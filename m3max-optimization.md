# M3 Max Optimization Guide (MLX)

Your MacBook Pro with **M3 Max and 128GB RAM** is a powerhouse for AI. To get the best performance (GPU acceleration), we should use the **MLX framework** instead of vLLM.

## Benefits of MLX on M3 Max
1. **GPU Acceleration**: Uses the 40-core GPU of your M3 Max.
2. **Unified Memory**: Direct access to your 128GB RAM.
3. **Speed**: Significant performance boost compared to CPU-only inference.
4. **Efficiency**: Lower power consumption and heat.

## How to use the MLX version
I have already:
1. **Converted** your model to an optimized 4-bit MLX version located in `./DeepAnalyze-8B-MLX-4bit`.
2. **Created** a new startup script: `start_all_mlx.sh`.
3. **Updated** the backend to support MLX stop conditions.

### Starting with MLX (Recommended)
```bash
./stop_all.sh
./start_all_mlx.sh
```

### Checking GPU Usage
You can open **Activity Monitor** -> **Window** -> **GPU History** to see your M3 Max GPU working during inference.

---
*DeepAnalyze MLX Optimization for Apple Silicon*
