"""Tests for admin cleanup observability endpoints."""


def test_cleanup_status_endpoint(client):
    resp = client.get("/v1/admin/cleanup-status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "cleanup" in data
    assert "run_count" in data["cleanup"]
    assert "failure_count" in data["cleanup"]