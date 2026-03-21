import openai
from typing import Optional, List, Dict, Any
import json
import os
import shutil
import re
import io
import contextlib
import traceback
from pathlib import Path
from urllib.parse import quote
import subprocess
import sys
import tempfile
import requests
import threading
import http.server
from functools import partial
import socketserver
import sqlite3
import hashlib
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Query, Depends, Request
from fastapi.responses import JSONResponse, Response, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import httpx
import uvicorn
import os
import re
import json
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool
import os
import re
from copy import deepcopy
import openai
from fastapi import FastAPI, Body
from fastapi.responses import StreamingResponse

import re
from matplotlib import font_manager

os.environ.setdefault("MPLBACKEND", "Agg")

# 注册中文字体到 matplotlib
FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../assets/fonts")
if os.path.exists(FONT_DIR):
    for font_file in os.listdir(FONT_DIR):
        if font_file.lower().endswith(('.ttf', '.ttc', '.otf')):
            try:
                font_manager.fontManager.addfont(os.path.join(FONT_DIR, font_file))
            except Exception as e:
                print(f"Error registering font {font_file}: {e}")

import chardet
from docx import Document

# 使用新的模块化 PDF 工具
from pdf_utils import (
    register_chinese_fonts,
    get_chinese_style,
    extract_markdown_sections,
    clean_md_text,
    generate_pdf as generate_pdf_module,
)

from docx_utils import (
    generate_docx as generate_docx_module,
    create_docx_document,
    clean_md_text_for_docx,
    extract_markdown_blocks,
)

# 雨途斩棘录模块
from yutu_zhanyilu import (
    init_yutu_if_needed,
    add_error_solution,
    search_errors,
    get_error_by_hash,
    update_error_solution,
    delete_error,
    get_yutu_html,
    update_yutu_html,
)


# ========== 自动错误记录功能 ==========
def detect_and_record_error(exe_output: str, code_str: str, workspace_dir: str) -> dict:
    """
    检测代码执行输出中的错误，并自动记录到雨途斩棘录

    Returns:
        dict: {
            "has_error": bool,           # 是否检测到错误
            "error_type": str,           # 错误类型
            "error_message": str,        # 错误消息
            "recorded": bool,            # 是否已记录到知识库
            "similar_found": bool        # 是否发现相似错误
        }
    """
    import re

    result = {
        "has_error": False,
        "error_type": "Unknown",
        "error_message": "",
        "recorded": False,
        "similar_found": False
    }

    # 如果没有输出或输出为空，认为没有错误
    if not exe_output or not exe_output.strip():
        return result

    # 检测常见的Python错误模式
    error_patterns = [
        # ImportError
        (r"ModuleNotFoundError|ImportError:\s*(.+?)(?:\n|$)", "ImportError"),
        # ValueError
        (r"ValueError:\s*(.+?)(?:\n|$)", "ValueError"),
        # TypeError
        (r"TypeError:\s*(.+?)(?:\n|$)", "TypeError"),
        # RuntimeError
        (r"RuntimeError:\s*(.+?)(?:\n|$)", "RuntimeError"),
        # KeyError
        (r"KeyError:\s*['\"](.+?)['\"]", "KeyError"),
        # FileNotFoundError
        (r"FileNotFoundError:\s*(.+?)(?:\n|$)", "FileNotFoundError"),
        # TimeoutError
        (r"TimeoutError:\s*(.+?)(?:\n|$)", "TimeoutError"),
        # SyntaxError
        (r"SyntaxError:\s*(.+?)(?:\n|$)", "SyntaxError"),
        # AttributeError
        (r"AttributeError:\s*(.+?)(?:\n|$)", "AttributeError"),
        # IndexError
        (r"IndexError:\s*(.+?)(?:\n|$)", "IndexError"),
        # MemoryError
        (r"MemoryError:\s*(.+?)(?:\n|$)", "MemoryError"),
        # ZeroDivisionError
        (r"ZeroDivisionError:\s*(.+?)(?:\n|$)", "ZeroDivisionError"),
        # FPDF/报告库相关错误
        (r"FPDF.*?DeprecationWarning|DeprecationWarning.*?FPDF", "FPDFDeprecationWarning"),
        # matplotlib 字体相关错误
        (r"Font.*?not found|FontProperties.*?not found", "FontNotFoundError"),
        # Unicode错误
        (r"UnicodeDecodeError|UnicodeEncodeError|UnicodeError", "UnicodeError"),
        # 一般错误
        (r"(?:Error|Exception|Error:)\s*(.+?)(?:\n|$)", "RuntimeError"),
        # 通用错误检测
        (r"Traceback \(most recent call last\):(.+?)(?:\n\n|\Z)", "PythonError"),
    ]

    error_type = "Unknown"
    error_message = ""

    # 遍历错误模式进行匹配
    for pattern, err_type in error_patterns:
        match = re.search(pattern, exe_output, re.IGNORECASE | re.DOTALL)
        if match:
            error_type = err_type
            # 提取错误消息，清理格式
            error_msg = match.group(1) if match.lastindex else match.group(0)
            # 限制错误消息长度，避免过长
            error_msg = error_msg.strip()[:500] if error_msg else exe_output[:500]
            error_message = error_msg
            break

    # 检查是否确实有错误（排除 "Success" 等正常输出）
    has_error = (
        error_type != "Unknown" or
        ("Error" in exe_output and "Success" not in exe_output) or
        ("error" in exe_output.lower() and "0 error" not in exe_output.lower())
    ) and not (
        # 排除成功的输出
        exe_output.strip().endswith("OK") or
        "Successfully" in exe_output or
        "successfully" in exe_output
    )

    # 进一步检测：如果输出中包含 "Error" 但不是真正的错误，也需要过滤
    if "Error" in exe_output and "[Error]:" in exe_output:
        has_error = True
    elif error_type == "Unknown" and "error" in exe_output.lower():
        # 可能是未知的错误格式，尝试提取整段
        error_type = "RuntimeError"
        error_message = exe_output[:500]

    if not has_error:
        return result

    result["has_error"] = True
    result["error_type"] = error_type
    result["error_message"] = error_message

    # 检查是否已有相似的错误记录（避免重复记录）
    try:
        similar_errors = search_errors(keywords=[error_type], page_size=1)
        if similar_errors and similar_errors.get("items"):
            for item in similar_errors["items"]:
                # 检查错误消息是否相似
                if item.get("error_message") and error_message:
                    # 简单的相似性检查：是否包含相同的关键词
                    msg_keywords = set(error_message.lower().split())
                    existing_keywords = set(item["error_message"].lower().split())
                    common = msg_keywords.intersection(existing_keywords)
                    if len(common) >= 3:  # 有3个以上共同关键词
                        result["similar_found"] = True
                        break
    except Exception as e:
        print(f"检查相似错误失败: {e}")

    # 自动记录错误到雨途斩棘录（如果没有相似记录）
    if not result["similar_found"]:
        try:
            # 生成解决方案建议
            solution = generate_solution_suggestion(error_type, error_message, code_str)
            solution_code = generate_fix_code(error_type, error_message, code_str)

            # 记录错误
            add_error_solution(
                error_type=error_type,
                error_message=error_message,
                error_context=f"工作区: {workspace_dir}\n代码长度: {len(code_str)} 字符",
                solution=solution,
                solution_code=solution_code,
                confidence=0.7,  # 自动记录的置信度稍低
                created_by="system_auto"
            )
            result["recorded"] = True
            print(f"[雨途斩棘录] 自动记录错误: {error_type} - {error_message[:50]}...")
        except Exception as e:
            print(f"[雨途斩棘录] 自动记录失败: {e}")

    return result


def generate_solution_suggestion(error_type: str, error_message: str, code_str: str) -> str:
    """根据错误类型和消息生成解决方案建议"""
    suggestions = {
        "ImportError": "检查是否已安装所需的Python包，可能需要使用 pip install 安装缺失的模块。",
        "ValueError": "检查输入数据的类型和格式，确保参数值在有效范围内。",
        "TypeError": "检查变量类型，确保操作符两边的数据类型兼容。",
        "FileNotFoundError": "检查文件路径是否正确，确保文件存在于指定位置。",
        "UnicodeError": "检查文件编码，可能需要指定正确的编码格式（如 encoding='utf-8'）。",
        "SyntaxError": "检查代码语法，确保Python语法正确。",
        "KeyError": "检查字典键是否存在，使用 .get() 方法或先检查键是否存在。",
        "IndexError": "检查列表/数组索引是否越界，确保索引值在有效范围内。",
        "AttributeError": "检查对象是否有该属性，确保使用正确的属性名。",
        "FontNotFoundError": "检查字体文件路径是否正确，确保字体文件存在。",
        "FPDFDeprecationWarning": "使用 fpdf2 替代 fpdf，或更新 FPDF 库到最新版本。",
    }
    return suggestions.get(error_type, f"遇到 {error_type} 错误，请检查代码逻辑并参考错误消息进行修复。")


def generate_fix_code(error_type: str, error_message: str, code_str: str) -> str:
    """生成修复代码的示例"""
    fix_examples = {
        "ImportError": '''# 解决方案：确保所有依赖已安装
import subprocess
import sys

def install_package(package_name):
    subprocess.check_call([sys.executable, "-m", "pip", "install", package_name])

# 示例：安装缺失的包
# install_package("package_name")
''',
        "FileNotFoundError": '''# 解决方案：检查文件是否存在，或使用绝对路径
import os

file_path = "your_file.csv"
if os.path.exists(file_path):
    # 读取文件
    pass
else:
    print(f"文件不存在: {file_path}")
    # 列出工作区文件帮助调试
    print("工作区文件:", os.listdir("."))
''',
        "UnicodeError": '''# 解决方案：指定正确的编码格式
import chardet

# 检测文件编码
with open("file.csv", "rb") as f:
    raw_data = f.read()
    result = chardet.detect(raw_data)
    encoding = result["encoding"]

# 使用检测到的编码读取文件
with open("file.csv", "r", encoding=encoding) as f:
    content = f.read()
''',
    }
    return fix_examples.get(error_type, "")

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.pagesizes import A4


Chinese_matplot_str = """
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import os

# 使用绝对路径注册所有字体（避免 __file__ 在 temp subprocess 中失效）
_ASSETS_FONTS = "/Users/m3max/IdeaProjects/DeepAnalyze/assets/fonts"
_FONT_DIRS = [
    _ASSETS_FONTS,
    "/System/Library/Fonts",
    "/Library/Fonts",
    "/System/Library/Fonts/Supplemental",
]
for _d in _FONT_DIRS:
    if os.path.exists(_d):
        for _ff in os.listdir(_d):
            if _ff.lower().endswith(('.ttf', '.ttc', '.otf')):
                try:
                    fm.fontManager.addfont(os.path.join(_d, _ff))
                except Exception:
                    pass

# 优先使用支持中文的字体系列（按优先级排序）
plt.rcParams['font.sans-serif'] = [
    # assets/fonts 中的中文字体（优先，纯 TTF）
    'SimHei',           # assets/simhei.ttf（黑体，主标题）
    'SimKai',           # assets/simkai.ttf（楷体，引用/强调）
    'STFangSong',       # assets/STFangSong.ttf（仿宋，正文）
    'STHeiti',          # assets/STHeiti.ttf（黑体，备选）
    # macOS 系统 CJK 字体
    'Heiti TC',         # macOS 繁体黑体
    'PingFang SC',      # macOS 苹方简体中文
    'PingFang TC',      # macOS 苹方繁体中文
    'Kaiti SC',         # macOS 楷体
    'Songti SC',        # macOS 宋体
    'Arial Unicode MS', # macOS 内置
    'DejaVu Sans',
    'sans-serif',
]
plt.rcParams['axes.unicode_minus'] = False
# 额外：确保数据标签、图例、标题全部使用 sans-serif 字体族
plt.rcParams['font.family'] = 'sans-serif'
"""


def execute_code_safe(
    code_str: str, workspace_dir: str = None, timeout_sec: int = 120
) -> str:
    """在独立进程中执行代码，支持超时，避免阻塞主进程。"""
    if workspace_dir is None:
        workspace_dir = WORKSPACE_BASE_DIR
    exec_cwd = os.path.abspath(workspace_dir)
    os.makedirs(exec_cwd, exist_ok=True)
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=".py", dir=exec_cwd)
        os.close(fd)
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(code_str)
        # 在子进程中设置无界面环境变量，避免 GUI 后端
        child_env = os.environ.copy()
        child_env.setdefault("MPLBACKEND", "Agg")
        child_env.setdefault("QT_QPA_PLATFORM", "offscreen")
        # 显式设置 R 环境路径，解决 libRblas.dylib 加载问题
        try:
            r_home = subprocess.check_output(["R", "RHOME"], text=True).strip()
            if r_home and os.path.exists(r_home):
                child_env.setdefault("R_HOME", r_home)
                r_lib = os.path.join(r_home, "lib")
                brew_lib = "/opt/homebrew/lib"

                # 构造库搜索路径，包含 R 自身库和 Homebrew 公共库
                lib_paths = [r_lib]
                if os.path.exists(brew_lib):
                    lib_paths.append(brew_lib)

                # 解决 libRblas.dylib 缺失问题：在 workspace 下创建软连接文件夹以引导 rpy2 (macOS brew 常见问题)
                fake_lib_dir = os.path.abspath(os.path.join(workspace_dir, ".lib"))
                os.makedirs(fake_lib_dir, exist_ok=True)
                fake_blas = os.path.join(fake_lib_dir, "libRblas.dylib")
                target_r_lib = os.path.join(r_lib, "libR.dylib")
                if not os.path.exists(fake_blas) and os.path.exists(target_r_lib):
                    try:
                        os.symlink(target_r_lib, fake_blas)
                    except:
                        pass
                if os.path.exists(fake_lib_dir):
                    lib_paths.insert(0, fake_lib_dir)

                path_str = ":".join(lib_paths)

                if "DYLD_LIBRARY_PATH" in child_env:
                    child_env["DYLD_LIBRARY_PATH"] = f"{path_str}:{child_env['DYLD_LIBRARY_PATH']}"
                else:
                    child_env["DYLD_LIBRARY_PATH"] = path_str

                # 设置多种路径变量以增强兼容性
                child_env["LD_LIBRARY_PATH"] = child_env["DYLD_LIBRARY_PATH"]
                child_env["DYLD_FALLBACK_LIBRARY_PATH"] = child_env["DYLD_LIBRARY_PATH"]
        except Exception:
            # 兜底常用路径
            r_home = "/opt/homebrew/opt/r/lib/R"
            if os.path.exists(r_home):
                child_env.setdefault("R_HOME", r_home)
                r_lib = os.path.join(r_home, "lib")
                child_env["DYLD_LIBRARY_PATH"] = f"{r_lib}:/opt/homebrew/lib"
                child_env["LD_LIBRARY_PATH"] = child_env["DYLD_LIBRARY_PATH"]
        child_env.pop("DISPLAY", None)

        completed = subprocess.run(
            [sys.executable, tmp_path],
            cwd=exec_cwd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_sec,
            env=child_env,
        )
        output = (completed.stdout or "") + (completed.stderr or "")
        return output
    except subprocess.TimeoutExpired:
        return f"[Timeout]: execution exceeded {timeout_sec} seconds"
    except Exception as e:
        return f"[Error]: {str(e)}"
    finally:
        try:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass


