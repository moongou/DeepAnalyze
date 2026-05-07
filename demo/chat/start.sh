#!/bin/bash

echo "Starting Chat System"
echo "=========================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
VENV_PYTHON="$SCRIPT_DIR/../jupyter/.venv/bin/python"

preferred_mlx_model_dir() {
    local candidate
    candidate="${DEEPANALYZE_MLX_MODEL_DIR:-$PROJECT_ROOT/DeepAnalyze-8B-MLX-FP16}"
    if [ -d "$candidate" ]; then
        echo "$candidate"
        return 0
    fi

    if [ -d "$PROJECT_ROOT/DeepAnalyze-8B-MLX-4bit" ]; then
        echo "$PROJECT_ROOT/DeepAnalyze-8B-MLX-4bit"
        return 0
    fi

    echo "$candidate"
}

resolve_compute_backend() {
    local backend
    backend="$(printf '%s' "${1:-auto}" | tr '[:upper:]' '[:lower:]')"
    if [ -z "$backend" ] || [ "$backend" = "auto" ]; then
        if [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ]; then
            echo "mlx"
        else
            echo "gpu"
        fi
        return 0
    fi

    echo "$backend"
}

# Compute profile defaults (can be injected by root start.sh)
DEEPANALYZE_COMPUTE_BACKEND="$(resolve_compute_backend "${DEEPANALYZE_COMPUTE_BACKEND:-auto}")"
DEEPANALYZE_DEFAULT_PROVIDER_TYPE="${DEEPANALYZE_DEFAULT_PROVIDER_TYPE:-deepanalyze}"
DEEPANALYZE_DEFAULT_PROVIDER_LABEL="${DEEPANALYZE_DEFAULT_PROVIDER_LABEL:-DeepAnalyze 默认}"
DEEPANALYZE_DEFAULT_PROVIDER_DESCRIPTION="${DEEPANALYZE_DEFAULT_PROVIDER_DESCRIPTION:-项目默认本地 vLLM 服务}"
DEEPANALYZE_DEFAULT_MODEL_BASE_URL="${DEEPANALYZE_DEFAULT_MODEL_BASE_URL:-http://localhost:8000/v1}"
DEEPANALYZE_DEFAULT_MODEL_NAME="${DEEPANALYZE_DEFAULT_MODEL_NAME:-DeepAnalyze-8B}"
DEEPANALYZE_MODEL_AUTOSTART="${DEEPANALYZE_MODEL_AUTOSTART:-auto}"
DEEPANALYZE_MODEL_READY_TIMEOUT_SECONDS="${DEEPANALYZE_MODEL_READY_TIMEOUT_SECONDS:-90}"
DEEPANALYZE_FRONTEND_CLEAN_CACHE="${DEEPANALYZE_FRONTEND_CLEAN_CACHE:-1}"

if [ "$DEEPANALYZE_COMPUTE_BACKEND" = "mlx" ]; then
    if [ "$DEEPANALYZE_DEFAULT_PROVIDER_TYPE" = "deepanalyze" ]; then
        DEEPANALYZE_DEFAULT_PROVIDER_TYPE="openai_compatible"
    fi
    if [ "$DEEPANALYZE_DEFAULT_PROVIDER_LABEL" = "DeepAnalyze 默认" ]; then
        DEEPANALYZE_DEFAULT_PROVIDER_LABEL="DeepAnalyze MLX"
    fi
    if [ "$DEEPANALYZE_DEFAULT_PROVIDER_DESCRIPTION" = "项目默认本地 vLLM 服务" ]; then
        DEEPANALYZE_DEFAULT_PROVIDER_DESCRIPTION="项目默认本地 MLX 服务"
    fi
    if [ "$DEEPANALYZE_DEFAULT_MODEL_NAME" = "DeepAnalyze-8B" ]; then
        DEEPANALYZE_DEFAULT_MODEL_NAME="$(preferred_mlx_model_dir)"
    fi
fi

