#!/bin/bash

# Configuration for M3 Max Optimization (MLX)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="$SCRIPT_DIR/demo/jupyter/.venv/bin/python"
MODEL_DIR="$SCRIPT_DIR/DeepAnalyze-8B-MLX-4bit"
MLX_PORT=8000
API_PORT=8200
FRONTEND_PORT=4000
LOG_DIR="$SCRIPT_DIR/logs"

# Create logs directory
mkdir -p "$LOG_DIR"

echo "===================================================="
echo "   DeepAnalyze MLX (Apple Silicon) Startup Script   "
echo "   Optimized for M3 Max / GPU Acceleration          "
echo "===================================================="

# 1. Check if MLX model exists
if [ ! -d "$MODEL_DIR" ]; then
    echo "MLX model not found at $MODEL_DIR"
    echo "Creating MLX 4-bit optimized model from original weights..."
    if [ ! -d "$SCRIPT_DIR/DeepAnalyze-8B" ]; then
        echo "Error: Original model directory $SCRIPT_DIR/DeepAnalyze-8B not found!"
        exit 1
    fi
    "$PYTHON_BIN" -m mlx_lm.convert --hf-path "$SCRIPT_DIR/DeepAnalyze-8B" -q --q-bits 4 --mlx-path "$MODEL_DIR"
fi

# 2. Start MLX Model Server
echo "[1/3] Starting MLX Model Server (GPU Accelerated)..."
# Setting HF_HUB_CACHE to avoid the crash I saw in testing
export HF_HUB_CACHE="$SCRIPT_DIR/.cache/huggingface"
mkdir -p "$HF_HUB_CACHE"

nohup "$PYTHON_BIN" -m mlx_lm.server \
    --model "$MODEL_DIR" \
    --port "$MLX_PORT" \
    --max-tokens 32768 \
    --trust-remote-code > "$LOG_DIR/mlx.log" 2>&1 &

MLX_PID=$!
echo "MLX Server started with PID: $MLX_PID. Initializing GPU..."

# 3. Wait for MLX to be ready (health check)
echo "Waiting for MLX server to initialize..."
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    # MLX server doesn't have /health, but we can check if the port is open
    if lsof -i :$MLX_PORT > /dev/null; then
        echo "MLX Server is listening on port $MLX_PORT!"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 2
    echo "Waiting for MLX... ($((RETRY_COUNT * 2))s)"
done

# 4. Start Backend API
echo "[2/3] Starting Backend API..."
cd "$SCRIPT_DIR/demo/chat" || exit
# Ensure MODEL_PATH matches what MLX server might return or ignore
nohup "$PYTHON_BIN" backend.py > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "Backend API started with PID: $BACKEND_PID"

# 5. Start Frontend
echo "[3/3] Starting Web Frontend..."
if [ -d "$SCRIPT_DIR/demo/chat/frontend" ]; then
    cd "$SCRIPT_DIR/demo/chat/frontend" || exit
    nohup npm run dev -- -p "$FRONTEND_PORT" > "$LOG_DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    echo "Frontend started with PID: $FRONTEND_PID"
else
    echo "Warning: Frontend directory not found."
fi

# Save PIDs for stop script
echo "$MLX_PID" > "$LOG_DIR/vllm.pid" # Reuse the same filename for stop_all.sh compatibility
echo "$BACKEND_PID" > "$LOG_DIR/backend.pid"
echo "$FRONTEND_PID" > "$LOG_DIR/frontend.pid"

echo "===================================================="
echo "All services are starting up with GPU acceleration!"
echo "MLX URL:      http://localhost:$MLX_PORT"
echo "Backend API:  http://localhost:$API_PORT"
echo "Frontend UI:  http://localhost:$FRONTEND_PORT"
echo "===================================================="
echo "Using MLX for M3 Max optimization. Check logs in $LOG_DIR/ for details."
