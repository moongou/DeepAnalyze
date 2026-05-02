"""
Projects API for DeepAnalyze API Server
Handles chat session project save/load/delete
"""

import json
import os
import shutil
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import JSONResponse

from storage import storage
from auth_api import get_current_user, require_auth
from utils import get_thread_workspace

router = APIRouter(prefix="/v1/projects", tags=["projects"])


@router.get("/list")
def list_projects(username: Optional[str] = Depends(get_current_user)):
    require_auth(username)
    projects = storage.list_projects(username)
    return {"object": "list", "data": projects}


@router.get("/check-name")
def check_project_name(
    name: str = Query(...),
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    exists = storage.check_project_name_exists(username, name)
    return {"exists": exists}


@router.post("/save")
def save_project(
    session_id: str = Query(...),
    name: str = Query(...),
    messages_json: str = Query(default="[]"),
    files_data_json: str = Query(default="{}"),
    side_tasks_json: str = Query(default="{}"),
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    project_id = storage.save_project(
        username, session_id, name, messages_json, files_data_json, side_tasks_json
    )
    return {"id": project_id, "status": "saved"}


@router.get("/load/{project_id}")
def load_project(
    project_id: str,
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    project = storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}")
def delete_project(
    project_id: str,
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    project = storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("username") != username:
        raise HTTPException(status_code=403, detail="Access denied")
    storage.delete_project(project_id)
    return {"status": "deleted"}


@router.get("/restore-files")
def restore_project_files(
    project_id: str = Query(...),
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    project = storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("username") != username:
        raise HTTPException(status_code=403, detail="Access denied")

    files_data = json.loads(project.get("files_data_json", "{}"))
    return {"project_id": project_id, "files_data": files_data}


@router.post("/restore-to-workspace")
def restore_project_to_workspace(
    project_id: str = Query(...),
    thread_id: str = Query(...),
    username: Optional[str] = Depends(get_current_user),
):
    require_auth(username)
    project = storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("username") != username:
        raise HTTPException(status_code=403, detail="Access denied")

    workspace_dir = get_thread_workspace(thread_id)
    os.makedirs(workspace_dir, exist_ok=True)

    files_data = json.loads(project.get("files_data_json", "{}"))
    restored_files = []

    for filename, content in files_data.items():
        filepath = os.path.join(workspace_dir, filename)
        os.makedirs(os.path.dirname(filepath) or workspace_dir, exist_ok=True)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content if isinstance(content, str) else json.dumps(content, ensure_ascii=False))
        restored_files.append(filename)

    return {"status": "restored", "files": restored_files, "workspace": workspace_dir}
