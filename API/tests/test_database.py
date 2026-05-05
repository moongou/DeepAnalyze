"""
Tests for database connectivity API
"""

import os
import sqlite3
import tempfile


class _FakeMessage:
    content = "```sql\nSELECT COUNT(*) AS total FROM sales\n```"


class _FakeChoice:
    message = _FakeMessage()


class _FakeCompletionResponse:
    choices = [_FakeChoice()]


class _FakeCompletions:
    def create(self, **kwargs):
        return _FakeCompletionResponse()


class _FakeChat:
    completions = _FakeCompletions()


class _FakeClient:
    chat = _FakeChat()


class _FakeModelGateway:
    def resolve_model(self, model_id):
        return {}, "fake-provider", "fake-model"

    def get_sync_client(self, provider_id):
        return _FakeClient()


class _UnsafeFakeMessage:
    content = "```sql\nDROP TABLE sales\n```"


class _UnsafeFakeChoice:
    message = _UnsafeFakeMessage()


class _UnsafeFakeCompletionResponse:
    choices = [_UnsafeFakeChoice()]


class _UnsafeFakeCompletions:
    def create(self, **kwargs):
        return _UnsafeFakeCompletionResponse()


class _UnsafeFakeChat:
    completions = _UnsafeFakeCompletions()


class _UnsafeFakeClient:
    chat = _UnsafeFakeChat()


class _UnsafeFakeModelGateway(_FakeModelGateway):
    def get_sync_client(self, provider_id):
        return _UnsafeFakeClient()


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
    assert data["truncated"] is False


def test_execute_sql_applies_row_limit(client, auth_headers):
    resp = client.post("/v1/database/execute", json={
        "db_type": "sqlite", "host": "", "port": 0,
        "user": "", "password": "", "database": ":memory:",
        "sql": "SELECT 1 AS n UNION ALL SELECT 2 AS n",
        "max_rows": 1,
    }, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["row_count"] == 1
    assert data["truncated"] is True
    assert data["max_rows"] == 1


def test_execute_sql_rejects_write_statement(client, auth_headers):
    resp = client.post("/v1/database/execute", json={
        "db_type": "sqlite", "host": "", "port": 0,
        "user": "", "password": "", "database": ":memory:",
        "sql": "DROP TABLE users",
    }, headers=auth_headers)
    assert resp.status_code == 400
    assert "Only SELECT" in resp.json()["detail"]


def test_generate_sql_uses_sync_model_client(client, auth_headers, monkeypatch):
    import database_api

    monkeypatch.setattr(database_api, "model_gateway", _FakeModelGateway())
    resp = client.post("/v1/database/generate-sql", json={
        "db_type": "sqlite",
        "schema_info": "table sales(id integer, amount real)",
        "question": "How many sales rows are there?",
    }, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["sql"] == "SELECT COUNT(*) AS total FROM sales"


def test_generate_sql_rejects_unsafe_model_output(client, auth_headers, monkeypatch):
    import database_api

    monkeypatch.setattr(database_api, "model_gateway", _UnsafeFakeModelGateway())
    resp = client.post("/v1/database/generate-sql", json={
        "db_type": "sqlite",
        "schema_info": "table sales(id integer, amount real)",
        "question": "Delete all rows",
    }, headers=auth_headers)
    assert resp.status_code == 400
    assert "Only SELECT" in resp.json()["detail"]


def test_inspect_schema_sqlite(client, auth_headers):
    root = tempfile.mkdtemp(prefix="deepanalyze_schema_test_")
    db_path = os.path.join(root, "schema.db")
    conn = sqlite3.connect(db_path)
    conn.execute("create table parent(id integer primary key, name text not null)")
    conn.execute("create table child(id integer primary key, parent_id integer, foreign key(parent_id) references parent(id))")
    conn.commit()
    conn.close()

    resp = client.post("/v1/database/schema", json={
        "db_type": "sqlite", "host": "", "port": 0,
        "user": "", "password": "", "database": db_path,
    }, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["table_count"] == 2
    table_names = {table["name"] for table in data["tables"]}
    assert table_names == {"child", "parent"}
    child = next(table for table in data["tables"] if table["name"] == "child")
    assert any(column["name"] == "parent_id" for column in child["columns"])
    assert child["foreign_keys"][0]["referred_table"] == "parent"


def test_connection_url_preserves_escaped_credentials():
    import database_api

    url = database_api._build_connection_url(
        "postgresql",
        "localhost",
        5432,
        "user@example",
        "p:a@ss",
        "riskdb",
    )
    assert "user%40example" in url
    assert "p%3Aa%40ss" in url
    assert "***" not in url
