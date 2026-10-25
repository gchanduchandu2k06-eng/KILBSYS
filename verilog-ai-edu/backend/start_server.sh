#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"
exec /root/.venvs/verilog-ai-edu/bin/uvicorn main:app --host 0.0.0.0 --port 8000
