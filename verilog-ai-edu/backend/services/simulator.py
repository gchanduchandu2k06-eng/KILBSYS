import subprocess
import tempfile
import shutil
import uuid

import requests
def clean_simulation_output(output: str):
    if not output:
        return ""

    hidden_patterns = (
        "- /tmp/",
        "- S i m u l a t i o n   R e p o r t:",
        "- Verilator: $finish",
        "- Verilator: end at",
        "- Verilator: cpu",
        "Verilator: $finish",
        "Verilator: end at",
        "Verilator: cpu",
        "S i m u l a t i o n   R e p o r t:",
    )

    cleaned_lines = []

    for line in output.splitlines():
        if any(pattern in line for pattern in hidden_patterns):
            continue

        cleaned_lines.append(line)

    return "\n".join(cleaned_lines).strip()
from pathlib import Path
import os

PUBLIC_BASE_URL = os.getenv(
    "PUBLIC_BASE_URL",
    "http://127.0.0.1:8000"
)
FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://127.0.0.1:5173"
)
def detect_top_module(testbench_code):
    import re

    match = re.search(r"\bmodule\s+([A-Za-z_][A-Za-z0-9_]*)", testbench_code)

    if not match:
        return "tb"

    return match.group(1)


def simulate_code(rtl_code: str, testbench_code: str, top_module: str | None):
    if not rtl_code.strip():
        return {
            "success": False,
            "output": "",
            "diagnostics": [
                {
                    "severity": "error",
                    "code": "EMPTY_RTL",
                    "message": "RTL code is empty."
                }
            ]
        }


    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        rtl_path = temp_path / "design.v"
        tb_path = temp_path / "testbench.v"
        executable_path = temp_path / "simulation"

        trace_file = temp_path / "waveform.vcd"

        if testbench_code.strip():
            detected_top = top_module or detect_top_module(testbench_code)

            # Avoid injecting duplicate $dumpfile if testbench already contains it
            if "$dumpfile" not in testbench_code:
                trace_block = f"""
initial begin
    $dumpfile("{trace_file.as_posix()}");
    $dumpvars(0, {detected_top});
end
"""
                last_end = testbench_code.rfind("endmodule")
                if last_end != -1:
                    testbench_code = testbench_code[:last_end] + trace_block + testbench_code[last_end:]
                else:
                    testbench_code += trace_block

            rtl_path.write_text(rtl_code, encoding="utf-8")
            tb_path.write_text(testbench_code, encoding="utf-8")
            source_files = [str(rtl_path), str(tb_path)]
        else:
            detected_top = top_module or detect_top_module(rtl_code)

            if "$dumpfile" not in rtl_code:
                trace_block = f"""
initial begin
    $dumpfile("{trace_file.as_posix()}");
    $dumpvars(0, {detected_top});
end
"""
                last_end = rtl_code.rfind("endmodule")
                if last_end != -1:
                    rtl_code = rtl_code[:last_end] + trace_block + rtl_code[last_end:]
                else:
                    rtl_code += trace_block

            rtl_path.write_text(rtl_code, encoding="utf-8")
            source_files = [str(rtl_path)]

        build_dir = temp_path / "obj_dir"

        command = [
            "verilator",
            "--binary",
            "--timing",
            "--trace",
            "--Wno-fatal",
            "-Wno-DECLFILENAME",
            "--Mdir",
            str(build_dir),
            "--top-module",
            detected_top,
            "-o",
            str(executable_path),
            *source_files,
        ]
        try:
            compile_result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=30,
            )
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "failure_stage": "timeout",
                "output": "",
                "diagnostics": [
                    {
                        "severity": "error",
                        "code": "SIMULATION_COMPILE_TIMEOUT",
                        "message": "Compilation exceeded the 30-second time limit."
                    }
                ]
            }

        compile_output = (
            compile_result.stdout or ""
        ) + (
            compile_result.stderr or ""
        )

        if compile_result.returncode != 0:
            from validation import parse_diagnostics
            parsed = parse_diagnostics(compile_output)
            has_tb_err = False
            has_rtl_err = False

            for d in parsed:
                if d.get("file"):
                    if "testbench" in d["file"]:
                        d["file"] = "testbench.v"
                        has_tb_err = True
                    elif "design" in d["file"] or "rtl" in d["file"]:
                        d["file"] = "design.v"
                        has_rtl_err = True

            if not parsed:
                is_tb = "testbench" in compile_output.lower()
                parsed = [
                    {
                        "severity": "error",
                        "code": "SIMULATION_COMPILE_ERROR",
                        "file": "testbench.v" if is_tb else "design.v",
                        "line": 1,
                        "column": 1,
                        "message": compile_output.strip()
                    }
                ]
                has_tb_err = is_tb
                has_rtl_err = not is_tb

            if has_tb_err and has_rtl_err:
                stage = "both_compile"
            elif has_tb_err:
                stage = "tb_compile"
            else:
                stage = "rtl_compile"

            return {
                "success": False,
                "failure_stage": stage,
                "output": compile_output,
                "diagnostics": parsed
            }

        try:
            run_result = subprocess.run(
                [str(executable_path)],
                capture_output=True,
                text=True,
                timeout=30,
                cwd=temp_path,
            )
        except subprocess.TimeoutExpired as exc:
            out_str = exc.stdout.decode("utf-8", errors="replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")
            return {
                "success": False,
                "failure_stage": "runtime_timeout",
                "output": (out_str + "\nSimulation exceeded the 30-second time limit.").strip(),
                "diagnostics": [
                    {
                        "severity": "error",
                        "code": "SIMULATION_RUNTIME_TIMEOUT",
                        "message": "Simulation exceeded the 30-second time limit. Check for infinite loops or ensure $finish is reached."
                    }
                ]
            }

        run_output = clean_simulation_output(run_result.stdout or "")
        if run_result.returncode != 0:
            return {
                "success": False,
                "failure_stage": "runtime",
                "output": run_output,
                "diagnostics": [
                    {
                        "severity": "error",
                        "code": "SIMULATION_RUNTIME_ERROR",
                        "message": "Simulator exited with non-zero status code."
                    }
                ]
            }

        # Analyze simulation stdout for assertion results
        failure_keywords = (
            "assertion failed",
            "assertion failure",
            "test failed",
            "testbench failed",
            "fatal:",
            "mismatch",
            "%error",
        )
        lower_out = run_output.lower()
        has_tb_failure = any(kw in lower_out for kw in failure_keywords)

        # Check if testbench or output had verification checks
        lower_tb = testbench_code.lower()
        check_indicators = ("assert", "passed", "checks passed", "all tests passed", "===", "!==")
        has_checks = any(ind in lower_out or ind in lower_tb for ind in check_indicators) or ("if (" in lower_tb and "display" in lower_tb)

        if has_tb_failure:
            verdict = "assertion_failure"
        elif has_checks:
            verdict = "passed_verified"
        else:
            verdict = "passed_unverified"

        waveform_url = None
        surfer_url = None
        job_id = None

        # Look for trace_file or any .vcd produced in temp directory
        vcd_candidates = list(temp_path.glob("*.vcd"))
        found_vcd = trace_file if trace_file.exists() else (vcd_candidates[0] if vcd_candidates else None)

        if found_vcd and found_vcd.exists():
            job_id = uuid.uuid4().hex

            job_dir = Path("waveforms") / job_id
            job_dir.mkdir(parents=True, exist_ok=True)

            saved_vcd = job_dir / "waveform.vcd"
            shutil.copy2(found_vcd, saved_vcd)

            waveform_url = f"{PUBLIC_BASE_URL}/vcd/{job_id}/waveform.vcd"

            surfer_url = (
                f"{FRONTEND_URL}/viewer/?load_url="
                + requests.utils.quote(waveform_url, safe="")
                + "#dev"
            )

        return {
            "success": not has_tb_failure,
            "failure_stage": "assertion_failure" if has_tb_failure else None,
            "verdict": verdict,
            "has_tb_failure": has_tb_failure,
            "has_checks": has_checks,
            "output": run_output,
            "diagnostics": [],
            "job_id": job_id,
            "waveform_url": waveform_url,
            "surfer_url": surfer_url
        }