export DEEPANALYZE_COMPUTE_BACKEND
export DEEPANALYZE_DEFAULT_PROVIDER_TYPE
export DEEPANALYZE_DEFAULT_PROVIDER_LABEL
export DEEPANALYZE_DEFAULT_PROVIDER_DESCRIPTION
export DEEPANALYZE_DEFAULT_MODEL_BASE_URL
export DEEPANALYZE_DEFAULT_MODEL_NAME
export DEEPANALYZE_MODEL_AUTOSTART
export DEEPANALYZE_MODEL_READY_TIMEOUT_SECONDS
export DEEPANALYZE_FRONTEND_CLEAN_CACHE

# Make frontend defaults follow selected compute profile
export NEXT_PUBLIC_AI_API_URL="${NEXT_PUBLIC_AI_API_URL:-$DEEPANALYZE_DEFAULT_MODEL_BASE_URL}"
export NEXT_PUBLIC_DEFAULT_PROVIDER_TYPE="${NEXT_PUBLIC_DEFAULT_PROVIDER_TYPE:-$DEEPANALYZE_DEFAULT_PROVIDER_TYPE}"
export NEXT_PUBLIC_DEFAULT_PROVIDER_LABEL="${NEXT_PUBLIC_DEFAULT_PROVIDER_LABEL:-$DEEPANALYZE_DEFAULT_PROVIDER_LABEL}"
export NEXT_PUBLIC_DEFAULT_PROVIDER_DESCRIPTION="${NEXT_PUBLIC_DEFAULT_PROVIDER_DESCRIPTION:-$DEEPANALYZE_DEFAULT_PROVIDER_DESCRIPTION}"
export NEXT_PUBLIC_DEFAULT_MODEL_NAME="${NEXT_PUBLIC_DEFAULT_MODEL_NAME:-$DEEPANALYZE_DEFAULT_MODEL_NAME}"

echo "Compute backend profile: $DEEPANALYZE_COMPUTE_BACKEND"
echo "Model endpoint:          $DEEPANALYZE_DEFAULT_MODEL_BASE_URL"
echo "Model name:              $DEEPANALYZE_DEFAULT_MODEL_NAME"
echo "Provider type:           $DEEPANALYZE_DEFAULT_PROVIDER_TYPE"

if [ -x "$VENV_PYTHON" ]; then
    PYTHON_BIN="$VENV_PYTHON"
else
    PYTHON_BIN="$(command -v python3 || true)"
fi

if [ -z "$PYTHON_BIN" ]; then
    echo "Error: python3 not found. Please install Python 3 first."
    exit 1
fi

echo "Using Python interpreter: $PYTHON_BIN"

MODEL_BASE_URL_NO_TRAIL="${DEEPANALYZE_DEFAULT_MODEL_BASE_URL%/}"
MODEL_HOST_PORT="$(printf '%s' "$MODEL_BASE_URL_NO_TRAIL" | sed -E 's#^https?://([^/]+).*$#\1#')"
MODEL_HOST="$(printf '%s' "$MODEL_HOST_PORT" | cut -d':' -f1)"
MODEL_PORT="$(printf '%s' "$MODEL_HOST_PORT" | cut -s -d':' -f2)"
if [ -z "$MODEL_PORT" ]; then
    MODEL_PORT="80"
fi

MODEL_PID_FILE="$LOG_DIR/model.pid"
MODEL_PORT_FILE="$LOG_DIR/model.port"
MODEL_LOG_FILE="$LOG_DIR/model.log"

is_local_model_endpoint() {
    case "$MODEL_HOST" in
        localhost|127.0.0.1)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

should_autostart_model() {
    local mode
    mode="$(printf '%s' "$DEEPANALYZE_MODEL_AUTOSTART" | tr '[:upper:]' '[:lower:]')"
    if [ "$mode" = "0" ] || [ "$mode" = "false" ] || [ "$mode" = "off" ] || [ "$mode" = "no" ]; then
        return 1
    fi
    if [ "$mode" = "1" ] || [ "$mode" = "true" ] || [ "$mode" = "on" ] || [ "$mode" = "yes" ]; then
        return 0
    fi
    # auto mode: only local endpoint autostarts
    is_local_model_endpoint
}

should_clean_frontend_cache() {
    local mode
    mode="$(printf '%s' "$DEEPANALYZE_FRONTEND_CLEAN_CACHE" | tr '[:upper:]' '[:lower:]')"
    case "$mode" in
        0|false|off|no)
            return 1
            ;;
        *)
            return 0
            ;;
    esac
}