# API endpoint and model path
API_BASE = "http://localhost:8000/v1"  # this localhost is for vllm api, do not change
MODEL_PATH = "DeepAnalyze-8B"  # replace to your path to DeepAnalyze-8B


# Initialize OpenAI client
client = openai.OpenAI(base_url=API_BASE, api_key="dummy")

# Workspace directory
WORKSPACE_BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "workspace")
PROJECTS_BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "projects")
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "deepanalyze.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL
        )
    ''')
    # Projects table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            session_id TEXT NOT NULL,
            name TEXT NOT NULL,
            messages TEXT NOT NULL,
            files_data TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (username) REFERENCES users(username)
        )
    ''')
    # 兼容旧数据库：projects 表可能已存在但缺少 files_data 列
    cursor.execute("PRAGMA table_info(projects)")
    columns = [row[1] for row in cursor.fetchall()]
    if "files_data" not in columns:
        cursor.execute("ALTER TABLE projects ADD COLUMN files_data TEXT DEFAULT '{}'")
    conn.commit()
    conn.close()

init_db()

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

HTTP_SERVER_PORT = 8100
HTTP_SERVER_BASE = (
    f"http://localhost:{HTTP_SERVER_PORT}"  # you can replace localhost to your local ip
)


def get_session_workspace(session_id: str, username: str = "default") -> str:
    """返回指定 user 和 session 的 workspace 路径（workspace/{username}/{session_id}/）。"""
    if not username:
        username = "default"
    if not session_id:
        session_id = "default"
    session_dir = os.path.join(WORKSPACE_BASE_DIR, username, session_id)
    os.makedirs(session_dir, exist_ok=True)
    return session_dir


def build_download_url(rel_path: str) -> str:
    try:
        encoded = quote(rel_path, safe="/")
    except Exception:
        encoded = rel_path
    return f"{HTTP_SERVER_BASE}/{encoded}"


# FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def start_http_server():
    """启动HTTP文件服务器（不修改全局工作目录）。"""
    os.makedirs(WORKSPACE_BASE_DIR, exist_ok=True)
    os.makedirs(PROJECTS_BASE_DIR, exist_ok=True)
    handler = partial(
        http.server.SimpleHTTPRequestHandler, directory=WORKSPACE_BASE_DIR
    )
    with socketserver.TCPServer(("", HTTP_SERVER_PORT), handler) as httpd:
        print(f"HTTP Server serving {WORKSPACE_BASE_DIR} at port {HTTP_SERVER_PORT}")
        httpd.serve_forever()


# Start HTTP server in a separate thread
threading.Thread(target=start_http_server, daemon=True).start()


def _build_filename_mapping(workspace_dir: str) -> dict:
    """
    构建原始文件名 → converted/ 目录中实际文件名的映射。
    例如：上传 data.csv → converted/data (1).csv，则映射 {"data.csv": "data (1).csv"}
    """
    converted_dir = Path(workspace_dir) / "converted"
    mapping = {}
    if not converted_dir.exists():
        return mapping

    # 获取 converted 目录中所有文件（不带路径）
    converted_names = {f.name for f in converted_dir.iterdir() if f.is_file()}
    if not converted_names:
        return mapping

    # 遍历根目录文件，若发现与 converted 同名（或同名+uniquify后），建立映射
    root_files = [f for f in Path(workspace_dir).iterdir() if f.is_file() and f.name not in (".lib",)]
    for root_file in root_files:
        if root_file.name in converted_names:
            # 完全同名（未被 uniquify）
            mapping[root_file.name] = root_file.name
        else:
            # 检查是否为某个 converted 文件的唯一化版本（通过 stem 比对）
            for cn in converted_names:
                cn_stem = Path(cn).stem
                if root_file.stem == cn_stem:
                    mapping[root_file.name] = cn
                    break
    return mapping


def _rewrite_file_paths(code_str: str, workspace_dir: str) -> str:
    """
    将代码中出现的原始文件名自动替换为 converted/ 目录下的实际文件名。
    支持：pd.read_csv("data.csv") → pd.read_csv("converted/data (1).csv")
    """
    mapping = _build_filename_mapping(workspace_dir)
    if not mapping:
        return code_str

    converted_dir = Path(workspace_dir).name  # 仅目录名，用于构造相对路径

    for orig_name, actual_name in mapping.items():
        if orig_name == actual_name:
            continue  # 同名无需替换
        # 匹配字符串参数中的原始文件名（各种常见读取函数）
        # 匹配模式：函数调用中以 orig_name 为字符串参数
        # 例如：read_csv("data.csv")  → read_csv("converted/data (1).csv")
        for func in ["read_csv", "read_table", "open", "load", "read_excel", "read_json", "read_xml", "read_clipboard"]:
            # 匹配 func("orig_name") 或 func('orig_name')
            for quote in ['"', "'"]:
                # 构造贪婪模式以避免通配符冲突
                escaped_orig = orig_name.replace("_", r"_").replace(".", r"\.")
                # 简单方式：直接替换字符串字面值
                target_literal = f"{quote}{escaped_orig}{quote}"
                replacement = f"{quote}{converted_dir}/{actual_name}{quote}"
                # 避免重复替换 converted/ 路径本身
                pattern_unsafe = f'(?<!/{converted_dir}/){quote}{escaped_orig}{quote}'
                try:
                    code_str = re.sub(
                        pattern_unsafe,
                        replacement,
                        code_str
                    )
                except re.error:
                    pass
    return code_str


def collect_file_info(directory: str) -> str:
    """收集文件信息，包括编码映射"""
    all_file_info_str = ""
    dir_path = Path(directory)
    if not dir_path.exists():
        return ""

    # 读取编码映射文件（如存在）
    encoding_map = {}
    encoding_map_path = dir_path / ".encoding_map.json"
    if encoding_map_path.exists():
        try:
            with open(encoding_map_path, "r", encoding="utf-8") as f:
                encoding_data = json.load(f)
                # 构建文件名 -> 编码信息的映射
                for item in encoding_data.get("files", []):
                    orig_name = item.get("original_name", "")
                    encoding_map[orig_name] = item
        except Exception:
            pass

    # 收集所有文件信息（排除 .encoding_map.json 本身）
    files = sorted([f for f in dir_path.iterdir() if f.is_file() and f.name != ".encoding_map.json"])

    for idx, file_path in enumerate(files, start=1):
        size_bytes = os.path.getsize(file_path)
        size_kb = size_bytes / 1024
        size_str = f"{size_kb:.1f}KB"

        # 获取该文件的编码信息
        enc_info = encoding_map.get(file_path.name, {})
        original_encoding = enc_info.get("original_encoding", "unknown")
        is_converted = enc_info.get("is_converted", False)
        converted_name = enc_info.get("converted_name", file_path.name)

        # 构建文件信息
        file_info = {
            "name": file_path.name,
            "size": size_str,
            "encoding": original_encoding,
            "is_utf8_converted": is_converted
        }

        # 如果是转换过的文件，标记正确路径
        if is_converted:
            file_info["use_path"] = f"converted/{converted_name}"

        file_info_str = json.dumps(file_info, indent=4, ensure_ascii=False)
        all_file_info_str += f"File {idx}:\n{file_info_str}\n\n"

    # 添加编码状态汇总
    if encoding_map:
        all_utf8 = all(
            item.get("original_encoding") in ("utf-8", "binary")
            for item in encoding_map.values()
        )
        converted_count = sum(1 for item in encoding_map.values() if item.get("is_converted"))

        if all_utf8:
            all_file_info_str += "【编码状态】所有文件已是 UTF-8 编码，可直接使用。\n\n"
        else:
            all_file_info_str += f"【编码状态】已转换 {converted_count} 个非 UTF-8 文件为 UTF-8 编码。\n"
            all_file_info_str += "【重要】读取数据文件时请使用 converted/ 目录下的 UTF-8 版本文件。\n\n"

    return all_file_info_str


def get_file_icon(extension):
    """获取文件图标"""
    ext = extension.lower()
    icons = {
        (".jpg", ".jpeg", ".png", ".gif", ".bmp"): "🖼️",
        (".pdf",): "📕",
        (".doc", ".docx"): "📘",
        (".txt",): "📄",
        (".md",): "📝",
        (".csv", ".xlsx"): "📊",
        (".json", ".sqlite"): "🗄️",
        (".mp4", ".avi", ".mov"): "🎥",
        (".mp3", ".wav"): "🎵",
        (".zip", ".rar", ".tar"): "🗜️",
    }

    for extensions, icon in icons.items():
        if ext in extensions:
            return icon
    return "📁"


def uniquify_path(target: Path) -> Path:
    """若目标已存在，生成 'name (1).ext'、'name (2).ext' 形式的新路径。"""
    if not target.exists():
        return target
    parent = target.parent
    stem = target.stem
    suffix = target.suffix
    import re as _re

    m = _re.match(r"^(.*) \((\d+)\)$", stem)
    base = stem
    start = 1
    if m:
        base = m.group(1)
        try:
            start = int(m.group(2)) + 1
        except Exception:
            start = 1
    i = start
    while True:
        candidate = parent / f"{base} ({i}){suffix}"
        if not candidate.exists():
            return candidate
        i += 1





# API Routes
@app.post("/api/auth/register")
async def register(username: str = Form(...), password: str = Form(...)):
    print(f"Registering user: {username}")
    # rainforgrain 允许空密码
    if username != "rainforgrain" and len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)",
                       (username, hash_password(password)))
        conn.commit()
        conn.close()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Username already exists")
    except Exception as e:
        print(f"Registration error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    return {"message": "Registered successfully"}

@app.post("/api/auth/login")
async def login(username: str = Form(...), password: str = Form(...)):
    print(f"Login attempt: {username}")
    if username == "rainforgrain":
        # Superuser skip password check (even if password is empty)
        # Ensure superuser exists in the DB for foreign key constraints
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT username FROM users WHERE username = ?", (username,))
            if not cursor.fetchone():
                cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)",
                               (username, hash_password("internal_bypass_value")))
                conn.commit()
            conn.close()
            return {"username": "rainforgrain", "is_superuser": True}
        except Exception as e:
            print(f"Superuser login error: {e}")
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # Allow empty password for any user who has no password set (empty hash)
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT password_hash FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        # Empty password allowed: check if stored hash is empty string hash
        if row["password_hash"] == "":
            # No password set - allow login if provided password is also empty
            if password == "":
                return {"username": username, "is_superuser": False}
            else:
                raise HTTPException(status_code=401, detail="Invalid username or password")
        if row["password_hash"] != hash_password(password):
            raise HTTPException(status_code=401, detail="Invalid username or password")

        return {"username": username, "is_superuser": False}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Login error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/workspace/files")
async def get_workspace_files(session_id: str = Query("default"), username: str = Query("default")):
    """获取工作区文件列表（支持 user & session 隔离）"""
    workspace_dir = get_session_workspace(session_id, username)
    generated_dir = Path(workspace_dir) / "generated"
    # 获取 generated 目录下的文件名集合
    generated_files = (
        set(f.name for f in generated_dir.iterdir() if f.is_file())
        if generated_dir.exists()
        else set()
    )

    files = []
    for file_path in Path(workspace_dir).iterdir():
        if file_path.is_file():
            if file_path.name in generated_files:
                continue
            stat = file_path.stat()
            # 重新构建包含 username/session_id 的路径
            rel_path = f"{username}/{session_id}/{file_path.name}"
            files.append(
                {
                    "name": file_path.name,
                    "size": stat.st_size,
                    "extension": file_path.suffix.lower(),
                    "icon": get_file_icon(file_path.suffix),
                    "download_url": build_download_url(rel_path),
                    "preview_url": (
                        build_download_url(rel_path)
                        if file_path.suffix.lower()
                        in [
                            ".jpg",
                            ".jpeg",
                            ".png",
                            ".gif",
                            ".bmp",
                            ".pdf",
                            ".txt",
                            ".doc",
                            ".docx",
                            ".csv",
                            ".xlsx",
                        ]
                        else None
                    ),
                }
            )
    return {"files": files}


