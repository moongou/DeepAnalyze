"""
雨途斩棘录 - 智能体错误修正记录管理模块

管理智能体在执行代码时遇到的错误及其已验证解决方案。
"""

import os
import json
import sqlite3
import hashlib
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "deepanalyze.db")
YUTU_HTML_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "yutu_zhanyilu.html")
BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "yutu_backups")
os.makedirs(BACKUP_DIR, exist_ok=True)


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _table_columns(cursor: sqlite3.Cursor, table_name: str) -> List[str]:
    cursor.execute(f"PRAGMA table_info({table_name})")
    return [row[1] for row in cursor.fetchall()]


def _row_to_dict(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    return dict(row)


def backup_to_json(custom_name: Optional[str] = None) -> str:
    """备份所有雨途斩棘录记录到 JSON 文件"""
    try:
        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM yutu_errors")
            records = [dict(row) for row in cursor.fetchall()]
            cursor.execute("SELECT * FROM yutu_error_keywords")
            keywords = [dict(row) for row in cursor.fetchall()]

        backup_data = {
            "version": "2.0",
            "timestamp": datetime.now().isoformat(),
            "records": records,
            "keywords": keywords,
        }

        if custom_name:
            safe_name = "".join(
                [c for c in custom_name if c.isalnum() or c in (" ", ".", "_", "-")]
            ).strip()
            if not safe_name:
                safe_name = "backup"
            if not safe_name.lower().endswith(".json"):
                safe_name += ".json"
            backup_file = os.path.join(BACKUP_DIR, safe_name)
        else:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_file = os.path.join(BACKUP_DIR, f"yutu_backup_{timestamp}.json")

        with open(backup_file, "w", encoding="utf-8") as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)

        logger.info(f"雨途斩棘录已备份到: {backup_file}")
        return backup_file
    except Exception as e:
        logger.error(f"备份失败: {e}")
        return ""


def delete_backup(filename: str) -> bool:
    """删除指定的备份文件"""
    try:
        if ".." in filename or os.path.isabs(filename):
            logger.error(f"非法的备份文件名: {filename}")
            return False

        backup_file = os.path.join(BACKUP_DIR, filename)
        if os.path.exists(backup_file):
            os.remove(backup_file)
            logger.info(f"已删除备份文件: {backup_file}")
            return True

        logger.error(f"备份文件不存在: {backup_file}")
        return False
    except Exception as e:
        logger.error(f"删除备份失败: {e}")
        return False


def restore_from_json(backup_file: str, mode: str = "append") -> bool:
    """从 JSON 文件恢复雨途斩棘录记录"""
    try:
        if not os.path.exists(backup_file):
            logger.error(f"备份文件不存在: {backup_file}")
            return False

        with open(backup_file, "r", encoding="utf-8") as f:
            backup_data = json.load(f)

        records = backup_data.get("records", [])
        keywords = backup_data.get("keywords", [])

        with _connect() as conn:
            cursor = conn.cursor()
            if mode == "overwrite":
                cursor.execute("DELETE FROM yutu_error_keywords")
                cursor.execute("DELETE FROM yutu_errors")
                logger.info("已清空现有记录以进行覆盖恢复")

            record_columns = _table_columns(cursor, "yutu_errors")
            keyword_columns = _table_columns(cursor, "yutu_error_keywords")

            for record in records:
                r_data = {k: v for k, v in record.items() if k != "id" and k in record_columns}
                if not r_data.get("error_hash"):
                    continue

                if mode == "append":
                    cursor.execute(
                        "SELECT id FROM yutu_errors WHERE error_hash = ?",
                        (r_data["error_hash"],),
                    )
                    if cursor.fetchone():
                        update_cols = ", ".join([f"{k} = ?" for k in r_data.keys()])
                        cursor.execute(
                            f"UPDATE yutu_errors SET {update_cols} WHERE error_hash = ?",
                            list(r_data.values()) + [r_data["error_hash"]],
                        )
                        continue

                placeholders = ", ".join(["?"] * len(r_data))
                columns = ", ".join(r_data.keys())
                cursor.execute(
                    f"INSERT INTO yutu_errors ({columns}) VALUES ({placeholders})",
                    list(r_data.values()),
                )

            for keyword in keywords:
                kw_data = {k: v for k, v in keyword.items() if k != "id" and k in keyword_columns}
                if not kw_data.get("error_hash") or not kw_data.get("keyword"):
                    continue
                if mode == "append":
                    cursor.execute(
                        "SELECT id FROM yutu_error_keywords WHERE error_hash = ? AND keyword = ?",
                        (kw_data["error_hash"], kw_data["keyword"]),
                    )
                    if cursor.fetchone():
                        continue

                placeholders = ", ".join(["?"] * len(kw_data))
                columns = ", ".join(kw_data.keys())
                cursor.execute(
                    f"INSERT INTO yutu_error_keywords ({columns}) VALUES ({placeholders})",
                    list(kw_data.values()),
                )

        update_yutu_html()
        logger.info(f"已从备份文件恢复记录: {backup_file} (模式: {mode})")
        return True
    except Exception as e:
        logger.error(f"恢复失败: {e}")
        return False


