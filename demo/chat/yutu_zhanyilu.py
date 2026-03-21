"""
雨途斩疑录 - 智能体错误修正记录管理模块

这个模块管理智能体在执行代码时遇到的错误及其解决方案，
形成知识库，帮助智能体在将来遇到类似问题时快速解决。
"""

import os
import json
import sqlite3
import hashlib
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 数据库路径
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "deepanalyze.db")

# 雨途斩疑录HTML文件路径
YUTU_HTML_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "yutu_zhanyilu.html")


def init_yutu_db():
    """初始化雨途斩疑录数据库"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 创建错误记录表
    cursor.execute('''
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
            created_by TEXT DEFAULT 'system'
        )
    ''')

    # 创建错误索引表，用于快速查找相似错误
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS yutu_error_keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            error_hash TEXT NOT NULL,
            keyword TEXT NOT NULL,
            FOREIGN KEY (error_hash) REFERENCES yutu_errors(error_hash)
        )
    ''')

    conn.commit()
    conn.close()

    logger.info("雨途斩疑录数据库初始化完成")


def compute_error_hash(error_type: str, error_message: str) -> str:
    """计算错误的哈希值，用于唯一标识错误"""
    content = f"{error_type}:{error_message}"
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def get_yutu_db():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def add_error_solution(
    error_type: str,
    error_message: str,
    error_context: Optional[str],
    solution: str,
    solution_code: Optional[str] = None,
    confidence: float = 0.0,
    created_by: str = "system"
) -> bool:
    """
    添加错误记录和解决方案

    Args:
        error_type: 错误类型（如 "ImportError", "ValueError"）
        error_message: 错误消息
        error_context: 错误上下文（可选）
        solution: 解决方案描述
        solution_code: 解决方案代码（可选）
        confidence: 解决方案置信度（0.0-1.0）
        created_by: 创建者用户名

    Returns:
        bool: 成功返回 True
    """
    try:
        error_hash = compute_error_hash(error_type, error_message)

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # 检查是否已存在
        cursor.execute(
            "SELECT id FROM yutu_errors WHERE error_hash = ?",
            (error_hash,)
        )
        existing = cursor.fetchone()

        if existing:
            # 更新现有记录
            cursor.execute('''
                UPDATE yutu_errors
                SET solution = ?, solution_code = ?, confidence = ?,
                    updated_at = CURRENT_TIMESTAMP, usage_count = usage_count + 1,
                    created_by = ?
                WHERE error_hash = ?
            ''', (solution, solution_code, confidence, created_by, error_hash))
        else:
            # 插入新记录
            cursor.execute('''
                INSERT INTO yutu_errors
                (error_hash, error_type, error_message, error_context,
                 solution, solution_code, confidence, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (error_hash, error_type, error_message, error_context,
                  solution, solution_code, confidence, created_by))

            # 提取关键词建立索引
            keywords = extract_keywords(error_message, error_type)
            for kw in keywords:
                cursor.execute(
                    "INSERT INTO yutu_error_keywords (error_hash, keyword) VALUES (?, ?)",
                    (error_hash, kw)
                )

        conn.commit()
        conn.close()

        logger.info(f"已添加错误解决方案: {error_type} - {error_hash}")

        # 更新HTML文件
        update_yutu_html()

        return True

    except Exception as e:
        logger.error(f"添加错误解决方案失败: {e}")
        return False


def extract_keywords(text: str, error_type: str) -> List[str]:
    """从错误消息中提取关键词"""
    import re

    keywords = [error_type.lower()]

    # 提取文本中的重要词
    words = re.findall(r'[a-zA-Z0-9_]+', text)

    # 过滤掉常见停用词
    stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
                  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
                  'would', 'could', 'should', 'may', 'might', 'must', 'shall',
                  'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in',
                  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
                  'through', 'during', 'before', 'after', 'above', 'below',
                  'between', 'under', 'again', 'further', 'then', 'once',
                  'here', 'there', 'when', 'where', 'why', 'how', 'all',
                  'each', 'few', 'more', 'most', 'other', 'some', 'such',
                  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
                  'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because',
                  'until', 'while', 'this', 'that', 'these', 'those'}

    for word in words:
        word_lower = word.lower()
        if word_lower not in stop_words and len(word) > 3:
            keywords.append(word_lower)

    # 去重并返回前20个关键词
    return list(set(keywords))[:20]


def search_errors(
    keywords: Optional[List[str]] = None,
    error_type: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
) -> Dict[str, Any]:
    """
    搜索错误记录

    Args:
        keywords: 关键词列表
        error_type: 错误类型
        page: 页码
        page_size: 每页大小

    Returns:
        dict: 搜索结果
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # 构建查询
        query = "SELECT * FROM yutu_errors WHERE is_active = 1"
        params = []

        if error_type:
            query += " AND error_type = ?"
            params.append(error_type)

        # 按关键词搜索
        if keywords:
            keyword_conditions = []
            for kw in keywords:
                keyword_conditions.append("error_message LIKE ?")
                params.append(f"%{kw}%")
            query += " AND (" + " OR ".join(keyword_conditions) + ")"

        query += " ORDER BY usage_count DESC, created_at DESC"

        # 分页
        offset = (page - 1) * page_size
        query += " LIMIT ? OFFSET ?"
        params.extend([page_size, offset])

        cursor.execute(query, params)
        results = cursor.fetchall()

        # 获取总数
        count_query = "SELECT COUNT(*) FROM yutu_errors WHERE is_active = 1"
        if error_type:
            count_query += " AND error_type = ?"
            params = [error_type]
        else:
            params = []

        if keywords:
            count_query += " AND (" + " OR ".join(
                [f"error_message LIKE ?" for _ in keywords]
            ) + ")"
            for _ in keywords:
                params.append(f"%{_[0]}%")

        # 获取总数
        count_query = "SELECT COUNT(*) FROM yutu_errors WHERE is_active = 1"
        count_params = []
        if error_type:
            count_query += " AND error_type = ?"
            count_params.append(error_type)

        if keywords:
            count_query += " AND (" + " OR ".join(
                [f"error_message LIKE ?" for _ in keywords]
            ) + ")"
            for kw in keywords:
                count_params.append(f"%{kw}%")

        cursor.execute(count_query, count_params)
        total = cursor.fetchone()[0]

        conn.close()

        # 转换结果
        items = []
        for row in results:
            # 使用数字索引，因为 row 是 tuple
            items.append({
                "id": row[0],
                "error_hash": row[1],
                "error_type": row[2],
                "error_message": row[3],
                "error_context": row[4],
                "solution": row[5],
                "solution_code": row[6],
                "confidence": row[7],
                "usage_count": row[8],
                "created_at": row[9],
                "updated_at": row[10],
                "created_by": row[11]
            })

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size
        }

    except Exception as e:
        logger.error(f"搜索错误记录失败: {e}")
        return {"items": [], "total": 0, "page": 1, "page_size": page_size, "total_pages": 1}


