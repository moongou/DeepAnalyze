#!/bin/bash

# ==============================================================================
# DeepAnalyze GPU (CUDA/OpenCL/DirectML) Startup Script
# DeepAnalyze GPU（CUDA/OpenCL/DirectML）启动脚本
# ==============================================================================
# Based on start_all.sh with GPU-specific hardware detection and optimizations.
# 基于 start_all.sh，增加了 GPU 硬件检测和优化。
# ==============================================================================

# --- Configuration / 配置 ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="python3"
VENV_PATH="$SCRIPT_DIR/demo/jupyter/.venv"
MODEL_DIR="$SCRIPT_DIR/DeepAnalyze-8B"
VLLM_PORT=8000
API_PORT=8200
FRONTEND_PORT=4000
LOG_DIR="$SCRIPT_DIR/logs"

# Default vLLM tuning parameters / 默认 vLLM 调优参数
GPU_MEMORY_UTILIZATION=0.90
MAX_MODEL_LEN=8192
MAX_NUM_BATCHED_TOKENS=8192

# Use venv if exists / 如果虚拟环境存在则使用
if [ -f "$VENV_PATH/bin/python" ]; then
    PYTHON_BIN="$VENV_PATH/bin/python"
    echo "Using virtual environment: $VENV_PATH"
    echo "使用虚拟环境：$VENV_PATH"
fi

# Create logs directory / 创建日志目录
mkdir -p "$LOG_DIR"

echo "========================================================"
echo "   DeepAnalyze GPU Startup Script                       "
echo "   DeepAnalyze GPU 启动脚本                              "
echo "========================================================"

# ==============================================================================
# GPU Hardware Detection / GPU 硬件检测
# ==============================================================================
echo ""
echo "--- GPU Hardware Detection / GPU 硬件检测 ---"

CUDA_AVAILABLE=false
GPU_VRAM_MB=0

if command -v nvidia-smi >/dev/null 2>&1; then
    CUDA_AVAILABLE=true

    # Detect NVIDIA driver version / 检测 NVIDIA 驱动版本
    NVIDIA_DRIVER_VERSION=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1)
    echo "NVIDIA Driver Version / NVIDIA 驱动版本: $NVIDIA_DRIVER_VERSION"

    CUDA_RUNTIME=$(nvidia-smi 2>/dev/null | grep -oP "CUDA Version: \K[0-9.]+" | head -1)
    if [ -n "$CUDA_RUNTIME" ]; then
        echo "CUDA Version / CUDA 版本: $CUDA_RUNTIME"
    fi

    # Show GPU info / 显示 GPU 信息
    echo ""
    echo "Detected GPUs / 检测到的 GPU:"
    nvidia-smi --query-gpu=index,name,memory.total,memory.free --format=csv,noheader 2>/dev/null
    echo ""

    # Get VRAM of the first GPU (in MiB) for auto-tuning
    # 获取第一块 GPU 显存（MiB）用于自动调优
    GPU_VRAM_MB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')

    if [ -n "$GPU_VRAM_MB" ] && [ "$GPU_VRAM_MB" -gt 0 ] 2>/dev/null; then
        echo "Primary GPU VRAM / 主 GPU 显存: ${GPU_VRAM_MB} MiB"

        # Auto-adjust parameters based on available VRAM
        # 根据可用显存自动调整参数
        if [ "$GPU_VRAM_MB" -ge 80000 ]; then
            # 80GB+ (A100/H100): aggressive settings / 激进设置
            GPU_MEMORY_UTILIZATION=0.95
            MAX_MODEL_LEN=16384
            MAX_NUM_BATCHED_TOKENS=16384
            echo "Profile: High-end GPU (80GB+) / 配置：高端 GPU（80GB+）"
        elif [ "$GPU_VRAM_MB" -ge 40000 ]; then
            # 40-80GB (A100-40GB, A6000): high settings / 高配置
            GPU_MEMORY_UTILIZATION=0.93
            MAX_MODEL_LEN=12288
            MAX_NUM_BATCHED_TOKENS=12288
            echo "Profile: Large GPU (40-80GB) / 配置：大显存 GPU（40-80GB）"
        elif [ "$GPU_VRAM_MB" -ge 20000 ]; then
            # 20-40GB (A5000, RTX 3090/4090): balanced settings / 均衡设置
            GPU_MEMORY_UTILIZATION=0.90
            MAX_MODEL_LEN=8192
            MAX_NUM_BATCHED_TOKENS=8192
            echo "Profile: Medium GPU (20-40GB) / 配置：中等显存 GPU（20-40GB）"
        elif [ "$GPU_VRAM_MB" -ge 10000 ]; then
            # 10-20GB (RTX 3080/4080): conservative settings / 保守设置
            GPU_MEMORY_UTILIZATION=0.85
            MAX_MODEL_LEN=4096
            MAX_NUM_BATCHED_TOKENS=4096
            echo "Profile: Standard GPU (10-20GB) / 配置：标准 GPU（10-20GB）"
        else
            # <10GB: minimal settings / 最小设置
            GPU_MEMORY_UTILIZATION=0.80
            MAX_MODEL_LEN=2048
            MAX_NUM_BATCHED_TOKENS=2048
            echo "Profile: Low VRAM GPU (<10GB) / 配置：低显存 GPU（<10GB）"
            echo "⚠️  Warning: Low VRAM may cause out-of-memory errors."
            echo "   警告：显存较低，可能出现内存不足错误。"
        fi
    fi

    # Set CUDA device visibility / 设置 CUDA 设备可见性
    # Default to first GPU if not already set / 如果未设置则默认使用第一块 GPU
    if [ -z "$CUDA_VISIBLE_DEVICES" ]; then
        export CUDA_VISIBLE_DEVICES=0
        echo "CUDA_VISIBLE_DEVICES set to: $CUDA_VISIBLE_DEVICES"
    else
        echo "CUDA_VISIBLE_DEVICES already set: $CUDA_VISIBLE_DEVICES"
    fi