def init_yutu_db():
    """初始化雨途斩棘录数据库并执行兼容迁移"""
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(
            '''
            CREATE TABLE IF NOT EXISTS yutu_errors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                error_hash TEXT UNIQUE NOT NULL,
                error_type TEXT NOT NULL,
                error_message TEXT NOT NULL,
                error_context TEXT,
                solution TEXT NOT NULL,
                solution_code TEXT,
                confidence REAL DEFAULT 0.0,
                usage_count INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT DEFAULT 'system',
                verification_status TEXT DEFAULT 'verified',
                verified_count INTEGER DEFAULT 0,
                failure_count INTEGER DEFAULT 0,
                last_verified_at TIMESTAMP,
                resolution_evidence TEXT,
                record_category TEXT DEFAULT 'runtime_code_generation'
            )
            '''
        )
        cursor.execute(
            '''
            CREATE TABLE IF NOT EXISTS yutu_error_keywords (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                error_hash TEXT NOT NULL,
                keyword TEXT NOT NULL,
                FOREIGN KEY (error_hash) REFERENCES yutu_errors(error_hash)
            )
            '''
        )
        cursor.execute(
            '''
            CREATE TABLE IF NOT EXISTS yutu_env_todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                source_error_hash TEXT,
                related_error_type TEXT,
                priority TEXT DEFAULT 'medium',
                status TEXT DEFAULT 'pending',
                owner TEXT,
                admin_confirmed INTEGER DEFAULT 0,
                admin_confirmed_by TEXT,
                admin_confirmed_at TIMESTAMP,
                resolution_note TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT DEFAULT 'system'
            )
            '''
        )

        columns = _table_columns(cursor, "yutu_errors")
        additions = {
            "verification_status": "TEXT DEFAULT 'verified'",
            "verified_count": "INTEGER DEFAULT 0",
            "failure_count": "INTEGER DEFAULT 0",
            "last_verified_at": "TIMESTAMP",
            "resolution_evidence": "TEXT",
            "record_category": "TEXT DEFAULT 'runtime_code_generation'",
        }
        for column, definition in additions.items():
            if column not in columns:
                cursor.execute(f"ALTER TABLE yutu_errors ADD COLUMN {column} {definition}")

        cursor.execute(
            """
            UPDATE yutu_errors
            SET verification_status = COALESCE(NULLIF(verification_status, ''), 'verified')
            """
        )
        cursor.execute(
            """
            UPDATE yutu_errors
            SET verified_count = CASE
                WHEN verified_count IS NULL OR verified_count = 0 THEN CASE WHEN usage_count > 0 THEN usage_count ELSE 1 END
                ELSE verified_count
            END
            """
        )
        cursor.execute(
            """
            UPDATE yutu_errors
            SET failure_count = COALESCE(failure_count, CASE WHEN usage_count > 0 THEN usage_count ELSE 1 END)
            """
        )
        cursor.execute(
            """
            UPDATE yutu_errors
            SET last_verified_at = COALESCE(last_verified_at, updated_at, created_at)
            WHERE verification_status = 'verified'
            """
        )
        cursor.execute(
            """
            UPDATE yutu_errors
            SET record_category = COALESCE(NULLIF(record_category, ''), 'runtime_code_generation')
            """
        )

    logger.info("雨途斩棘录数据库初始化完成")


