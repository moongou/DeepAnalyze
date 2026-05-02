"""
Database Connectivity API for DeepAnalyze API Server
Handles database connection testing, SQL generation, and query execution
"""

import re
import time
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy import create_engine, text as sa_text
from sqlalchemy.engine import URL

from storage import storage
from auth_api import get_current_user, require_auth
from model_gateway import model_gateway

router = APIRouter(prefix="/v1/database", tags=["database"])


def _build_connection_url(db_type: str, host: str, port: int, user: str, password: str, database: str) -> str:
    """Build SQLAlchemy connection URL from parameters."""
    if db_type == "sqlite":
        return f"sqlite:///{database}"
    elif db_type == "postgresql":
        return f"postgresql://{user}:{password}@{host}:{port}/{database}"
    elif db_type == "mysql":
        return f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}"
    elif db_type == "mssql":
        return f"mssql+pymssql://{user}:{password}@{host}:{port}/{database}"
    raise HTTPException(status_code=400, detail=f"Unsupported database type: {db_type}")


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
        url = _build_connection_url(db_type, host, port, user, password, database)
        engine = create_engine(url, connect_args={"connect_timeout": 10} if db_type != "sqlite" else {})
        with engine.connect() as conn:
            result = conn.execute(sa_text("SELECT 1"))
            result.fetchone()
        engine.dispose()
        return {"status": "connected", "db_type": db_type}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)}")


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
        client = model_gateway.get_client(provider_id)
        prompt = f"""数据库类型: {db_type}
表结构信息:
{schema_info}

用户问题: {question}

请根据以上表结构信息，生成一个 {db_type} SQL 查询语句来回答用户的问题。
只输出SQL语句，不要有解释。SQL语句必须以```sql开始，以```结束。"""
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
        return {"sql": sql_text}
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
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    try:
        url = _build_connection_url(db_type, host, port, user, password, database)
        engine = create_engine(url)
        with engine.connect() as conn:
            result = conn.execute(sa_text(sql))
            rows = [dict(zip(result.keys(), row)) for row in result.fetchall()]
        engine.dispose()
        return {"columns": list(rows[0].keys()) if rows else [], "rows": rows, "row_count": len(rows)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Execution failed: {str(e)}")
