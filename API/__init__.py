"""
DeepAnalyze API Package
OpenAI-compatible API server for DeepAnalyze model
"""

__version__ = "1.1.16"
__title__ = "DeepAnalyze OpenAI-Compatible API"

__all__ = ["create_app", "main"]


def __getattr__(name):
    if name in ("create_app", "main"):
        from .main import create_app, main
        return create_app if name == "create_app" else main
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")