def compute_error_hash(error_type: str, error_message: str) -> str:
    content = f"{error_type}:{error_message}"
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def get_yutu_db():
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


def extract_keywords(text: str, error_type: str) -> List[str]:
    import re

    keywords = [str(error_type or "unknown").lower()]
    words = re.findall(r"[a-zA-Z0-9_]+", text or "")
    stop_words = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "must", "shall", "can", "need", "dare", "ought",
        "used", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
        "into", "through", "during", "before", "after", "above", "below", "between",
        "under", "again", "further", "then", "once", "here", "there", "when", "where",
        "why", "how", "all", "each", "few", "more", "most", "other", "some", "such",
        "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "just",
        "and", "but", "if", "or", "because", "until", "while", "this", "that", "these", "those",
    }
    for word in words:
        lowered = word.lower()
        if lowered not in stop_words and len(lowered) > 3:
            keywords.append(lowered)
    return list(dict.fromkeys(keywords))[:20]


def add_error_solution(
    error_type: str,
    error_message: str,
    error_context: Optional[str],
    solution: str,
    solution_code: Optional[str] = None,
    confidence: float = 0.0,
    created_by: str = "system",
    verification_status: str = "verified",
    verified_count: int = 1,
    failure_count: int = 1,
    resolution_evidence: Optional[str] = None,
    record_category: str = "runtime_code_generation",
) -> bool:
    """添加或更新已验证的错误解决方案"""
    try:
        error_hash = compute_error_hash(error_type, error_message)
        verified_increment = max(int(verified_count or 0), 0)
        failure_increment = max(int(failure_count or 0), 0)
        usage_increment = verified_increment or 1

        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM yutu_errors WHERE error_hash = ?", (error_hash,))
            existing = cursor.fetchone()

            if existing:
                cursor.execute(
                    '''
                    UPDATE yutu_errors
                    SET error_context = ?,
                        solution = ?,
                        solution_code = ?,
                        confidence = ?,
                        updated_at = CURRENT_TIMESTAMP,
                        usage_count = usage_count + ?,
                        created_by = ?,
                        verification_status = ?,
                        verified_count = COALESCE(verified_count, 0) + ?,
                        failure_count = COALESCE(failure_count, 0) + ?,
                        last_verified_at = CASE WHEN ? = 'verified' THEN CURRENT_TIMESTAMP ELSE last_verified_at END,
                        resolution_evidence = CASE
                            WHEN ? IS NOT NULL AND TRIM(?) != '' THEN ?
                            ELSE resolution_evidence
                        END,
                        record_category = COALESCE(NULLIF(?, ''), record_category)
                    WHERE error_hash = ?
                    ''',
                    (
                        error_context,
                        solution,
                        solution_code,
                        confidence,
                        usage_increment,
                        created_by,
                        verification_status,
                        verified_increment,
                        failure_increment,
                        verification_status,
                        resolution_evidence,
                        resolution_evidence,
                        resolution_evidence,
                        record_category,
                        error_hash,
                    ),
                )
            else:
                cursor.execute(
                    '''
                    INSERT INTO yutu_errors (
                        error_hash, error_type, error_message, error_context,
                        solution, solution_code, confidence, usage_count,
                        created_by, verification_status, verified_count,
                        failure_count, last_verified_at, resolution_evidence,
                        record_category
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''',
                    (
                        error_hash,
                        error_type,
                        error_message,
                        error_context,
                        solution,
                        solution_code,
                        confidence,
                        usage_increment,
                        created_by,
                        verification_status,
                        verified_increment,
                        failure_increment,
                        datetime.now().isoformat(sep=" ", timespec="seconds") if verification_status == "verified" else None,
                        resolution_evidence,
                        record_category,
                    ),
                )
                for keyword in extract_keywords(error_message, error_type):
                    cursor.execute(
                        "INSERT INTO yutu_error_keywords (error_hash, keyword) VALUES (?, ?)",
                        (error_hash, keyword),
                    )

        logger.info(f"已添加错误解决方案: {error_type} - {error_hash}")
        update_yutu_html()
        return True
    except Exception as e:
        logger.error(f"添加错误解决方案失败: {e}")
        return False