def get_error_by_hash(error_hash: str) -> Optional[Dict[str, Any]]:
    """根据哈希获取错误记录"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM yutu_errors WHERE error_hash = ?",
            (error_hash,)
        )
        row = cursor.fetchone()
        conn.close()

        if row:
            return {
                "id": row["id"],
                "error_hash": row["error_hash"],
                "error_type": row["error_type"],
                "error_message": row["error_message"],
                "error_context": row["error_context"],
                "solution": row["solution"],
                "solution_code": row["solution_code"],
                "confidence": row["confidence"],
                "usage_count": row["usage_count"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "created_by": row["created_by"]
            }
        return None

    except Exception as e:
        logger.error(f"获取错误记录失败: {e}")
        return None


def update_error_solution(
    error_hash: str,
    solution: str,
    solution_code: Optional[str] = None,
    confidence: float = 0.0,
    updated_by: str = "system"
) -> bool:
    """更新错误解决方案"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        cursor.execute('''
            UPDATE yutu_errors
            SET solution = ?, solution_code = ?, confidence = ?,
                updated_at = CURRENT_TIMESTAMP, created_by = ?
            WHERE error_hash = ?
        ''', (solution, solution_code, confidence, updated_by, error_hash))

        conn.commit()
        conn.close()

        # 更新HTML文件
        update_yutu_html()

        logger.info(f"已更新错误解决方案: {error_hash}")
        return True

    except Exception as e:
        logger.error(f"更新错误解决方案失败: {e}")
        return False


def delete_error(error_hash: str) -> bool:
    """删除错误记录（软删除）"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        cursor.execute(
            "UPDATE yutu_errors SET is_active = 0 WHERE error_hash = ?",
            (error_hash,)
        )

        conn.commit()
        conn.close()

        # 更新HTML文件
        update_yutu_html()

        logger.info(f"已删除错误记录: {error_hash}")
        return True

    except Exception as e:
        logger.error(f"删除错误记录失败: {e}")
        return False


def reorganize_all_records(records: List[dict]) -> int:
    """重新整理所有雨途斩疑记录 - 改进记录的组织和内容"""
    if not records:
        return 0

    updated_count = 0
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        for record in records:
            error_hash = record.get("error_hash")
            if not error_hash:
                continue

            # 改进解决方案描述，添加更清晰的场景描述
            solution = record.get("solution", "")
            error_message = record.get("error_message", "")
            error_type = record.get("error_type", "")

            # 生成更清晰的场景描述和改进的解决方案
            improved_solution = solution
            if solution:
                # 添加场景标签和改进的结构
                improved_solution = f"【场景分析】遇到 {error_type} 错误时：{error_message[:100]}...\n\n【解决方案】{solution}\n\n【关键要点】该错误通常由{_extract_key_cause(error_type)}引起，建议直接采用上述解决方案。"

            # 更新数据库
            cursor.execute(
                "UPDATE yutu_errors SET solution = ? WHERE error_hash = ?",
                (improved_solution, error_hash)
            )
            updated_count += 1

        conn.commit()
        logger.info(f"已整理 {updated_count} 条记录")

    except Exception as e:
        logger.error(f"整理记录失败: {e}")
    finally:
        conn.close()

    # 生成新的HTML
    update_yutu_html()

    return updated_count


def _extract_key_cause(error_type: str) -> str:
    """提取错误类型的常见原因关键词"""
    causes = {
        "ImportError": "模块路径问题或缺少依赖",
        "ValueError": "数据类型不匹配或值超出范围",
        "TypeError": "操作类型不匹配",
        "AttributeError": "对象缺少属性或属性名错误",
        "KeyError": "字典键不存在",
        "IndexError": "索引超出列表范围",
        "FileNotFoundError": "文件路径错误或文件不存在",
        "PermissionError": "权限不足",
        "SyntaxError": "代码语法错误",
        "NameError": "变量名未定义"
    }
    return causes.get(error_type, "多种原因")


def generate_yutu_html() -> str:
    """生成雨途斩疑录HTML内容"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # 获取所有活动的错误记录
        cursor.execute(
            "SELECT * FROM yutu_errors WHERE is_active = 1 ORDER BY created_at DESC"
        )
        rows = cursor.fetchall()
        conn.close()

        # 构建HTML
        html = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>雨途斩疑录 - 智能体错误修正记录</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: "Microsoft YaHei", "SimHei", sans-serif;
            background: #f5f5f5;
            color: #333;
            line-height: 1.6;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: linear-gradient(135deg, #1a237e 0%, #3949ab 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 20px;
            text-align: center;
        }
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            font-weight: bold;
        }
        .header p {
            font-size: 1.1em;
            opacity: 0.9;
        }
        .stats {
            display: flex;
            justify-content: center;
            gap: 30px;
            margin-top: 20px;
            flex-wrap: wrap;
        }
        .stat-item {
            background: rgba(255,255,255,0.1);
            padding: 15px 30px;
            border-radius: 8px;
            text-align: center;
        }
        .stat-number {
            font-size: 2em;
            font-weight: bold;
            display: block;
        }
        .stat-label {
            font-size: 0.9em;
            opacity: 0.8;
        }
        .entry {
            background: white;
            border-radius: 8px;
            padding: 25px;
            margin-bottom: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .entry-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 2px solid #eee;
        }
        .error-type {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 0.9em;
        }
        .error-type.ImportError { background: #e3f2fd; color: #1565c0; }
        .error-type.ValueError { background: #ffebee; color: #c62828; }
        .error-type.TypeError { background: #fff3e0; color: #ef6c00; }
        .error-type.RuntimeError { background: #f3e5f5; color: #7b1fa2; }
        .error-type.default { background: #eceff1; color: #455a64; }
        .error-hash {
            font-family: monospace;
            font-size: 0.85em;
            color: #666;
            background: #f5f5f5;
            padding: 3px 8px;
            border-radius: 4px;
        }
        .error-message {
            background: #fff3e0;
            padding: 15px;
            border-left: 4px solid #ff9800;
            margin-bottom: 15px;
            font-family: monospace;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .error-context {
            background: #f5f5f5;
            padding: 10px 15px;
            margin-bottom: 15px;
            border-radius: 4px;
            font-size: 0.9em;
            color: #666;
        }
        .solution {
            background: #e8f5e9;
            padding: 20px;
            border-left: 4px solid #4caf50;
            margin-bottom: 15px;
        }
        .solution h4 {
            color: #2e7d32;
            margin-bottom: 10px;
            font-size: 1.1em;
        }
        .solution pre {
            background: #1a1a1a;
            color: #f8f8f2;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            font-family: "Consolas", "Monaco", monospace;
            font-size: 0.9em;
            line-height: 1.5;
        }
        .solution code {
            font-family: "Consolas", "Monaco", monospace;
        }
        .meta {
            display: flex;
            gap: 20px;
            font-size: 0.85em;
            color: #666;
            padding-top: 15px;
            border-top: 1px solid #eee;
            flex-wrap: wrap;
        }
        .meta span {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .confidence-bar {
            height: 6px;
            background: #eee;
            border-radius: 3px;
            overflow: hidden;
            margin-top: 8px;
        }
        .confidence-fill {
            height: 100%;
            background: linear-gradient(90deg, #4caf50, #8bc34a);
            transition: width 0.3s;
        }
        .confidence-low { background: linear-gradient(90deg, #ff9800, #ffc107); }
        .confidence-high { background: linear-gradient(90deg, #4caf50, #8bc34a); }
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #666;
        }
        .empty-icon {
            font-size: 4em;
            margin-bottom: 20px;
        }
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 0.9em;
        }
        .tag {
            display: inline-block;
            background: #e0e0e0;
            padding: 3px 8px;
            border-radius: 3px;
            font-size: 0.8em;
            margin-right: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📖 雨途斩疑录</h1>
            <p>智能体错误修正记录与解决方案知识库</p>
            <div class="stats">
                <div class="stat-item">
                    <span class="stat-number">''' + str(len(rows)) + '''</span>
                    <span class="stat-label">错误记录</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">''' + str(sum(row[8] for row in rows)) + '''</span>
                    <span class="stat-label">总解决次数</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">''' + str(len(set(row[1] for row in rows))) + '''</span>
                    <span class="stat-label">唯一错误类型</span>
                </div>
            </div>
        </div>

        <div class="entries">
'''

        if not rows:
            html += '''
            <div class="empty-state">
                <div class="empty-icon">📜</div>
                <h3>暂无错误记录</h3>
                <p>当智能体遇到错误并找到解决方案后，记录将自动添加到这里</p>
            </div>
'''
        else:
            for row in rows:
                error_type = row[2] if row[2] else "Unknown"
                confidence = row[9] if row[9] else 0.0

                confidence_class = "confidence-low" if confidence < 0.5 else "confidence-high"

                error_type_class = f"error-type.{error_type}" if error_type in ["ImportError", "ValueError", "TypeError", "RuntimeError"] else "error-type.default"

                solution_code = row[6] if row[6] else ""

                html += f'''
            <div class="entry">
                <div class="entry-header">
                    <span class="{error_type_class}">{error_type}</span>
                    <span class="error-hash">{row[1]}</span>
                </div>
                <div class="error-message">{row[3]}</div>
'''

                if row[4]:
                    html += f'''                <div class="error-context">
                    <strong>上下文：</strong>{row[4]}
                </div>
'''

                html += f'''                <div class="solution">
                    <h4>✅ 解决方案</h4>
'''

                if solution_code:
                    html += f'''                    <pre><code>{solution_code}</code></pre>
'''
                else:
                    html += f'''                    <p>{row[5]}</p>
'''

                html += f'''                </div>

                <div class="meta">
                    <span>📅 创建时间: {row[10]}</span>
                    <span>🔄 更新时间: {row[11]}</span>
                    <span>👤 创建者: {row[12]}</span>
                    <span>📊 使用次数: {row[8]}</span>
                    <span>🎯 置信度: {confidence:.0%}</span>
                </div>
                <div class="confidence-bar">
                    <div class="confidence-fill {confidence_class}" style="width: {confidence*100}%"></div>
                </div>
            </div>
'''

        html += '''
        </div>

        <div class="footer">
            <p>雨途斩疑录 - 智能体的错误修正知识库</p>
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
    """更新雨途斩疑录HTML文件"""
    try:
        html_content = generate_yutu_html()

        # 保存到文件
        with open(YUTU_HTML_PATH, "w", encoding="utf-8") as f:
            f.write(html_content)

        logger.info(f"雨途斩疑录HTML已更新: {YUTU_HTML_PATH}")

        # 同时保存到数据库的special_files表（如果存在）
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()

            # 检查special_files表是否存在
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='special_files'")
            if cursor.fetchone():
                # 保存HTML到数据库
                cursor.execute('''
                    INSERT OR REPLACE INTO special_files (name, content, updated_at)
                    VALUES ('yutu_zhanyilu', ?, CURRENT_TIMESTAMP)
                ''', (html_content,))
                conn.commit()
                logger.info("雨途斩疑录HTML已同步到数据库")

            conn.close()
        except Exception as e:
            logger.debug(f"同步到数据库失败: {e}")

    except Exception as e:
        logger.error(f"更新HTML失败: {e}")


def get_yutu_html() -> str:
    """获取雨途斩疑录HTML内容"""
    try:
        if os.path.exists(YUTU_HTML_PATH):
            with open(YUTU_HTML_PATH, "r", encoding="utf-8") as f:
                return f.read()

        # 如果文件不存在，生成并保存
        html = generate_yutu_html()
        with open(YUTU_HTML_PATH, "w", encoding="utf-8") as f:
            f.write(html)
        return html

    except Exception as e:
        logger.error(f"获取HTML失败: {e}")
        return "<html><body><h1>加载失败</h1></body></html>"


def init_yutu_if_needed():
    """初始化雨途斩疑录（如果需要）"""
    init_yutu_db()
    update_yutu_html()


# 初始化
init_yutu_if_needed()


if __name__ == "__main__":
    print("=" * 60)
    print("雨途斩疑录 - 初始化测试")
    print("=" * 60)

    # 添加测试记录
    add_error_solution(
        error_type="ImportError",
        error_message="ModuleNotFoundError: No module named 'pandas'",
        error_context="在执行数据分析代码时，缺少pandas库",
        solution="安装pandas库",
        solution_code="pip install pandas",
        confidence=0.95,
        created_by="system"
    )

    add_error_solution(
        error_type="ValueError",
        error_message="UnicodeDecodeError: 'utf-8' codec can't decode byte",
        error_context="读取非UTF-8编码的文件时出现错误",
        solution="使用chardet检测文件编码并转换",
        solution_code="""
import chardet

with open('file.csv', 'rb') as f:
    raw_data = f.read()
    encoding = chardet.detect(raw_data)['encoding']
    content = raw_data.decode(encoding, errors='ignore')
""",
        confidence=0.90,
        created_by="system"
    )

    # 搜索测试
    results = search_errors(keywords=["pandas", "module"])
    print(f"\n搜索结果: {len(results['items'])} 条记录")

    # 获取HTML
    html = get_yutu_html()
    print(f"\nHTML已生成，大小: {len(html)} 字符")

    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)
