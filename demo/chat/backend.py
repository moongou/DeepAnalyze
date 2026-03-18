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
from fastapi.responses import JSONResponse, Response
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
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

Chinese_matplot_str = """
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import os

# 注册中文字体到 matplotlib
font_dirs = [os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../assets/fonts"), "/System/Library/Fonts", "/Library/Fonts"]
for d in font_dirs:
    if os.path.exists(d):
        for font_file in os.listdir(d):
            if font_file.lower().endswith(('.ttf', '.ttc', '.otf')):
                try:
                    fm.fontManager.addfont(os.path.join(d, font_file))
                except:
                    pass

# 优先尝试常见中文字体
plt.rcParams['font.sans-serif'] = ['SimHei', 'PingFang SC', 'Heiti SC', 'STHeiti', 'SimSun', 'Arial Unicode MS', 'DejaVu Sans', 'sans-serif']
plt.rcParams['axes.unicode_minus'] = False
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
                if "DYLD_LIBRARY_PATH" in child_env:
                    child_env["DYLD_LIBRARY_PATH"] = f"{r_lib}:{child_env['DYLD_LIBRARY_PATH']}"
                else:
                    child_env["DYLD_LIBRARY_PATH"] = r_lib
                child_env["LD_LIBRARY_PATH"] = child_env.get("DYLD_LIBRARY_PATH")
        except Exception:
            # 兜底常用路径
            r_home = "/opt/homebrew/opt/r/lib/R"
            if os.path.exists(r_home):
                child_env.setdefault("R_HOME", r_home)
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (username) REFERENCES users(username)
        )
    ''')
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
    handler = partial(
        http.server.SimpleHTTPRequestHandler, directory=WORKSPACE_BASE_DIR
    )
    with socketserver.TCPServer(("", HTTP_SERVER_PORT), handler) as httpd:
        print(f"HTTP Server serving {WORKSPACE_BASE_DIR} at port {HTTP_SERVER_PORT}")
        httpd.serve_forever()


# Start HTTP server in a separate thread
threading.Thread(target=start_http_server, daemon=True).start()


def collect_file_info(directory: str) -> str:
    """收集文件信息"""
    all_file_info_str = ""
    dir_path = Path(directory)
    if not dir_path.exists():
        return ""

    files = sorted([f for f in dir_path.iterdir() if f.is_file()])
    for idx, file_path in enumerate(files, start=1):
        size_bytes = os.path.getsize(file_path)
        size_kb = size_bytes / 1024
        size_str = f"{size_kb:.1f}KB"
        file_info = {"name": file_path.name, "size": size_str}
        file_info_str = json.dumps(file_info, indent=4, ensure_ascii=False)
        all_file_info_str += f"File {idx}:\n{file_info_str}\n\n"
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
    if len(password) < 8:
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
        # Superuser skip password check
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

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT password_hash FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        conn.close()
        if not row or row["password_hash"] != hash_password(password):
            raise HTTPException(status_code=401, detail="Invalid username or password")

        return {"username": username, "is_superuser": False}
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

        # 自定义排序：generated 文件夹放在最后，其他按目录优先、名称排序
        def sort_key(p):
            is_generated = p.name == "generated"
            is_dir = p.is_dir()
            return (is_generated, not is_dir, p.name.lower())

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


def convert_to_utf8(file_path: Path) -> Optional[Path]:
    """检查文件编码并转换为 UTF-8，另存为 _utf8 后缀的文件。"""
    if not file_path.exists() or not file_path.is_file():
        return None

    # 已经是 _utf8 文件或不是需要转换的文本类型，跳过
    if file_path.stem.endswith("_utf8"):
        return file_path

    # 仅转换文本类文件
    if file_path.suffix.lower() not in [".csv", ".txt", ".md", ".json", ".xml"]:
        return file_path

    try:
        with open(file_path, "rb") as f:
            raw_data = f.read()

        result = chardet.detect(raw_data)
        encoding = result['encoding']

        if not encoding:
            encoding = 'utf-8' # 兜底

        if encoding.lower() == 'utf-8':
            # 已经是 utf-8，但为了符合用户要求，依然创建一个副本
            utf8_path = file_path.parent / f"{file_path.stem}_utf8{file_path.suffix}"
            if not utf8_path.exists():
                shutil.copy2(file_path, utf8_path)
            return utf8_path

        # 转换
        content = raw_data.decode(encoding, errors='replace')
        utf8_path = file_path.parent / f"{file_path.stem}_utf8{file_path.suffix}"
        with open(utf8_path, "w", encoding="utf-8") as f:
            f.write(content)
        return utf8_path
    except Exception as e:
        print(f"Error converting {file_path} to UTF-8: {e}")
        return file_path

@app.post("/workspace/upload")
async def upload_files(
    files: List[UploadFile] = File(...), session_id: str = Query("default"), username: str = Query("default")
):
    """上传文件到工作区（支持 user & session 隔离），并自动转换为 UTF-8"""
    workspace_dir = get_session_workspace(session_id, username)
    uploaded_files = []

    for file in files:
        # 唯一化文件名，避免覆盖
        dst = uniquify_path(Path(workspace_dir) / file.filename)
        with open(dst, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # 自动转换为 UTF-8
        utf8_dst = convert_to_utf8(dst)

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

    return {
        "message": f"Successfully uploaded {len(uploaded_files)} files (including UTF-8 conversions)",
        "files": uploaded_files,
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
    for f in files:
        dst = uniquify_path(target_dir / f.filename)
        try:
            with open(dst, "wb") as buffer:
                content = await f.read()
                buffer.write(content)

            # 自动转换为 UTF-8
            utf8_dst = convert_to_utf8(dst)

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
    return {"message": f"uploaded {len(saved)} (including UTF-8 conversions)", "files": saved}


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


def bot_stream(messages, workspace, session_id="default", username="default", strategy="聚焦诉求"):
    # Strategy-specific prompts
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

**你的特质与要求**：
- **环境就绪（极重要）**：系统已为你安装了充足的 Python 和 R 语言工具包，包括但不限于 `fpdf2`, `python-docx`, `pandas`, `matplotlib`, `seaborn`, `chardet`, `reportlab` 等。
- **R 语言中文/PDF 增强（极重要）**：在 R 环境中，已为你安装了 `showtext`, `extrafont`, `Cairo`, `grDevices`, `ggplot2`, `lattice`, `knitr`, `rmarkdown`, `tinytex` 等核心包。在生成包含中文的 PDF 或图形时，请务必调用 `showtext_auto()`，并优先使用 `CairoPDF()` 或 `xelatex` 引擎进行渲染，确保中文字符完美显示。
- **UTF-8 编码优先（极重要）**：系统已自动将上传的文本文件转换为 UTF-8 编码并添加了 `_utf8` 后缀。**请务必优先使用带有 `_utf8` 后缀的文件进行分析**，以确保 Python 和 R 能够正确识别中文字符，彻底杜绝乱码。
- **中文字符与编码处理**：在处理任何数据文件前，应确认使用 UTF-8 编码。对于任何包含中文的内容，必须确保在所有输出文件（Png, Jpg, Pdf, Txt, Csv, Docx 等）中正确显示中文。
- **可视化支持**：在 Python 绘图时，务必配置 `plt.rcParams['font.sans-serif']` 使用 `SimHei`, `PingFang SC` 或其他系统中文字体，防止出现乱码或方框。在 R 中使用 `showtext` 处理中文。
- **报告生成**：分析完成后，必须生成详细的最终报告。**最终报告必须同时包含 PDF 和 DOCX 格式**，这是你的标准交付物。
- **深度洞察**：能够穿透表面数据，通过多角度关联分析挖掘深层逻辑，明确指出可疑行为并详述推理原因。
- **自主思考**：能根据用户上传的数据，主动提出分析假设并验证。
- **工具专家**：熟练切换并结合 Python (Pandas, Scikit-learn, Seaborn) 和 R (Tidyverse, ggplot2, stats) 的优势进行建模与可视化。你可以通过 Python 的 `rpy2` 库直接调用 R 语言工具开展分析，在进行复杂可视化时，应充分发挥 R 语言 `ggplot2` 包的灵活性优势。**注意：使用 rpy2 (版本 3.x+) 时，请使用 `rpy2.robjects.pandas2ri.activate()` 或 `with rpy2.robjects.conversion.localconverter(rpy2.robjects.default_converter + rpy2.robjects.pandas2ri.converter):` 进行数据转换，不要使用已废弃的 `conversion.register` 属性。**
- **专业严谨**：始终保持专业、严谨的态度，提供具有前瞻性和决策价值的洞察。
""" + selected_strategy_prompt + """

**终止逻辑与防循环（极重要）**：
- 每一轮完整的分析任务**必须**以 `<Answer>` 标签包裹的最终结论结束。
- 禁止在没有新进展的情况下重复生成相同的代码或进行循环逻辑。
- 如果已达成分析目标，请立即输出 `<Answer>`。
- 请始终以这种专业、敏锐且富有洞察力的风格与用户沟通。"""

    # Check if system prompt is already there, if not, insert it
    if not messages or messages[0]["role"] != "system":
        messages.insert(0, {"role": "system", "content": system_prompt})

    original_cwd = os.getcwd()
    WORKSPACE_DIR = get_session_workspace(session_id, username)
    os.makedirs(WORKSPACE_DIR, exist_ok=True)
    # 创建 generated 子文件夹用于存放代码生成的文件
    GENERATED_DIR = os.path.join(WORKSPACE_DIR, "generated")
    os.makedirs(GENERATED_DIR, exist_ok=True)
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
            temperature=0.4,
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

    # 动态构建 workspace 目录，确保能正确识别当前 session 的文件
    actual_workspace_dir = get_session_workspace(session_id, username)

    def generate():
        for delta_content in bot_stream(messages, workspace, session_id, username, strategy):
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


