"""
Structured logging middleware for DeepAnalyze API Server
Provides JSON-formatted request/response logging with tracing support
"""

import time
import json
import uuid
import logging
import sys
from typing import Optional, Dict, Any, Callable
from contextvars import ContextVar

from fastapi import Request

# Thread-safe request-level context
request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class JsonFormatter(logging.Formatter):
    """JSON log formatter for machine-readable structured logs."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "level": record.levelname,
            "timestamp": self.formatTime(record, datefmt="%Y-%m-%dT%H:%M:%S.%fZ"),
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_var.get(""),
        }

        # Add extra fields from the log record
        for key in ("duration_ms", "method", "path", "status_code", "user", "error"):
            val = getattr(record, key, None)
            if val is not None:
                log_entry[key] = val

        # Include exception info if present
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = str(record.exc_info[1])

        return json.dumps(log_entry, ensure_ascii=False)


def setup_logging(level: int = logging.INFO, json_format: bool = True):
    """Configure structured logging for the application."""
    logger = logging.getLogger("deepanalyze")
    logger.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    if json_format:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("[%(asctime)s] %(levelname)s %(name)s: %(message)s")
        )

    # Remove any existing handlers to avoid duplicates
    logger.handlers.clear()
    logger.addHandler(handler)
    logger.propagate = False
    return logger


# Create the default logger
log = setup_logging()


def log_api_call(
    method: str,
    path: str,
    duration_ms: float,
    status_code: int,
    user: Optional[str] = None,
    error: Optional[str] = None,
):
    """Log an API call with key metadata for observability."""
    log.info(
        f"{method} {path} -> {status_code} in {duration_ms:.1f}ms",
        extra={
            "method": method,
            "path": path,
            "duration_ms": round(duration_ms, 1),
            "status_code": status_code,
            "user": user or "-",
            "error": error,
        },
    )


def log_llm_call(
    model: str,
    duration_ms: float,
    token_count: int = 0,
    error: Optional[str] = None,
):
    """Log an LLM inference call."""
    log.info(
        f"LLM {model}: {token_count} tokens in {duration_ms:.1f}ms"
        + (f" [ERROR: {error}]" if error else ""),
        extra={
            "duration_ms": round(duration_ms, 1),
            "error": error,
        },
    )


def log_code_execution(
    duration_ms: float,
    error: Optional[str] = None,
    code_snippet: str = "",
):
    """Log a code execution event."""
    log.info(
        f"Code execution: {duration_ms:.1f}ms"
        + (f" [ERROR: {error[:100]}]" if error else " [OK]"),
        extra={
            "duration_ms": round(duration_ms, 1),
            "error": error,
        },
    )
