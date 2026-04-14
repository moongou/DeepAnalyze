#!/bin/bash

# ==============================================================================
# DeepAnalyze Unified Startup Script / DeepAnalyze 统一启动脚本
# ==============================================================================
# This script provides a single entry point to launch DeepAnalyze using either:
#   - MLX backend (Apple Silicon / M-series chips)
#   - GPU backend (CUDA / OpenCL / DirectML)
#
# 本脚本提供统一入口，用于启动 DeepAnalyze：
#   - MLX 后端（Apple Silicon / M 系列芯片）
#   - GPU 后端（CUDA / OpenCL / DirectML）
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Banner / 横幅 ---
echo "╔══════════════════════════════════════════════════╗"
echo "║                                                  ║"
echo "║              🔬  D e e p A n a l y z e           ║"
echo "║                                                  ║"
echo "║       Intelligent Analysis Platform              ║"
echo "║       智能分析平台                                ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# --- Menu: Choose backend / 选择后端 ---
echo "Please select your compute backend / 请选择计算后端:"
echo ""
echo "  1) MLX  - Apple Silicon (M1/M2/M3/M4) [Default / 默认]"
echo "  2) GPU  - CUDA / OpenCL / DirectML"
echo ""

# Read user choice with a 10-second timeout; default to MLX
# 读取用户选择，10 秒超时后默认选择 MLX
read -t 10 -p "Enter choice / 输入选项 [1]: " CHOICE
echo "" # newline after read

# Default to 1 (MLX) on timeout or empty input
# 超时或空输入时默认选择 1（MLX）
CHOICE="${CHOICE:-1}"

# ==============================================================================
# Helper: Ask user to confirm continuation after a warning
# 辅助函数：警告后询问用户是否继续
# ==============================================================================
ask_continue() {
    local msg="$1"
    echo ""
    echo "⚠️  WARNING / 警告: $msg"
    echo ""
    read -p "Continue anyway? / 是否仍然继续？ (y/N): " CONFIRM
    CONFIRM="${CONFIRM:-N}"
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo "Aborted. / 已取消。"
        exit 0
    fi
}

# ==============================================================================
# Option 1: MLX (Apple Silicon)
# 选项 1：MLX（Apple Silicon）
# ==============================================================================
if [ "$CHOICE" = "1" ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Selected: MLX (Apple Silicon)"
    echo "  已选择：MLX（Apple Silicon）"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Check for Apple Metal support / 检测 Apple Metal 支持
    METAL_AVAILABLE=false
    if [[ "$(uname)" == "Darwin" ]]; then
        # macOS: use system_profiler to check for Metal support
        # macOS：使用 system_profiler 检测 Metal 支持
        if command -v system_profiler >/dev/null 2>&1; then
            if system_profiler SPDisplaysDataType 2>/dev/null | grep -qi "Metal"; then
                METAL_AVAILABLE=true
                echo "✅ Apple Metal support detected. / 检测到 Apple Metal 支持。"
            fi
        fi
    fi

    if [ "$METAL_AVAILABLE" = false ]; then
        ask_continue "Apple Metal not detected. MLX requires Metal-capable Apple Silicon. / 未检测到 Apple Metal。MLX 需要支持 Metal 的 Apple Silicon。"
    fi

    echo ""
    echo "Launching MLX startup script... / 正在启动 MLX 启动脚本..."
    exec "$SCRIPT_DIR/start_all_mlx.sh"

# ==============================================================================
# Option 2: GPU (CUDA / OpenCL / DirectML)
# 选项 2：GPU（CUDA / OpenCL / DirectML）
# ==============================================================================
elif [ "$CHOICE" = "2" ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Selected: GPU (CUDA / OpenCL / DirectML)"
    echo "  已选择：GPU（CUDA / OpenCL / DirectML）"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Detect available GPU frameworks / 检测可用的 GPU 框架
    GPU_FOUND=false

    # Check CUDA via nvidia-smi / 通过 nvidia-smi 检测 CUDA
    if command -v nvidia-smi >/dev/null 2>&1; then
        echo "✅ CUDA (NVIDIA) detected. / 检测到 CUDA（NVIDIA）。"
        nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | head -5
        GPU_FOUND=true
    fi

    # Check OpenCL via clinfo / 通过 clinfo 检测 OpenCL
    if command -v clinfo >/dev/null 2>&1; then
        echo "✅ OpenCL detected. / 检测到 OpenCL。"
        GPU_FOUND=true
    fi

    # Check DirectML (Windows/WSL) / 检测 DirectML（Windows/WSL 环境）
    if [ -d "/usr/lib/wsl" ] || [ -f "/usr/lib/libdirectml.so" ]; then
        echo "✅ DirectML (WSL) detected. / 检测到 DirectML（WSL）。"
        GPU_FOUND=true
    fi

    if [ "$GPU_FOUND" = false ]; then
        ask_continue "No GPU framework (CUDA/OpenCL/DirectML) detected. Consider using MLX instead (option 1). / 未检测到 GPU 框架（CUDA/OpenCL/DirectML）。建议使用 MLX（选项 1）。"
    fi

    echo ""
    echo "Launching GPU startup script... / 正在启动 GPU 启动脚本..."
    exec "$SCRIPT_DIR/start_all_gpu.sh"

# ==============================================================================
# Invalid choice / 无效选项
# ==============================================================================
else
    echo "❌ Invalid choice: $CHOICE. Please enter 1 or 2."
    echo "   无效选项：$CHOICE。请输入 1 或 2。"
    exit 1
fi
