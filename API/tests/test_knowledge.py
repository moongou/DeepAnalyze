"""
Tests for knowledge base API
"""


def test_add_and_list_entries(client, auth_headers):
    resp = client.post("/v1/knowledge/entries", json={
        "error_type": "ImportError",
        "error_message": "ModuleNotFoundError: No module named 'pandas'",
        "solution": "pip install pandas",
        "code_context": "import pandas",
        "tags": "import,pandas",
    }, headers=auth_headers)
    assert resp.status_code == 200

    resp = client.get("/v1/knowledge/entries", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()["data"]) >= 1


def test_search_entries(client, auth_headers):
    client.post("/v1/knowledge/entries", json={
        "error_type": "ValueError",
        "error_message": "ValueError: invalid value",
        "solution": "Check input",
        "tags": "value",
    }, headers=auth_headers)

    resp = client.post("/v1/knowledge/entries/search",
        json="ValueError", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()["data"]) >= 1


def test_delete_entry(client, auth_headers):
    client.post("/v1/knowledge/entries", json={
        "error_type": "DelTest",
        "error_message": "Delete me",
        "solution": "",
        "tags": "",
    }, headers=auth_headers)

    entries = client.get("/v1/knowledge/entries", headers=auth_headers).json()["data"]
    eid = entries[0]["id"]

    resp = client.delete(f"/v1/knowledge/entries/{eid}", headers=auth_headers)
    assert resp.status_code == 200


def test_kb_settings_save_and_get(client, auth_headers):
    settings = {"onyx_base_url": "http://example.com", "onyx_api_key": "test-key"}
    resp = client.post("/v1/knowledge/settings", json=settings, headers=auth_headers)
    assert resp.status_code == 200

    resp = client.get("/v1/knowledge/settings", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json().get("onyx_base_url") == "http://example.com"


def test_kb_test_endpoint(client, auth_headers):
    resp = client.post("/v1/knowledge/test", json={
        "kb_type": "unknown",
        "config": {},
    }, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "error"