def search_errors(
    keywords: Optional[List[str]] = None,
    error_type: Optional[str] = None,
    record_category: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """搜索错误记录"""
    try:
        base_query = "SELECT * FROM yutu_errors WHERE is_active = 1"
        where_parts: List[str] = []
        params: List[Any] = []

        if error_type:
            where_parts.append("error_type = ?")
            params.append(error_type)

        if record_category:
            where_parts.append("record_category = ?")
            params.append(record_category)

        if keywords:
            keyword_conditions = []
            for kw in keywords:
                if not str(kw).strip():
                    continue
                keyword_conditions.append("error_message LIKE ?")
                params.append(f"%{str(kw).strip()}%")
            if keyword_conditions:
                where_parts.append("(" + " OR ".join(keyword_conditions) + ")")

        if where_parts:
            base_query += " AND " + " AND ".join(where_parts)

        order_clause = " ORDER BY verified_count DESC, usage_count DESC, last_verified_at DESC, created_at DESC"
        offset = max(page - 1, 0) * page_size

        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute(base_query + order_clause + " LIMIT ? OFFSET ?", params + [page_size, offset])
            items = [dict(row) for row in cursor.fetchall()]
            cursor.execute("SELECT COUNT(*) FROM (" + base_query + ")", params)
            total = cursor.fetchone()[0]

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size if page_size else 1,
        }
    except Exception as e:
        logger.error(f"搜索错误记录失败: {e}")
        return {"items": [], "total": 0, "page": 1, "page_size": page_size, "total_pages": 1}


def add_env_todo(
    title: str,
    description: str,
    source_error_hash: Optional[str] = None,
    related_error_type: Optional[str] = None,
    priority: str = "medium",
    owner: Optional[str] = None,
    created_by: str = "system",
) -> bool:
    try:
        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                INSERT INTO yutu_env_todos (
                    title, description, source_error_hash, related_error_type,
                    priority, owner, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ''',
                (title, description, source_error_hash, related_error_type, priority, owner, created_by),
            )
        update_yutu_html()
        return True
    except Exception as e:
        logger.error(f"添加环境完善建议失败: {e}")
        return False


def search_env_todos(
    status: Optional[str] = None,
    admin_confirmed: Optional[bool] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    try:
        base_query = "SELECT * FROM yutu_env_todos WHERE is_active = 1"
        where_parts: List[str] = []
        params: List[Any] = []

        if status:
            where_parts.append("status = ?")
            params.append(status)
        if admin_confirmed is not None:
            where_parts.append("admin_confirmed = ?")
            params.append(1 if admin_confirmed else 0)

        if where_parts:
            base_query += " AND " + " AND ".join(where_parts)

        order_clause = " ORDER BY admin_confirmed ASC, updated_at DESC, created_at DESC"
        offset = max(page - 1, 0) * page_size

        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute(base_query + order_clause + " LIMIT ? OFFSET ?", params + [page_size, offset])
            items = [dict(row) for row in cursor.fetchall()]
            cursor.execute("SELECT COUNT(*) FROM (" + base_query + ")", params)
            total = cursor.fetchone()[0]

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size if page_size else 1,
        }
    except Exception as e:
        logger.error(f"搜索环境完善建议失败: {e}")
        return {"items": [], "total": 0, "page": 1, "page_size": page_size, "total_pages": 1}


def update_env_todo(
    todo_id: int,
    status: Optional[str] = None,
    owner: Optional[str] = None,
    resolution_note: Optional[str] = None,
    priority: Optional[str] = None,
) -> bool:
    try:
        fields = ["updated_at = CURRENT_TIMESTAMP"]
        params: List[Any] = []
        if status is not None:
            fields.append("status = ?")
            params.append(status)
        if owner is not None:
            fields.append("owner = ?")
            params.append(owner)
        if resolution_note is not None:
            fields.append("resolution_note = ?")
            params.append(resolution_note)
        if priority is not None:
            fields.append("priority = ?")
            params.append(priority)
        params.append(todo_id)

        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute(f"UPDATE yutu_env_todos SET {', '.join(fields)} WHERE id = ?", params)
        update_yutu_html()
        return True
    except Exception as e:
        logger.error(f"更新环境完善建议失败: {e}")
        return False


def confirm_env_todo(todo_id: int, confirmed_by: str, resolution_note: Optional[str] = None) -> bool:
    try:
        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                UPDATE yutu_env_todos
                SET admin_confirmed = 1,
                    admin_confirmed_by = ?,
                    admin_confirmed_at = CURRENT_TIMESTAMP,
                    status = 'done',
                    resolution_note = COALESCE(?, resolution_note),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                ''',
                (confirmed_by, resolution_note, todo_id),
            )
        update_yutu_html()
        return True
    except Exception as e:
        logger.error(f"确认环境完善建议失败: {e}")
        return False


