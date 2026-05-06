#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_banner() {
	local term_cols
	term_cols="$(tput cols 2>/dev/null || echo 80)"
	if [[ ! "$term_cols" =~ ^[0-9]+$ ]]; then
		term_cols=80
	fi

	print_centered_line() {
		local line="$1"
		local width="$2"
		local line_len="${#line}"
		if (( line_len >= width )); then
			echo "$line"
			return
		fi
		local pad=$(( (width - line_len) / 2 ))
		printf "%*s%s\n" "$pad" "" "$line"
	}

	while IFS= read -r line; do
		print_centered_line "$line" "$term_cols"
	done <<'EOF'
           ▄▄▄▄▄▄▄▄▄▄    ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
   ███████ ██▀▀▀▀▀▀██    ▀▀▀▀▀▀▀▀▀██▀▀▀▀▀▀▀▀▀
       ▄█▀ ██  ▄▄  ██      ▄▄▄▄▄▄▄██▄▄▄▄▄▄▄
   ██▄ ██  ██  ██  ██     ▀██▀▀▀▀▀██▀▀▀▀▀██▀
    ▀█▄██  ██  ██  ██      ██ ▄▄  ██ ██▄ ██
      ██▄  ██ ▄█▀  ██      ██  ▀█ ██  ▀█ ██
    ▄██▀█▄ ▀  ████         ██ ▄▄  ██ █▄  ██
  ▄██▀  ▀▀  ▄██▀██   ▄     ██ ▀██ ██  ██ ██
  ▀▀     ▄▄██▀  ██  ███    ██     ██   ▄▄██
        ▀█▀▀    ▀▀▀▀▀▀    ▀▀▀          ▀█▀▀
EOF
	echo ""
	print_centered_line "AI-powered Customs Risk Analysis Expert" "$term_cols"
	echo ""
}

ask_continue() {
	local msg="$1"
	local confirm

	if [[ "${DEEPANALYZE_ASSUME_YES:-}" == "1" ]]; then
		echo "Warning: $msg"
		echo "Auto-continue enabled by DEEPANALYZE_ASSUME_YES=1"
		return 0
	fi

	if [[ ! -t 0 ]]; then
		echo "Warning: $msg"
		echo "Non-interactive shell detected, continue by default."
		return 0
	fi

	echo ""
	echo "⚠️  WARNING / 警告: $msg"
	read -r -p "Continue anyway? / 是否仍然继续？ (y/N): " confirm
	confirm="${confirm:-N}"
	if [[ "$confirm" =~ ^[Yy]$ ]]; then
		return 0
	fi

	echo "Aborted. / 已取消。"
	return 1
}

normalize_backend() {
	local raw="${1:-}"
	raw="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
	case "$raw" in
		1|mlx|apple|apple_silicon) echo "mlx" ;;
		2|gpu|cuda|nvidia) echo "gpu" ;;
		*) echo "" ;;
	esac
}

detect_default_backend() {
	if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
		echo "mlx"
	else
		echo "gpu"
	fi
}

apply_backend_profile() {
	local backend="$1"
	if [[ "$backend" == "mlx" ]]; then
		local mlx_model_dir
		mlx_model_dir="${DEEPANALYZE_MLX_MODEL_DIR:-$SCRIPT_DIR/DeepAnalyze-8B-MLX-FP16}"
		if [[ ! -d "$mlx_model_dir" && -d "$SCRIPT_DIR/DeepAnalyze-8B-MLX-4bit" ]]; then
			mlx_model_dir="$SCRIPT_DIR/DeepAnalyze-8B-MLX-4bit"
		fi
		export DEEPANALYZE_MLX_MODEL_DIR="$mlx_model_dir"
		export DEEPANALYZE_COMPUTE_BACKEND="mlx"
		export DEEPANALYZE_DEFAULT_PROVIDER_TYPE="${DEEPANALYZE_MLX_PROVIDER_TYPE:-openai_compatible}"
		export DEEPANALYZE_DEFAULT_PROVIDER_LABEL="${DEEPANALYZE_MLX_PROVIDER_LABEL:-DeepAnalyze MLX}"
		export DEEPANALYZE_DEFAULT_PROVIDER_DESCRIPTION="${DEEPANALYZE_MLX_PROVIDER_DESCRIPTION:-项目默认本地 MLX 服务}"
		export DEEPANALYZE_DEFAULT_MODEL_BASE_URL="${DEEPANALYZE_MLX_BASE_URL:-http://localhost:8000/v1}"
		export DEEPANALYZE_DEFAULT_MODEL_NAME="${DEEPANALYZE_MLX_MODEL:-$mlx_model_dir}"
	else
		export DEEPANALYZE_GPU_MODEL_DIR="${DEEPANALYZE_GPU_MODEL_DIR:-$SCRIPT_DIR/DeepAnalyze-8B}"
		export DEEPANALYZE_COMPUTE_BACKEND="gpu"
		export DEEPANALYZE_DEFAULT_PROVIDER_TYPE="${DEEPANALYZE_GPU_PROVIDER_TYPE:-deepanalyze}"
		export DEEPANALYZE_DEFAULT_PROVIDER_LABEL="${DEEPANALYZE_GPU_PROVIDER_LABEL:-DeepAnalyze GPU}"
		export DEEPANALYZE_DEFAULT_PROVIDER_DESCRIPTION="${DEEPANALYZE_GPU_PROVIDER_DESCRIPTION:-项目默认本地 GPU vLLM 服务}"
		export DEEPANALYZE_DEFAULT_MODEL_BASE_URL="${DEEPANALYZE_GPU_BASE_URL:-http://localhost:8000/v1}"
		export DEEPANALYZE_DEFAULT_MODEL_NAME="${DEEPANALYZE_GPU_MODEL:-DeepAnalyze-8B}"
	fi

	# Frontend runtime defaults (picked up by Next.js dev server at startup)
	export NEXT_PUBLIC_AI_API_URL="$DEEPANALYZE_DEFAULT_MODEL_BASE_URL"
	export NEXT_PUBLIC_DEFAULT_PROVIDER_TYPE="$DEEPANALYZE_DEFAULT_PROVIDER_TYPE"
	export NEXT_PUBLIC_DEFAULT_PROVIDER_LABEL="$DEEPANALYZE_DEFAULT_PROVIDER_LABEL"
	export NEXT_PUBLIC_DEFAULT_PROVIDER_DESCRIPTION="$DEEPANALYZE_DEFAULT_PROVIDER_DESCRIPTION"
	export NEXT_PUBLIC_DEFAULT_MODEL_NAME="$DEEPANALYZE_DEFAULT_MODEL_NAME"
}

