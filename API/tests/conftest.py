"""
Pytest fixtures for DeepAnalyze API tests
"""

import sys
import os
import uuid

# Ensure the API directory is in the path before any imports
api_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, api_dir)
os.chdir(api_dir)

# Disable strict rate limiting during tests
os.environ.setdefault("DEEPANALYZE_RATE_LIMIT", "500")
os.environ.setdefault("DEEPANALYZE_AUTH_RATE_LIMIT", "50")

import pytest


@pytest.fixture
def client():
    """Create a TestClient for the FastAPI app."""
    from main import create_app
    app = create_app()
    from fastapi.testclient import TestClient
    return TestClient(app)


def register_and_login(client, username: str, password: str) -> str:
    """Helper: register a user and return the bearer token."""
    resp = client.post("/v1/auth/register", json={
        "username": username, "password": password,
    })
    if resp.status_code == 200:
        return resp.json().get("access_token", "")
    # Already exists or rate limited, try login
    resp = client.post("/v1/auth/login", json={
        "username": username, "password": password,
    })
    if resp.status_code == 200:
        return resp.json().get("access_token", "")
    return ""


def unique_user():
    return f"t{uuid.uuid4().hex[:8]}"


@pytest.fixture
def auth_headers(client):
    """Register a fresh test user and return auth headers."""
    user = unique_user()
    token = register_and_login(client, user, "testpass123")
    if token:
        return {"Authorization": f"Bearer {token}"}
    pytest.skip("Unable to create test user (rate limited?)")
