"""
Tests for export API
"""


def test_export_no_assistant(client, auth_headers):
    resp = client.post("/v1/export/report", json={
        "messages": [{"role": "user", "content": "Hello"}],
        "format": "md",
    }, headers=auth_headers)
    assert resp.status_code == 400


def test_export_invalid_format(client, auth_headers):
    resp = client.post("/v1/export/report", json={
        "messages": [
            {"role": "user", "content": "test"},
            {"role": "assistant", "content": "Response text"},
        ],
        "format": "invalid",
    }, headers=auth_headers)
    assert resp.status_code == 400


def test_export_md(client, auth_headers):
    resp = client.post("/v1/export/report", json={
        "messages": [
            {"role": "user", "content": "test"},
            {"role": "assistant", "content": "# Analysis\nTest report."},
        ],
        "format": "md",
    }, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/markdown")
