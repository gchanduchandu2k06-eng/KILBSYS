"""
KILBSYS AI — Context-Aware RTL Analysis and Debugging Assistant
Gemini integration for the VerilogLab EDA platform.
Credentials are server-side only; the API key is never sent to the frontend.
"""

from __future__ import annotations

import os
import re
import textwrap
from typing import Any

# ---------------------------------------------------------------------------
# Optional Gemini SDK import — graceful degradation if not installed
# ---------------------------------------------------------------------------
import warnings

try:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=FutureWarning)
        import google.generativeai as genai

    _SDK_AVAILABLE = True
except ImportError:  # pragma: no cover
    genai = None  # type: ignore
    _SDK_AVAILABLE = False

from pathlib import Path
from dotenv import load_dotenv

# Ensure backend/.env is loaded even when imported directly
load_dotenv(Path(__file__).parent.parent / ".env")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
_MODEL_NAME = os.getenv("KILBSYS_AI_MODEL", "gemini-2.0-flash-lite")
_TIMEOUT_SECONDS = 30


def get_ai_unavailable_reason() -> str | None:
    """Return reason why AI is unavailable, or None if available."""
    if not _SDK_AVAILABLE:
        return "google-generativeai package is not installed."
    key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not key or key.lower().startswith("your_") or "placeholder" in key.lower() or key.startswith("<"):
        return "GEMINI_API_KEY is not configured in backend/.env."
    return None


# Module-level variable for backwards compatibility
AI_UNAVAILABLE_REASON: str | None = get_ai_unavailable_reason()

# ---------------------------------------------------------------------------
# Approved KILBSYS FAQ corpus (server-side only; injected into system prompt)
# ---------------------------------------------------------------------------
_KILBSYS_FAQS = """
KILBSYS PRODUCT FAQ (approved, authoritative):
- What is KILBSYS? KILBSYS is a browser-based, AI-assisted EDA platform for digital chip design. It helps students, colleges, startups, and small hardware teams write RTL/Verilog, create testbenches, simulate designs, understand errors, and move toward synthesis and physical design without installing complex EDA tools.
- Where did KILBSYS originate? KILBSYS originated in India as a student-founded deep-tech startup from Bengaluru.
- Who are the founders? Dhanush Rangachar and Joshua S Dandin are the co-founders. Dhanush serves as CEO and Joshua serves as CTO.
- Who is the CTO? Joshua S Dandin, who leads the platform's technical development and architecture.
- Who is the CEO? Dhanush Rangachar, who leads product vision, semiconductor-design direction, and overall startup execution.
- Is KILBSYS the company name? KILBSYS is the product built by KILBSYS Labs, the company responsible for the software.

IMPORTANT: Do not invent additional company history, achievements, credentials, or technical capabilities beyond what is stated above.
"""

_OPEN_SOURCE_NOTICES = """
KILBSYS OPEN-SOURCE NOTICES:
- Verilator — LGPL-3.0-only or Artistic-2.0: https://verilator.org
- Surfer — EUPL-1.2; dual-licensed under MIT and Apache: https://surfer-project.org
KILBSYS, VerilogLab, and KILBSYS AI are trademarks of KILBSYS Labs. All third-party trademarks belong to their respective owners.
"""

# ---------------------------------------------------------------------------
# Scope-restriction system prompt
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = textwrap.dedent(f"""
You are KILBSYS AI, the intelligent digital-design assistant built into the KILBSYS EDA platform.

SCOPE — you ONLY assist with:
1. Verilog, SystemVerilog, RTL design, testbenches, simulation, waveform analysis.
2. EDA compiler diagnostics: Verilator errors, warnings, linting issues.
3. Digital logic design: combinational and sequential circuits, FSMs, arithmetic units, memories.
4. KILBSYS platform questions — use only the approved FAQ below.
5. Open-source tool information — use only the notices below.

OUT OF SCOPE — for anything unrelated to digital design or KILBSYS, respond politely:
"KILBSYS AI specialises in digital design, RTL development, simulation, and the KILBSYS platform. I'm not able to help with that topic."

Do NOT: invent company facts, generate marketing text, discuss pricing, or discuss topics outside EDA/HDL.

FORMAT RULES:
- Use clear, concise technical language.
- Use plain text. When showing code, use ```verilog or ```systemverilog fenced blocks.
- Never use HTML tags in your responses.
- When proposing corrected code, delimit it with: CORRECTED_CODE_START and CORRECTED_CODE_END on their own lines.
- Report uncertainties honestly. If a design's intent is ambiguous, ask for clarification rather than guessing.

{_KILBSYS_FAQS}
{_OPEN_SOURCE_NOTICES}
""").strip()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_model():
    """Return a configured Gemini GenerativeModel, or raise if unavailable."""
    reason = get_ai_unavailable_reason()
    if reason:
        raise RuntimeError(reason)
    api_key = os.getenv("GEMINI_API_KEY")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(
        model_name=_MODEL_NAME,
        system_instruction=_SYSTEM_PROMPT,
    )


