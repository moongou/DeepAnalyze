"""Shared SQL safety helpers for read-only database analysis endpoints."""

import re

READONLY_SQL_START_KEYWORDS = {"select", "with", "explain"}
FORBIDDEN_SQL_KEYWORDS = {
    "alter",
    "attach",
    "call",
    "copy",
    "create",
    "delete",
    "detach",
    "drop",
    "execute",
    "grant",
    "insert",
    "load",
    "merge",
    "pragma",
    "replace",
    "revoke",
    "truncate",
    "unload",
    "update",
    "vacuum",
}


class SqlSafetyError(ValueError):
    """Raised when a SQL statement violates the read-only safety policy."""


def strip_sql_comments(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", " ", str(sql or ""), flags=re.DOTALL)
    sql = re.sub(r"--.*?$", " ", sql, flags=re.MULTILINE)
    return sql.strip()


def validate_readonly_sql(sql: str) -> str:
    cleaned = strip_sql_comments(sql).strip()
    if not cleaned:
        raise SqlSafetyError("SQL cannot be empty")
    cleaned = cleaned.rstrip(";\n\t ")
    if ";" in cleaned:
        raise SqlSafetyError("Only one read-only SQL statement is allowed")
    first_keyword_match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\b", cleaned)
    first_keyword = first_keyword_match.group(1).lower() if first_keyword_match else ""
    if first_keyword not in READONLY_SQL_START_KEYWORDS:
        raise SqlSafetyError("Only SELECT, WITH, or EXPLAIN read-only queries are allowed")
    tokens = set(re.findall(r"\b[A-Za-z_][A-Za-z0-9_]*\b", cleaned.lower()))
    blocked = sorted(tokens & FORBIDDEN_SQL_KEYWORDS)
    if blocked:
        raise SqlSafetyError(f"SQL contains forbidden write/admin keywords: {', '.join(blocked)}")
    return cleaned