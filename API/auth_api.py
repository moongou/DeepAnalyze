"""
Authentication API for DeepAnalyze API Server
Provides login, register, and API key management endpoints
"""

import time
import uuid
import secrets
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    verify_api_key,
    API_KEY_HEADER,
)
from storage import storage

router = APIRouter(prefix="/v1/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


# --- Pydantic models ---

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    password: str = Field(..., min_length=8, max_length=128)

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str

class UserResponse(BaseModel):
    username: str
    created_at: int

class ApiKeyCreateRequest(BaseModel):
    label: str = Field(default="default", max_length=64)

class ApiKeyResponse(BaseModel):
    id: str
    key_prefix: str
    label: str
    created_at: int


# --- Auth dependency ---

async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[str]:
    """Extract authenticated username from JWT or API key."""
    # Try JWT Bearer token first
    if credentials:
        payload = decode_access_token(credentials.credentials)
        if payload:
            return payload.get("sub")

    # Try API key header
    api_key = request.headers.get(API_KEY_HEADER)
    if api_key:
        return verify_api_key(api_key)

    # Try query param (for SSE/EventSource which can't set headers)
    token_param = request.query_params.get("token")
    if token_param:
        payload = decode_access_token(token_param)
        if payload:
            return payload.get("sub")

    return None


def require_auth(username: Optional[str]) -> str:
    if not username:
        raise HTTPException(status_code=401, detail="Authentication required")
    return username


# --- Endpoints ---

@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest):
    existing = storage.get_user(body.username)
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")

    storage.create_user(body.username, hash_password(body.password))
    token = create_access_token(body.username)
    return TokenResponse(access_token=token, username=body.username)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    user = storage.get_user(body.username)
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token(body.username)
    return TokenResponse(access_token=token, username=body.username)


@router.get("/me", response_model=UserResponse)
def get_me(username: Optional[str] = Depends(get_current_user)):
    require_auth(username)
    user = storage.get_user(username)
    return UserResponse(username=username, created_at=user.get("created_at", 0))


@router.post("/api-keys", response_model=ApiKeyResponse)
def create_api_key(
    body: ApiKeyCreateRequest,
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    api_key = f"dak-{secrets.token_hex(24)}"
    key_id = f"apikey-{uuid.uuid4().hex[:12]}"

    storage.create_api_key(
        key_id=key_id,
        username=username,
        key_hash=hash_password(api_key),
        key_prefix=api_key[:11],
        label=body.label,
    )
    return ApiKeyResponse(
        id=key_id,
        key_prefix=api_key[:11],
        label=body.label,
        created_at=int(time.time()),
    )


@router.get("/api-keys", response_model=list[ApiKeyResponse])
def list_api_keys(username: Optional[str] = Depends(get_current_user)):
    require_auth(username)
    keys = storage.list_api_keys(username)
    return [
        ApiKeyResponse(
            id=k["id"],
            key_prefix=k["key_prefix"],
            label=k.get("label", ""),
            created_at=k.get("created_at", 0),
        )
        for k in keys
    ]


@router.get("/users")
def list_users(username: Optional[str] = Depends(get_current_user)):
    require_auth(username)
    users = storage.list_users()
    return {"users": users}


@router.delete("/api-keys/{key_id}")
def delete_api_key(
    key_id: str,
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    if not storage.delete_api_key(key_id, username):
        raise HTTPException(status_code=404, detail="API key not found")
    return {"status": "deleted"}
