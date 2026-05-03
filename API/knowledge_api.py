"""
Knowledge Base (Yutu) API for DeepAnalyze API Server
Manages error knowledge base entries and search
"""

import hashlib
import json
import shutil
import time
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query, Body

from storage import storage
from auth_api import get_current_user, require_auth

router = APIRouter(prefix="/v1/knowledge", tags=["knowledge"])


def _hash_error(error_message: str) -> str:
    return hashlib.sha256(error_message.encode("utf-8", errors="replace")).hexdigest()


@router.get("/entries")
def list_entries(username: Optional[str] = Depends(get_current_user)):
    require_auth(username)
    entries = storage.list_knowledge_entries()
    return {"object": "list", "data": entries}


@router.post("/entries")
def add_entry(
    error_type: str = Body(...),
    error_message: str = Body(...),
    solution: str = Body(default=""),
    code_context: str = Body(default=""),
    exe_output: str = Body(default=""),
    tags: str = Body(default=""),
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    error_hash = _hash_error(error_message)
    entry_id = storage.add_knowledge_entry(
        error_hash, error_type, error_message, solution, code_context, exe_output, tags
    )
    return {"id": entry_id, "status": "created"}


@router.post("/entries/search")
def search_entries(
    keyword: str = Body(...),
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    results = storage.search_knowledge_entries(keyword)
    return {"object": "list", "data": results}


@router.get("/entries/{entry_id}")
def get_entry(
    entry_id: int,
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    entries = storage.list_knowledge_entries()
    entry = next((e for e in entries if e.get("id") == entry_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry


@router.put("/entries/{entry_id}")
def update_entry(
    entry_id: int,
    error_type: Optional[str] = Body(None),
    error_message: Optional[str] = Body(None),
    solution: Optional[str] = Body(None),
    code_context: Optional[str] = Body(None),
    tags: Optional[str] = Body(None),
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    patch = {}
    if error_type is not None:
        patch["error_type"] = error_type
    if error_message is not None:
        patch["error_message"] = error_message
    if solution is not None:
        patch["solution"] = solution
    if code_context is not None:
        patch["code_context"] = code_context
    if tags is not None:
        patch["tags"] = tags
    if not storage.update_knowledge_entry(entry_id, patch):
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"status": "updated"}


@router.delete("/entries/{entry_id}")
def delete_entry(
    entry_id: int,
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    if not storage.delete_knowledge_entry(entry_id):
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"status": "deleted"}


@router.post("/entries/organize")
def organize_entries(username: Optional[str] = Depends(get_current_user)):
    require_auth(username)
    entries = storage.list_knowledge_entries()
    by_type = {}
    for e in entries:
        et = e.get("error_type", "Unknown")
        by_type.setdefault(et, []).append(e)
    return {"object": "list", "catalog": by_type}


# --- Knowledge Base External Integration Settings ---

_kb_settings: dict = {}


@router.get("/settings")
def get_kb_settings(username: Optional[str] = Depends(get_current_user)):
    require_auth(username)
    return _kb_settings


@router.post("/settings")
def save_kb_settings(
    settings: dict = Body(...),
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    _kb_settings.update(settings)
    return {"status": "saved", "settings": _kb_settings}


@router.post("/test")
def test_kb(
    kb_type: str = Body(...),
    config: dict = Body(default={}),
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    try:
        if kb_type == "onyx":
            base_url = config.get("base_url", "")
            api_key = config.get("api_key", "")
            if not base_url:
                return {"status": "error", "detail": "Missing base_url"}
            import urllib.request
            import urllib.error
            req = urllib.request.Request(
                f"{base_url.rstrip('/')}/api/status",
                headers={"Authorization": f"Bearer {api_key}"} if api_key else {},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                return {"status": "ok", "detail": "Connected to Onyx"}
        elif kb_type == "dify":
            base_url = config.get("base_url", "")
            api_key = config.get("api_key", "")
            if not base_url:
                return {"status": "error", "detail": "Missing base_url"}
            import urllib.request
            import urllib.error
            req = urllib.request.Request(
                f"{base_url.rstrip('/')}/v1/conversations",
                headers={"Authorization": f"Bearer {api_key}"} if api_key else {},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                return {"status": "ok", "detail": "Connected to Dify"}
        else:
            return {"status": "error", "detail": f"Unknown kb_type: {kb_type}"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}