# ---------- Workspace Tree & Single File Delete ----------
def _rel_path(path: Path, root: Path) -> str:
    try:
        rel = path.relative_to(root)
        return rel.as_posix()
    except Exception:
        return path.name


def build_tree(path: Path, root: Optional[Path] = None) -> dict:
    if root is None:
        root = path
    node: dict = {
        "name": path.name or "workspace",
        "path": _rel_path(path, root),
        "is_dir": path.is_dir(),
    }
    if path.is_dir():
        children = []

        # 自定义排序：generated 和 converted 文件夹放在最后，其他按目录优先、名称排序
        def sort_key(p):
            is_generated = p.name == "generated"
            is_converted = p.name == "converted"
            is_dir = p.is_dir()
            return (is_generated or is_converted, not is_dir, p.name.lower())

        for child in sorted(path.iterdir(), key=sort_key):
            if child.name.startswith("."):
                continue
            children.append(build_tree(child, root))
        node["children"] = children
    else:
        node["size"] = path.stat().st_size
        node["extension"] = path.suffix.lower()
        node["icon"] = get_file_icon(path.suffix)
        rel = _rel_path(path, root)
        node["download_url"] = build_download_url(rel)
        # 标记 converted 目录下的文件
        node["is_converted"] = "converted" + os.sep in rel or rel.startswith("converted")
    return node


@app.get("/workspace/tree")
async def workspace_tree(session_id: str = Query("default"), username: str = Query("default")):
    workspace_dir = get_session_workspace(session_id, username)
    root = Path(workspace_dir)
    tree_data = build_tree(root, root)

    # 在下载链接前加上 username/session_id 前缀
    def prefix_urls(node, un, sid):
        if "download_url" in node and node["download_url"]:
            # 重新构建包含 username/session_id 的路径
            rel = node.get("path", "")
            node["download_url"] = build_download_url(f"{un}/{sid}/{rel}")
        if "children" in node:
            for child in node["children"]:
                prefix_urls(child, un, sid)

    prefix_urls(tree_data, username, session_id)
    return tree_data


