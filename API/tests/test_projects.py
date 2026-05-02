"""
Tests for project management API
"""

import json
from urllib.parse import urlencode


def _save_project(client, auth_headers, name, session_id, files_data=None):
    """Helper: save a project with properly encoded query params."""
    params = {
        "session_id": session_id,
        "name": name,
        "messages_json": "[]",
        "files_data_json": json.dumps(files_data or {}),
        "side_tasks_json": "{}",
    }
    return client.post(f"/v1/projects/save?{urlencode(params)}", headers=auth_headers)


def test_save_and_list_projects(client, auth_headers):
    resp = _save_project(client, auth_headers, "TestP", "sess1")
    assert resp.status_code == 200
    assert resp.json()["status"] == "saved"

    resp = client.get("/v1/projects/list", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()["data"]) >= 1


def test_check_project_name(client, auth_headers):
    resp = client.get("/v1/projects/check-name?name=CheckName", headers=auth_headers)
    assert resp.status_code == 200


def test_delete_project(client, auth_headers):
    resp = _save_project(client, auth_headers, "DelMe", "sess_del")
    pid = resp.json()["id"]
    resp = client.delete(f"/v1/projects/{pid}", headers=auth_headers)
    assert resp.status_code == 200


def test_restore_project_files(client, auth_headers):
    resp = _save_project(client, auth_headers, "RestoreTest", "sess_rf",
                         files_data={"test.csv": "col1,col2"})
    pid = resp.json()["id"]

    resp = client.get(f"/v1/projects/restore-files?project_id={pid}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["files_data"]["test.csv"] == "col1,col2"


def test_restore_project_to_workspace(client, auth_headers):
    resp = _save_project(client, auth_headers, "WorkspaceRestore", "sess_rw",
                         files_data={"readme.md": "# Hello"})
    pid = resp.json()["id"]

    resp = client.post(
        f"/v1/projects/restore-to-workspace?project_id={pid}&thread_id=thread_restore_test",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "restored"
    assert "readme.md" in resp.json()["files"]


def test_restore_project_unauthorized(client, auth_headers):
    resp = client.get("/v1/projects/restore-files?project_id=nonexistent", headers=auth_headers)
    assert resp.status_code == 404
