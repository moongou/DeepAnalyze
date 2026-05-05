"""Tests for shared SQL safety helpers."""

import pytest

from sql_safety import SqlSafetyError, validate_readonly_sql


def test_validate_readonly_sql_accepts_select_with_comments():
    sql = "-- purpose\nSELECT * FROM declarations;"
    assert validate_readonly_sql(sql) == "SELECT * FROM declarations"


def test_validate_readonly_sql_rejects_multiple_statements():
    with pytest.raises(SqlSafetyError):
        validate_readonly_sql("SELECT 1; SELECT 2")


def test_validate_readonly_sql_rejects_write_keyword():
    with pytest.raises(SqlSafetyError):
        validate_readonly_sql("WITH deleted AS (DELETE FROM users RETURNING *) SELECT * FROM deleted")