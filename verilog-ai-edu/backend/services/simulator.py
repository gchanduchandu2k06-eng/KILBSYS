import subprocess
import tempfile
import shutil
import uuid
import re
import os
from pathlib import Path
import requests

PUBLIC_BASE_URL = os.getenv(
    "RENDER_EXTERNAL_URL",
    os.getenv("PUBLIC_BASE_URL", "https://kilbsys-1.onrender.com")
).rstrip("/")

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://127.0.0.1:5173"
).rstrip("/")


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


def detect_top_module(testbench_code):
    match = re.search(r"\bmodule\s+([A-Za-z_][A-Za-z0-9_]*)", testbench_code)
    if not match:
        return "tb"
    return match.group(1)


def parse_iverilog_diagnostics(output: str) -> list[dict]:
    diagnostics = []
    pattern = re.compile(r"^(?P<file>[^:\s]+):(?P<line>\d+):(?:\s*(?P<col>\d+):)?\s*(?P<msg>.+)$")
    for raw in output.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = pattern.match(line)
        if m:
            fn = Path(m.group("file")).name
            ln = int(m.group("line"))
            msg = m.group("msg").strip()
            sev = "warning" if "warning" in msg.lower() else "error"
            diagnostics.append({
                "severity": sev,
                "code": "SYNTAX_ERROR",
                "file": fn,
                "line": ln,
                "column": int(m.group("col")) if m.group("col") else None,
                "message": msg
            })
    return diagnostics


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

        # -------------------------------------------------------------
        # Tier 1: Icarus Verilog (iverilog + vvp) — Fast (< 0.1s)
        # -------------------------------------------------------------
        iverilog_path = shutil.which("iverilog")
        vvp_path = shutil.which("vvp")

        run_output = ""
        success = False
        has_tb_failure = False

        if iverilog_path and vvp_path:
            vvp_exec = temp_path / "sim.vvp"
            compile_cmd = [
                iverilog_path,
                "-g2012",
                "-o", str(vvp_exec),
                "-s", detected_top,
                *source_files
            ]
            try:
                comp_res = subprocess.run(compile_cmd, capture_output=True, text=True, timeout=15)
                comp_out = (comp_res.stdout or "") + (comp_res.stderr or "")
                if comp_res.returncode != 0:
                    diags = parse_iverilog_diagnostics(comp_out)
                    is_tb = "testbench" in comp_out.lower()
                    if not diags:
                        diags = [{
                            "severity": "error",
                            "code": "SIMULATION_COMPILE_ERROR",
                            "file": "testbench.v" if is_tb else "design.v",
                            "line": 1,
                            "message": comp_out.strip()
                        }]
                    return {
                        "success": False,
                        "failure_stage": "tb_compile" if is_tb else "rtl_compile",
                        "output": comp_out,
                        "diagnostics": diags
                    }

                # Run simulation with vvp
                run_res = subprocess.run(
                    [vvp_path, str(vvp_exec)],
                    capture_output=True,
                    text=True,
                    timeout=15,
                    cwd=temp_path
                )
                run_output = clean_simulation_output((run_res.stdout or "") + (run_res.stderr or ""))
                if run_res.returncode != 0:
                    return {
                        "success": False,
                        "failure_stage": "runtime",
                        "output": run_output,
                        "diagnostics": [{
                            "severity": "error",
                            "code": "SIMULATION_RUNTIME_ERROR",
                            "message": "Simulation runtime error."
                        }]
                    }
                success = True

            except subprocess.TimeoutExpired:
                return {
                    "success": False,
                    "failure_stage": "runtime_timeout",
                    "output": "Simulation exceeded time limit (check for infinite loops).",
                    "diagnostics": [{
                        "severity": "error",
                        "code": "SIMULATION_RUNTIME_TIMEOUT",
                        "message": "Simulation exceeded time limit. Check for infinite loops or missing $finish."
                    }]
                }

        # -------------------------------------------------------------
        # Tier 2: Verilator (as primary or fallback)
        # -------------------------------------------------------------
        if not success and shutil.which("verilator"):
            build_dir = temp_path / "obj_dir"
            executable_path = temp_path / "simulation"

            command = [
                "verilator",
                "--binary",
                "--timing",
                "--trace",
                "-CFLAGS", "-O0",
                "-MAKEFLAGS", "-j1",
                "--Wno-fatal",
                "-Wno-DECLFILENAME",
                "--Mdir", str(build_dir),
                "--top-module", detected_top,
                "-o", str(executable_path),
                *source_files,
            ]
            try:
                compile_result = subprocess.run(command, capture_output=True, text=True, timeout=90)
            except subprocess.TimeoutExpired:
                return {
                    "success": False,
                    "failure_stage": "timeout",
                    "output": "",
                    "diagnostics": [{
                        "severity": "error",
                        "code": "SIMULATION_COMPILE_TIMEOUT",
                        "message": "Compilation exceeded the time limit."
                    }]
                }

            compile_output = (compile_result.stdout or "") + (compile_result.stderr or "")

            if compile_result.returncode != 0:
                from validation import parse_diagnostics
                parsed = parse_diagnostics(compile_output)
                has_tb_err = any("testbench" in d.get("file", "") for d in parsed)
                if not parsed:
                    is_tb = "testbench" in compile_output.lower()
                    parsed = [{
                        "severity": "error",
                        "code": "SIMULATION_COMPILE_ERROR",
                        "file": "testbench.v" if is_tb else "design.v",
                        "line": 1,
                        "column": 1,
                        "message": compile_output.strip()
                    }]
                    has_tb_err = is_tb

                return {
                    "success": False,
                    "failure_stage": "tb_compile" if has_tb_err else "rtl_compile",
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
                    "output": (out_str + "\nSimulation exceeded time limit.").strip(),
                    "diagnostics": [{
                        "severity": "error",
                        "code": "SIMULATION_RUNTIME_TIMEOUT",
                        "message": "Simulation exceeded time limit. Check for infinite loops or ensure $finish is reached."
                    }]
                }

            run_output = clean_simulation_output(run_result.stdout or "")
            if run_result.returncode != 0:
                return {
                    "success": False,
                    "failure_stage": "runtime",
                    "output": run_output,
                    "diagnostics": [{
                        "severity": "error",
                        "code": "SIMULATION_RUNTIME_ERROR",
                        "message": "Simulator exited with non-zero status code."
                    }]
                }
            success = True

        if not success:
            return {
                "success": False,
                "failure_stage": "runtime",
                "output": "No Verilog simulator (iverilog or verilator) found on system PATH.",
                "diagnostics": [{
                    "severity": "error",
                    "code": "SIMULATOR_NOT_FOUND",
                    "message": "Simulator tools are not installed on server."
                }]
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
        has_tb_failure = any(keyword in run_output.lower() for keyword in failure_keywords)

        check_indicators = (
            "pass",
            "passed",
            "assert",
            "check",
            "ok",
            "testbench finished",
            "simulation finished",
            "success",
        )
        has_checks = any(ind in run_output.lower() for ind in check_indicators)

        if has_tb_failure:
            verdict = "failed_assertion"
        elif has_checks:
            verdict = "passed_verified"
        else:
            verdict = "passed_unchecked"

        job_id = None
        waveform_url = None
        surfer_url = None

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
