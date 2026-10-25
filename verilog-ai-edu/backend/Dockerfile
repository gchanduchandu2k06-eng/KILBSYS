FROM python:3.11-slim

# Install system dependencies including Verilator, C++ compiler and make
RUN apt-get update && apt-get install -y --no-install-recommends \
    verilator \
    build-essential \
    make \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY . .

# Expose default port (Render will override via $PORT env var)
ENV PORT=8000
EXPOSE 8000

# Start FastAPI server
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