def delete_env_todo(todo_id: int) -> bool:
    try:
        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE yutu_env_todos SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (todo_id,))
        update_yutu_html()
        return True
    except Exception as e:
        logger.error(f"删除环境完善建议失败: {e}")
        return False


def get_error_by_hash(error_hash: str) -> Optional[Dict[str, Any]]:
    """根据哈希获取错误记录"""
    try:
        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM yutu_errors WHERE error_hash = ?", (error_hash,))
            return _row_to_dict(cursor.fetchone())
    except Exception as e:
        logger.error(f"获取错误记录失败: {e}")
        return None


def update_error_solution(
    error_hash: str,
    solution: str,
    solution_code: Optional[str] = None,
    confidence: float = 0.0,
    updated_by: str = "system",
    verification_status: Optional[str] = None,
    resolution_evidence: Optional[str] = None,
) -> bool:
    """更新错误解决方案"""
    try:
        fields = [
            "solution = ?",
            "solution_code = ?",
            "confidence = ?",
            "updated_at = CURRENT_TIMESTAMP",
            "created_by = ?",
        ]
        params: List[Any] = [solution, solution_code, confidence, updated_by]

        if verification_status is not None:
            fields.append("verification_status = ?")
            params.append(verification_status)
            if verification_status == "verified":
                fields.append("last_verified_at = CURRENT_TIMESTAMP")

        if resolution_evidence is not None:
            fields.append("resolution_evidence = ?")
            params.append(resolution_evidence)

        params.append(error_hash)

        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"UPDATE yutu_errors SET {', '.join(fields)} WHERE error_hash = ?",
                params,
            )

        update_yutu_html()
        logger.info(f"已更新错误解决方案: {error_hash}")
        return True
    except Exception as e:
        logger.error(f"更新错误解决方案失败: {e}")
        return False


def delete_error(error_hash: str) -> bool:
    """删除错误记录（软删除）"""
    try:
        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE yutu_errors SET is_active = 0 WHERE error_hash = ?", (error_hash,))
        update_yutu_html()
        logger.info(f"已删除错误记录: {error_hash}")
        return True
    except Exception as e:
        logger.error(f"删除错误记录失败: {e}")
        return False


def _escape_html(text: Any) -> str:
    value = str(text or "")
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _status_label(status: str) -> str:
    mapping = {
        "verified": "已验证",
        "pending": "待验证",
        "draft": "草稿",
    }
    return mapping.get(status or "verified", status or "已验证")