def _save_pdf(md_text: str, base_name: str, workspace_dir: str) -> Path | None:
    # 尝试使用 pypandoc
    Path(workspace_dir).mkdir(parents=True, exist_ok=True)
    pdf_path = uniquify_path(Path(workspace_dir) / f"{base_name}.pdf")
    try:
        pypandoc.convert_text(
            md_text,
            "pdf",
            format="md",
            outputfile=str(pdf_path),
            extra_args=[
                "--standalone",
                "--pdf-engine=xelatex",
                "-V", "mainfont=PingFang SC", # macOS 常用
            ],
        )
        return pdf_path
    except Exception as e:
        print(f"Pandoc PDF conversion failed: {e}, falling back to ReportLab")
        return _save_pdf_with_reportlab(md_text, base_name, workspace_dir)


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
    Path(workspace_dir).mkdir(parents=True, exist_ok=True)
    docx_path = uniquify_path(Path(workspace_dir) / f"{base_name}.docx")
    try:
        doc = Document()
        # 移除 Markdown 标记（简单处理）
        clean_text = re.sub(r"\\newpage", "", md_text)
        # 按换行分割
        for line in clean_text.splitlines():
            if line.startswith("# "):
                doc.add_heading(line[2:], level=1)
            elif line.startswith("## "):
                doc.add_heading(line[3:], level=2)
            elif line.startswith("### "):
                doc.add_heading(line[4:], level=3)
            else:
                doc.add_paragraph(line)
        doc.save(docx_path)
        return docx_path
    except Exception as e:
        print(f"Error saving DOCX: {e}")
        return None

