"use client";

import { useState, useRef, useEffect, useCallback, type RefObject } from "react";
import { API_URLS } from "@/lib/config";

export interface WorkspaceFile {
  name: string;
  size: number;
  extension: string;
  icon: string;
  download_url: string;
  preview_url?: string;
}

export type WorkspaceNode = {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  extension: string;
  children?: WorkspaceNode[];
  is_generated?: boolean;
};

interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

interface UseWorkspaceOptions {
  sessionId: string;
  userRef: RefObject<string | null>;
}

export function useWorkspace({ sessionId, userRef }: UseWorkspaceOptions) {
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceNode | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const suppressRefreshCount = useRef(0);
  const suppressDuringFileRestore = useRef(false);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [treeSize, setTreeSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!treeContainerRef.current) return;
    const container = treeContainerRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setTreeSize({ w: width, h: height });
      }
    });
    observer.observe(container);
    setTreeSize({ w: container.clientWidth, h: container.clientHeight });
    return () => observer.disconnect();
  }, []);

  const loadFiles = useCallback(async () => {
    if (!sessionId) return;
    if (suppressRefreshCount.current > 0) return;
    if (suppressDuringFileRestore.current) return;
    try {
      const res = await fetch(
        `${API_URLS.WORKSPACE_FILES}?session_id=${sessionId}&username=${userRef.current || "default"}`
      );
      if (res.ok) {
        const data = await res.json();
        setWorkspaceFiles(data.files);
      }
    } catch (e) {
      console.error("Failed to load workspace files:", e);
    }
  }, [sessionId]);

  const loadTree = useCallback(async () => {
    if (!sessionId) return;
    if (suppressRefreshCount.current > 0) return;
    if (suppressDuringFileRestore.current) return;
    try {
      const res = await fetch(
        `${API_URLS.WORKSPACE_TREE}?session_id=${sessionId}&username=${userRef.current || "default"}`
      );
      if (res.ok) {
        const data = await res.json();
        const markGenerated = (node: WorkspaceNode, parentIsGenerated = false) => {
          const isGenerated = parentIsGenerated || node.name === "generated" ||
            node.path.startsWith("generated/") || node.path.startsWith("generated");
          node.is_generated = isGenerated;
          if (node.children) {
            node.children.forEach(child => markGenerated(child, isGenerated));
          }
        };
        if (data) markGenerated(data);
        setWorkspaceTree(data);
        setExpanded(prev => {
          const next: Record<string, boolean> = { ...prev, "": true };
          if (data?.children) {
            data.children.forEach((c: WorkspaceNode) => {
              if (c.is_dir && prev[c.path] === undefined) next[c.path] = true;
            });
          }
          return next;
        });
      }
    } catch (e) {
      console.error("load tree error", e);
    }
  }, [sessionId]);

  const refresh = useCallback(async () => {
    await loadTree();
    await loadFiles();
  }, [loadTree, loadFiles]);

  const toggleExpand = useCallback((p: string) => {
    setExpanded(prev => ({ ...prev, [p]: !prev[p] }));
  }, []);

  const clearWorkspace = useCallback(async (sid: string, username: string) => {
    try {
      await fetch(`${API_URLS.WORKSPACE_CLEAR}?session_id=${sid}&username=${username}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.warn("Failed to clear workspace:", e);
    }
  }, []);

  const deleteFile = useCallback(async (p: string) => {
    suppressRefreshCount.current += 1;
    try {
      const url = `${API_URLS.WORKSPACE_DELETE_FILE}?path=${encodeURIComponent(p)}&session_id=${encodeURIComponent(sessionId)}&username=${userRef.current || "default"}`;
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) await refresh();
    } catch (e) {
      console.error("delete file error", e);
    } finally {
      suppressRefreshCount.current -= 1;
    }
  }, [sessionId, refresh]);

  const deleteDir = useCallback(async (p: string) => {
    suppressRefreshCount.current += 1;
    try {
      const url = `${API_URLS.WORKSPACE_DELETE_DIR}?path=${encodeURIComponent(p)}&recursive=true&session_id=${encodeURIComponent(sessionId)}&username=${userRef.current || "default"}`;
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) await refresh();
    } catch (e) {
      console.error("delete dir error", e);
    } finally {
      suppressRefreshCount.current -= 1;
    }
  }, [sessionId, refresh]);

  return {
    workspaceFiles, setWorkspaceFiles,
    workspaceTree, setWorkspaceTree,
    expanded, toggleExpand,
    attachments, setAttachments,
    isUploading, setIsUploading,
    treeContainerRef, treeSize,
    suppressRefreshCount,
    suppressDuringFileRestore,
    loadFiles, loadTree, refresh,
    clearWorkspace,
    deleteFile, deleteDir,
  };
}