def generate_yutu_html() -> str:
    """生成雨途斩棘录 HTML 内容"""
    try:
        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM yutu_errors WHERE is_active = 1 ORDER BY last_verified_at DESC, created_at DESC"
            )
            rows = [dict(row) for row in cursor.fetchall()]
            cursor.execute(
                "SELECT * FROM yutu_env_todos WHERE is_active = 1 ORDER BY admin_confirmed ASC, updated_at DESC, created_at DESC"
            )
            env_rows = [dict(row) for row in cursor.fetchall()]

        total_verified = sum(int(row.get("verified_count") or 0) for row in rows)
        total_failures = sum(int(row.get("failure_count") or 0) for row in rows)
        total_env_pending = sum(1 for row in env_rows if not int(row.get("admin_confirmed") or 0))

        html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>雨途斩棘录 - 智能体错误修正记录</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: "Microsoft YaHei", "SimHei", sans-serif; background: #f5f5f5; color: #333; line-height: 1.6; padding: 20px; }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        .header {{ background: linear-gradient(135deg, #1a237e 0%, #3949ab 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 20px; text-align: center; }}
        .header h1 {{ font-size: 2.5em; margin-bottom: 10px; font-weight: bold; }}
        .header p {{ font-size: 1.05em; opacity: 0.9; }}
        .stats {{ display: flex; justify-content: center; gap: 20px; margin-top: 20px; flex-wrap: wrap; }}
        .stat-item {{ background: rgba(255,255,255,0.12); padding: 15px 24px; border-radius: 8px; text-align: center; min-width: 140px; }}
        .stat-number {{ font-size: 1.8em; font-weight: bold; display: block; }}
        .stat-label {{ font-size: 0.9em; opacity: 0.82; }}
        .entry {{ background: white; border-radius: 8px; padding: 25px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }}
        .entry-header {{ display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 2px solid #eee; flex-wrap: wrap; }}
        .entry-left {{ display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }}
        .serial {{ display: inline-flex; align-items: center; justify-content: center; min-width: 34px; height: 34px; border-radius: 999px; background: #e8eaf6; color: #283593; font-weight: bold; }}
        .error-type {{ display: inline-block; padding: 5px 12px; border-radius: 4px; font-weight: bold; font-size: 0.9em; }}
        .error-type.ImportError {{ background: #e3f2fd; color: #1565c0; }}
        .error-type.ValueError {{ background: #ffebee; color: #c62828; }}
        .error-type.TypeError {{ background: #fff3e0; color: #ef6c00; }}
        .error-type.RuntimeError, .error-type.PythonError {{ background: #f3e5f5; color: #7b1fa2; }}
        .error-type.default {{ background: #eceff1; color: #455a64; }}
        .status {{ display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 0.82em; font-weight: bold; background: #e8f5e9; color: #2e7d32; }}
        .error-hash {{ font-family: monospace; font-size: 0.85em; color: #666; background: #f5f5f5; padding: 3px 8px; border-radius: 4px; }}
        .error-message {{ background: #fff3e0; padding: 15px; border-left: 4px solid #ff9800; margin-bottom: 15px; font-family: monospace; white-space: pre-wrap; word-break: break-word; }}
        .error-context {{ background: #f5f5f5; padding: 10px 15px; margin-bottom: 15px; border-radius: 4px; font-size: 0.92em; color: #666; white-space: pre-wrap; }}
        .solution {{ background: #e8f5e9; padding: 20px; border-left: 4px solid #4caf50; margin-bottom: 15px; }}
        .solution h4 {{ color: #2e7d32; margin-bottom: 10px; font-size: 1.05em; }}
        .solution p {{ white-space: pre-wrap; word-break: break-word; }}
        .solution pre {{ background: #1a1a1a; color: #f8f8f2; padding: 15px; border-radius: 4px; overflow-x: auto; font-family: "Consolas", "Monaco", monospace; font-size: 0.88em; line-height: 1.5; margin-top: 12px; white-space: pre-wrap; word-break: break-word; }}
        .evidence {{ background: #f1f8ff; padding: 12px 14px; border-left: 4px solid #64b5f6; margin-bottom: 15px; border-radius: 4px; white-space: pre-wrap; word-break: break-word; font-size: 0.92em; }}
        .meta {{ display: flex; gap: 20px; font-size: 0.85em; color: #666; padding-top: 15px; border-top: 1px solid #eee; flex-wrap: wrap; }}
        .confidence-bar {{ height: 6px; background: #eee; border-radius: 3px; overflow: hidden; margin-top: 8px; }}
        .confidence-fill {{ height: 100%; background: linear-gradient(90deg, #4caf50, #8bc34a); transition: width 0.3s; }}
        .confidence-low {{ background: linear-gradient(90deg, #ff9800, #ffc107); }}
        .confidence-high {{ background: linear-gradient(90deg, #4caf50, #8bc34a); }}
        .empty-state {{ text-align: center; padding: 60px 20px; color: #666; }}
        .empty-icon {{ font-size: 4em; margin-bottom: 20px; }}
        .footer {{ text-align: center; padding: 20px; color: #666; font-size: 0.9em; }}
        .section-title {{ font-size: 1.4em; margin: 28px 0 16px; color: #283593; }}
        .env-entry {{ background: #fff; border-radius: 8px; padding: 22px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }}
        .env-meta {{ display: flex; gap: 16px; flex-wrap: wrap; font-size: 0.85em; color: #666; margin-top: 12px; }}
        .pill {{ display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 0.82em; font-weight: bold; background: #e3f2fd; color: #1565c0; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📖 雨途斩棘录</h1>
            <p>记录已真实跑通、已验证有效的错误修复方法</p>
            <div class="stats">
                <div class="stat-item"><span class="stat-number">{len(rows)}</span><span class="stat-label">错误记录</span></div>
                <div class="stat-item"><span class="stat-number">{total_verified}</span><span class="stat-label">验证成功次数</span></div>
                <div class="stat-item"><span class="stat-number">{total_failures}</span><span class="stat-label">失败观测次数</span></div>
                <div class="stat-item"><span class="stat-number">{total_env_pending}</span><span class="stat-label">环境待办未确认</span></div>
            </div>
        </div>
        <h2 class="section-title">错误修复知识库</h2>
        <div class="entries">
'''

        if not rows:
            html += '''
            <div class="empty-state">
                <div class="empty-icon">📜</div>
                <h3>暂无错误记录</h3>
                <p>当智能体遇到错误并在后续真实跑通后，验证过的解决方案会自动沉淀到这里。</p>
            </div>
'''
        else:
            for index, row in enumerate(rows, start=1):
                error_type = row.get("error_type") or "Unknown"
                confidence = float(row.get("confidence") or 0.0)
                confidence_class = "confidence-low" if confidence < 0.5 else "confidence-high"
                error_type_class = error_type if error_type in ["ImportError", "ValueError", "TypeError", "RuntimeError", "PythonError"] else "default"
                solution = _escape_html(row.get("solution"))
                solution_code = _escape_html(row.get("solution_code"))
                evidence = _escape_html(row.get("resolution_evidence"))
                error_message = _escape_html(row.get("error_message"))
                error_context = _escape_html(row.get("error_context"))
                html += f'''
            <div class="entry">
                <div class="entry-header">
                    <div class="entry-left">
                        <span class="serial">{index}</span>
                        <span class="error-type {error_type_class}">{_escape_html(error_type)}</span>
                        <span class="status">{_escape_html(_status_label(str(row.get("verification_status") or "verified")))}</span>
                    </div>
                    <span class="error-hash">{_escape_html(row.get("error_hash"))}</span>
                </div>
                <div class="error-message">{error_message}</div>
'''
                if error_context:
                    html += f'''
                <div class="error-context"><strong>上下文：</strong>{error_context}</div>
'''
                html += f'''
                <div class="solution">
                    <h4>✅ 已验证解决方案</h4>
                    <p>{solution}</p>
'''
                if solution_code:
                    html += f'''
                    <pre><code>{solution_code}</code></pre>
'''
                html += '</div>'
                if evidence:
                    html += f'''
                <div class="evidence"><strong>验证证据：</strong>{evidence}</div>
'''
                html += f'''
                <div class="meta">
                    <span>📅 创建时间: {_escape_html(row.get("created_at"))}</span>
                    <span>🕒 更新时间: {_escape_html(row.get("updated_at"))}</span>
                    <span>✅ 最近验证: {_escape_html(row.get("last_verified_at") or "-")}</span>
                    <span>👤 创建者: {_escape_html(row.get("created_by"))}</span>
                    <span>🗂️ 分类: {_escape_html(row.get("record_category") or "runtime_code_generation")}</span>
                    <span>🔁 验证成功: {int(row.get("verified_count") or 0)}</span>
                    <span>🧪 失败观测: {int(row.get("failure_count") or 0)}</span>
                    <span>📊 使用次数: {int(row.get("usage_count") or 0)}</span>
                    <span>🎯 置信度: {confidence:.0%}</span>
                </div>
                <div class="confidence-bar">
                    <div class="confidence-fill {confidence_class}" style="width: {confidence * 100}%"></div>
                </div>
            </div>
'''

        html += '''
        </div>
        <h2 class="section-title">环境完善建议</h2>
        <div class="entries">
'''
        if not env_rows:
            html += '''
            <div class="empty-state">
                <div class="empty-icon">🛠️</div>
                <h3>暂无环境完善建议</h3>
                <p>当系统检测到可通过基础环境完善解决的问题时，会在这里形成管理员待办。</p>
            </div>
'''
        else:
            for item in env_rows:
                html += f'''
            <div class="env-entry">
                <div class="entry-header">
                    <div class="entry-left">
                        <span class="pill">{_escape_html(item.get("priority") or "medium")}</span>
                        <span class="pill">{_escape_html(item.get("status") or "pending")}</span>
                        <span class="pill">{'已确认' if int(item.get("admin_confirmed") or 0) else '待确认'}</span>
                    </div>
                    <span class="error-hash">ENV-{int(item.get("id") or 0)}</span>
                </div>
                <div class="error-message">{_escape_html(item.get("title"))}</div>
                <div class="error-context"><strong>建议：</strong>{_escape_html(item.get("description"))}</div>
                <div class="env-meta">
                    <span>来源错误哈希: {_escape_html(item.get("source_error_hash") or '-')}</span>
                    <span>相关错误类型: {_escape_html(item.get("related_error_type") or '-')}</span>
                    <span>负责人: {_escape_html(item.get("owner") or '-')}</span>
                    <span>创建者: {_escape_html(item.get("created_by") or '-')}</span>
                    <span>确认人: {_escape_html(item.get("admin_confirmed_by") or '-')}</span>
                    <span>确认时间: {_escape_html(item.get("admin_confirmed_at") or '-')}</span>
                </div>
                {f'<div class="evidence"><strong>修复说明：</strong>{_escape_html(item.get("resolution_note"))}</div>' if item.get("resolution_note") else ''}
            </div>
'''

        html += '''
        <div class="footer">
            <p>雨途斩棘录 - 智能体的已验证错误修复知识库</p>
            <p>超级用户: rainforgrain</p>
        </div>
    </div>
</body>
</html>'''
        return html
    except Exception as e:
        logger.error(f"生成HTML失败: {e}")
        return "<html><body><h1>生成失败</h1></body></html>"


def update_yutu_html():
    """更新雨途斩棘录 HTML 文件"""
    try:
        html_content = generate_yutu_html()
        with open(YUTU_HTML_PATH, "w", encoding="utf-8") as f:
            f.write(html_content)

        logger.info(f"雨途斩棘录HTML已更新: {YUTU_HTML_PATH}")

        try:
            with _connect() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='special_files'")
                if cursor.fetchone():
                    cursor.execute(
                        '''
                        INSERT OR REPLACE INTO special_files (name, content, updated_at)
                        VALUES ('yutu_zhanyilu', ?, CURRENT_TIMESTAMP)
                        ''',
                        (html_content,),
                    )
                    logger.info("雨途斩棘录HTML已同步到数据库")
        except Exception as e:
            logger.debug(f"同步到数据库失败: {e}")
    except Exception as e:
        logger.error(f"更新HTML失败: {e}")


def get_yutu_html() -> str:
    """获取雨途斩棘录 HTML 内容"""
    try:
        if os.path.exists(YUTU_HTML_PATH):
            with open(YUTU_HTML_PATH, "r", encoding="utf-8") as f:
                return f.read()
        html = generate_yutu_html()
        with open(YUTU_HTML_PATH, "w", encoding="utf-8") as f:
            f.write(html)
        return html
    except Exception as e:
        logger.error(f"获取HTML失败: {e}")
        return "<html><body><h1>加载失败</h1></body></html>"


def init_yutu_if_needed():
    init_yutu_db()
    update_yutu_html()


init_yutu_if_needed()
