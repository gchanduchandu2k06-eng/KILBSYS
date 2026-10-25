import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api", tags=["Validation"])

MAX_TOTAL_BYTES = 500_000
TIMEOUT_SECONDS = 10

LANGUAGE_FLAGS = {
    "verilog": "1364-2005",
    "systemverilog": "1800-2017",
}

DIAGNOSTIC_PATTERN = re.compile(
    r"^%(Error|Warning)(?:-([A-Z0-9_]+))?: "
    r"(?:(.+?):(\d+):(?:(\d+):)?\s*)?(.*)$"
)


class SourceFile(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(max_length=MAX_TOTAL_BYTES)


class ValidationRequest(BaseModel):
    files: list[SourceFile] = Field(min_length=1, max_length=30)
    language: Literal["verilog", "systemverilog"] = "systemverilog"
    top_module: str | None = Field(default=None, max_length=120)


def parse_diagnostics(logs: str) -> list[dict]:
    diagnostics = []

    for line in logs.splitlines():
        if line.strip().startswith("Exiting due to"):
            continue

        match = DIAGNOSTIC_PATTERN.match(line)
        if not match:
            continue

        severity, code, filename, line_number, column, message = (
            match.groups()
        )

        diagnostics.append({
            "severity": severity.lower(),
            "code": code,
            "file": Path(filename).name if filename else None,
            "line": int(line_number) if line_number else None,
            "column": int(column) if column else None,
            "message": message,
        })

    return diagnostics


@router.post("/validate")
def validate_code(request: ValidationRequest):
    executable = shutil.which("verilator")

    if executable is None:
        raise HTTPException(
            status_code=503,
            detail="Verilator is not installed or is not on PATH.",
        )

    if request.top_module and not re.fullmatch(
        r"[A-Za-z_][A-Za-z0-9_$]*",
        request.top_module,
    ):
        raise HTTPException(
            status_code=400,
            detail="Enter a simple module name such as counter or tb.",
        )

    total_bytes = sum(
        len(source.code.encode("utf-8"))
        for source in request.files
    )

    if total_bytes > MAX_TOTAL_BYTES:
        raise HTTPException(
            status_code=413,
            detail="The combined source files exceed 500 KB.",
        )

    names = set()
    compilation_files = []

    for source in request.files:
        if (
            not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]*", source.name)
            or source.name in {".", ".."}
        ):
            raise HTTPException(
                status_code=400,
                detail="Use simple filenames without folders.",
            )

        extension = Path(source.name).suffix.lower()

        if extension not in {".v", ".sv", ".vh", ".svh"}:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file extension: {source.name}",
            )

        if source.name in names:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate filename: {source.name}",
            )

        names.add(source.name)

        if extension in {".v", ".sv"}:
            compilation_files.append(source.name)

    if not compilation_files:
        raise HTTPException(
            status_code=400,
            detail="Include at least one .v or .sv source file.",
        )

    started = time.perf_counter()

    with tempfile.TemporaryDirectory(prefix="kilbsys-lint-") as folder:
        work = Path(folder)

        for source in request.files:
            (work / source.name).write_text(
                source.code,
                encoding="utf-8",
            )

        command = [
            executable,
            "--lint-only",
            "--timing",
            "--assert",
            "-Wall",
            "-Wno-fatal",
            "--error-limit",
            "20",
            "--language",
            LANGUAGE_FLAGS[request.language],
            "-I.",
        ]

        if request.top_module:
            command.extend(["--top-module", request.top_module])

        command.extend(compilation_files)

        timed_out = False

        try:
            result = subprocess.run(
                command,
                cwd=work,
                capture_output=True,
                text=True,
                errors="replace",
                timeout=TIMEOUT_SECONDS,
                check=False,
            )
            logs = result.stdout + result.stderr
            return_code = result.returncode

        except subprocess.TimeoutExpired as exc:
            timed_out = True
            return_code = None

            def as_text(value):
                if isinstance(value, bytes):
                    return value.decode("utf-8", errors="replace")
                return value or ""

            logs = as_text(exc.stdout) + as_text(exc.stderr)
            logs += "\nValidation exceeded the 10-second time limit."

        diagnostics = parse_diagnostics(logs)

    errors = [
        item for item in diagnostics
        if item["severity"] == "error"
    ]
    warnings = [
        item for item in diagnostics
        if item["severity"] == "warning"
    ]

    unsupported = any(
        item["code"] in {"UNSUPPORTED", "FUTURE"}
        or "unsupported" in item["message"].lower()
        for item in diagnostics
    )

    if timed_out:
        status = "timeout"
    elif unsupported:
        status = "unsupported"
    elif return_code != 0 or errors:
        status = "failed"
    elif warnings:
        status = "passed_with_warnings"
    else:
        status = "passed"

    return {
        "status": status,
        "passed": (
            not timed_out
            and not unsupported
            and return_code == 0
            and not errors
        ),
        "language": request.language,
        "elapsed_seconds": round(time.perf_counter() - started, 3),
        "error_count": len(errors),
        "warning_count": len(warnings),
        "diagnostics": diagnostics,
        "logs": logs.strip(),
        "scope": "Verilator lint checks; not functional verification.",
    }
