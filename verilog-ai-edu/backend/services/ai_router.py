"""
KILBSYS AI — FastAPI router
Handles /api/ai/explain-rtl, /api/ai/analyse-sim, /api/ai/chat,
and /api/ai/status endpoints.
Credentials never leave the server.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.ai_assistant import (
    AI_UNAVAILABLE_REASON,
    get_ai_unavailable_reason,
    explain_rtl,
    analyse_simulation,
    answer_question,
)
from services.simulator import simulate_code
from validation import validate_code, ValidationRequest, SourceFile

router = APIRouter(prefix="/api/ai", tags=["KILBSYS AI"])

MAX_CODE_BYTES = 50_000


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class ExplainRtlRequest(BaseModel):
    rtl_code: str = Field(..., max_length=MAX_CODE_BYTES)
    language: str = Field("verilog", pattern=r"^(verilog|systemverilog)$")
    diagnostics: list[dict] = Field(default_factory=list)
    passed: bool = False


class RevalidateRequest(BaseModel):
    """Ask the backend to revalidate a candidate RTL produced by AI."""
    rtl_code: str = Field(..., max_length=MAX_CODE_BYTES)
    language: str = Field("verilog", pattern=r"^(verilog|systemverilog)$")


class AnalyseSimRequest(BaseModel):
    rtl_code: str = Field(..., max_length=MAX_CODE_BYTES)
    testbench_code: str = Field("", max_length=MAX_CODE_BYTES)
    simulation_output: str = Field("", max_length=20_000)
    diagnostics: list[dict] = Field(default_factory=list)
    success: bool = False
    has_tb_failure: bool = False


class ResimulateRequest(BaseModel):
    """Re-simulate a candidate code (RTL or testbench) with the other file."""
    candidate_code: str | None = Field(None, max_length=MAX_CODE_BYTES)
    candidate_rtl: str | None = Field(None, max_length=MAX_CODE_BYTES)
    testbench_code: str = Field("", max_length=MAX_CODE_BYTES)
    rtl_code: str = Field("", max_length=MAX_CODE_BYTES)
    target: str = Field("rtl", pattern=r"^(rtl|testbench)$")
    top_module: str | None = Field(None, max_length=120)


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    rtl_context: str | None = Field(None, max_length=MAX_CODE_BYTES)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/status")
def ai_status():
    """Returns whether KILBSYS AI is available and configured."""
    reason = get_ai_unavailable_reason()
    return {
        "ai_available": reason is None,
        "reason": reason,
    }


@router.post("/explain-rtl")
def explain_rtl_endpoint(request: ExplainRtlRequest):
    """
    Analyse RTL + Verilator diagnostics and return an explanation.
    If errors exist, also returns a corrected candidate RTL.
    """
    result = explain_rtl(
        rtl_code=request.rtl_code,
        language=request.language,
        diagnostics=request.diagnostics,
        passed=request.passed,
    )
    return result


@router.post("/revalidate")
def revalidate_endpoint(request: RevalidateRequest):
    """
    Revalidate a candidate RTL (produced by AI) with the actual Verilator compiler.
    Returns the same structure as /api/validate.
    """
    ext = ".sv" if request.language == "systemverilog" else ".v"
    filename = f"candidate{ext}"
    val_request = ValidationRequest(
        files=[SourceFile(name=filename, code=request.rtl_code)],
        language=request.language,
        top_module=None,
    )
    return validate_code(val_request)


@router.post("/analyse-sim")
def analyse_sim_endpoint(request: AnalyseSimRequest):
    """
    Analyse simulation results and return an explanation.
    May include a corrected candidate RTL for failing simulations.
    """
    result = analyse_simulation(
        rtl_code=request.rtl_code,
        testbench_code=request.testbench_code,
        simulation_output=request.simulation_output,
        diagnostics=request.diagnostics,
        success=request.success,
        has_tb_failure=request.has_tb_failure,
    )
    return result


@router.post("/resimulate")
@router.post("/resimuate")
def resimulate_endpoint(request: ResimulateRequest):
    """
    Re-simulate a candidate RTL or testbench using the original partner file.
    Used to verify AI-proposed corrections before presenting them to the user.
    """
    cand = request.candidate_code or request.candidate_rtl or ""
    if request.target == "testbench":
        final_rtl = request.rtl_code or ""
        final_tb = cand
    else:
        final_rtl = cand
        final_tb = request.testbench_code or ""

    return simulate_code(
        rtl_code=final_rtl,
        testbench_code=final_tb,
        top_module=request.top_module,
    )


@router.post("/chat")
def chat_endpoint(request: ChatRequest):
    """
    Free-form Q&A scoped to digital design / KILBSYS topics.
    Passes the current RTL as context if supplied.
    """
    result = answer_question(
        question=request.question,
        rtl_context=request.rtl_context,
    )
    return result