print_profile_summary() {
	echo "Selected compute backend: $DEEPANALYZE_COMPUTE_BACKEND"
	echo "Default model endpoint:   $DEEPANALYZE_DEFAULT_MODEL_BASE_URL"
	echo "Default model name:       $DEEPANALYZE_DEFAULT_MODEL_NAME"
	echo "Default provider type:    $DEEPANALYZE_DEFAULT_PROVIDER_TYPE"
}

warn_if_backend_mismatch() {
	if [[ "$DEEPANALYZE_COMPUTE_BACKEND" == "mlx" ]]; then
		if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
			ask_continue "MLX profile is best for Apple Silicon (Darwin arm64)." || exit 1
		fi
	else
		local gpu_detected="false"
		local cuda_version=""
		if command -v nvidia-smi >/dev/null 2>&1; then
			gpu_detected="true"
			cuda_version="$(nvidia-smi 2>/dev/null | sed -n 's/.*CUDA Version: \([0-9.]*\).*/\1/p' | head -1)"
			echo "Detected NVIDIA GPU via nvidia-smi${cuda_version:+ (CUDA $cuda_version)}"
			nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader 2>/dev/null | head -5 || true
		elif command -v clinfo >/dev/null 2>&1; then
			gpu_detected="true"
			echo "Detected OpenCL runtime via clinfo"
		elif [[ -d "/usr/lib/wsl" || -f "/usr/lib/libdirectml.so" ]]; then
			gpu_detected="true"
			echo "Detected DirectML (WSL) runtime"
		fi
		if [[ "$gpu_detected" == "false" ]]; then
			ask_continue "No CUDA/OpenCL/DirectML tool detected. GPU profile may still work with remote endpoints." || exit 1
		fi
	fi
}

print_banner

BACKEND_ARG=""
if [[ "${1:-}" == "--backend" ]]; then
	BACKEND_ARG="$(normalize_backend "${2:-}")"
elif [[ "${1:-}" == --backend=* ]]; then
	BACKEND_ARG="$(normalize_backend "${1#--backend=}")"
fi

SELECTED_BACKEND=""
if [[ -n "$BACKEND_ARG" ]]; then
	SELECTED_BACKEND="$BACKEND_ARG"
elif [[ -n "${DEEPANALYZE_COMPUTE_BACKEND:-}" ]]; then
	SELECTED_BACKEND="$(normalize_backend "$DEEPANALYZE_COMPUTE_BACKEND")"
fi

if [[ -z "$SELECTED_BACKEND" ]]; then
	DEFAULT_BACKEND="$(detect_default_backend)"
	echo "DeepAnalyze startup profile selection"
	echo "1) Apple Silicon / MLX"
	echo "2) GPU / CUDA/OpenCL"
	if [[ "$DEFAULT_BACKEND" == "mlx" ]]; then
		read -t 12 -p "Choose backend [1]: " CHOICE
		CHOICE="${CHOICE:-1}"
	else
		read -t 12 -p "Choose backend [2]: " CHOICE
		CHOICE="${CHOICE:-2}"
	fi
	SELECTED_BACKEND="$(normalize_backend "$CHOICE")"
fi

if [[ -z "$SELECTED_BACKEND" ]]; then
	echo "Invalid backend choice. Use --backend mlx|gpu"
	exit 1
fi

apply_backend_profile "$SELECTED_BACKEND"
warn_if_backend_mismatch
print_profile_summary

cd "$SCRIPT_DIR/demo/chat" || exit 1
exec bash start.sh
