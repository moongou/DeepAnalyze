#!/bin/bash

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="python3"
VENV_PATH="$SCRIPT_DIR/demo/jupyter/.venv"
MODEL_DIR="$SCRIPT_DIR/DeepAnalyze-8B"
VLLM_PORT=8000
API_PORT=8200
FRONTEND_PORT=4000
LOG_DIR="$SCRIPT_DIR/logs"

# Use venv if exists
if [ -f "$VENV_PATH/bin/python" ]; then
    PYTHON_BIN="$VENV_PATH/bin/python"
    echo "Using virtual environment: $VENV_PATH"
fi

# Create logs directory
mkdir -p "$LOG_DIR"

echo "=========================================="
echo "   DeepAnalyze All-in-One Startup Script  "
echo "=========================================="

# 1. Start vLLM Model Server
echo "[1/3] Starting vLLM Model Server..."
if [ ! -d "$MODEL_DIR" ]; then
    echo "Error: Model directory $MODEL_DIR not found!"
    exit 1
fi

nohup "$PYTHON_BIN" -m vllm.entrypoints.openai.api_server \
    --model "$MODEL_DIR" \
    --served-model-name DeepAnalyze-8B \
    --max-model-len 8192 \
    --max-num-batched-tokens 8192 \
    --gpu-memory-utilization 0.95 \
    --port "$VLLM_PORT" \
    --trust-remote-code > "$LOG_DIR/vllm.log" 2>&1 &

VLLM_PID=$!
echo "vLLM started with PID: $VLLM_PID. Waiting for initialization (this may take a few minutes)..."

# 2. Wait for vLLM to be ready (health check)
MAX_RETRIES=60
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s "http://localhost:$VLLM_PORT/health" > /dev/null; then
        echo "vLLM is ready!"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 5
    echo "Waiting for vLLM... ($((RETRY_COUNT * 5))s)"
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "Warning: vLLM initialization is taking longer than expected. Proceeding anyway..."
fi

# 3. Start Backend API
echo "[2/3] Starting Backend API..."
cd "$SCRIPT_DIR/demo/chat" || exit
nohup "$PYTHON_BIN" backend.py > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "Backend API started with PID: $BACKEND_PID"

# 4. Start Frontend
echo "[3/3] Starting Web Frontend..."
if [ -d "$SCRIPT_DIR/demo/chat/frontend" ]; then
    cd "$SCRIPT_DIR/demo/chat/frontend" || exit
    # Check if node_modules exists, if not run npm install
    if [ ! -d "node_modules" ]; then
        echo "Installing frontend dependencies (first time)..."
        npm install
    fi
    nohup npm run dev -- -p "$FRONTEND_PORT" > "$LOG_DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    echo "Frontend started with PID: $FRONTEND_PID"
else
    echo "Warning: Frontend directory not found."
fi

# Save PIDs for stop script
echo "$VLLM_PID" > "$LOG_DIR/vllm.pid"
echo "$BACKEND_PID" > "$LOG_DIR/backend.pid"
echo "$FRONTEND_PID" > "$LOG_DIR/frontend.pid"

echo "=========================================="
echo "All services are starting up!"
echo "Model URL:    http://localhost:$VLLM_PORT"
echo "Backend API:  http://localhost:$API_PORT"
echo "Frontend UI:   http://localhost:$FRONTEND_PORT"
echo "=========================================="
echo "Check logs in $LOG_DIR/ for details."
