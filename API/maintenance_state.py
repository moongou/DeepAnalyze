"""Thread-safe maintenance state for API background jobs."""

import threading
import time
from typing import Any, Dict, Optional

_lock = threading.Lock()
_cleanup_state: Dict[str, Any] = {
    "enabled": False,
    "started_at": None,
    "last_run_at": None,
    "last_success_at": None,
    "last_error_at": None,
    "last_error": None,
    "last_cleaned_count": 0,
    "run_count": 0,
    "failure_count": 0,
    "interval_minutes": None,
    "timeout_hours": None,
}


def mark_cleanup_started(interval_minutes: int, timeout_hours: int, enabled: bool = True) -> None:
    with _lock:
        _cleanup_state.update(
            {
                "enabled": enabled,
                "started_at": int(time.time()),
                "interval_minutes": interval_minutes,
                "timeout_hours": timeout_hours,
            }
        )


def mark_cleanup_disabled(interval_minutes: int, timeout_hours: int) -> None:
    mark_cleanup_started(interval_minutes=interval_minutes, timeout_hours=timeout_hours, enabled=False)


def mark_cleanup_success(cleaned_count: int) -> None:
    now = int(time.time())
    with _lock:
        _cleanup_state.update(
            {
                "last_run_at": now,
                "last_success_at": now,
                "last_error": None,
                "last_cleaned_count": int(cleaned_count),
                "run_count": int(_cleanup_state.get("run_count") or 0) + 1,
            }
        )


def mark_cleanup_failure(error: Exception) -> None:
    now = int(time.time())
    with _lock:
        _cleanup_state.update(
            {
                "last_run_at": now,
                "last_error_at": now,
                "last_error": str(error),
                "failure_count": int(_cleanup_state.get("failure_count") or 0) + 1,
            }
        )


def get_cleanup_status() -> Dict[str, Optional[Any]]:
    with _lock:
        return dict(_cleanup_state)