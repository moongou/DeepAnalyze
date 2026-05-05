"""
Database Connectivity API for DeepAnalyze API Server
Handles database connection testing, schema inspection, SQL generation, and query execution
"""

import re
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy import create_engine, inspect, text as sa_text
from sqlalchemy.engine import URL

from auth_api import get_current_user, require_auth
from model_gateway import model_gateway
from sql_safety import SqlSafetyError, validate_readonly_sql

router = APIRouter(prefix="/v1/database", tags=["database"])


def _readonly_sql_or_http(sql: str) -> str:
    try:
        return validate_readonly_sql(sql)
    except SqlSafetyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def _build_connection_url(db_type: str, host: str, port: int, user: str, password: str, database: str) -> str:
    """Build SQLAlchemy connection URL from parameters."""
    if db_type == "sqlite":
        return f"sqlite:///{database}"
    elif db_type == "postgresql":
        return URL.create(
            "postgresql",
            username=user,
            password=password,
            host=host,
            port=port,
            database=database,
        ).render_as_string(hide_password=False)
    elif db_type == "mysql":
        return URL.create(
            "mysql+pymysql",
            username=user,
            password=password,
            host=host,
            port=port,
            database=database,
        ).render_as_string(hide_password=False)
    elif db_type == "mssql":
        return URL.create(
            "mssql+pymssql",
            username=user,
            password=password,
            host=host,
            port=port,
            database=database,
        ).render_as_string(hide_password=False)
    raise HTTPException(status_code=400, detail=f"Unsupported database type: {db_type}")


def _engine_connect_args(db_type: str) -> Dict[str, Any]:
    if db_type == "mysql":
        return {"connect_timeout": 10}
    if db_type == "postgresql":
        return {"connect_timeout": 10}
    if db_type == "mssql":
        return {"login_timeout": 10}
    return {}


def _create_engine(db_type: str, host: str, port: int, user: str, password: str, database: str):
    url = _build_connection_url(db_type, host, port, user, password, database)
    return create_engine(url, connect_args=_engine_connect_args(db_type))


def _format_column(column: Dict[str, Any], primary_key_columns: set) -> Dict[str, Any]:
    default_value = column.get("default")
    return {
        "name": str(column.get("name") or ""),
        "type": str(column.get("type") or ""),
        "nullable": bool(column.get("nullable", True)),
        "default": str(default_value) if default_value is not None else None,
        "primary_key": str(column.get("name") or "") in primary_key_columns,
    }


@router.post("/test")
def test_connection(
    db_type: str = Body(...),
    host: str = Body(...),
    port: int = Body(...),
    user: str = Body(...),
    password: str = Body(default=""),
    database: str = Body(...),
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    try:
        engine = _create_engine(db_type, host, port, user, password, database)
        try:
            with engine.connect() as conn:
                result = conn.execute(sa_text("SELECT 1"))
                result.fetchone()
        finally:
            engine.dispose()
        return {"status": "connected", "db_type": db_type}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)}")


@router.post("/schema")
def inspect_schema(
    db_type: str = Body(...),
    host: str = Body(...),
    port: int = Body(...),
    user: str = Body(...),
    password: str = Body(default=""),
    database: str = Body(...),
    db_schema: Optional[str] = Body(default=None, alias="schema"),
    max_tables: int = Body(default=200),
    include_columns: bool = Body(default=True),
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    safe_max_tables = min(max(int(max_tables or 200), 1), 1000)
    engine = None
    try:
        engine = _create_engine(db_type, host, port, user, password, database)
        with engine.connect() as conn:
            inspector = inspect(conn)
            table_names = sorted(inspector.get_table_names(schema=db_schema))
            returned_names = table_names[:safe_max_tables]
            tables: List[Dict[str, Any]] = []
            for table_name in returned_names:
                pk_info = inspector.get_pk_constraint(table_name, schema=db_schema) or {}
                primary_key_columns = set(pk_info.get("constrained_columns") or [])
                columns = []
                if include_columns:
                    columns = [
                        _format_column(column, primary_key_columns)
                        for column in inspector.get_columns(table_name, schema=db_schema)
                    ]
                tables.append(
                    {
                        "name": table_name,
                        "schema": db_schema,
                        "columns": columns,
                        "primary_key": list(primary_key_columns),
                        "foreign_keys": [
                            {
                                "constrained_columns": fk.get("constrained_columns") or [],
                                "referred_schema": fk.get("referred_schema"),
                                "referred_table": fk.get("referred_table"),
                                "referred_columns": fk.get("referred_columns") or [],
                            }
                            for fk in inspector.get_foreign_keys(table_name, schema=db_schema)
                        ],
                    }
                )
        return {
            "db_type": db_type,
            "database": database,
            "schema": db_schema,
            "table_count": len(table_names),
            "returned_table_count": len(tables),
            "truncated": len(table_names) > safe_max_tables,
            "tables": tables,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Schema inspection failed: {str(e)}")
    finally:
        if engine is not None:
            engine.dispose()


@router.post("/generate-sql")
def generate_sql(
    db_type: str = Body(...),
    schema_info: str = Body(...),
    question: str = Body(...),
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    try:
        _, provider_id, provider_model = model_gateway.resolve_model("DeepAnalyze-8B")
        client = model_gateway.get_sync_client(provider_id)
        prompt = f"""数据库类型: {db_type}
表结构信息:
{schema_info}

用户问题: {question}

请根据以上表结构信息，生成一个 {db_type} SQL 查询语句来回答用户的问题。
只输出SQL语句，不要有解释。SQL语句必须以```sql开始，以```结束。只能生成 SELECT / WITH / EXPLAIN 只读查询。"""
        response = client.chat.completions.create(
            model=provider_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=4096,
        )
        sql_text = response.choices[0].message.content
        # Extract SQL from markdown
        match = re.search(r"```sql\s*(.*?)\s*```", sql_text or "", re.DOTALL)
        if match:
            sql_text = match.group(1).strip()
        return {"sql": _readonly_sql_or_http(sql_text)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SQL generation failed: {str(e)}")


@router.post("/execute")
def execute_sql(
    db_type: str = Body(...),
    host: str = Body(...),
    port: int = Body(...),
    user: str = Body(...),
    password: str = Body(default=""),
    database: str = Body(...),
    sql: str = Body(...),
    max_rows: int = Body(default=1000),
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    try:
        safe_sql = _readonly_sql_or_http(sql)
        safe_max_rows = min(max(int(max_rows or 1000), 1), 50000)
        engine = _create_engine(db_type, host, port, user, password, database)
        try:
            with engine.connect() as conn:
                result = conn.execute(sa_text(safe_sql))
                columns = list(result.keys()) if result.returns_rows else []
                fetched = result.fetchmany(safe_max_rows + 1) if result.returns_rows else []
                truncated = len(fetched) > safe_max_rows
                rows = [dict(row._mapping) for row in fetched[:safe_max_rows]]
        finally:
            engine.dispose()
        return {
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "truncated": truncated,
            "max_rows": safe_max_rows,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Execution failed: {str(e)}")
