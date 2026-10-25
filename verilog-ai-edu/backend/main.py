from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from services.validator import validate_code
from services.simulator import simulate_code
from services.ai_router import router as ai_router

app = FastAPI(title="VerilogLab / KILBSYS API")

# ---------------------------------------------------------------------------
# CORS — allow frontend origin
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Include routers
# ---------------------------------------------------------------------------
from validation import router as validation_router
app.include_router(validation_router)
app.include_router(ai_router)

# ---------------------------------------------------------------------------
# Surfer proxy config
# ---------------------------------------------------------------------------
SURVER_URL = "http://127.0.0.1:8001"

# ---------------------------------------------------------------------------
# Core routes
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "VerilogLab / KILBSYS Backend API",
        "health": "/api/health",
        "docs": "/docs"
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


class CheckRequest(BaseModel):
    rtl_code: str = Field(..., max_length=100000)
    testbench_code: str = Field("", max_length=100000)
    top_module: str | None = None


@app.post("/api/check")
def check_code(request: CheckRequest):
    return validate_code(
        rtl_code=request.rtl_code,
        testbench_code=request.testbench_code,
    )


@app.post("/api/simulate")
def simulate(request: CheckRequest):
    return simulate_code(
        rtl_code=request.rtl_code,
        testbench_code=request.testbench_code,
        top_module=request.top_module,
    )


@app.get("/api/waveform/{job_id}")
def get_waveform(job_id: str):
    vcd_path = Path("waveforms") / f"{job_id}.vcd"
    if not vcd_path.exists():
        raise HTTPException(status_code=404, detail="Waveform not found")
    return FileResponse(
        path=vcd_path,
        media_type="application/vnd.vcd",
        filename=f"{job_id}.vcd",
    )


@app.get("/vcd/{job_id}/waveform.vcd")
def get_job_waveform_vcd(job_id: str):
    path = Path("waveforms") / job_id / "waveform.vcd"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Waveform not found")
    return FileResponse(
        path,
        media_type="application/octet-stream",
        headers={"Access-Control-Allow-Origin": "*"},
    )


@app.get("/surfer-proxy/{token}")
def surfer_proxy(token: str):
    upstream = f"{SURVER_URL}/{token}"
    r = requests.get(upstream, stream=True)
    return StreamingResponse(
        r.iter_content(chunk_size=8192),
        status_code=r.status_code,
        media_type=r.headers.get("Content-Type", "application/octet-stream"),
        headers={"Access-Control-Allow-Origin": "*"},
    )


if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)

