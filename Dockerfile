FROM python:3.11-slim

# Install system dependencies: Icarus Verilog (for sub-second simulation), Verilator (linting), C++ compiler and make
RUN apt-get update && apt-get install -y --no-install-recommends \
    iverilog \
    verilator \
    build-essential \
    make \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY verilog-ai-edu/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code into working directory
COPY verilog-ai-edu/backend/ .

# Expose default port (Render will override via $PORT env var)
ENV PORT=8000
EXPOSE 8000

# Start FastAPI server
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
