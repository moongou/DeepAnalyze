#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"

echo "=========================================="
echo "   DeepAnalyze Stopping Services          "
echo "=========================================="

# Function to kill process by PID file
kill_from_pid_file() {
    local name=$1
    local file=$2
    if [ -f "$file" ]; then
        local pid=$(cat "$file")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "Stopping $name (PID: $pid)..."
            kill "$pid" 2>/dev/null || true
            # Wait briefly then force kill if still alive
            sleep 1
            kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
        else
            echo "$name (PID: $pid) already stopped."
        fi
        rm -f "$file"
    else
        echo "$name PID file not found, skipping."
    fi
}

# Kill known PIDs (order: MLX → Backend → Frontend)
kill_from_pid_file "MLX Server" "$LOG_DIR/vllm.pid"
kill_from_pid_file "Backend API" "$LOG_DIR/backend.pid"
kill_from_pid_file "Frontend" "$LOG_DIR/frontend.pid"

# Safety cleanup: ensure all related processes are stopped
echo "Performing safety sweep..."

# MLX model server
pkill -f "mlx_lm.server" 2>/dev/null || true

# vLLM model server (GPU mode)
pkill -f "vllm" 2>/dev/null || true

# Backend (FastAPI/uvicorn)
pkill -f "backend.py" 2>/dev/null || true

# Frontend (Next.js dev server) - be specific to avoid killing other node processes
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-dev" 2>/dev/null || true

# Also kill any orphaned node processes on the frontend port (4000)
if command -v lsof >/dev/null 2>&1; then
    for pid in $(lsof -ti :4000 2>/dev/null); do
        echo "Killing orphan process on port 4000 (PID: $pid)..."
        kill -9 "$pid" 2>/dev/null || true
    done
fi

echo "Done. All services stopped."
echo "=========================================="