else
    echo "⚠️  nvidia-smi not found. CUDA GPU detection unavailable."
    echo "   未找到 nvidia-smi，无法检测 CUDA GPU。"
    echo "   Proceeding with default vLLM settings..."
    echo "   将使用默认 vLLM 设置继续..."
fi

echo ""
echo "vLLM Parameters / vLLM 参数:"
echo "  gpu-memory-utilization: $GPU_MEMORY_UTILIZATION"
echo "  max-model-len:          $MAX_MODEL_LEN"
echo "  max-num-batched-tokens:  $MAX_NUM_BATCHED_TOKENS"
echo ""

# ==============================================================================
# [1/3] Start vLLM Model Server / 启动 vLLM 模型服务器
# ==============================================================================
echo "[1/3] Starting vLLM Model Server (GPU)..."
echo "      启动 vLLM 模型服务器（GPU）..."

if [ ! -d "$MODEL_DIR" ]; then
    echo "Error: Model directory $MODEL_DIR not found!"
    echo "错误：模型目录 $MODEL_DIR 未找到！"
    exit 1
fi

nohup "$PYTHON_BIN" -m vllm.entrypoints.openai.api_server \
    --model "$MODEL_DIR" \
    --served-model-name DeepAnalyze-8B \
    --max-model-len "$MAX_MODEL_LEN" \
    --max-num-batched-tokens "$MAX_NUM_BATCHED_TOKENS" \
    --gpu-memory-utilization "$GPU_MEMORY_UTILIZATION" \
    --port "$VLLM_PORT" \
    --trust-remote-code > "$LOG_DIR/vllm.log" 2>&1 &

VLLM_PID=$!
echo "vLLM started with PID: $VLLM_PID. Waiting for initialization (this may take a few minutes)..."
echo "vLLM 已启动，PID: $VLLM_PID。等待初始化（可能需要几分钟）..."

# ==============================================================================
# [Health Check] Wait for vLLM to be ready / 等待 vLLM 就绪
# ==============================================================================
MAX_RETRIES=60
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s "http://localhost:$VLLM_PORT/health" > /dev/null; then
        echo "✅ vLLM is ready! / vLLM 已就绪！"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 5
    echo "Waiting for vLLM... ($((RETRY_COUNT * 5))s) / 等待 vLLM..."
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "⚠️  Warning: vLLM initialization is taking longer than expected. Proceeding anyway..."
    echo "   警告：vLLM 初始化时间超出预期，继续执行..."
fi

# ==============================================================================
# [2/3] Start Backend API / 启动后端 API
# ==============================================================================
echo "[2/3] Starting Backend API..."
echo "      启动后端 API..."
cd "$SCRIPT_DIR/demo/chat" || exit
nohup "$PYTHON_BIN" backend.py > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "Backend API started with PID: $BACKEND_PID"

# ==============================================================================
# [3/3] Start Frontend / 启动前端
# ==============================================================================
echo "[3/3] Starting Web Frontend..."
echo "      启动前端..."
if [ -d "$SCRIPT_DIR/demo/chat/frontend" ]; then
    cd "$SCRIPT_DIR/demo/chat/frontend" || exit
    # Check if node_modules exists, if not run npm install
    # 检查 node_modules 是否存在，如不存在则运行 npm install
    if [ ! -d "node_modules" ]; then
        echo "Installing frontend dependencies (first time)..."
        echo "安装前端依赖（首次运行）..."
        npm install
    fi
    nohup npm run dev -- -p "$FRONTEND_PORT" > "$LOG_DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    echo "Frontend started with PID: $FRONTEND_PID"
else
    echo "⚠️  Warning: Frontend directory not found. / 警告：前端目录未找到。"
fi

# ==============================================================================
# Save PIDs for stop script / 保存 PID 供停止脚本使用
# ==============================================================================
echo "$VLLM_PID" > "$LOG_DIR/vllm.pid"
echo "$BACKEND_PID" > "$LOG_DIR/backend.pid"
echo "$FRONTEND_PID" > "$LOG_DIR/frontend.pid"

echo "========================================================"
echo "All services are starting up with GPU acceleration!"
echo "所有服务正在以 GPU 加速模式启动！"
echo ""
echo "  Model URL / 模型地址:    http://localhost:$VLLM_PORT"
echo "  Backend API / 后端 API:  http://localhost:$API_PORT"
echo "  Frontend UI / 前端界面:  http://localhost:$FRONTEND_PORT"
echo ""
echo "Check logs in $LOG_DIR/ for details."
echo "查看 $LOG_DIR/ 目录中的日志以获取详细信息。"
echo "========================================================"
