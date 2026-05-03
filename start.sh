#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
		mlx_model_dir="${DEEPANALYZE_MLX_MODEL_DIR:-$SCRIPT_DIR/DeepAnalyze-8B-MLX-4bit}"
		if [[ ! -d "$mlx_model_dir" && -d "$SCRIPT_DIR/DeepAnalyze-8B-MLX-FP16" ]]; then
			mlx_model_dir="$SCRIPT_DIR/DeepAnalyze-8B-MLX-FP16"
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
			echo "Warning: MLX profile is best for Apple Silicon (Darwin arm64)."
		fi
	else
		local gpu_detected="false"
		if command -v nvidia-smi >/dev/null 2>&1; then
			gpu_detected="true"
		elif command -v clinfo >/dev/null 2>&1; then
			gpu_detected="true"
		fi
		if [[ "$gpu_detected" == "false" ]]; then
			echo "Warning: No CUDA/OpenCL tool detected. GPU profile may still work with remote endpoints."
		fi
	fi
}

BACKEND_ARG=""
if [[ "${1:-}" == "--backend" ]]; then
	BACKEND_ARG="$(normalize_backend "${2:-}")"
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