model_health_url() {
    echo "$MODEL_BASE_URL_NO_TRAIL/models"
}

wait_for_model_ready() {
    local timeout_seconds="$DEEPANALYZE_MODEL_READY_TIMEOUT_SECONDS"
    local elapsed=0
    local check_interval=2
    local url
    url="$(model_health_url)"

    while [ "$elapsed" -lt "$timeout_seconds" ]; do
        if curl -sSf "$url" >/dev/null 2>&1; then
            echo "Model endpoint is ready: $url"
            return 0
        fi
        sleep "$check_interval"
        elapsed=$((elapsed + check_interval))
    done

    return 1
}

start_model_server_if_needed() {
    local backend
    local mlx_model_dir
    local gpu_model_dir

    backend="$(printf '%s' "$DEEPANALYZE_COMPUTE_BACKEND" | tr '[:upper:]' '[:lower:]')"

    if [ "$backend" = "mlx" ]; then
        mlx_model_dir="$(preferred_mlx_model_dir)"

        if [ -d "$mlx_model_dir" ]; then
            export DEEPANALYZE_MLX_MODEL_DIR="$mlx_model_dir"
            # MLX OpenAI-compatible server expects model field to match local path.
            export DEEPANALYZE_DEFAULT_MODEL_NAME="$mlx_model_dir"
            export NEXT_PUBLIC_DEFAULT_MODEL_NAME="$DEEPANALYZE_DEFAULT_MODEL_NAME"
        fi
    else
        gpu_model_dir="${DEEPANALYZE_GPU_MODEL_DIR:-$PROJECT_ROOT/DeepAnalyze-8B}"
        export DEEPANALYZE_GPU_MODEL_DIR="$gpu_model_dir"
    fi

    if ! should_autostart_model; then
        echo "Model autostart skipped (DEEPANALYZE_MODEL_AUTOSTART=$DEEPANALYZE_MODEL_AUTOSTART)."
        return 0
    fi

    if ! is_local_model_endpoint; then
        echo "Model endpoint is not local ($DEEPANALYZE_DEFAULT_MODEL_BASE_URL); skipping local model startup."
        return 0
    fi

    if lsof -tiTCP:"$MODEL_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
        echo "Model port $MODEL_PORT already has a listener; verifying health..."
        if wait_for_model_ready; then
            echo "$MODEL_PORT" > "$MODEL_PORT_FILE"
            return 0
        fi
        echo "Error: model port $MODEL_PORT is occupied but endpoint is unhealthy."
        echo "Please stop the stale process and retry."
        return 1
    fi

    echo "Starting local model server for backend profile: $backend"

    if [ "$backend" = "mlx" ]; then
        if [ ! -d "$mlx_model_dir" ]; then
            echo "Error: MLX model directory not found."
            echo "Checked: $PROJECT_ROOT/DeepAnalyze-8B-MLX-FP16 and $PROJECT_ROOT/DeepAnalyze-8B-MLX-4bit"
            return 1
        fi

        if ! "$PYTHON_BIN" -c "import mlx_lm" >/dev/null 2>&1; then
            echo "Error: mlx_lm not available in current Python environment."
            echo "Please install mlx-lm or switch to GPU profile."
            return 1
        fi

        export HF_HUB_CACHE="${HF_HUB_CACHE:-$PROJECT_ROOT/.cache/huggingface}"
        mkdir -p "$HF_HUB_CACHE"

        nohup "$PYTHON_BIN" -m mlx_lm.server \
            --model "$mlx_model_dir" \
            --port "$MODEL_PORT" \
            --max-tokens 32768 \
            --trust-remote-code > "$MODEL_LOG_FILE" 2>&1 &
    else
        if [ ! -d "$gpu_model_dir" ]; then
            echo "Error: GPU/vLLM model directory not found: $gpu_model_dir"
            return 1
        fi

        if ! "$PYTHON_BIN" -c "import vllm" >/dev/null 2>&1; then
            echo "Error: vllm not available in current Python environment."
            echo "Please install vllm or switch to MLX profile."
            return 1
        fi

        nohup "$PYTHON_BIN" -m vllm.entrypoints.openai.api_server \
            --model "$gpu_model_dir" \
            --served-model-name "$DEEPANALYZE_DEFAULT_MODEL_NAME" \
            --max-model-len 8192 \
            --max-num-batched-tokens 8192 \
            --gpu-memory-utilization 0.90 \
            --port "$MODEL_PORT" \
            --trust-remote-code > "$MODEL_LOG_FILE" 2>&1 &
    fi

    local model_pid=$!
    echo "$model_pid" > "$MODEL_PID_FILE"
    echo "$MODEL_PORT" > "$MODEL_PORT_FILE"
    echo "Model server PID: $model_pid"
    echo "Model log: $MODEL_LOG_FILE"

    if ! wait_for_model_ready; then
        echo "Error: model server did not become ready within ${DEEPANALYZE_MODEL_READY_TIMEOUT_SECONDS}s."
        echo "Check model log: $MODEL_LOG_FILE"
        return 1
    fi

    return 0
}

