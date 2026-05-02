"""
Tests for database connectivity API
"""


def test_test_connection_sqlite(client, auth_headers):
    resp = client.post("/v1/database/test", json={
        "db_type": "sqlite", "host": "", "port": 0,
        "user": "", "password": "", "database": ":memory:",
    }, headers=auth_headers)
    assert resp.status_code == 200


def test_execute_sql_sqlite(client, auth_headers):
    resp = client.post("/v1/database/execute", json={
        "db_type": "sqlite", "host": "", "port": 0,
        "user": "", "password": "", "database": ":memory:",
        "sql": "SELECT 1 AS n",
    }, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["row_count"] == 1
