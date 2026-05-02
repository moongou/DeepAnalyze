"""
Tests for authentication API endpoints
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from conftest import unique_user


def test_register_success(client):
    user = unique_user()
    resp = client.post("/v1/auth/register", json={
        "username": user, "password": "securepass123",
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_register_duplicate(client):
    user = unique_user()
    client.post("/v1/auth/register", json={
        "username": user, "password": "securepass123",
    })
    resp = client.post("/v1/auth/register", json={
        "username": user, "password": "securepass123",
    })
    assert resp.status_code == 409


def test_register_invalid_username(client):
    resp = client.post("/v1/auth/register", json={
        "username": "ab", "password": "securepass123",
    })
    assert resp.status_code == 422


def test_register_short_password(client):
    resp = client.post("/v1/auth/register", json={
        "username": unique_user(), "password": "short",
    })
    assert resp.status_code == 422


def test_login_success(client):
    user = unique_user()
    client.post("/v1/auth/register", json={
        "username": user, "password": "mypass123",
    })
    resp = client.post("/v1/auth/login", json={
        "username": user, "password": "mypass123",
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password(client):
    user = unique_user()
    client.post("/v1/auth/register", json={
        "username": user, "password": "correct123",
    })
    resp = client.post("/v1/auth/login", json={
        "username": user, "password": "wrongpass",
    })
    assert resp.status_code == 401


def test_login_nonexistent_user(client):
    resp = client.post("/v1/auth/login", json={
        "username": unique_user(), "password": "whatever123",
    })
    assert resp.status_code == 401


def test_me_authenticated(client):
    user = unique_user()
    resp = client.post("/v1/auth/register", json={
        "username": user, "password": "mypass123",
    })
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    resp = client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["username"] == user


def test_me_unauthenticated(client):
    resp = client.get("/v1/auth/me")
    assert resp.status_code == 401


def test_list_users_authenticated(client, auth_headers):
    resp = client.get("/v1/auth/users", headers=auth_headers)
    assert resp.status_code == 200
    assert "users" in resp.json()


def test_list_users_unauthenticated(client):
    resp = client.get("/v1/auth/users")
    assert resp.status_code == 401


def test_api_keys_crud(client, auth_headers):
    # List (empty initially)
    resp = client.get("/v1/auth/api-keys", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

    # Create
    resp = client.post("/v1/auth/api-keys", json={"label": "test-key"}, headers=auth_headers)
    assert resp.status_code == 200
    key_id = resp.json()["id"]
    assert resp.json()["label"] == "test-key"

    # Delete
    resp = client.delete(f"/v1/auth/api-keys/{key_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"