# Ensure logs directory exists
mkdir -p "$LOG_DIR"
rm -f "$MODEL_PID_FILE" "$MODEL_PORT_FILE"

# Function to check and free ports
check_port() {
    local port=$1
    # Only target TCP LISTENers to avoid killing incidental connections
    local pids
    pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "Port $port in use by PIDs: $pids. Terminating..."
        kill $pids 2>/dev/null || true
        sleep 1
        # Force kill if still present
        local pids2
        pids2=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
        if [ -n "$pids2" ]; then
            echo "Force terminating remaining PIDs on $port: $pids2"
            kill -9 $pids2 2>/dev/null || true
            sleep 1
        fi
    fi
}

# Clean up old processes
echo "Cleaning old processes..."
pkill -f "python.*backend.py" 2>/dev/null || true
pkill -f "npm.*dev" 2>/dev/null || true
# Extra cleanup for child processes that may outlive npm
pkill -f "vite.*serve" 2>/dev/null || true
pkill -f "node.*vite" 2>/dev/null || true
pkill -f "react-scripts.*start" 2>/dev/null || true

# Frontend port (default 4000, can override via FRONTEND_PORT)
FRONTEND_PORT=${FRONTEND_PORT:-4000}

# Check and clean ports (only LISTENers)
check_port 8100
check_port 8200
check_port "$FRONTEND_PORT"

echo "Cleanup completed."
echo ""

if ! start_model_server_if_needed; then
    echo "Startup aborted due to local model server initialization failure."
    exit 1
fi

echo ""

# Start backend API (ports 8200, 8100)
echo "Starting backend API..."
nohup "$PYTHON_BIN" "$SCRIPT_DIR/backend.py" > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"
echo "API running on: http://localhost:8200"
echo "File service running on: http://localhost:8100"

# Wait for backend to initialize
sleep 3

# Start frontend (React, default port: $FRONTEND_PORT)
echo ""
echo "Starting React frontend..."
cd "$SCRIPT_DIR/frontend" || exit
if should_clean_frontend_cache; then
    if [ -d ".next" ]; then
        echo "Cleaning frontend .next cache..."
        rm -rf .next
    else
        echo "Frontend .next cache not found, skipping cleanup."
    fi
else
    echo "Frontend cache cleanup skipped (DEEPANALYZE_FRONTEND_CLEAN_CACHE=$DEEPANALYZE_FRONTEND_CLEAN_CACHE)."
fi
nohup npm run dev -- -p "$FRONTEND_PORT" > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"
echo "Frontend running on: http://localhost:$FRONTEND_PORT"

# Save PIDs
echo $BACKEND_PID > "$LOG_DIR/backend.pid"
echo $FRONTEND_PID > "$LOG_DIR/frontend.pid"

echo ""
echo "All services started successfully."
echo ""
echo "Service URLs:"
echo "  Backend API:  http://localhost:8200"
echo "  Frontend:     http://localhost:$FRONTEND_PORT"
echo "  File Service: http://localhost:8100"
echo ""
echo "Log files:"
echo "  Backend: logs/backend.log"
echo "  Frontend: logs/frontend.log"
echo ""
echo "Stop services: ./stop.sh"