def _save_pdf_with_reportlab(md_text: str, base_name: str, workspace_dir: str) -> Path | None:
    Path(workspace_dir).mkdir(parents=True, exist_ok=True)
    pdf_path = uniquify_path(Path(workspace_dir) / f"{base_name}.pdf")
    try:
        # 尝试注册中文字体
        font_paths = [
            "/System/Library/Fonts/STHeiti Light.ttc",
            "/Library/Fonts/Arial Unicode.ttf",
            os.path.join(FONT_DIR, "SimHei.ttf")
        ]
        font_name = "Helvetica"
        for fp in font_paths:
            if os.path.exists(fp):
                try:
                    pdfmetrics.registerFont(TTFont('ChineseFont', fp))
                    font_name = 'ChineseFont'
                    break
                except:
                    continue

        doc = SimpleDocTemplate(str(pdf_path))
        styles = getSampleStyleSheet()
        if font_name == 'ChineseFont':
            styles['Normal'].fontName = 'ChineseFont'
            styles['Heading1'].fontName = 'ChineseFont'

        story = []
        clean_text = re.sub(r"\\newpage", "", md_text)
        for line in clean_text.splitlines():
            if line.strip():
                if line.startswith("# "):
                    story.append(Paragraph(line[2:], styles['Heading1']))
                else:
                    story.append(Paragraph(line, styles['Normal']))
                story.append(Spacer(1, 12))

        doc.build(story)
        return pdf_path
    except Exception as e:
        print(f"Error saving PDF with ReportLab: {e}")
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


@app.post("/api/projects/save")
async def save_project(
    username: str = Form(...),
    session_id: str = Form(...),
    name: str = Form(...),
    messages: str = Form(...)
):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Check if project name already exists for this user to support "overwrite" logic
        cursor.execute("SELECT id FROM projects WHERE username = ? AND name = ?", (username, name))
        existing = cursor.fetchone()

        if existing:
            cursor.execute(
                "UPDATE projects SET session_id = ?, messages = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
                (session_id, messages, existing["id"])
            )
            project_id = existing["id"]
        else:
            cursor.execute(
                "INSERT INTO projects (username, session_id, name, messages) VALUES (?, ?, ?, ?)",
                (username, session_id, name, messages)
            )
            project_id = cursor.lastrowid

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

@app.get("/api/projects/load")
async def load_project(project_id: int = Query(...)):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT session_id, messages FROM projects WHERE id = ?", (project_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"session_id": row["session_id"], "messages": json.loads(row["messages"])}
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


if __name__ == "__main__":
    print("🚀 启动后端服务...")
    print(f"   - API服务: http://localhost:8200")
    print(f"   - 文件服务: http://localhost:8100")
    uvicorn.run(app, host="0.0.0.0", port=8200)