def _extract_corrected_code(text: str) -> str | None:
    """
    Extract code between CORRECTED_CODE_START / CORRECTED_CODE_END delimiters.
    Returns None if not present.
    """
    pattern = re.compile(
        r"CORRECTED_CODE_START\s*\n(.*?)CORRECTED_CODE_END",
        re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        return None
    code = match.group(1)
    # Strip fenced code block markers if present
    code = re.sub(r"^```(?:verilog|systemverilog)?\n?", "", code.strip())
    code = re.sub(r"\n?```$", "", code)
    return code.strip()


def _sanitise_ai_text(text: str) -> str:
    """Strip HTML tags and reduce excessive whitespace from AI output."""
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Public API — called by FastAPI routes
# ---------------------------------------------------------------------------

def explain_rtl(
    rtl_code: str,
    language: str,
    diagnostics: list[dict],
    passed: bool,
) -> dict[str, Any]:
    """
    Analyse RTL code and Verilator diagnostics.
    Returns explanation, corrected_rtl (if errors present), ai_available flag.
    """
    reason = get_ai_unavailable_reason()
    if reason:
        return {"ai_available": False, "reason": reason}

    diag_text = _format_diagnostics(diagnostics)
    status_line = "RTL lint passed with no errors." if passed else f"RTL lint FAILED with {len(diagnostics)} issue(s)."

    if passed:
        prompt = textwrap.dedent(f"""
            Language: {language}
            Status: {status_line}

            RTL Source:
            ```{language}
            {rtl_code}
            ```

            The RTL passed Verilator lint successfully.
            Respond in MAXIMUM 2 brief sentences:
            Confirm that the RTL passed syntax and lint checks cleanly with zero compiler diagnostics.
            Do NOT write lengthy essays, disclaimers, or verbose paragraphs.
        """).strip()
    else:
        prompt = textwrap.dedent(f"""
            Language: {language}
            Status: {status_line}

            RTL Source:
            ```{language}
            {rtl_code}
            ```

            Verilator Diagnostics:
            {diag_text}

            Tasks:
            1. MISTAKEN CODE: Quote the exact line from the user's code that caused the error, and explain clearly what was mistaken.
            2. CORRECTION: Explain what the correct code should be and why.
            3. MINIMAL CORRECTION: Take the USER'S CODE and apply ONLY the minimal fix needed. Do NOT rewrite the module from scratch or invent different code. Preserve the user's variable names and structure.
               Wrap the corrected code with:
               CORRECTED_CODE_START
               <corrected code here>
               CORRECTED_CODE_END
        """).strip()

    try:
        model = _get_model()
        response = model.generate_content(
            prompt,
            generation_config={"temperature": 0.2, "max_output_tokens": 2048},
            request_options={"timeout": _TIMEOUT_SECONDS},
        )
        text = _sanitise_ai_text(response.text)
        corrected = _extract_corrected_code(text) if not passed else None
        clean_text = re.sub(
            r"CORRECTED_CODE_START.*?CORRECTED_CODE_END",
            "[Corrected code extracted -- see candidate below]",
            text,
            flags=re.DOTALL,
        )
        return {
            "ai_available": True,
            "explanation": clean_text,
            "corrected_rtl": corrected,
            "target": "rtl",
        }
    except Exception as exc:
        err = str(exc)
        is_key_err = "API_KEY_INVALID" in err or "API key not valid" in err
        return {
            "ai_available": False,
            "reason": "GEMINI_API_KEY is invalid." if is_key_err else "KILBSYS AI service error.",
            "explanation": "KILBSYS AI is unavailable: The configured GEMINI_API_KEY is invalid. Please check backend/.env." if is_key_err else f"KILBSYS AI is temporarily unavailable: {err}",
            "corrected_rtl": None,
            "target": "rtl",
        }


def analyse_simulation(
    rtl_code: str,
    testbench_code: str,
    simulation_output: str,
    diagnostics: list[dict],
    success: bool,
    has_tb_failure: bool,
) -> dict[str, Any]:
    """
    Analyse a completed simulation run.
    Returns explanation and optionally a corrected RTL or testbench candidate.
    """
    reason = get_ai_unavailable_reason()
    if reason:
        return {"ai_available": False, "reason": reason}

    diag_text = _format_diagnostics(diagnostics)

    if success and not has_tb_failure:
        prompt = textwrap.dedent(f"""
            Simulation Status: PASSED -- all assertions passed

            RTL Source:
            ```verilog
            {rtl_code}
            ```

            Testbench:
            ```verilog
            {testbench_code}
            ```

            Simulation Output:
            {simulation_output or "(no stdout)"}

            The simulation executed and all testbench assertions passed.
            Respond in MAXIMUM 2 brief sentences:
            Confirm that the simulation completed successfully with all testbench assertions passing.
            Do NOT write lengthy essays, disclaimers, or verbose paragraphs.
        """).strip()
    else:
        status_label = "ASSERTION FAILURE -- simulator exited 0 but testbench reported failures" if (success and has_tb_failure) else "FAILED -- compilation or runtime error"
        prompt = textwrap.dedent(f"""
            Simulation Status: {status_label}

            RTL Source:
            ```verilog
            {rtl_code}
            ```

            Testbench:
            ```verilog
            {testbench_code}
            ```

            Simulation Output:
            {simulation_output or "(no stdout)"}

            Compiler/Runtime Diagnostics:
            {diag_text or "(none)"}

            Tasks:
            1. MISTAKEN CODE: Identify whether the error is in the RTL or the Testbench. Quote the exact mistaken line from the user's code and explain why it is wrong.
            2. CORRECTION: Explain what the correct code should be and why.
            3. MINIMAL CORRECTION: Take the user's existing code (for the affected file: RTL or Testbench) and apply ONLY the minimal fix required. Do NOT invent new code, rewrite the design from scratch, or replace the user's variable names. Fix only the mistake.
               Wrap the corrected code with:
               CORRECTED_CODE_START
               <corrected code here>
               CORRECTED_CODE_END
        """).strip()

    try:
        model = _get_model()
        response = model.generate_content(
            prompt,
            generation_config={"temperature": 0.2, "max_output_tokens": 2048},
            request_options={"timeout": _TIMEOUT_SECONDS},
        )
        text = _sanitise_ai_text(response.text)
        corrected = _extract_corrected_code(text) if (not success or has_tb_failure) else None
        clean_text = re.sub(
            r"CORRECTED_CODE_START.*?CORRECTED_CODE_END",
            "[Corrected code extracted -- see candidate below]",
            text,
            flags=re.DOTALL,
        )

        target = "rtl"
        if corrected:
            lower = corrected.lower()
            if "_tb" in lower or "$dumpfile" in lower or "$finish" in lower or "testbench" in lower:
                target = "testbench"
            elif "uut" in lower and "initial" in lower:
                target = "testbench"

        return {
            "ai_available": True,
            "explanation": clean_text,
            "corrected_rtl": corrected,
            "target": target,
        }
    except Exception as exc:
        err = str(exc)
        is_key_err = "API_KEY_INVALID" in err or "API key not valid" in err
        return {
            "ai_available": False,
            "reason": "GEMINI_API_KEY is invalid." if is_key_err else "KILBSYS AI service error.",
            "explanation": "KILBSYS AI is unavailable: The configured GEMINI_API_KEY is invalid. Please check backend/.env." if is_key_err else f"KILBSYS AI is temporarily unavailable: {err}",
            "corrected_rtl": None,
        }


def answer_question(question: str, rtl_context: str | None = None) -> dict[str, Any]:
    """
    Free-form question answering, scoped to digital design / KILBSYS topics.
    """
    reason = get_ai_unavailable_reason()
    if reason:
        return {"ai_available": False, "reason": reason}

    context_block = ""
    if rtl_context and rtl_context.strip():
        context_block = (
            "Current RTL in Editor (for reference):\n"
            f"```verilog\n{rtl_context[:3000]}\n```\n\n"
        )

    prompt = f"{context_block}User question: {question}"

    try:
        model = _get_model()
        response = model.generate_content(
            prompt,
            generation_config={"temperature": 0.3, "max_output_tokens": 1500},
            request_options={"timeout": _TIMEOUT_SECONDS},
        )
        return {
            "ai_available": True,
            "answer": _sanitise_ai_text(response.text),
        }
    except Exception as exc:
        err = str(exc)
        is_key_err = "API_KEY_INVALID" in err or "API key not valid" in err
        return {
            "ai_available": False,
            "reason": "GEMINI_API_KEY is invalid." if is_key_err else "KILBSYS AI service error.",
            "answer": "KILBSYS AI is unavailable: The configured GEMINI_API_KEY is invalid. Please configure a valid API key in backend/.env." if is_key_err else f"KILBSYS AI is temporarily unavailable: {err}",
        }


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _format_diagnostics(diagnostics: list[dict]) -> str:
    if not diagnostics:
        return "(none)"
    lines = []
    for d in diagnostics[:30]:  # cap to prevent giant prompts
        loc = ""
        if d.get("file") and d.get("line"):
            loc = f" [{d['file']}:{d['line']}]"
        elif d.get("line"):
            loc = f" [line {d['line']}]"
        lines.append(f"  {d.get('severity', 'error').upper()}{loc}: {d.get('message', '')}")
    return "\n".join(lines)
