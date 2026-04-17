#!/bin/bash
# Start DeepAnalyze services (Backend + Frontend only, no model server)
SCRIPT_DIR="/Users/m3max/VS-CODE-PROJECT/DeepAnalyze/DeepAnalyze"
PYTHON_BIN="$SCRIPT_DIR/demo/jupyter/.venv/bin/python"
LOG_DIR="$SCRIPT_DIR/logs"

mkdir -p "$LOG_DIR"

# Kill any existing processes on our ports
lsof -ti:8200 | xargs kill -9 2>/dev/null || true
lsof -ti:4000 | xargs kill -9 2>/dev/null || true
lsof -ti:8100 | xargs kill -9 2>/dev/null || true

echo "=== Starting Backend API ==="
cd "$SCRIPT_DIR/demo/chat"
nohup "$PYTHON_BIN" backend.py > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"
echo "$BACKEND_PID" > "$LOG_DIR/backend.pid"

sleep 3
echo "--- Backend log ---"
tail -15 "$LOG_DIR/backend.log"

echo ""
echo "=== Starting Frontend ==="
cd "$SCRIPT_DIR/demo/chat/frontend"
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi
nohup npm run dev -- -p 4000 > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"
echo "$FRONTEND_PID" > "$LOG_DIR/frontend.pid"

sleep 5
echo "--- Frontend log ---"
tail -10 "$LOG_DIR/frontend.log"

echo ""
echo "===================================================="
echo "Services started (without model server):"
echo "  Backend API:  http://localhost:8200"
echo "  Frontend UI:  http://localhost:4000"
echo "===================================================="
echo "NOTE: MLX model server not started (model weights not found)."
echo "  To use, download DeepAnalyze-8B model weights first,"
echo "  then run: bash start_all_mlx.sh"
