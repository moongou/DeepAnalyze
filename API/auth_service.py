"""
Authentication service for DeepAnalyze API Server
Provides bcrypt password hashing and JWT token management
"""

import os
import time
import hashlib
import secrets
from typing import Optional, Dict, Any

import jwt

# Try to import bcrypt; fall back to hashlib with salt if unavailable
try:
    import bcrypt as _bcrypt

    def hash_password(password: str) -> str:
        return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")

    def verify_password(password: str, hashed: str) -> bool:
        try:
            return _bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
        except Exception:
            return False

except ImportError:
    import hashlib

    def hash_password(password: str) -> str:
        salt = secrets.token_hex(16)
        digest = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
        return f"sha256${salt}${digest}"

    def verify_password(password: str, hashed: str) -> bool:
        try:
            if hashed.startswith("sha256$"):
                _, salt, digest = hashed.split("$", 2)
                expected = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
                return secrets.compare_digest(digest, expected)
            # Legacy unsalted SHA-256 fallback
            raw_digest = hashlib.sha256(password.encode()).hexdigest()
            return secrets.compare_digest(raw_digest, hashed)
        except Exception:
            return False


JWT_SECRET = os.getenv("DEEPANALYZE_JWT_SECRET", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = int(os.getenv("DEEPANALYZE_JWT_EXPIRATION_HOURS", "168"))  # 7 days
API_KEY_HEADER = "X-API-Key"


def create_access_token(username: str, extra_claims: Optional[Dict[str, Any]] = None) -> str:
    now = int(time.time())
    payload = {
        "sub": username,
        "iat": now,
        "exp": now + JWT_EXPIRATION_HOURS * 3600,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.PyJWTError:
        return None


def verify_api_key(api_key: str) -> Optional[str]:
    """Verify a static API key and return the associated username."""
    from storage import storage
    return storage.verify_api_key(api_key)


def require_user(username: Optional[str]) -> str:
    """Raise if no authenticated user. Returns validated username."""
    if not username:
        raise PermissionError("Authentication required")
    return username
