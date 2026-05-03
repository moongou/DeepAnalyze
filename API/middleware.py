"""
Security middleware for DeepAnalyze API Server
Provides rate limiting and request ID tracing as pure ASGI middleware
"""

import time
import uuid
from collections import defaultdict
from typing import Dict, Tuple

from fastapi import Request, HTTPException
from starlette.responses import JSONResponse


class RateLimiter:
    """Simple sliding-window in-memory rate limiter."""

    def __init__(self, max_requests: int = 60, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._windows: Dict[str, list] = defaultdict(list)

    def _clean_window(self, key: str, now: float) -> None:
        cutoff = now - self.window_seconds
        self._windows[key] = [t for t in self._windows[key] if t > cutoff]

    def is_allowed(self, key: str) -> Tuple[bool, int]:
        now = time.time()
        self._clean_window(key, now)
        count = len(self._windows[key])
        if count >= self.max_requests:
            return False, int(self.window_seconds - (now - min(self._windows[key])))
        self._windows[key].append(now)
        return True, 0

    def get_remaining(self, key: str) -> int:
        self._clean_window(key, time.time())
        return max(0, self.max_requests - len(self._windows[key]))


# Global rate limiter with defaults (configurable via env for testing)
import os as _os
_RL_DEFAULT = int(_os.getenv("DEEPANALYZE_RATE_LIMIT", "120"))
_RL_AUTH = int(_os.getenv("DEEPANALYZE_AUTH_RATE_LIMIT", "20"))
rate_limiter = RateLimiter(max_requests=_RL_DEFAULT, window_seconds=60)
auth_rate_limiter = RateLimiter(max_requests=_RL_AUTH, window_seconds=60)


def get_client_key(scope: dict) -> str:
    """Derive rate limit key from X-Forwarded-For or client host."""
    headers = dict(scope.get("headers", []))
    forwarded = headers.get(b"x-forwarded-for")
    if forwarded:
        return forwarded.decode("latin-1").split(",")[0].strip()
    client = scope.get("client")
    return client[0] if client else "unknown"


class UnifiedSecurityMiddleware:
    """
    Pure ASGI middleware that combines rate limiting and request tracing.
    Avoids BaseHTTPMiddleware/anyio task groups which are incompatible with TestClient.
    """

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            from starlette.types import Message
            async def _passthrough() -> Message:  # unreachable but needed for type completeness
                return {"type": "http.request", "body": b"", "more_body": False}  # type: ignore[typeddict-item]
            return

        # Request ID
        headers = dict(scope.get("headers", []))
        request_id = headers.get(b"x-request-id", str(uuid.uuid4())[:8].encode()).decode("latin-1")

        # Rate limiting
        key = get_client_key(scope)
        path = scope.get("path", "/")
        if path.startswith("/v1/auth"):
            limiter = auth_rate_limiter
        else:
            limiter = rate_limiter

        allowed, retry_after = limiter.is_allowed(key)
        if not allowed:
            response = JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded"},
                headers={"Retry-After": str(retry_after), "X-Request-ID": request_id},
            )
            await response(scope, receive, send)
            return

        remaining = str(limiter.get_remaining(key))

        # Add X-Request-ID to response headers
        start = time.time()

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                msg_headers = dict(message.get("headers", []))
                msg_headers[b"x-request-id"] = request_id.encode()
                msg_headers[b"x-ratelimit-remaining"] = remaining.encode()
                message["headers"] = list(msg_headers.items())
            await send(message)

        try:
            from starlette.types import ASGIApp as _ASGIApp
            # Call the inner app directly (not via BaseHTTPMiddleware)
            await self._call_app(scope, receive, send_wrapper)
        except Exception:
            # Let the app's own error handlers deal with it
            pass

    async def _call_app(self, scope, receive, send):
        # This is populated by the add_middleware-style registration
        pass


def create_security_middleware(app):
    """
    Register rate limiting and request tracing as raw ASGI middleware
    (avoiding Starlette BaseHTTPMiddleware/anyio issues).
    """
    from starlette.types import ASGIApp

    class _SecurityMiddleware:
        def __init__(self, inner: ASGIApp):
            self.inner = inner

        async def __call__(self, scope, receive, send):
            if scope["type"] != "http" or not scope.get("path", "").startswith("/"):
                await self.inner(scope, receive, send)
                return

            headers = dict(scope.get("headers", []))
            request_id = headers.get(b"x-request-id", str(uuid.uuid4())[:8].encode()).decode("latin-1")

            key = get_client_key(scope)
            path = scope.get("path", "/")
            if path.startswith("/v1/auth"):
                limiter = auth_rate_limiter
            else:
                limiter = rate_limiter

            allowed, retry_after = limiter.is_allowed(key)
            if not allowed:
                response = JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded"},
                    headers={"Retry-After": str(retry_after), "X-Request-ID": request_id},
                )
                await response(scope, receive, send)
                return

            remaining = str(limiter.get_remaining(key))

            async def send_wrapper(message):
                if message["type"] == "http.response.start":
                    msg_headers = list(message.get("headers", []) if isinstance(message.get("headers"), list) else [])
                    msg_headers.append((b"x-request-id", request_id.encode()))
                    msg_headers.append((b"x-ratelimit-remaining", remaining.encode()))
                    message["headers"] = msg_headers
                await send(message)

            await self.inner(scope, receive, send_wrapper)

    app.add_middleware(_SecurityMiddleware)
    return app
