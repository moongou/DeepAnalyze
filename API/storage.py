"""
Storage layer for DeepAnalyze API Server
Handles in-memory storage for OpenAI objects
"""

import os
import time
import uuid
import json
import sqlite3
import shutil
import threading
from pathlib import Path
from typing import List, Optional, Dict, Any

from config import WORKSPACE_BASE_DIR
from models import (
    FileObject, ThreadObject, MessageObject
)
from utils import get_thread_workspace, uniquify_path


class Storage:
    """Simple in-memory storage for OpenAI objects"""

    def __init__(self):
        self.files: Dict[str, Dict[str, Any]] = {}
        self.threads: Dict[str, Dict[str, Any]] = {}
        self.messages: Dict[str, List[Dict[str, Any]]] = {}  # thread_id -> messages
        self.datasets: Dict[str, Dict[str, Any]] = {}
        self.analytics_jobs: Dict[str, Dict[str, Any]] = {}
        self.workflows: Dict[str, Dict[str, Any]] = {}
        self.skill_runs: Dict[str, Dict[str, Any]] = {}
        self.skill_policy_decisions: Dict[str, Dict[str, Any]] = {}

        os.makedirs(WORKSPACE_BASE_DIR, exist_ok=True)
        self._db_path = os.path.join(WORKSPACE_BASE_DIR, "_deepanalyze.db")
        self._db_conn = sqlite3.connect(self._db_path, check_same_thread=False)
        self._db_conn.row_factory = sqlite3.Row
        self._init_main_db()

        self._audit_db_path = os.path.join(WORKSPACE_BASE_DIR, "_governance_audit.db")
        self._audit_conn = sqlite3.connect(self._audit_db_path, check_same_thread=False)
        self._audit_conn.row_factory = sqlite3.Row
        self._init_audit_db()

        self._lock = threading.Lock()

    def _init_main_db(self) -> None:
        cur = self._db_conn.cursor()
        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS api_keys (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL REFERENCES users(username),
                key_hash TEXT NOT NULL,
                key_prefix TEXT NOT NULL,
                label TEXT NOT NULL DEFAULT 'default',
                created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_api_keys_username
            ON api_keys(username);

            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                session_id TEXT NOT NULL,
                name TEXT NOT NULL,
                messages_json TEXT NOT NULL DEFAULT '[]',
                files_data_json TEXT NOT NULL DEFAULT '{}',
                side_tasks_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_projects_username
            ON projects(username);

            CREATE TABLE IF NOT EXISTS knowledge_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                error_hash TEXT UNIQUE NOT NULL,
                error_type TEXT NOT NULL,
                error_message TEXT NOT NULL,
                solution TEXT NOT NULL DEFAULT '',
                code_context TEXT NOT NULL DEFAULT '',
                exe_output TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                verified_count INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_knowledge_type
            ON knowledge_entries(error_type);

            CREATE INDEX IF NOT EXISTS idx_knowledge_hash
            ON knowledge_entries(error_hash);
            """
        )
        self._db_conn.commit()

    def _init_audit_db(self) -> None:
        cur = self._audit_conn.cursor()
        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS skill_runs (
                id TEXT PRIMARY KEY,
                skill_id TEXT NOT NULL,
                runtime TEXT NOT NULL,
                status TEXT NOT NULL,
                context_json TEXT NOT NULL,
                output_json TEXT NOT NULL,
                error TEXT,
                meta_json TEXT NOT NULL,
                workflow_id TEXT,
                step_id TEXT,
                policy_decision_id TEXT,
                trace_id TEXT,
                started_at INTEGER,
                finished_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_skill_runs_skill_status_created
            ON skill_runs(skill_id, status, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_skill_runs_trace_created
            ON skill_runs(trace_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS skill_policy_decisions (
                id TEXT PRIMARY KEY,
                action TEXT NOT NULL,
                skill_id TEXT NOT NULL,
                effect TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                reasons_json TEXT NOT NULL,
                required_permissions_json TEXT NOT NULL,
                missing_requirements_json TEXT NOT NULL,
                policy_version TEXT NOT NULL,
                trace_id TEXT,
                context_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_policy_skill_action_created
            ON skill_policy_decisions(skill_id, action, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_policy_trace_created
            ON skill_policy_decisions(trace_id, created_at DESC);
            """
        )
        self._audit_conn.commit()

    @staticmethod
    def _json_dumps(value: Any) -> str:
        return json.dumps(value if value is not None else {}, ensure_ascii=False)

    @staticmethod
    def _json_loads(raw: Any, default: Any) -> Any:
        if raw is None or raw == "":
            return default
        try:
            return json.loads(raw)
        except Exception:
            return default

    def _row_to_skill_run(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "skill_id": row["skill_id"],
            "runtime": row["runtime"],
            "status": row["status"],
            "context": self._json_loads(row["context_json"], {}),
            "output": self._json_loads(row["output_json"], {}),
            "error": row["error"],
            "meta": self._json_loads(row["meta_json"], {}),
            "workflow_id": row["workflow_id"],
            "step_id": row["step_id"],
            "policy_decision_id": row["policy_decision_id"],
            "trace_id": row["trace_id"] or "",
            "started_at": row["started_at"],
            "finished_at": row["finished_at"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def _row_to_policy_decision(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "action": row["action"],
            "skill_id": row["skill_id"],
            "effect": row["effect"],
            "risk_level": row["risk_level"],
            "reasons": self._json_loads(row["reasons_json"], []),
            "required_permissions": self._json_loads(row["required_permissions_json"], []),
            "missing_requirements": self._json_loads(row["missing_requirements_json"], []),
            "policy_version": row["policy_version"],
            "trace_id": row["trace_id"] or "",
            "context": self._json_loads(row["context_json"], {}),
            "created_at": row["created_at"],
        }

    def create_file(self, filename: str, filepath: str, purpose: str) -> FileObject:
        """Create a file record"""
        with self._lock:
            file_id = f"file-{uuid.uuid4().hex[:24]}"
            file_size = os.path.getsize(filepath)
            file_obj = {
                "id": file_id,
                "object": "file",
                "bytes": file_size,
                "created_at": int(time.time()),
                "filename": filename,
                "purpose": purpose,
                "filepath": filepath,
            }
            self.files[file_id] = file_obj
            return FileObject(**file_obj)

    def get_file(self, file_id: str) -> Optional[FileObject]:
        """Get a file record"""
        with self._lock:
            if file_id in self.files:
                return FileObject(**self.files[file_id])
            return None

    def delete_file(self, file_id: str) -> bool:
        """Delete a file record"""
        with self._lock:
            if file_id in self.files:
                filepath = self.files[file_id].get("filepath")
                if filepath and os.path.exists(filepath):
                    os.remove(filepath)
                del self.files[file_id]
                return True
            return False

    def list_files(self, purpose: Optional[str] = None) -> List[FileObject]:
        """List files with optional purpose filter"""
        with self._lock:
            files = list(self.files.values())
            if purpose:
                files = [f for f in files if f.get("purpose") == purpose]
            return [FileObject(**f) for f in files]

  
    def create_thread(
        self,
        metadata: Optional[Dict] = None,
        file_ids: Optional[List[str]] = None,
        tool_resources: Optional[Dict] = None
    ) -> ThreadObject:
        """Create a thread record"""
        with self._lock:
            thread_id = f"thread-{uuid.uuid4().hex[:24]}"
            now = int(time.time())
            thread = {
                "id": thread_id,
                "object": "thread",
                "created_at": now,
                "last_accessed_at": now,
                "metadata": metadata or {},
                "file_ids": file_ids or [],
                "tool_resources": tool_resources,
            }
            self.threads[thread_id] = thread
            self.messages[thread_id] = []

            # Create workspace for this thread
            workspace_dir = get_thread_workspace(thread_id)
            os.makedirs(workspace_dir, exist_ok=True)
            os.makedirs(os.path.join(workspace_dir, "generated"), exist_ok=True)

            # Copy files to thread workspace
            for fid in (file_ids or []):
                if fid in self.files:
                    file_data = self.files[fid]
                    src_path = file_data.get("filepath")
                    if src_path and os.path.exists(src_path):
                        dst_path = uniquify_path(Path(workspace_dir) / file_data["filename"])
                        shutil.copy2(src_path, dst_path)

            return ThreadObject(**thread)

    def get_thread(self, thread_id: str) -> Optional[ThreadObject]:
        """Get a thread record"""
        with self._lock:
            if thread_id in self.threads:
                # Update last accessed time
                self.threads[thread_id]["last_accessed_at"] = int(time.time())
                return ThreadObject(**self.threads[thread_id])
            return None

    def delete_thread(self, thread_id: str) -> bool:
        """Delete a thread record"""
        with self._lock:
            if thread_id in self.threads:
                del self.threads[thread_id]
                if thread_id in self.messages:
                    del self.messages[thread_id]
                # Clean up workspace
                workspace_dir = get_thread_workspace(thread_id)
                if os.path.exists(workspace_dir):
                    shutil.rmtree(workspace_dir)
                return True
            return False

    def create_message(
        self,
        thread_id: str,
        role: str,
        content: str,
        file_ids: Optional[List[str]] = None,
        metadata: Optional[Dict] = None,
    ) -> MessageObject:
        """Create a message record"""
        with self._lock:
            if thread_id not in self.threads:
                raise ValueError(f"Thread {thread_id} not found")

            message_id = f"msg-{uuid.uuid4().hex[:24]}"
            message = {
                "id": message_id,
                "object": "thread.message",
                "created_at": int(time.time()),
                "thread_id": thread_id,
                "role": role,
                "content": [{"type": "text", "text": {"value": content}}],
                "file_ids": file_ids or [],
                "assistant_id": None,
                "run_id": None,
                "metadata": metadata or {},
            }
            self.messages[thread_id].append(message)
            return MessageObject(**message)

    def list_messages(self, thread_id: str) -> List[MessageObject]:
        """List messages in a thread"""
        with self._lock:
            if thread_id not in self.messages:
                return []
            return [MessageObject(**m) for m in self.messages[thread_id]]

    
    def cleanup_expired_threads(self, timeout_hours: float = 12) -> int:
        """Clean up threads that haven't been accessed for more than timeout_hours"""
        with self._lock:
            now = int(time.time())
            timeout_seconds = int(timeout_hours * 3600)
            expired_threads = []

            for thread_id, thread_data in self.threads.items():
                last_accessed = thread_data.get("last_accessed_at", thread_data.get("created_at", 0))
                if now - last_accessed > timeout_seconds:
                    expired_threads.append(thread_id)

        cleaned_count = 0
        for thread_id in expired_threads:
            try:
                # Delete thread and its workspace
                if self.delete_thread(thread_id):
                    cleaned_count += 1
                    print(f"Cleaned up expired thread: {thread_id}")
            except Exception as e:
                print(f"Error cleaning up thread {thread_id}: {e}")

        return cleaned_count

    def create_dataset(self, dataset_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create and persist a dataset metadata record."""
        with self._lock:
            dataset_id = f"ds-{uuid.uuid4().hex[:24]}"
            now = int(time.time())
            record = {
                "id": dataset_id,
                "created_at": now,
                "updated_at": now,
                **dataset_data,
            }
            self.datasets[dataset_id] = record
            return dict(record)

    def list_datasets(self) -> List[Dict[str, Any]]:
        """List all registered datasets."""
        with self._lock:
            return [dict(v) for v in self.datasets.values()]

    def get_dataset(self, dataset_id: str) -> Optional[Dict[str, Any]]:
        """Get a dataset metadata record by id."""
        with self._lock:
            dataset = self.datasets.get(dataset_id)
            if not dataset:
                return None
            return dict(dataset)

    def update_dataset(self, dataset_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Patch an existing dataset record."""
        with self._lock:
            if dataset_id not in self.datasets:
                return None
            self.datasets[dataset_id].update(patch)
            self.datasets[dataset_id]["updated_at"] = int(time.time())
            return dict(self.datasets[dataset_id])

    def create_analytics_job(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create an analytics job record."""
        with self._lock:
            job_id = f"job-{uuid.uuid4().hex[:24]}"
            now = int(time.time())
            record = {
                "id": job_id,
                "created_at": now,
                "status": "queued",
                "result": {},
                **job_data,
            }
            self.analytics_jobs[job_id] = record
            return dict(record)

    def list_analytics_jobs(self) -> List[Dict[str, Any]]:
        """List all analytics jobs."""
        with self._lock:
            return [dict(v) for v in self.analytics_jobs.values()]

    def get_analytics_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get analytics job by id."""
        with self._lock:
            job = self.analytics_jobs.get(job_id)
            if not job:
                return None
            return dict(job)

    def update_analytics_job(self, job_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Patch analytics job record."""
        with self._lock:
            if job_id not in self.analytics_jobs:
                return None
            self.analytics_jobs[job_id].update(patch)
            return dict(self.analytics_jobs[job_id])

    def create_workflow(self, workflow_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create one analysis workflow record."""
        with self._lock:
            workflow_id = f"wf-{uuid.uuid4().hex[:24]}"
            now = int(time.time())
            record = {
                "id": workflow_id,
                "created_at": now,
                "updated_at": now,
                **workflow_data,
            }
            self.workflows[workflow_id] = record
            return dict(record)

    def list_workflows(self) -> List[Dict[str, Any]]:
        """List all workflows."""
        with self._lock:
            return [dict(v) for v in self.workflows.values()]

    def get_workflow(self, workflow_id: str) -> Optional[Dict[str, Any]]:
        """Get workflow by id."""
        with self._lock:
            item = self.workflows.get(workflow_id)
            if not item:
                return None
            return dict(item)

    def update_workflow(self, workflow_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Patch workflow by id."""
        with self._lock:
            if workflow_id not in self.workflows:
                return None
            self.workflows[workflow_id].update(patch)
            self.workflows[workflow_id]["updated_at"] = int(time.time())
            return dict(self.workflows[workflow_id])

    def create_skill_run(self, run_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create one skill run record (persisted in SQLite)."""
        with self._lock:
            run_id = f"sr-{uuid.uuid4().hex[:24]}"
            now = int(time.time())
            record = {
                "id": run_id,
                "created_at": now,
                "updated_at": now,
                **run_data,
            }

            self._audit_conn.execute(
                """
                INSERT INTO skill_runs (
                    id, skill_id, runtime, status,
                    context_json, output_json, error, meta_json,
                    workflow_id, step_id, policy_decision_id, trace_id,
                    started_at, finished_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.get("id"),
                    record.get("skill_id"),
                    record.get("runtime", "python"),
                    record.get("status", "running"),
                    self._json_dumps(record.get("context", {})),
                    self._json_dumps(record.get("output", {})),
                    record.get("error"),
                    self._json_dumps(record.get("meta", {})),
                    record.get("workflow_id"),
                    record.get("step_id"),
                    record.get("policy_decision_id"),
                    str(record.get("trace_id") or ""),
                    record.get("started_at"),
                    record.get("finished_at"),
                    record.get("created_at"),
                    record.get("updated_at"),
                ),
            )
            self._audit_conn.commit()
            self.skill_runs[run_id] = record
            return dict(record)

    def list_skill_runs(
        self,
        skill_id: Optional[str] = None,
        status: Optional[str] = None,
        trace_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List skill runs with optional filters (from SQLite)."""
        with self._lock:
            query = "SELECT * FROM skill_runs WHERE 1=1"
            params: List[Any] = []
            if skill_id:
                query += " AND skill_id = ?"
                params.append(skill_id)
            if status:
                query += " AND status = ?"
                params.append(status)
            if trace_id:
                query += " AND trace_id = ?"
                params.append(trace_id)
            query += " ORDER BY created_at DESC"

            cur = self._audit_conn.execute(query, tuple(params))
            rows = cur.fetchall()
            return [self._row_to_skill_run(row) for row in rows]

    def get_skill_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        """Get one skill run by id (from SQLite)."""
        with self._lock:
            cur = self._audit_conn.execute("SELECT * FROM skill_runs WHERE id = ?", (run_id,))
            row = cur.fetchone()
            if not row:
                return None
            return self._row_to_skill_run(row)

    def update_skill_run(self, run_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Patch skill run by id (persisted in SQLite)."""
        with self._lock:
            cur = self._audit_conn.execute("SELECT * FROM skill_runs WHERE id = ?", (run_id,))
            row = cur.fetchone()
            if not row:
                return None

            current = self._row_to_skill_run(row)
            current.update(patch)
            current["updated_at"] = int(time.time())

            self._audit_conn.execute(
                """
                UPDATE skill_runs SET
                    skill_id = ?, runtime = ?, status = ?,
                    context_json = ?, output_json = ?, error = ?, meta_json = ?,
                    workflow_id = ?, step_id = ?, policy_decision_id = ?, trace_id = ?,
                    started_at = ?, finished_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    current.get("skill_id"),
                    current.get("runtime", "python"),
                    current.get("status", "running"),
                    self._json_dumps(current.get("context", {})),
                    self._json_dumps(current.get("output", {})),
                    current.get("error"),
                    self._json_dumps(current.get("meta", {})),
                    current.get("workflow_id"),
                    current.get("step_id"),
                    current.get("policy_decision_id"),
                    str(current.get("trace_id") or ""),
                    current.get("started_at"),
                    current.get("finished_at"),
                    current.get("updated_at"),
                    run_id,
                ),
            )
            self._audit_conn.commit()
            self.skill_runs[run_id] = current
            return dict(current)

    def create_skill_policy_decision(self, decision_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create one skill policy decision audit record (persisted in SQLite)."""
        with self._lock:
            decision_id = f"spd-{uuid.uuid4().hex[:24]}"
            now = int(time.time())
            record = {
                "id": decision_id,
                "created_at": now,
                **decision_data,
            }

            self._audit_conn.execute(
                """
                INSERT INTO skill_policy_decisions (
                    id, action, skill_id, effect, risk_level,
                    reasons_json, required_permissions_json, missing_requirements_json,
                    policy_version, trace_id, context_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.get("id"),
                    record.get("action"),
                    record.get("skill_id"),
                    record.get("effect"),
                    record.get("risk_level", "low"),
                    self._json_dumps(record.get("reasons", [])),
                    self._json_dumps(record.get("required_permissions", [])),
                    self._json_dumps(record.get("missing_requirements", [])),
                    str(record.get("policy_version") or ""),
                    str(record.get("trace_id") or ""),
                    self._json_dumps(record.get("context", {})),
                    record.get("created_at"),
                ),
            )
            self._audit_conn.commit()
            self.skill_policy_decisions[decision_id] = record
            return dict(record)

    def list_skill_policy_decisions(
        self,
        skill_id: Optional[str] = None,
        action: Optional[str] = None,
        trace_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List policy decisions with optional filters (from SQLite)."""
        with self._lock:
            query = "SELECT * FROM skill_policy_decisions WHERE 1=1"
            params: List[Any] = []
            if skill_id:
                query += " AND skill_id = ?"
                params.append(skill_id)
            if action:
                query += " AND action = ?"
                params.append(action)
            if trace_id:
                query += " AND trace_id = ?"
                params.append(trace_id)
            query += " ORDER BY created_at DESC"

            cur = self._audit_conn.execute(query, tuple(params))
            rows = cur.fetchall()
            return [self._row_to_policy_decision(row) for row in rows]

    def get_skill_policy_decision(self, decision_id: str) -> Optional[Dict[str, Any]]:
        """Get one policy decision by id (from SQLite)."""
        with self._lock:
            cur = self._audit_conn.execute(
                "SELECT * FROM skill_policy_decisions WHERE id = ?",
                (decision_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return self._row_to_policy_decision(row)


    # --- User & Auth ---

    def create_user(self, username: str, password_hash: str) -> Dict[str, Any]:
        with self._lock:
            now = int(time.time())
            self._db_conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, password_hash, now),
            )
            self._db_conn.commit()
            return {"username": username, "password_hash": password_hash, "created_at": now}

    def get_user(self, username: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            cur = self._db_conn.execute("SELECT * FROM users WHERE username = ?", (username,))
            row = cur.fetchone()
            return dict(row) if row else None

    def list_users(self) -> List[str]:
        with self._lock:
            cur = self._db_conn.execute("SELECT username FROM users")
            return [r["username"] for r in cur.fetchall()]

    def create_api_key(self, key_id: str, username: str, key_hash: str, key_prefix: str, label: str) -> None:
        with self._lock:
            now = int(time.time())
            self._db_conn.execute(
                "INSERT INTO api_keys (id, username, key_hash, key_prefix, label, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (key_id, username, key_hash, key_prefix, label, now),
            )
            self._db_conn.commit()

    def verify_api_key(self, api_key: str) -> Optional[str]:
        from auth_service import verify_password
        with self._lock:
            cur = self._db_conn.execute("SELECT id, key_hash, username FROM api_keys")
            for row in cur.fetchall():
                if verify_password(api_key, row["key_hash"]):
                    return row["username"]
            return None

    def list_api_keys(self, username: str) -> List[Dict[str, Any]]:
        with self._lock:
            cur = self._db_conn.execute(
                "SELECT id, key_prefix, label, created_at FROM api_keys WHERE username = ?",
                (username,),
            )
            return [dict(r) for r in cur.fetchall()]

    def delete_api_key(self, key_id: str, username: str) -> bool:
        with self._lock:
            cur = self._db_conn.execute(
                "DELETE FROM api_keys WHERE id = ? AND username = ?", (key_id, username)
            )
            self._db_conn.commit()
            return cur.rowcount > 0

    # --- Projects ---

    def save_project(
        self,
        username: str,
        session_id: str,
        name: str,
        messages_json: str,
        files_data_json: str,
        side_tasks_json: str,
    ) -> str:
        with self._lock:
            project_id = f"proj-{uuid.uuid4().hex[:16]}"
            now = int(time.time())
            self._db_conn.execute(
                """INSERT INTO projects (id, username, session_id, name, messages_json, files_data_json, side_tasks_json, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (project_id, username, session_id, name, messages_json, files_data_json, side_tasks_json, now),
            )
            self._db_conn.commit()
            return project_id

    def list_projects(self, username: str) -> List[Dict[str, Any]]:
        with self._lock:
            cur = self._db_conn.execute(
                "SELECT id, username, session_id, name, messages_json, files_data_json, side_tasks_json, created_at FROM projects WHERE username = ? ORDER BY created_at DESC",
                (username,),
            )
            return [dict(r) for r in cur.fetchall()]

    def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            cur = self._db_conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    def delete_project(self, project_id: str) -> bool:
        with self._lock:
            cur = self._db_conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            self._db_conn.commit()
            return cur.rowcount > 0

    def check_project_name_exists(self, username: str, name: str) -> bool:
        with self._lock:
            cur = self._db_conn.execute(
                "SELECT 1 FROM projects WHERE username = ? AND name = ?", (username, name)
            )
            return cur.fetchone() is not None

    # --- Knowledge (Yutu) ---

    def add_knowledge_entry(
        self, error_hash: str, error_type: str, error_message: str,
        solution: str = "", code_context: str = "", exe_output: str = "", tags: str = ""
    ) -> int:
        with self._lock:
            now = int(time.time())
            cur = self._db_conn.execute(
                """INSERT OR REPLACE INTO knowledge_entries
                   (error_hash, error_type, error_message, solution, code_context, exe_output, tags, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (error_hash, error_type, error_message, solution, code_context, exe_output, tags, now, now),
            )
            self._db_conn.commit()
            return cur.lastrowid

    def search_knowledge_entries(self, keyword: str) -> List[Dict[str, Any]]:
        with self._lock:
            cur = self._db_conn.execute(
                """SELECT * FROM knowledge_entries
                   WHERE error_message LIKE ? OR error_type LIKE ? OR tags LIKE ?
                   ORDER BY updated_at DESC LIMIT 50""",
                (f"%{keyword}%", f"%{keyword}%", f"%{keyword}%"),
            )
            return [dict(r) for r in cur.fetchall()]

    def get_knowledge_entry_by_hash(self, error_hash: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            cur = self._db_conn.execute(
                "SELECT * FROM knowledge_entries WHERE error_hash = ?", (error_hash,)
            )
            row = cur.fetchone()
            return dict(row) if row else None

    def update_knowledge_entry(self, entry_id: int, patch: Dict[str, Any]) -> bool:
        with self._lock:
            patch["updated_at"] = int(time.time())
            cols = ", ".join(f"{k} = ?" for k in patch)
            vals = list(patch.values()) + [entry_id]
            cur = self._db_conn.execute(
                f"UPDATE knowledge_entries SET {cols} WHERE id = ?", vals
            )
            self._db_conn.commit()
            return cur.rowcount > 0

    def delete_knowledge_entry(self, entry_id: int) -> bool:
        with self._lock:
            cur = self._db_conn.execute("DELETE FROM knowledge_entries WHERE id = ?", (entry_id,))
            self._db_conn.commit()
            return cur.rowcount > 0

    def list_knowledge_entries(self) -> List[Dict[str, Any]]:
        with self._lock:
            cur = self._db_conn.execute("SELECT * FROM knowledge_entries ORDER BY updated_at DESC")
            return [dict(r) for r in cur.fetchall()]

    def increment_knowledge_verified_count(self, error_hash: str) -> None:
        with self._lock:
            self._db_conn.execute(
                "UPDATE knowledge_entries SET verified_count = verified_count + 1, updated_at = ? WHERE error_hash = ?",
                (int(time.time()), error_hash),
            )
            self._db_conn.commit()


# Global storage instance
storage = Storage()