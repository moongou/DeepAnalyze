#!/bin/bash

LOG_DIR="./logs"

echo "=========================================="
echo "   DeepAnalyze Stopping Services          "
echo "=========================================="

# Function to kill process by PID file
kill_from_pid_file() {
    local name=$1
    local file=$2
    if [ -f "$file" ]; then
        local pid=$(cat "$file")
        echo "Stopping $name (PID: $pid)..."
        kill "$pid" 2>/dev/null || true
        rm "$file"
    else
        echo "$name PID file not found, skipping."
    fi
}

# Kill known PIDs
kill_from_pid_file "Frontend" "$LOG_DIR/frontend.pid"
kill_from_pid_file "Backend" "$LOG_DIR/backend.pid"
kill_from_pid_file "vLLM" "$LOG_DIR/vllm.pid"

# Backup cleanup (pkill as safety)
echo "Ensuring all related processes are stopped..."
pkill -f "vllm.entrypoints.openai.api_server" 2>/dev/null || true
pkill -f "backend.py" 2>/dev/null || true
pkill -f "next-dev" 2>/dev/null || true

echo "Done. All services stopped."
echo "=========================================="
