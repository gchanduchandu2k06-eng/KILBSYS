import re
import subprocess
import tempfile
from pathlib import Path


def parse_diagnostics(output: str):
    diagnostics = []

    pattern = re.compile(
        r"^%(?P<severity>Error|Warning)"
        r"(?:-(?P<code>[A-Z0-9_]+))?:"
        r"\s*(?P<file>[^:\s]+):(?P<line>\d+)(?::\d+)?:"
        r"\s*(?P<message>.+)$"
    )

    for raw_line in output.splitlines():
        line = raw_line.strip()

        if not line:
            continue

        if line.startswith("Exiting due to"):
            continue

        match = pattern.match(line)

        if not match:
            continue

        severity = "error" if match.group("severity") == "Error" else "warning"
        code = match.group("code") or severity.upper()
        file_name = match.group("file")
        line_number = int(match.group("line"))
        message = match.group("message").strip()

        diagnostics.append({
            "severity": severity,
            "code": code,
            "file": file_name,
            "line": line_number,
            "message": f"{file_name}:{line_number}: {message}"
        })

    return diagnostics


def find_undriven_outputs(rtl_code: str):
    errors = []

    module_match = re.search(
        r"\bmodule\s+[A-Za-z_][A-Za-z0-9_]*\s*\((.*?)\);",
        rtl_code,
        re.DOTALL
    )

    if not module_match:
        return errors

    port_block = module_match.group(1)

    outputs = re.findall(
        r"\boutput\s+(?:reg\s+|wire\s+)?(?:\[[^\]]+\]\s+)?([A-Za-z_][A-Za-z0-9_]*)",
        port_block
    )

    for output_name in outputs:
        driven = re.search(
            rf"\bassign\s+{re.escape(output_name)}\s*=",
            rtl_code
        ) or re.search(
            rf"\b{re.escape(output_name)}\s*<=",
            rtl_code
        ) or re.search(
            rf"\b{re.escape(output_name)}\s*=",
            rtl_code
        )

        if not driven:
            errors.append({
                "severity": "error",
                "code": "OUTPUT_NOT_DRIVEN",
                "message": f"Output '{output_name}' is not driven by the RTL."
            })

    return errors


def validate_code(rtl_code: str, testbench_code: str = ""):
    with tempfile.TemporaryDirectory() as temp_dir:
        workdir = Path(temp_dir)
        rtl_file = workdir / "design.v"

        rtl_file.write_text(
            "`default_nettype none\n"
            + rtl_code
            + "\n`default_nettype wire\n",
            encoding="utf-8"
        )

        files = [str(rtl_file)]

        if testbench_code.strip():
            testbench_file = workdir / "testbench.v"
            testbench_file.write_text(
                testbench_code,
                encoding="utf-8"
            )
            files.append(str(testbench_file))

        command = [
            "verilator",
            "--lint-only",
            "--language", "1800-2012",
            "--Wall",
        "-Wno-DECLFILENAME",
            "--Wno-fatal",
            *files
        ]

        try:
            result = subprocess.run(
                command,
                cwd=workdir,
                capture_output=True,
                text=True,
                timeout=10
            )

        except FileNotFoundError:
            return {
                "valid": False,
                "can_open_testbench": False,
                "diagnostics": [{
                    "severity": "error",
                    "code": "VERILATOR_NOT_FOUND",
                    "message": "Verilator was not found."
                }]
            }

        except subprocess.TimeoutExpired:
            return {
                "valid": False,
                "can_open_testbench": False,
                "diagnostics": [{
                    "severity": "error",
                    "code": "TIMEOUT",
                    "message": "Validation timed out."
                }]
            }

        output = result.stdout + "\n" + result.stderr
        diagnostics = parse_diagnostics(output)

        errors = [
            item for item in diagnostics
            if item["severity"] == "error"
        ]

        errors.extend(find_undriven_outputs(rtl_code))

        return {
            "valid": len(errors) == 0,
            "can_open_testbench": len(errors) == 0,
            "diagnostics": diagnostics,
            "raw_output": output
        }