@app.delete("/workspace/file")
async def delete_workspace_file(
    path: str = Query(..., description="relative path under workspace"),
    session_id: str = Query("default"),
    username: str = Query("default"),
):
    workspace_dir = get_session_workspace(session_id, username)
    abs_workspace = Path(workspace_dir).resolve()
    target = (abs_workspace / path).resolve()
    if abs_workspace not in target.parents and target != abs_workspace:
        raise HTTPException(status_code=400, detail="Invalid path")
    if not target.exists():
        raise HTTPException(status_code=404, detail="Not found")
    if target.is_dir():
        raise HTTPException(status_code=400, detail="Folder deletion not allowed")
    try:
        target.unlink()
        return {"message": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/workspace/move")
async def move_path(
    src: str = Query(..., description="relative source path under workspace"),
    dst_dir: str = Query("", description="relative target directory under workspace"),
    session_id: str = Query("default"),
    username: str = Query("default"),
):
    """在同一 workspace 内移动（或重命名）文件/目录。
    - src: 源相对路径（必填）
    - dst_dir: 目标目录（相对路径，空表示移动到根目录）
    """
    workspace_dir = get_session_workspace(session_id, username)
    abs_workspace = Path(workspace_dir).resolve()

    abs_src = (abs_workspace / src).resolve()
    if abs_workspace not in abs_src.parents and abs_src != abs_workspace:
        raise HTTPException(status_code=400, detail="Invalid src path")
    if not abs_src.exists():
        raise HTTPException(status_code=404, detail="Source not found")

    abs_dst_dir = (abs_workspace / (dst_dir or "")).resolve()
    if abs_workspace not in abs_dst_dir.parents and abs_dst_dir != abs_workspace:
        raise HTTPException(status_code=400, detail="Invalid dst_dir path")
    abs_dst_dir.mkdir(parents=True, exist_ok=True)

    target = abs_dst_dir / abs_src.name
    target = uniquify_path(target)
    try:
        shutil.move(str(abs_src), str(target))
        rel_new = str(target.relative_to(abs_workspace))
        return {"message": "moved", "new_path": rel_new}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Move failed: {e}")


@app.delete("/workspace/dir")
async def delete_workspace_dir(
    path: str = Query(..., description="relative directory under workspace"),
    recursive: bool = Query(True, description="delete directory recursively"),
    session_id: str = Query("default"),
    username: str = Query("default"),
):
    """删除 workspace 下的目录。默认递归删除，禁止删除根目录。"""
    workspace_dir = get_session_workspace(session_id, username)
    abs_workspace = Path(workspace_dir).resolve()
    target = (abs_workspace / path).resolve()
    if abs_workspace not in target.parents and target != abs_workspace:
        raise HTTPException(status_code=400, detail="Invalid path")
    if target == abs_workspace:
        raise HTTPException(status_code=400, detail="Cannot delete workspace root")
    if not target.exists():
        raise HTTPException(status_code=404, detail="Not found")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")
    try:
        if recursive:
            shutil.rmtree(target)
        else:
            target.rmdir()
        return {"message": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/proxy")
async def proxy(url: str):
    """Simple CORS proxy for previewing external files.
    WARNING: For production, add domain allowlist and authentication.
    """
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client_httpx:
            r = await client_httpx.get(url)
        return Response(
            content=r.content,
            media_type=r.headers.get("content-type", "application/octet-stream"),
            headers={"Access-Control-Allow-Origin": "*"},
            status_code=r.status_code,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Proxy fetch failed: {e}")


def convert_to_utf8(file_path: Path, workspace_dir: str) -> tuple[Optional[Path], str]:
    """检查文件编码并转换为 UTF-8，另存为 converted/ 子目录下的文件。
    返回 (目标路径, 原始编码) 元组。
    """
    if not file_path.exists() or not file_path.is_file():
        return None, "unknown"

    # 已经是 converted 目录下的文件，跳过
    if "converted" + os.sep in str(file_path) or str(file_path).startswith("converted"):
        return file_path, "utf-8"

    # 仅转换文本类文件
    if file_path.suffix.lower() not in [".csv", ".txt", ".md", ".json", ".xml"]:
        return file_path, "binary"

    try:
        with open(file_path, "rb") as f:
            raw_data = f.read()

        result = chardet.detect(raw_data)
        encoding = result['encoding']

        if not encoding:
            encoding = 'utf-8' # 兜底

        # converted 子目录
        converted_dir = Path(workspace_dir) / "converted"
        converted_dir.mkdir(parents=True, exist_ok=True)

        # 目标路径：converted/原始文件名（不加 _utf8 后缀）
        utf8_path = converted_dir / file_path.name
        # 唯一化，避免覆盖
        utf8_path = uniquify_path(utf8_path)

        if encoding.lower() == 'utf-8':
            # 已经是 utf-8，直接复制到 converted 目录
            if not utf8_path.exists():
                shutil.copy2(file_path, utf8_path)
            return utf8_path, "utf-8"

        # 转换非 UTF-8 编码
        content = raw_data.decode(encoding, errors='replace')
        with open(utf8_path, "w", encoding="utf-8") as f:
            f.write(content)
        return utf8_path, encoding
    except Exception as e:
        print(f"Error converting {file_path} to UTF-8: {e}")
        return file_path, "unknown"

@app.post("/workspace/upload")
async def upload_files(
    files: List[UploadFile] = File(...), session_id: str = Query("default"), username: str = Query("default")
):
    """上传文件到工作区（支持 user & session 隔离），并自动转换为 UTF-8"""
    workspace_dir = get_session_workspace(session_id, username)
    uploaded_files = []
    encoding_report = []  # 记录每个文件的编码状态

    for file in files:
        # 唯一化文件名，避免覆盖
        dst = uniquify_path(Path(workspace_dir) / file.filename)
        with open(dst, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # 自动转换为 UTF-8（保存到 converted/ 子目录）
        utf8_dst, original_encoding = convert_to_utf8(dst, workspace_dir)

        # 记录编码信息
        encoding_report.append({
            "original_name": dst.name,
            "converted_name": utf8_dst.name if utf8_dst else dst.name,
            "original_encoding": original_encoding,
            "is_converted": (utf8_dst != dst) if utf8_dst else False,
            "path": str(utf8_dst.relative_to(Path(workspace_dir))) if utf8_dst else str(dst.relative_to(Path(workspace_dir)))
        })

        uploaded_files.append(
            {
                "name": dst.name,
                "size": len(content),
                "path": str(dst.relative_to(Path(workspace_dir))),
            }
        )
        if utf8_dst and utf8_dst != dst:
             uploaded_files.append(
                {
                    "name": utf8_dst.name,
                    "size": utf8_dst.stat().st_size,
                    "path": str(utf8_dst.relative_to(Path(workspace_dir))),
                }
            )

    # 生成编码状态汇总
    all_utf8 = all(item["original_encoding"] == "utf-8" or item["original_encoding"] == "binary" for item in encoding_report)
    converted_count = sum(1 for item in encoding_report if item["is_converted"])

    encoding_summary = {
        "all_files_utf8": all_utf8,
        "converted_count": converted_count,
        "total_files": len(encoding_report),
        "files": encoding_report
    }

    # 保存编码映射文件，供智能体后续分析时读取
    encoding_map_path = Path(workspace_dir) / ".encoding_map.json"
    with open(encoding_map_path, "w", encoding="utf-8") as f:
        json.dump(encoding_summary, f, indent=2, ensure_ascii=False)

    return {
        "message": f"Successfully uploaded {len(uploaded_files)} files",
        "files": uploaded_files,
        "encoding_info": encoding_summary
    }


@app.delete("/workspace/clear")
async def clear_workspace(session_id: str = Query("default"), username: str = Query("default")):
    """清空工作区（支持 user & session 隔离）"""
    workspace_dir = get_session_workspace(session_id, username)
    if os.path.exists(workspace_dir):
        shutil.rmtree(workspace_dir)
    os.makedirs(workspace_dir, exist_ok=True)
    return {"message": "Workspace cleared successfully"}


@app.post("/workspace/upload-to")
async def upload_to_dir(
    dir: str = Query("", description="relative directory under workspace"),
    files: List[UploadFile] = File(...),
    session_id: str = Query("default"),
    username: str = Query("default"),
):
    """上传文件到 workspace 下的指定子目录（仅限工作区内），并自动转换为 UTF-8。"""
    workspace_dir = get_session_workspace(session_id, username)
    abs_workspace = Path(workspace_dir).resolve()
    target_dir = (abs_workspace / dir).resolve()
    if abs_workspace not in target_dir.parents and target_dir != abs_workspace:
        raise HTTPException(status_code=400, detail="Invalid dir path")
    target_dir.mkdir(parents=True, exist_ok=True)

    saved = []
    encoding_report = []
    for f in files:
        dst = uniquify_path(target_dir / f.filename)
        try:
            with open(dst, "wb") as buffer:
                content = await f.read()
                buffer.write(content)

            # 自动转换为 UTF-8（保存到 converted/ 子目录）
            utf8_dst, original_encoding = convert_to_utf8(dst, workspace_dir)

            encoding_report.append({
                "original_name": dst.name,
                "converted_name": utf8_dst.name if utf8_dst else dst.name,
                "original_encoding": original_encoding,
                "is_converted": (utf8_dst != dst) if utf8_dst else False,
            })

            saved.append(
                {
                    "name": dst.name,
                    "size": len(content),
                    "path": str(dst.relative_to(abs_workspace)),
                }
            )
            if utf8_dst and utf8_dst != dst:
                 saved.append(
                    {
                        "name": utf8_dst.name,
                        "size": utf8_dst.stat().st_size,
                        "path": str(utf8_dst.relative_to(abs_workspace)),
                    }
                )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Save failed: {e}")

    all_utf8 = all(item["original_encoding"] == "utf-8" or item["original_encoding"] == "binary" for item in encoding_report)
    converted_count = sum(1 for item in encoding_report if item["is_converted"])

    encoding_summary = {
        "all_files_utf8": all_utf8,
        "converted_count": converted_count,
        "total_files": len(encoding_report),
        "files": encoding_report
    }

    # 保存编码映射文件，供智能体后续分析时读取
    encoding_map_path = Path(workspace_dir) / ".encoding_map.json"
    with open(encoding_map_path, "w", encoding="utf-8") as f:
        json.dump(encoding_summary, f, indent=2, ensure_ascii=False)

    return {"message": f"uploaded {len(saved)} files", "files": saved, "encoding_info": encoding_summary}


@app.post("/execute")
async def execute_code_api(request: dict):
    """执行 Python 代码"""
    try:
        code = request.get("code", "")
        session_id = request.get("session_id", "default")
        username = request.get("username", "default")
        workspace_dir = get_session_workspace(session_id, username)

        if not code:
            raise HTTPException(status_code=400, detail="No code provided")

        # 使用子进程安全执行，避免 GUI/线程问题（在指定 session workspace 中）
        result = await run_in_threadpool(execute_code_safe, code, workspace_dir)

        return {
            "success": True,
            "result": result,
            "message": "Code executed successfully",
        }

    except Exception as e:
        return {
            "success": False,
            "result": f"Error: {str(e)}",
            "message": "Code execution failed",
        }


def fix_code_block(content):
    def fix_text(text):
        stack = []
        lines = text.splitlines(keepends=True)
        result = []
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("```python"):
                if stack and stack[-1] == "```python":
                    result.append("```\n")
                    stack.pop()
                stack.append("```python")
                result.append(line)
            elif stripped == "```":
                if stack and stack[-1] == "```python":
                    stack.pop()
                result.append(line)
            else:
                result.append(line)
        while stack:
            result.append("```\n")
            stack.pop()
        return "".join(result)

    if isinstance(content, str):
        return fix_text(content)
    elif isinstance(content, tuple):
        text_part = content[0] if content[0] else ""
        return (fix_text(text_part), content[1])
    return content


def fix_tags_and_codeblock(s: str) -> str:
    """
    修复未闭合的tags，并确保</Code>后代码块闭合。
    """
    pattern = re.compile(
        r"<(Analyze|Understand|Code|Execute|Answer)>(.*?)(?:</\1>|(?=$))", re.DOTALL
    )

    # 找所有匹配
    matches = list(pattern.finditer(s))
    if not matches:
        return s  # 没有标签，直接返回

    # 检查最后一个匹配是否闭合
    last_match = matches[-1]
    tag_name = last_match.group(1)
    matched_text = last_match.group(0)

    if not matched_text.endswith(f"</{tag_name}>"):
        # 没有闭合，补上
        if tag_name == "Code":
            s = fix_code_block(s) + f"\n```\n</{tag_name}>"
        else:
            s += f"\n</{tag_name}>"

    return s


def bot_stream(messages, workspace, session_id="default", username="default", strategy="聚焦诉求", temperature=0.4):
    # Strategy-specific prompts and default temperature
    strategy_temperatures = {
        "聚焦诉求": 0.2,
        "适度扩展": 0.4,
        "广泛延展": 0.6,
    }
    # Use provided temperature, or fall back to strategy default
    effective_temperature = temperature if temperature is not None else strategy_temperatures.get(strategy, 0.4)

    strategy_prompts = {
        "聚焦诉求": "\n**分析策略：聚焦诉求**。请严格遵守用户指令，仅针对用户直接提出的问题进行分析和回答，不要进行任何不必要的发散或多余的关联分析。保持回答简洁、高效、直击要点。",
        "适度扩展": "\n**分析策略：适度扩展**。在满足用户核心需求的基础上，请基于数据表现进行适量的关联性分析。你可以简要探讨与核心指标相关的其他因素，提供一些背景信息或浅层的风险提示，但请注意分寸，不要过度发散。",
        "广泛延展": "\n**分析策略：广泛延展**。请进行深度发散分析，充分挖掘数据间的潜在联系。你可以大胆发挥想象力，结合海关业务逻辑进行全方位的风险预判、趋势分析和关联挖掘。鼓励你提供多维度的洞察和前瞻性的建议。"
    }

    selected_strategy_prompt = strategy_prompts.get(strategy, strategy_prompts["聚焦诉求"])

    # Inject System Prompt to enhance self-awareness and customs risk analysis capabilities
    system_prompt = """你是 DeepAnalyze，一位精通 Python 和 R 语言的顶尖数据科学家，同时也是专门从事中国海关风险管理和风险防控的数据分析专家。

**你的核心使命**：
忠于国家安全，服务海关履行职责，以风险管理和防控违法违规为目标，确保海关监管措施、管理规定、政策制度执行到位，维护市场公平竞争的秩序环境。

**你的核心任务**：
基于数据统计、比较、相关性和逻辑推理，深入分析进出口业务主体（包括经营企业、收发货人、货主单位、报关单位、代理单位、运输企业、跨境电商平台及其参与方等）的行为数据，挖掘并报告以下违法违规行为：
1. 进出口过程中的走私及违规行为；
2. 违反安全准入管理规定的行为；
3. 通过伪报、瞒报、虚报等方式逃避监管证件管理的行为；
4. 通过低报价格、伪报原产地、伪报HS编码归类逃避税税的行为。你的分析结果应明确指出可疑行为，并详细阐述推理原因。

**============================================
第一部分：PDF库弃用警告与正确用法（极重要）
============================================
使用 FPDF/fpdf2 库时，**必须**遵守以下规则以避免已知的弃用警告和错误：

1. **FPDF 2.x 弃用警告（"DeprecationWarning" / "FPDF internal: ..."）**：
   - 原因：FPDF 2.x 弃用了 `add_font(dejaVu condensed=True)` 语法。应使用 `style='B'` 参数。
   - **完整正确写法示例（生成中文PDF）**：
     ```python
     from fpdf import FPDF
     pdf = FPDF()
     # 添加中文字体（必须使用绝对路径）
     pdf.add_font('SimHei', '', '/Users/m3max/IdeaProjects/DeepAnalyze/assets/fonts/simhei.ttf')
     pdf.add_font('SimHei', 'B', '/Users/m3max/IdeaProjects/DeepAnalyze/assets/fonts/simhei.ttf')
     pdf.add_font('SimHei', 'I', '/Users/m3max/IdeaProjects/DeepAnalyze/assets/fonts/simkai.ttf')
     pdf.add_font('STFangSong', '', '/Users/m3max/IdeaProjects/DeepAnalyze/assets/fonts/STFangSong.ttf')

     pdf.add_page()
     # 设置字体，大小
     pdf.set_font('SimHei', '', 16)
     pdf.cell(0, 10, '中文标题', ln=True, align='C')
     pdf.set_font('STFangSong', '', 12)
     pdf.multi_cell(0, 10, '这是一段中文正文，可以正常显示。请注意使用 multi_cell 来自动换行。')
     pdf.output('output.pdf')
     ```
   - **禁止写法**：`add_font('SimHei', condensed=True)` → 会产生弃用警告
   - **禁止写法**：`add_font('SimHei', '', '/path/font.ttf', condensed=True)` → 会产生弃用警告
   - **重要**：必须使用 `pdf.set_font()` 设置已注册的字体，并使用 `pdf.multi_cell()` 渲染中文文本。

2. **FPDF 2.x 图片嵌入弃用（"NOTSUBSET" / "ftface warning"）**：
   - 原因：旧版 FPDF 的 `image()` 方法在处理某些 TTF 字体时会产生 NOTSUBSET 警告。
   - 解决方案：使用 `fpdf2`（而非旧版 `fpdf`），并确保字体在图片渲染前已正确注册。
   - 如使用 matplotlib 生成图片再嵌入 PDF，建议在 matplotlib 中直接使用支持 CJK 的字体渲染文字，避免依赖 FPDF 的字体子集化。

3. **reportlab 注意事项**：
   - reportlab 的 `TTFont` 不支持 TTC 格式字体（如 macOS 的 STHeiti、PingFang SC 等）。
   - 必须使用 assets/fonts/ 目录下的纯 TTF 字体文件。

4. **PDF 渲染中文多行文本**：
   - 使用 `pdf.multi_cell()` 而非手动换行。
   - 设置正确的 `ln` 参数控制换行后的光标位置。

**============================================
第二部分：时间处理（极重要）
============================================
系统已安装丰富的时间处理包，包括但不限于：`pandas`, `numpy`, `datetime`, `dateutil`, `pytz`, `zoneinfo`, ` pendulum`, `delorean`, `timeuuid`。

**时间粒度与上下文敏感性原则**：
- 当用户要求"按月分析"时，**必须**先判断数据中时间字段的覆盖范围。
- **如果数据跨越多个年份**，则"按月分析"实际上是指"每年每月"（例如：2023年1月 vs 2024年1月是完全不同的时间段）。
- 绝不能将不同年份的同一月份混为一谈。
- 正确的做法：先探索数据的时间范围（使用 `df['date_column'].min()` / `.max()`），若跨年，按 "YYYY-MM" 格式分组，或按 "年份-月份" 组合维度分析。

**时间分析的输出结构**：
- 在分析报告中，必须明确标注每个时间段的年份。
- 例如：`2023年1月`、`2024年3月` 而非笼统的 `1月`、`3月`。

**============================================
第三部分：报告结构规范（极重要）
============================================
每次分析完成后，生成的报告**必须**遵循以下结构，**报告内所有内容必须使用简体中文**：

**报告整体结构（PDF/DOCX/聊天输出均适用）**：
1. **第一部分：分析思路**（必须放在报告开头）
   ```
   # 分析思路
   本文档针对 [用户核心诉求] 进行分析，采用以下分析路径：
   1. [第一步：数据理解与预处理]
   2. [第二步：多维度分析（如：时间维度、主体维度、商品维度等）]
   3. [第三步：可视化与关键发现]
   4. [第四步：风险点识别与结论]
   ...
   ```

2. **第二部分：分析主体内容**（放在分析思路之后、分析小结之前）
   - 按分析角度分章节，每个角度的分析完成后给出：
     - 文字分析（观点、推理、结论）
     - 数据表格
     - 可视化图表（图表标题置于图表下方，引用编号置于标题前，如"图1："）
   - **章节标题**：使用黑体（SimHei）加粗，层级清晰
   - **正文**：使用仿宋（STFangSong），保持1.2-1.5倍行距
   - **图表**：保持原始清晰度，确保中文显示正常

3. **第三部分：分析小结**（必须放在报告结尾）
   ```
   # 分析小结
   本次分析采用了以下方法：
   - 数据源：[文件名/数据量]
   - 时间范围：[YYYY-MM-DD ~ YYYY-MM-DD]
   - 主要分析方法：[描述]
   - 关键发现：[1-3条核心结论]
   - 局限性与后续建议：[如有]
   ```

**重要提醒**：
- 分析思路和分析小结**必须**出现在聊天输出**和**生成的PDF/DOCX报告中
- 报告顺序：**分析思路** → **主体分析内容（图表+数据+观点）** → **分析小结**
- 禁止将分析小结放在开头，或省略分析思路
- PDF/DOCX排版要求：保持标题层级、使用正确的中文字体（见排版规范）

**============================================
第四部分：排版与美学规范
============================================
生成 PDF/DOCX 报告时，请严格遵守以下排版规范：

1. **标题层级与字体**：
   - 一级标题（如"# 标题"）：黑体（SimHei），字号 18-20pt，加粗
   - 二级标题（如"## 标题"）：黑体（SimHei），字号 14-16pt，加粗
   - 三级标题（如"### 标题"）：楷体（SimKai），字号 12-13pt，加粗
   - 正文：仿宋（STFangSong），字号 10.5-11pt
   - 图片说明：楷体（SimKai），字号 9-10pt，斜体

2. **行间距**：
   - 正文：1.2-1.5 倍行距（推荐 1.3）
   - 段后间距：6-8pt
   - 标题与正文的间距：段前 12pt，段后 6pt

3. **页面布局**：
   - 页边距：上下 2cm，左右 2.1cm
   - 页眉页脚：简洁风格，包含页码

4. **图表**：
   - 图表标题置于图表下方，引用编号置于标题前（如"图1："）
   - 表格标题置于表格上方

**============================================
第五部分：分析工作流规范（极重要）
============================================
**禁止行为（容易导致错误和工作重复）**：
- ❌ 在所有素材准备好之前就急于生成 PDF。
- ❌ 多次生成相同或相似的图表/数据。
- ❌ 使用自己定义的但未确认存在的文件名读取数据。
- ❌ 在代码块中硬编码文件名而不先验证文件是否存在。
- ❌ 重复编写相同的加载数据代码，每次分析都从头开始。
- ❌ 不判断分析是否已满足用户需求，持续进行不必要的分析。

**文件编码与映射规范（极重要）**：
系统已在文件上传时自动完成编码检测和转换，但你仍需遵循以下规范：

1. **编码状态告知**：上传完成后，系统会告知你每个文件的编码状态。
   - 如果所有文件均为 UTF-8 编码，系统会提示"所有文件已是 UTF-8 编码，可直接使用"
   - 如果存在非 UTF-8 文件，系统会提示"已转换 X 个文件为 UTF-8 编码"

2. **文件映射机制**：系统会自动维护一个文件映射表，在你开始分析时提供：
   ```
   文件映射表：
   - 原始文件名 → converted/文件名（UTF-8版本）
   - 文件编码记录：[文件名: 编码类型]
   ```
   **你必须记住这个映射表，分析时直接使用 mapped 文件路径，无需重新检测编码。**

3. **分析时的文件访问规则**：
   - **直接使用 converted/ 目录下的 UTF-8 文件进行读取**
   - **禁止在分析时重新检测编码或重新转换文件**
   - 使用 pandas 读取 CSV 文件时，直接指定正确路径即可
   - 示例正确写法：`df = pd.read_csv('workspace/session_xxx/converted/数据文件.csv')`

**任务拆解与分层执行规范（极重要）**：

你必须严格遵循以下三阶段工作流程，**绝对禁止在任务清单完成前进入报告汇总阶段**。

---

### 阶段一：构建任务拆解清单（必须首先完成）

收到用户分析目标后，**立即、全面地拆解任务**，构建结构化的任务清单：

1. **拆解原则**：
   - 将用户的分析目标分解为若干有逻辑层次的具体子任务
   - 明确各子任务之间的依赖关系和执行顺序
   - 按"先数据理解 → 再多维分析 → 后综合汇总"的顺序排列

2. **任务清单格式**（在聊天窗口中明确列出）：
   ```
   【任务拆解清单】
   1. [子任务名称] → 依赖：无 → 预期成果：xxx
   2. [子任务名称] → 依赖：任务1 → 预期成果：xxx
   3. [子任务名称] → 依赖：任务1,2 → 预期成果：xxx
   ...
   ```

3. **拆解示例**：
   - 用户目标："分析进出口企业风险"
   - 拆解清单：
     1. 数据概览与质量评估 → 依赖：无 → 成果：数据概况报告
     2. 时间维度分析 → 依赖：1 → 成果：时间趋势图表
     3. 企业类型分布分析 → 依赖：1 → 成果：企业分布图表
     4. 高风险企业识别 → 依赖：1,2,3 → 成果：风险企业清单
     5. 关联关系挖掘 → 依赖：1,3 → 成果：关联分析报告
     6. 综合报告生成 → 依赖：2,3,4,5 → 成果：最终PDF/DOCX报告

---

### 阶段二：逐个执行任务清单（按顺序执行，禁止跳过）

**核心原则**：按清单顺序逐个完成任务，每个任务完成后才进入下一个。

1. **单任务执行规范**：
   - 每执行一个子任务前，先确认其依赖任务已全部完成
   - 在代码中生成该任务的成果（图表/数据/观点），存入工作区
   - **立即向用户汇报**：当前完成的任务、生成的文件、关键发现
   - 完成后在任务清单中打勾标记：`[x] 任务1：已完成 → 成果路径`

2. **素材存放规范**：
   - 每个任务的成果必须存入工作区（workspace/session_xxx/）
   - 文件命名规范：`{序号}_{任务名}_{内容描述}.{扩展名}`
   - 示例：`02_time_trend_chart.png`、`03_enterprise_distribution.csv`
   - 已生成的素材**不得重复生成**，直接引用已有文件

3. **死循环检测与跳出机制（极重要）**：
   - **循环判定标准**：当发现以下情况时，说明已陷入死循环：
     - 连续3次以上执行相同的数据处理逻辑且产生相似/相同结果
     - 相同代码被执行两次以上且没有产生新的数据洞察
     - 反复尝试相同路径的分析方法
   - **跳出操作**：检测到死循环后，**立即停止当前循环**，记录问题原因，然后：
     1. 跳出当前分析路径，转向任务清单中的下一项任务
     2. 在运行记录中标注：`[死循环跳过] 任务X：原因描述`
     3. 继续执行后续任务，不得卡在原地
   - **禁止行为**：禁止在死循环中持续尝试同一方法超过2次

4. **进度追踪**：
   - 每完成一个任务，更新任务清单状态并向用户展示
   - 汇总已完成：`[x] 任务1 [x] 任务2 [ ] 任务3...`

---

### 阶段三：汇总生成报告（仅在所有任务完成后执行）

**触发条件**：任务清单中的所有子任务（除综合报告生成外）均已标记为已完成。

1. **报告生成时机**：
   - ✅ 所有分析子任务完成 → 生成最终报告
   - ❌ 用户刚提出目标 → 不得立即生成报告
   - ❌ 仅完成1-2个子任务 → 不得生成最终报告

2. **报告内容组织**：
   - 按结构组织：分析思路 → 各子任务成果（图表+数据+观点）→ 分析小结
   - 引用各任务在工作区生成的具体素材文件

3. **分析小结（必须包含运行问题记录）**：
   分析完成后，必须输出"工作小结"章节，内容包括：
   ```
   【工作小结】
   - 数据处理：描述数据处理过程和关键数据操作
   - 风险点识别：列出发现的主要风险点
   - 执行统计：共计完成X个子任务，生成Y个素材文件

   【运行问题记录】（如实填写，即使没有问题也需标注"无"）
   - 错误信息：[列出执行过程中遇到的各类错误及错误代码]
   - 死循环情况：[记录检测到的死循环次数、原因及跳出操作]
   - 环境组件问题：[组件缺失、版本冲突等问题的描述]
   - 分析重复原因：[如果出现分析结果重复，说明原因]
   - 其他异常：[其他导致运行不畅顺的因素]

   【改进建议】
   - 针对上述问题，提出具体的改进方向
   ```

---

**文件名与路径管理原则**：
- 所有由代码生成的文件，应在生成后立即打印其完整路径。
- 后续代码引用这些文件时，**必须使用之前打印的完整路径**，禁止重新猜测文件名。
- 使用 `os.listdir()` 或 `glob` 验证文件存在性。
- **已生成的图表和数据不得重复生成**，直接引用已有文件路径。

**============================================
第六部分：环境就绪与字体规范（极重要）
============================================
- **环境就绪**：系统已为你安装了充足的 Python 和 R 语言工具包，包括但不限于 `fpdf2`, `python-docx`, `pandas`, `matplotlib`, `seaborn`, `chardet`, `reportlab` 等。
- **R 语言中文/PDF 增强**：在 R 环境中，已为你安装了 `showtext`, `extrafont`, `Cairo`, `grDevices`, `ggplot2`, `lattice`, `knitr`, `rmarkdown`, `tinytex` 等核心包。在生成包含中文的 PDF 或图形时，请务必调用 `showtext_auto()`，并优先使用 `CairoPDF()` 或 `xelatex` 引擎进行渲染，确保中文字符完美显示。
- **UTF-8 编码优先**：系统已自动将上传的文本文件转换为 UTF-8 编码并保存到 `converted/` 子目录（文件名保持不变）。**无论用户输入的文件名是否带有编码转换标注，系统会自动将其映射到 `converted/` 目录下的正确文件进行分析**，请直接根据用户提到的文件名进行数据读取，系统会自动处理文件路径映射。
- **中文字符与编码处理**：在处理任何数据文件前，应确认使用 UTF-8 编码。对于任何包含中文的内容，必须确保在所有输出文件（Png, Jpg, Pdf, Txt, Csv, Docx 等）中正确显示中文。
- **可视化支持**：在 Python 绘图时，务必配置 `plt.rcParams['font.sans-serif']` 使用 `SimHei`, `PingFang SC` 或其他系统中文字体，防止出现乱码或方框。在 R 中使用 `showtext` 处理中文。
- **报告生成**：分析完成后，必须生成详细的最终报告。**最终报告必须同时包含 PDF 和 DOCX 格式**，这是你的标准交付物。
  - **PDF 生成推荐方案（按优先级）**：
    1. **reportlab + 中文字体（首选）**：使用 reportlab 库，注册 assets/fonts/ 下的纯 TTF 字体生成 PDF
    2. **matplotlib PdfPages（图表为主）**：使用 matplotlib 的 PdfPages 生成包含图表的 PDF
    3. **python-docx（DOCX）**：使用 python-docx 生成 Word 文档
  - **注意**：当前环境为 macOS，禁止使用 `comtypes` 或 `docx2pdf` 库。
- **字体与路径支持（极重要）**：请务必清楚当前环境中有以下字体可用，**不要随意猜测或尝试不存在的字体路径**：
  - **中文字体（assets/fonts/ 目录，纯 TTF，reportlab/matplotlib 全支持，已验证可用）**：
    - `SimHei` → `/Users/m3max/IdeaProjects/DeepAnalyze/assets/fonts/simhei.ttf`（黑体，主标题/重点内容，✅已验证）
    - `SimKai` → `/Users/m3max/IdeaProjects/DeepAnalyze/assets/fonts/simkai.ttf`（楷体，引用/强调/副标题，✅已验证）
    - `STFangSong` → `/Users/m3max/IdeaProjects/DeepAnalyze/assets/fonts/STFangSong.ttf`（仿宋，正文/报告，✅已验证）
    - `STHeiti` → `/Users/m3max/IdeaProjects/DeepAnalyze/assets/fonts/STHeiti.ttf`（黑体备选，✅已验证）
    - `LiSongPro` → `/Users/m3max/IdeaProjects/DeepAnalyze/assets/fonts/LiSongPro.ttf`（隶书，可选）
  - **macOS 系统 CJK 字体（TTC 格式，用于 R showtext / matplotlib）**：
    - `STHeiti Light` → `/System/Library/Fonts/STHeiti Light.ttc`（黑体）
    - `STHeiti Medium` → `/System/Library/Fonts/STHeiti Medium.ttc`（中黑）
    - `PingFang SC` → `/System/Library/Fonts/PingFang SC.ttc`（苹方）
    - `Songti SC` → `/System/Library/Fonts/Supplemental/Songti.ttc`（宋体）
  - **macOS 系统拉丁字体（纯 TTF，用于 reportlab）**：
    - `Arial Unicode` → `/System/Library/Fonts/Supplemental/Arial Unicode.ttf`
    - `Georgia` → `/System/Library/Fonts/Supplemental/Georgia.ttf`
    - `Times New Roman` → `/System/Library/Fonts/Supplemental/Times New Roman.ttf`
  - **字体选择原则**：
    - **PDF 报告生成**：使用 reportlab + assets/fonts/ 下的纯 TTF 字体（SimHei/SimKai/STFangSong）
    - Python matplotlib 绘图：使用 `SimHei`、`STHeiti`、`PingFang SC`、`Songti SC` 等中文字体
    - R showtext 渲染：使用 `SimHei`（assets）或 `STHeiti`/`Kaiti SC`（系统）
    - **正式报告场景**：使用 `SimHei` 作为标题，`STFangSong` 作为正文
    - **强调/引用场景**：使用 `SimKai`（楷体）
    - **绝对禁止**：尝试使用 `Arial.ttf`、`Helvetica.ttf` 等不存在的字体文件路径。禁止在 PDF 或图表中使用 `Arial`、`Helvetica`、`Times New Roman` 等不支持中文的字体名称。
    - **注意**：`simfang.ttf` 和 `fzbsk.ttf` 是损坏的字体文件（实际是 HTML 文件），请勿使用。`SimFang` 字体不可用，请使用 `STFangSong` 替代。
- **深度洞察**：能够穿透表面数据，通过多角度关联分析挖掘深层逻辑，明确指出可疑行为并详述推理原因。
- **自主思考**：能根据用户上传的数据，主动提出分析假设并验证。
- **工具专家**：熟练切换并结合 Python (Pandas, Scikit-learn, Seaborn) 和 R (Tidyverse, ggplot2, stats) 的优势进行建模与可视化。你可以通过 Python 的 `rpy2` 库直接调用 R 语言工具开展分析，在进行复杂可视化时，应充分发挥 R 语言 `ggplot2` 包的灵活性优势。**注意：使用 rpy2 (版本 3.x+) 时，请使用 `rpy2.robjects.pandas2ri.activate()` 或 `with rpy2.robjects.conversion.localconverter(rpy2.robjects.default_converter + rpy2.robjects.pandas2ri.converter):` 进行数据转换，不要使用已废弃的 `conversion.register` 属性。**
- **专业严谨**：始终保持专业、严谨的态度，提供具有前瞻性和决策价值的洞察。
- **语言规范**：与用户交流及生成报告时，**默认使用简体中文中文**。除非用户明确指定使用其他语言（如英文），否则不得使用英文或其他语言输出分析内容、报告文本。

**============================================
第七部分：雨途斩棘录 - 错误修正知识库（极重要）
============================================

雨途斩棘录是智能体的错误修正知识库，记录了所有已解决的错误及其解决方案。**你必须在每次开始新分析任务时，首先查询这本笔记，避免重复曾经犯过的错误！**

**启动时必须执行的查询命令**：
在开始任何分析之前，你**必须**先用以下代码查询雨途斩棘录中的已知错误和解决方案：
```python
import requests
# 获取雨途斩棘录中最近的错误记录
response = requests.get("http://localhost:8200/api/yutu/search", json={"keywords": [], "page": 1, "page_size": 10})
data = response.json()
if data.get("success") and data.get("data", {}).get("items"):
    print("=== 雨途斩棘录 - 历史错误记录 ===")
    for item in data["data"]["items"]:
        print(f"错误类型: {item['error_type']}")
        print(f"错误消息: {item['error_message']}")
        print(f"解决方案: {item.get('solution', 'N/A')}")
        print("---")
```

**雨途斩棘录功能说明**：
1. **自动记录**：【重要变化】系统现在已经**自动**记录你执行代码时遇到的错误。当你遇到错误并成功解决后，系统会自动把错误和解决方案记录到知识库中，你无需手动记录（但如果是你自己发现的额外解决方案，也可以手动记录）。
2. **快速查找**：遇到相似错误时，优先查询雨途斩棘录获取已知解决方案
3. **持续优化**：每次成功解决问题后，更新雨途斩棘录以提升未来工作效率

**超级用户管理功能**：
- 超级用户 `rainforgrain` 可以通过前端界面管理雨途斩棘录
- 功能包括：查看、搜索、编辑、删除错误记录
- 其他用户只能查看，不能管理

**雨途斩棘录API端点**：
- `GET /api/yutu/html` - 获取HTML格式的雨途斩棘录
- `POST /api/yutu/add` - 添加新记录（仅超级用户）
- `POST /api/yutu/update` - 更新记录（仅超级用户）
- `POST /api/yutu/delete` - 删除记录（仅超级用户）
- `POST /api/yutu/search` - 搜索记录
- `POST /api/yutu/init` - 初始化雨途斩棘录

**使用雨途斩棘录的场景**：
1. **【必须】每次开始新任务时**：查询雨途斩棘录，避免使用曾经失败的代码方式
2. **【必须】代码执行出现错误后**：系统会自动记录错误，但你也可以补充解决方案
3. 当遇到环境配置问题（如字体缺失、库版本冲突）时
4. 当找到有效的解决方案后，应记录到雨途斩棘录
5. 在尝试新方案前，先查询雨途斩棘录是否有类似问题的解决方案

**记录格式**：
- error_type: 错误类型（如 ImportError, ValueError）
- error_message: 错误消息全文
- error_context: 错误发生的上下文
- solution: 解决方案描述
- solution_code: 解决方案代码（如有）
- confidence: 解决方案置信度（0.0-1.0）

**【重要】任务开始模板**：
在开始分析时，请按以下格式输出你的查询结果：
```
<Analyze>
# 工作前查询

根据雨途斩棘录，以下是需要避免的错误模式：
1. 错误类型: XXX - 解决方案: XXX
2. 错误类型: YYY - 解决方案: YYY

本次分析将采用以下策略避免这些错误：
- [具体策略1]
- [具体策略2]
</Analyze>
```
""" + selected_strategy_prompt + """

**并行试错与死循环检测（极重要）**：

1. **并行优先原则**：当你需要尝试多种方案（例如：生成 PDF 时尝试不同字体、绘图时尝试不同引擎、导入时尝试不同路径），**必须将这些方案合并到一个代码块中**，通过 `if/elif/else` 或 `try/except` 结构同时验证多条路径，让代码在一次执行中就能确定哪个方案有效。
   - ✅ 正确示范：在一个 `<Code>` 中用 `try: reportlab... except: fpdf2... except: R...` 依次尝试，或用 `if os.path.exists("A"): ... elif os.path.exists("B"): ...`
   - ❌ 错误示范：将方案A放在一个 `<Code>`，等执行失败后在下一次 LLM 调用中再试方案B——这会导致循环和低效。

2. **死循环检测与强制跳出机制（极重要）**：
   - **死循环判定标准**（满足任一即判定）：
     - 相同的数据处理逻辑被执行 ≥3 次且结果相似/相同
     - 相同代码块被执行 ≥2 次且没有产生新的数据洞察
     - 反复尝试相同路径的分析方法 ≥3 次
     - 在同一子任务内停留超过预期的迭代次数
   - **强制跳出操作步骤**：
     1. 立即停止当前循环/重复操作
     2. 记录问题：`[死循环跳过] 任务X - 原因：{具体描述}`
     3. 转向任务清单中的下一项任务
     4. 继续执行，不得卡在原地
   - **禁止行为**：
     - ❌ 死循环中持续尝试同一方法超过2次
     - ❌ 在同一任务内无限迭代
     - ❌ 不记录问题就跳过

3. **终止逻辑**：每一轮完整的分析任务**必须**以 `<Answer>` 标签包裹的最终结论结束。
4. **禁止循环**：禁止在没有新进展的情况下重复生成相同的代码。如果上一次执行已成功或已确定某路径不可行，必须进入下一阶段或输出 `<Answer>`，不得重复相同代码。
5. **一次完成**：每个 `<Code>` 块应尽量完成一个完整的阶段性任务，避免拆分成多个小块依次执行。
6. 请始终以这种专业、敏锐且富有洞察力的风格与用户沟通。"""

    # Check if system prompt is already there, if not, insert it
    if not messages or messages[0]["role"] != "system":
        messages.insert(0, {"role": "system", "content": system_prompt})

    original_cwd = os.getcwd()
    WORKSPACE_DIR = get_session_workspace(session_id, username)
    os.makedirs(WORKSPACE_DIR, exist_ok=True)
    # 创建 generated 子文件夹用于存放代码生成的文件
    GENERATED_DIR = os.path.join(WORKSPACE_DIR, "generated")
    os.makedirs(GENERATED_DIR, exist_ok=True)
    # 创建 converted 子文件夹用于存放 UTF-8 转换后的文件
    CONVERTED_DIR = os.path.join(WORKSPACE_DIR, "converted")
    os.makedirs(CONVERTED_DIR, exist_ok=True)
    # print(messages)
    if messages and messages[0]["role"] == "assistant":
        messages = messages[1:]
    elif len(messages) > 1 and messages[0]["role"] == "system" and messages[1]["role"] == "assistant":
        # Keep system prompt, but skip the first assistant message if it's misplaced
        messages = [messages[0]] + messages[2:]

    if messages and messages[-1]["role"] == "user":
        user_message = messages[-1]["content"]
        # 总是使用当前 session 的 WORKSPACE_DIR 获取文件信息
        file_info = collect_file_info(WORKSPACE_DIR)
        if file_info:
            messages[-1][
                "content"
            ] = f"# Instruction\n{user_message}\n\n# Data\n{file_info}"
        else:
            messages[-1]["content"] = f"# Instruction\n{user_message}"
    # print("111",messages)
    initial_workspace = set(workspace)
    assistant_reply = ""
    finished = False
    exe_output = None
    while not finished:
        response = client.chat.completions.create(
            model=MODEL_PATH,
            messages=messages,
            temperature=effective_temperature,
            stream=True,
            stop=["</Code>", "</s>", "<|endoftext|>", "<|im_end|>"],
            extra_body={
                "add_generation_prompt": False,
                "max_new_tokens": 32768,
            },
        )
        cur_res = ""
        for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content is not None:
                delta = chunk.choices[0].delta.content
                cur_res += delta
                assistant_reply += delta
                yield delta
            if "</Answer>" in cur_res:
                finished = True
                break
        if chunk.choices[0].finish_reason == "stop" and not finished:
            if not cur_res.endswith("</Code>"):
                missing_tag = "</Code>"
                cur_res += missing_tag
                assistant_reply += missing_tag
                yield missing_tag
        if "</Code>" in cur_res and not finished:
            messages.append({"role": "assistant", "content": cur_res})
            code_match = re.search(r"<Code>(.*?)</Code>", cur_res, re.DOTALL)
            if code_match:
                code_content = code_match.group(1).strip()
                md_match = re.search(r"```(?:python)?(.*?)```", code_content, re.DOTALL)
                code_str = md_match.group(1).strip() if md_match else code_content
                code_str = Chinese_matplot_str + "\n" + code_str
                # 自动将用户提及的原始文件名映射为 converted/ 目录下的实际文件
                code_str = _rewrite_file_paths(code_str, WORKSPACE_DIR)
                # 执行前快照（路径 -> (size, mtime)）
                try:
                    before_state = {
                        p.resolve(): (p.stat().st_size, p.stat().st_mtime_ns)
                        for p in Path(WORKSPACE_DIR).rglob("*")
                        if p.is_file()
                    }
                except Exception:
                    before_state = {}
                # 在子进程中以固定工作区执行
                exe_output = execute_code_safe(code_str, WORKSPACE_DIR)

                # ========== 自动检测并记录错误到雨途斩棘录 ==========
                try:
                    error_info = detect_and_record_error(exe_output, code_str, WORKSPACE_DIR)
                    if error_info.get("has_error"):
                        print(f"[雨途斩棘录] 检测到错误: {error_info.get('error_type')}")
                        if error_info.get("recorded"):
                            print(f"[雨途斩棘录] 已自动记录到知识库")
                        elif error_info.get("similar_found"):
                            print(f"[雨途斩棘录] 发现相似错误记录，跳过重复记录")
                except Exception as e:
                    print(f"[雨途斩棘录] 错误检测失败: {e}")
                # ========== 错误检测结束 ==========

                # 执行后快照
                try:
                    after_state = {
                        p.resolve(): (p.stat().st_size, p.stat().st_mtime_ns)
                        for p in Path(WORKSPACE_DIR).rglob("*")
                        if p.is_file()
                    }
                except Exception:
                    after_state = {}
                # 计算新增与修改
                added_paths = [p for p in after_state.keys() if p not in before_state]
                modified_paths = [
                    p
                    for p in after_state.keys()
                    if p in before_state and after_state[p] != before_state[p]
                ]

                # 将新增和修改的文件移动到 generated 文件夹
                artifact_paths = []
                for p in added_paths:
                    try:
                        # 如果文件不在 generated 文件夹中，移动它
                        if not str(p).startswith(GENERATED_DIR):
                            dest_path = Path(GENERATED_DIR) / p.name
                            dest_path = uniquify_path(dest_path)
                            shutil.copy2(str(p), str(dest_path))
                            artifact_paths.append(dest_path.resolve())
                        else:
                            artifact_paths.append(p)
                    except Exception as e:
                        print(f"Error moving file {p}: {e}")
                        artifact_paths.append(p)

                # 为修改的文件生成副本并移动到 generated 文件夹
                for p in modified_paths:
                    try:
                        dest_name = f"{Path(p).stem}_modified{Path(p).suffix}"
                        dest_path = Path(GENERATED_DIR) / dest_name
                        dest_path = uniquify_path(dest_path)
                        shutil.copy2(p, dest_path)
                        artifact_paths.append(dest_path.resolve())
                    except Exception as e:
                        print(f"Error copying modified file {p}: {e}")

                # 旧：Execute 内部放控制台输出；新：追加 <File> 段落给前端渲染卡片
                exe_str = f"\n<Execute>\n```\n{exe_output}\n```\n</Execute>\n"
                file_block = ""
                if artifact_paths:
                    lines = ["<File>"]
                    for p in artifact_paths:
                        try:
                            rel = (
                                Path(p)
                                .relative_to(Path(WORKSPACE_DIR).resolve())
                                .as_posix()
                            )
                        except Exception:
                            rel = Path(p).name
                        # 在相对路径前加上 username/session_id 前缀
                        url = build_download_url(f"{username}/{session_id}/{rel}")
                        name = Path(p).name
                        lines.append(f"- [{name}]({url})")
                        if Path(p).suffix.lower() in [
                            ".png",
                            ".jpg",
                            ".jpeg",
                            ".gif",
                            ".webp",
                            ".svg",
                        ]:
                            lines.append(f"![{name}]({url})")
                    lines.append("</File>")
                    file_block = "\n" + "\n".join(lines) + "\n"
                full_execution_block = exe_str + file_block
                assistant_reply += full_execution_block
                yield full_execution_block
                messages.append({"role": "execute", "content": f"{exe_output}"})
                # 刷新工作区快照（路径集合）
                current_files = set(
                    [
                        os.path.join(WORKSPACE_DIR, f)
                        for f in os.listdir(WORKSPACE_DIR)
                        if os.path.isfile(os.path.join(WORKSPACE_DIR, f))
                    ]
                )
                new_files = list(current_files - initial_workspace)
                if new_files:
                    workspace.extend(new_files)
                    initial_workspace.update(new_files)
    os.chdir(original_cwd)


@app.post("/chat/completions")
async def chat(body: dict = Body(...)):
    messages = body.get("messages", [])
    workspace = body.get("workspace", [])
    session_id = body.get("session_id", "default")
    username = body.get("username", "default")
    strategy = body.get("strategy", "聚焦诉求")
    temperature = body.get("temperature", None)  # Optional: user can override temperature

    # 动态构建 workspace 目录，确保能正确识别当前 session 的文件
    actual_workspace_dir = get_session_workspace(session_id, username)

    def generate():
        for delta_content in bot_stream(messages, workspace, session_id, username, strategy, temperature):
            # print(delta_content)
            chunk = {
                "id": "chatcmpl-stream",
                "object": "chat.completion.chunk",  # 标识为流式块
                "created": 1677652288,
                "model": MODEL_PATH,
                "choices": [
                    {
                        "index": 0,
                        # 3. 使用 delta 字段而非 message 字段
                        "delta": {
                            "content": delta_content  # 直接填入原始内容，不要调用 fix_tags
                        },
                        "finish_reason": None,  # 传输中为 None
                    }
                ],
            }

            yield json.dumps(chunk) + "\n"
            # 5. 循环结束后，发送一个结束标记 (Optional, 但推荐)
        end_chunk = {
            "id": "chatcmpl-stream",
            "object": "chat.completion.chunk",
            "created": 1677652288,
            "model": MODEL_PATH,
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]
        }
        yield json.dumps(end_chunk) + "\n"

    return StreamingResponse(generate(), media_type="text/plain")


# -------- Export Report (PDF + MD) --------
from datetime import datetime


def _extract_sections_from_messages(messages: list[dict]) -> str:
    """从历史消息中抽取 <Answer>..</Answer> 作为报告主体，其余部分按原始顺序作为 Appendix 拼成 Markdown。"""
    if not isinstance(messages, list):
        return ""
    import re as _re

    parts: list[str] = []
    appendix: list[str] = []

    tag_pattern = r"<(Analyze|Understand|Code|Execute|File|Answer)>([\s\S]*?)</\1>"

    for idx, m in enumerate(messages, start=1):
        role = (m or {}).get("role")
        if role != "assistant":
            continue
        content = str((m or {}).get("content") or "")

        step = 1
        # 按照在文本中的出现顺序依次提取
        for match in _re.finditer(tag_pattern, content, _re.DOTALL):
            tag, seg = match.groups()
            seg = seg.strip()
            if tag == "Answer":
                parts.append(f"{seg}\n")

            appendix.append(f"\n### Step {step}: {tag}\n\n{seg}\n")
            step += 1

    final_text = "".join(parts).strip()
    if appendix:
        final_text += (
            "\n\n\\newpage\n\n# Appendix: Detailed Process\n"
            + "".join(appendix).strip()
        )

    # print(final_text)
    return final_text


def _save_md(md_text: str, base_name: str, workspace_dir: str) -> Path:
    Path(workspace_dir).mkdir(parents=True, exist_ok=True)
    md_path = uniquify_path(Path(workspace_dir) / f"{base_name}.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_text)
    return md_path


import pypandoc


def _get_available_fonts() -> dict:
    """
    返回所有可用字体信息的字典。
    返回结构：{
        "assets": [(font_path, font_name, font_description), ...],
        "system": [(font_path, font_name, font_description), ...],
        "reportlab_fallback": (font_path, font_name),  # 纯 TTF，无 TTC
    }
    """
    import reportlab.pdfbase.ttfonts as ttfonts

    fonts = {"assets": [], "system": [], "reportlab_fallback": None}

    # === assets 字体（纯 TTF，reportlab/fpdf2/matplotlib 均支持）===
    assets_fonts = [
        ("simhei.ttf",  "SimHei",  "黑体 - 主标题/重点内容"),
        ("simkai.ttf",  "SimKai",  "楷体 - 引用/强调"),
        ("STFangSong.ttf", "STFangSong", "仿宋 - 正文/报告"),
        ("STHeiti.ttf", "STHeiti", "黑体备选"),
        ("LiSongPro.ttf", "LiSongPro", "隶书 - 可选"),
        # 注意：simfang.ttf 和 fzbsk.ttf 是损坏的 HTML 文件，已排除
    ]
    for fname, name, desc in assets_fonts:
        fp = os.path.join(FONT_DIR, fname)
        if os.path.exists(fp):
            fonts["assets"].append((fp, name, desc))

    # === reportlab 回退字体（纯 TTF，排除 TTC）===
    # Helvetica.ttc 是 TTC，reportlab 的 TTFont 不支持 TTC，所以找一个替代
    for fp in [
        "/System/Library/Fonts/Helvetica.ttc",  # TTC，reportlab 不支持
        "/System/Library/Fonts/Arial.ttf",       # 不存在，macOS Arial 是 .ttc
    ]:
        pass  # 都不适合 reportlab

    # macOS 系统纯 TTF 拉丁字体（适合 reportlab/fpdf2）
    system_ttf_candidates = [
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
        "/System/Library/Fonts/Supplemental/Verdana.ttf",
        "/System/Library/Fonts/Supplemental/Courier New.ttf",
    ]
    for fp in system_ttf_candidates:
        if os.path.exists(fp):
            name = os.path.splitext(os.path.basename(fp))[0]
            fonts["system"].append((fp, name, "系统内置拉丁字体"))

    # === 系统 TTC 字体（用于 R showtext / matplotlib，不适合 reportlab/fpdf2）===
    system_ttc = [
        ("/System/Library/Fonts/STHeiti Light.ttc", "STHeiti",  "macOS 黑体 - CJK"),
        ("/System/Library/Fonts/Hiragino Sans GB.ttc", "Hiragino Sans GB", "macOS 冬青黑体 - CJK"),
        ("/System/Library/Fonts/PingFang SC.ttc", "PingFang SC", "macOS 苹方简体中文"),
        ("/System/Library/Fonts/PingFang TC.ttc", "PingFang TC", "macOS 苹方繁体中文"),
    ]
    for fp, name, desc in system_ttc:
        if os.path.exists(fp):
            fonts["system"].append((fp, name, desc))

    # === reportlab 回退：找一个可用的系统纯 TTF ===
    for fp, name, desc in fonts["system"]:
        if fp.endswith(".ttf"):
            fonts["reportlab_fallback"] = (fp, name)
            break

    return fonts


def _find_chinese_font() -> tuple[str | None, str]:
    """返回 (font_path, font_name)，优先使用 assets/simhei.ttf > 系统 STHeiti.ttc"""
    fonts = _get_available_fonts()
    # 优先 assets
    if fonts["assets"]:
        return fonts["assets"][0][0], fonts["assets"][0][1]
    # 系统 TTC
    for fp, name, desc in fonts["system"]:
        if fp.endswith(".ttc"):
            return fp, name
    # 回退
    if fonts["reportlab_fallback"]:
        return fonts["reportlab_fallback"]
    return None, "Helvetica"


def _save_pdf(md_text: str, base_name: str, workspace_dir: str) -> Path | None:
    """使用 R with Cairo 生成中文 PDF（优先），失败则降级到 reportlab"""
    Path(workspace_dir).mkdir(parents=True, exist_ok=True)
    pdf_path = uniquify_path(Path(workspace_dir) / f"{base_name}.pdf")

    # 先尝试 R Cairo 方案（对 CJK 字体支持最完整）
    r_result = _save_pdf_with_r(md_text, base_name, workspace_dir)
    if r_result:
        print(f"PDF generated with R Cairo: {r_result}")
        return r_result

    # 降级到 reportlab
    return _save_pdf_with_reportlab(md_text, base_name, workspace_dir)


def _save_pdf_with_r(md_text: str, base_name: str, workspace_dir: str) -> Path | None:
    """使用 R script + Cairo/grDevices 生成中文 PDF（支持所有 CJK 字体）"""
    import tempfile, subprocess

    font_path, font_name = _find_chinese_font()
    if not font_path:
        return None

    # 准备字体路径（确保无空格或特殊字符）
    r_script_path = os.path.join(workspace_dir, f"_pdf_gen_{os.getpid()}.R")
    r_font_path = font_path.replace("\\", "\\\\").replace("'", "\\'")

    # 清理 markdown 文本
    clean_text = re.sub(r"\\newpage", "", md_text)

    # 生成 R 脚本
    r_script = f"""
options(width=120)
Sys.setenv(LANG="en_US.UTF-8")
library(grDevices)

# 注册中文字体（Cairo 支持 TTC/TTF）
tryCatch({{
    if (file.exists("{r_font_path}")) {{
        # macOS: 使用 quartz 或 cairo 设备
        if (.Platform$GUI[1] == "AQUA") {{
            # macOS 原生字体注册
            quartz粵 font = quartzFont(c("{font_name}"))
        }}
    }}
    warning("Font not found")
}}, error = function(e) {{ warning(e) }})

# 使用 showtext 方案（最可靠）
tryCatch({{
    library(showtext)
    library(sysfonts)

    # 添加字体文件
    font_add("{font_name}", "{r_font_path}")
    showtext_auto()

    pdf("{str(pdf_path).replace("\\", "\\\\").replace("'", "\\'")}",
        family="{font_name}", width=8.27, height=11.69)

    par(family="{font_name}", mar=c(2.5, 2.5, 2, 1), oma=c(0, 0, 0, 0))

    lines <- strsplit(gsub(r"\\n(?=\\S)", "<<<SPLIT>>>", "{_escape_r_string(clean_text)}", perl=TRUE), "<<<SPLIT>>>")[[1]]

    for (line in lines) {{
        line <- gsub("^#\\\\s+(.*)$", "\\\\1", line, perl=TRUE)
        if (grepl("^##\\\\s+(.*)$", line, perl=TRUE)) {{
            title <- gsub("^##\\\\s+(.*)$", "\\\\1", line, perl=TRUE)
            cat("\\n")
            plot.new()
            text(0.5, 0.7, title, cex=2.2, family="{font_name}", font=2, adj=0)
        }} else if (grepl("^###\\\\s+(.*)$", line, perl=TRUE)) {{
            title <- gsub("^###\\\\s+(.*)$", "\\\\1", line, perl=TRUE)
            cat("\\n")
            plot.new()
            text(0.5, 0.65, title, cex=1.6, family="{font_name}", font=2, adj=0)
        }} else if (nzchar(trimws(line))) {{
            if (grepl("^[-*]\\\\s+(.*)$", line, perl=TRUE)) {{
                line <- paste0("  \\u2022 ", gsub("^[-*]\\\\s+(.*)$", "\\\\1", line, perl=TRUE))
            }}
            cat(line, "\\n", sep="")
        }}
    }}

    dev.off()
    cat("PDF_R_OK\\n")
}}, error = function(e) {{
    message("R Cairo PDF failed: ", e$message)
    if (dev.cur() > 1) dev.off()
}})
"""
    try:
        with open(r_script_path, "w", encoding="utf-8") as f:
            f.write(r_script)

        result = subprocess.run(
            ["Rscript", "--vanilla", "--quiet", r_script_path],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=60
        )

        # 清理脚本
        try:
            os.remove(r_script_path)
        except Exception:
            pass

        if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
            return pdf_path
        else:
            print(f"R PDF generation failed stdout: {result.stdout}, stderr: {result.stderr}")
            return None

    except Exception as e:
        print(f"R PDF generation error: {e}")
        try:
            os.remove(r_script_path)
        except Exception:
            pass
        return None


def _escape_r_string(s: str) -> str:
    """转义字符串用于嵌入 R 脚本"""
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("$", "\\$")


from typing import Optional


def _render_md_to_html(md_text: str, title: Optional[str] = None) -> str:
    """简化为占位实现（仅供未来 PDF 渲染使用）。当前仅生成 MD。"""
    doc_title = (title or "Report").strip() or "Report"
    safe = (md_text or "").replace("<", "&lt;").replace(">", "&gt;")
    return f"<html><head><meta charset='utf-8'><title>{doc_title}</title></head><body><pre>{safe}</pre></body></html>"


def _save_pdf_from_md(html_text: str, base_name: str) -> Path:
    """TODO: 服务端 PDF 渲染未实现。"""
    raise NotImplementedError("TODO: implement server-side PDF rendering")


def _save_pdf_with_chromium(html_text: str, base_name: str) -> Path:
    """TODO: 使用 Chromium 渲染 PDF（暂不实现）。"""
    raise NotImplementedError("TODO: chromium-based PDF rendering")


def _save_pdf_from_text(text: str, base_name: str) -> Path:
    """TODO: 纯文本 PDF 渲染（暂不实现）。"""
    raise NotImplementedError("TODO: text-based PDF rendering")


def _save_docx(md_text: str, base_name: str, workspace_dir: str) -> Path | None:
    """
    使用模块化方式生成中文 DOCX 文件

    优化要点：
    1. 使用 docx_utils 模块处理中文编码问题
    2. 正确设置中文字体（STFangSong）
    3. 确保使用 UTF-8 编码
    4. 避免乱码问题

    关键修复：
    - 使用 create_docx_document() 创建配置好字体的文档
    - 使用 clean_md_text_for_docx() 清理 Markdown 标记
    - 使用 extract_markdown_blocks() 解析内容结构
    - 确保所有中文 run 都设置正确的 eastAsia 字体
    """
    Path(workspace_dir).mkdir(parents=True, exist_ok=True)
    docx_path = uniquify_path(Path(workspace_dir) / f"{base_name}.docx")

    try:
        print(f"开始生成 DOCX: {docx_path}")

        # 使用 docx_utils 模块生成 DOCX
        success = generate_docx_module(md_text, str(docx_path), title=base_name)

        if success:
            print(f"DOCX 生成成功: {docx_path}")
            return docx_path
        else:
            print(f"DOCX 生成失败")
            return None

    except Exception as e:
        error_msg = f"DOCX 生成失败: {e}"
        print(error_msg)
        traceback.print_exc()
        return None

def _save_pdf_with_reportlab(md_text: str, base_name: str, workspace_dir: str) -> Path | None:
    """
    使用 reportlab + simhei.ttf 生成中文 PDF（降级方案）

    优化要点：
    1. 使用模块化的字体注册函数 register_chinese_fonts()
    2. 使用 get_chinese_style() 获取预定义样式
    3. 使用 extract_markdown_sections() 提取结构化内容
    4. 使用 clean_md_text() 清理 Markdown 标记
    5. 完善的错误处理和日志记录
    """
    Path(workspace_dir).mkdir(parents=True, exist_ok=True)
    pdf_path = uniquify_path(Path(workspace_dir) / f"{base_name}.pdf")

    try:
        print(f"开始生成 PDF (ReportLab): {pdf_path}")

        # 1. 注册中文字体（使用模块化函数，只注册一次）
        registered = register_chinese_fonts(force=False)
        if not registered:
            print("警告：没有成功注册中文字体，PDF 可能无法正常显示中文")
        else:
            print(f"已注册字体: {list(registered.keys())}")

        # 2. 提取 Markdown 内容块
        clean_text = clean_md_text(md_text)
        blocks = extract_markdown_sections(clean_text)
        print(f"提取到 {len(blocks)} 个内容块")

        # 3. 初始化 PDF 文档
        doc = SimpleDocTemplate(
            str(pdf_path),
            pagesize=A4,
            rightMargin=50,
            leftMargin=50,
            topMargin=50,
            bottomMargin=50,
        )

        # 4. 准备故事（PDF 内容）
        story = []

        # 5. 处理每个内容块
        for block in blocks:
            block_type = block["type"]
            content = block["content"]

            if block_type == "heading1":
                style = get_chinese_style("heading1")
                story.append(Paragraph(content, style))
                story.append(Spacer(1, 12))

            elif block_type == "heading2":
                style = get_chinese_style("heading2")
                story.append(Paragraph(content, style))
                story.append(Spacer(1, 8))

            elif block_type == "heading3":
                style = get_chinese_style("heading3")
                story.append(Paragraph(content, style))
                story.append(Spacer(1, 6))

            elif block_type == "paragraph":
                style = get_chinese_style("normal")
                story.append(Paragraph(content, style))
                story.append(Spacer(1, 8))

            elif block_type == "list":
                style = get_chinese_style("list")
                for item in content:
                    para_text = f"• {item}"
                    story.append(Paragraph(para_text, style))
                    story.append(Spacer(1, 4))
                story.append(Spacer(1, 8))

        # 6. 构建 PDF
        doc.build(story)

        # 7. 验证生成结果
        if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
            file_size = os.path.getsize(pdf_path) / 1024
            print(f"PDF 生成成功: {pdf_path.name} ({file_size:.1f} KB)")
            return pdf_path
        else:
            print(f"PDF 生成失败: 文件不存在或为空")
            return None

    except Exception as e:
        error_msg = f"PDF 生成失败: {e}"
        print(error_msg)
        traceback.print_exc()
        return None

@app.post("/export/report")
async def export_report(body: dict = Body(...)):
    """
    接收全部聊天历史（messages: [{role, content}...]），抽取 <Analyze>..~ <Answer>..
    生成 Markdown, PDF (ReportLab) 和 DOCX 文件。
    """
    try:
        messages = body.get("messages", [])
        title = (body.get("title") or "").strip()
        session_id = body.get("session_id", "default")
        username = body.get("username", "default")
        workspace_dir = get_session_workspace(session_id, username)

        if not isinstance(messages, list):
            raise HTTPException(status_code=400, detail="messages must be a list")

        md_text = _extract_sections_from_messages(messages)
        if not md_text:
            md_text = "(No <Analyze>/<Understand>/<Code>/<Execute>/<Answer> sections found.)"

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_title = re.sub(r"[^\w\-_.]+", "_", title) if title else "Report"
        base_name = f"{safe_title}_{ts}" if title else f"Report_{ts}"

        export_dir = os.path.join(workspace_dir, "generated")
        os.makedirs(export_dir, exist_ok=True)

        md_path = _save_md(md_text, base_name, export_dir)
        docx_path = _save_docx(md_text, base_name, export_dir)
        pdf_path = _save_pdf(md_text, base_name, export_dir)

        result = {
            "message": "exported",
            "md": md_path.name,
            "pdf": pdf_path.name if pdf_path else None,
            "docx": docx_path.name if docx_path else None,
            "download_urls": {
                "md": build_download_url(f"{username}/{session_id}/generated/{md_path.name}"),
                "pdf": build_download_url(f"{username}/{session_id}/generated/{pdf_path.name}") if pdf_path else None,
                "docx": build_download_url(f"{username}/{session_id}/generated/{docx_path.name}") if docx_path else None,
            },
        }
        return JSONResponse(result)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Export report error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/users/list")
async def list_users():
    """获取已注册用户列表（仅返回用户名）"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT username FROM users ORDER BY username ASC")
        rows = cursor.fetchall()
        conn.close()
        return {"users": [row["username"] for row in rows]}
    except Exception as e:
        print(f"List users error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/save")
async def save_project(
    username: str = Form(...),
    session_id: str = Form(...),
    name: str = Form(...),
    messages: str = Form(...),
    files_data: str = Form("{}")
):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Check if project name already exists for this user to support "overwrite" logic
        cursor.execute("SELECT id, session_id FROM projects WHERE username = ? AND name = ?", (username, name))
        existing = cursor.fetchone()

        # Build workspace snapshot: list all files in the user's workspace directory
        workspace_dir = get_session_workspace(session_id, username)
        files_snapshot = []

        if existing:
            project_id = existing["id"]
            # Create project directory to store file copies
            project_dir = os.path.join(PROJECTS_BASE_DIR, str(project_id))
            os.makedirs(project_dir, exist_ok=True)
        else:
            # For new project, use a temporary directory name first
            project_id = None
            project_dir = None

        if os.path.exists(workspace_dir):
            for root, dirs, files in os.walk(workspace_dir):
                for fname in files:
                    if fname.startswith("."):
                        continue
                    fpath = os.path.join(root, fname)
                    rel_path = os.path.relpath(fpath, workspace_dir)
                    files_snapshot.append({
                        "name": fname,
                        "path": rel_path,
                        "size": os.path.getsize(fpath)
                    })

        files_json = json.dumps(files_snapshot)

        if existing:
            cursor.execute(
                "UPDATE projects SET session_id = ?, messages = ?, files_data = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
                (session_id, messages, files_json, project_id)
            )
        else:
            cursor.execute(
                "INSERT INTO projects (username, session_id, name, messages, files_data) VALUES (?, ?, ?, ?, ?)",
                (username, session_id, name, messages, files_json)
            )
            project_id = cursor.lastrowid
            # Now create project directory with actual ID
            project_dir = os.path.join(PROJECTS_BASE_DIR, str(project_id))
            os.makedirs(project_dir, exist_ok=True)

        # Copy files to project directory
        if project_dir and os.path.exists(workspace_dir):
            for root, dirs, files in os.walk(workspace_dir):
                for fname in files:
                    if fname.startswith("."):
                        continue
                    fpath = os.path.join(root, fname)
                    rel_path = os.path.relpath(fpath, workspace_dir)
                    try:
                        project_file_dir = os.path.join(project_dir, os.path.dirname(rel_path))
                        os.makedirs(project_file_dir, exist_ok=True)
                        project_file_path = os.path.join(project_file_dir, fname)
                        shutil.copy2(fpath, project_file_path)
                    except Exception as copy_err:
                        print(f"Warning: Failed to copy file {rel_path} to project directory: {copy_err}")

        conn.commit()
        conn.close()
        return {"message": "Project saved successfully", "project_id": project_id}
    except Exception as e:
        print(f"Save project error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects/list")
async def list_projects(username: str = Query(...)):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, session_id, created_at FROM projects WHERE username = ? ORDER BY created_at DESC",
            (username,)
        )
        rows = cursor.fetchall()
        projects = [dict(row) for row in rows]
        conn.close()
        return {"projects": projects}
    except Exception as e:
        print(f"List projects error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects/check-name")
async def check_project_name(username: str = Query(...), name: str = Query(...)):
    """检查项目名称是否已存在"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM projects WHERE username = ? AND name = ?", (username, name))
        row = cursor.fetchone()
        conn.close()
        return {"exists": row is not None, "project_id": row["id"] if row else None}
    except Exception as e:
        print(f"Check project name error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects/restore-files")
async def restore_project_files(project_id: int = Query(...)):
    """获取指定项目的文件列表及其下载链接，供前端恢复文件"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT session_id, username, files_data FROM projects WHERE id = ?", (project_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")

        files_data = json.loads(row["files_data"]) if row["files_data"] else []
        result_files = []
        for f in files_data:
            rel_path = f.get("path", "")
            # 构建项目文件的下载 URL（从项目目录读取）
            download_url = f"/api/projects/file/{project_id}/{quote(rel_path)}"
            result_files.append({
                "name": f.get("name", ""),
                "path": rel_path,
                "size": f.get("size", 0),
                "download_url": download_url,
            })
        return {"files": result_files}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Restore project files error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects/file/{project_id}/{file_path}")
async def get_project_file(project_id: int, file_path: str):
    """从项目目录中获取文件内容"""
    try:
        # 构建项目文件路径
        project_dir = os.path.join(PROJECTS_BASE_DIR, str(project_id))
        if not os.path.exists(project_dir):
            raise HTTPException(status_code=404, detail="Project directory not found")

        # 清理文件路径，防止目录穿越攻击
        safe_path = os.path.normpath(file_path)
        file_full_path = os.path.join(project_dir, safe_path)

        # 确保文件在项目目录内
        if not os.path.abspath(file_full_path).startswith(os.path.abspath(project_dir) + os.sep):
            raise HTTPException(status_code=403, detail="Access denied")

        if not os.path.exists(file_full_path):
            raise HTTPException(status_code=404, detail="File not found")

        # 返回文件
        return FileResponse(file_full_path)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Get project file error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects/load")
async def load_project(project_id: int = Query(...)):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT session_id, messages, files_data FROM projects WHERE id = ?", (project_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        return {
            "session_id": row["session_id"],
            "messages": json.loads(row["messages"]),
            "files_data": json.loads(row["files_data"]) if row["files_data"] else []
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Load project error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/projects/delete")
async def delete_project(project_id: int = Query(...), username: str = Query(...)):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        # Get session_id first to delete files
        cursor.execute("SELECT session_id FROM projects WHERE id = ? AND username = ?", (project_id, username))
        row = cursor.fetchone()
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Project not found")

        session_id = row["session_id"]

        # Delete from DB
        cursor.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        conn.commit()
        conn.close()

        # Delete workspace files
        workspace_dir = get_session_workspace(session_id, username)
        if os.path.exists(workspace_dir):
            shutil.rmtree(workspace_dir)

        return {"message": "Project deleted successfully"}
    except Exception as e:
        print(f"Delete project error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ========== 雨途斩棘录 API ==========
@app.get("/api/yutu/html")
async def get_yutu_html_api():
    """获取雨途斩棘录HTML内容（所有人都可以查看）"""
    try:
        html = get_yutu_html()
        return {"success": True, "html": html}
    except Exception as e:
        print(f"Get yutu HTML error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/yutu/add")
async def add_yutu_record(body: dict = Body(...), username: str = Query("default")):
    """
    添加错误记录和解决方案（仅超级用户）
    """
    try:
        # 检查是否为超级用户
        if username != "rainforgrain":
            raise HTTPException(status_code=403, detail="Only superuser can add records")

        error_type = body.get("error_type", "Unknown")
        error_message = body.get("error_message", "")
        error_context = body.get("error_context")
        solution = body.get("solution", "")
        solution_code = body.get("solution_code")
        confidence = body.get("confidence", 0.0)

        success = add_error_solution(
            error_type=error_type,
            error_message=error_message,
            error_context=error_context,
            solution=solution,
            solution_code=solution_code,
            confidence=confidence,
            created_by=username
        )

        if success:
            return {"success": True, "message": "Record added successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to add record")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Add yutu record error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/yutu/update")
async def update_yutu_record(body: dict = Body(...), username: str = Query("default")):
    """
    更新错误记录（仅超级用户）
    """
    try:
        # 检查是否为超级用户
        if username != "rainforgrain":
            raise HTTPException(status_code=403, detail="Only superuser can update records")

        error_hash = body.get("error_hash")
        solution = body.get("solution")
        solution_code = body.get("solution_code")
        confidence = body.get("confidence", 0.0)

        if not error_hash:
            raise HTTPException(status_code=400, detail="error_hash is required")

        success = update_error_solution(
            error_hash=error_hash,
            solution=solution,
            solution_code=solution_code,
            confidence=confidence,
            updated_by=username
        )

        if success:
            return {"success": True, "message": "Record updated successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to update record")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Update yutu record error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/yutu/delete")
async def delete_yutu_record(body: dict = Body(...), username: str = Query("default")):
    """
    删除错误记录（仅超级用户）
    """
    try:
        # 检查是否为超级用户
        if username != "rainforgrain":
            raise HTTPException(status_code=403, detail="Only superuser can delete records")

        error_hash = body.get("error_hash")

        if not error_hash:
            raise HTTPException(status_code=400, detail="error_hash is required")

        success = delete_error(error_hash)

        if success:
            return {"success": True, "message": "Record deleted successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete record")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Delete yutu record error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/yutu/search")
async def search_yutu_records(body: dict = Body(...)):
    """
    搜索错误记录（所有人都可以搜索）
    """
    try:
        keywords = body.get("keywords", [])
        error_type = body.get("error_type")
        page = body.get("page", 1)
        page_size = body.get("page_size", 20)

        results = search_errors(
            keywords=keywords,
            error_type=error_type,
            page=page,
            page_size=page_size
        )

        return {"success": True, "data": results}
    except Exception as e:
        print(f"Search yutu records error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/yutu/init")
async def init_yutu_api():
    """初始化雨途斩棘录（超级用户专用）"""
    try:
        init_yutu_if_needed()
        return {"success": True, "message": "Yutu initialized successfully"}
    except Exception as e:
        print(f"Init yutu error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/yutu/organize")
async def organize_yutu_api(records: List[dict], username: str = ""):
    """整理雨途斩棘录 - 使用VLLM AI重新组织所有记录（超级用户专用）"""
    # 验证超级用户
    if username != "rainforgrain":
        raise HTTPException(status_code=403, detail="只有超级用户可以整理笔记")

    if not records or len(records) == 0:
        return {"success": False, "detail": "没有记录可整理", "updated_count": 0, "records": []}

    try:
        # 1. 导出原始笔记到本地文件
        import json
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        export_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "yutu_backups")
        os.makedirs(export_dir, exist_ok=True)
        backup_file = os.path.join(export_dir, f"yutu_backup_{timestamp}.json")
        with open(backup_file, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)

        # 2. 使用VLLM进行整理
        prompt = f"""你是雨途斩棘录的智能整理助手。请分析以下所有错误记录，将每条记录的solution字段重新整理，使其：
1. 更清晰地描述错误场景
2. 提供更具体可执行的解决方案
3. 添加"关键要点"总结

请为每条记录生成改进后的solution，保持原有error_type和error_message不变。

原始记录：
{json.dumps(records, ensure_ascii=False, indent=2)}

请直接返回JSON数组格式的整理结果，每条记录包含：error_hash, error_type, error_message, improved_solution（改进后的solution）。"""

        try:
            response = client.chat.completions.create(
                model=MODEL_PATH,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=4000
            )
            improved_content = response.choices[0].message.content

            # 解析改进内容
            import re
            json_match = re.search(r'\[.*\]', improved_content, re.DOTALL)
            if json_match:
                improved_records = json.loads(json_match.group())
            else:
                # 如果无法解析，返回原始记录
                improved_records = records

            # 保存整理后的预览版本到临时文件
            preview_file = os.path.join(export_dir, f"yutu_preview_{timestamp}.json")
            with open(preview_file, "w", encoding="utf-8") as f:
                json.dump(improved_records, f, ensure_ascii=False, indent=2)

            # 返回预览数据给前端
            return {
                "success": True,
                "updated_count": len(improved_records),
                "records": improved_records,
                "backup_file": backup_file,
                "preview_file": preview_file,
                "timestamp": timestamp
            }
        except Exception as vllm_err:
            print(f"VLLM调用失败: {vllm_err}")
            # VLLM失败时使用本地简单整理
            from yutu_zhanyilu import reorganize_all_records
            updated_count = reorganize_all_records(records)
            return {
                "success": True,
                "updated_count": updated_count,
                "records": records,
                "backup_file": backup_file,
                "note": "VLLM不可用，使用本地整理"
            }

    except Exception as e:
        print(f"Organize yutu error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/yutu/organize/confirm")
async def confirm_organize(data: dict, username: str = ""):
    """确认整理结果：应用改进后的方案"""
    if username != "rainforgrain":
        raise HTTPException(status_code=403, detail="只有超级用户可以确认")

    improved_records = data.get("records", [])
    if not improved_records:
        return {"success": False, "detail": "没有记录可更新"}

    try:
        from yutu_zhanyilu import update_solution
        updated_count = 0
        for record in improved_records:
            if update_solution(record.get("error_hash"), record.get("improved_solution", "")):
                updated_count += 1

        return {"success": True, "updated_count": updated_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/yutu/organize/cancel")
async def cancel_organize(data: dict, username: str = ""):
    """取消整理：恢复到原始备份"""
    if username != "rainforgrain":
        raise HTTPException(status_code=403, detail="只有超级用户可以取消")

    # 取消操作不需要实际恢复，因为原始数据未修改
    return {"success": True, "message": "已取消整理，原始记录保持不变"}


if __name__ == "__main__":
    print("🚀 启动后端服务...")
    print(f"   - API服务: http://localhost:8200")
    print(f"   - 文件服务: http://localhost:8100")
    uvicorn.run(app, host="0.0.0.0", port=8200)