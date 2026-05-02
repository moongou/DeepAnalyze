"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_URLS } from "@/lib/config";
import { useToast } from "@/hooks/use-toast";

interface UseProjectsOptions {
  isLoggedIn: boolean;
  currentUser: string | null;
  sessionId: string;
  messages: any[];
  sideGuidanceHistory: string[];
  setSessionId: (id: string) => void;
  setMessages: (msgs: any[]) => void;
  setSideGuidanceHistory: (h: string[]) => void;
  onRefreshWorkspace: () => Promise<void>;
  clearWorkspace: (sessionId: string, username: string) => Promise<void>;
  showAuthModal: () => void;
  CHAT_STORAGE_KEY: string;
  suppressWorkspaceRefreshCount: React.MutableRefObject<number>;
}

export function useProjects({
  isLoggedIn, currentUser, sessionId, messages, sideGuidanceHistory,
  setSessionId, setMessages, setSideGuidanceHistory,
  onRefreshWorkspace, clearWorkspace, showAuthModal,
  CHAT_STORAGE_KEY, suppressWorkspaceRefreshCount,
}: UseProjectsOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [projectName, setProjectName] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<any>(null);

  const { data: userProjectsData } = useQuery({
    queryKey: ["projects", currentUser],
    queryFn: async () => {
      const res = await fetch(`${API_URLS.PROJECTS_LIST}?username=${currentUser}`);
      if (!res.ok) throw new Error("Failed to list projects");
      const data = await res.json();
      return data.projects;
    },
    enabled: !!currentUser,
    staleTime: 30 * 1000,
  });
  const userProjects = userProjectsData || [];

  const listProjects = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["projects", currentUser] });
  }, [queryClient, currentUser]);

  const saveProjectMutation = useMutation({
    mutationFn: async (params: { saveName: string; confirmed: boolean }) => {
      const { saveName, confirmed } = params;

      if (!confirmed) {
        const checkRes = await fetch(
          `${API_URLS.PROJECTS_CHECK_NAME}?username=${encodeURIComponent(currentUser!)}&name=${encodeURIComponent(saveName)}`
        );
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.exists) {
            setPendingSaveData({ confirmed: true });
            setSaveConfirmOpen(true);
            throw new Error("EXISTS");
          }
        }
      }

      const formData = new FormData();
      formData.append("username", currentUser!);
      formData.append("session_id", sessionId);
      formData.append("name", saveName);
      formData.append("messages", JSON.stringify(messages));
      formData.append("side_tasks", JSON.stringify(sideGuidanceHistory));
      const res = await fetch(API_URLS.PROJECTS_SAVE, { method: "POST", body: formData });
      if (!res.ok) throw new Error("保存失败");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ description: `项目已保存${data?.storage_size ? ` (${data.storage_size})` : ""}` });
      setShowSaveDialog(false);
      setPendingSaveData(null);
      queryClient.invalidateQueries({ queryKey: ["projects", currentUser] });
    },
    onError: (error: Error) => {
      if (error.message === "EXISTS") return;
      toast({ description: error.message, variant: "destructive" });
    },
  });

  const saveProject = useCallback((confirmed = false) => {
    if (!isLoggedIn) { showAuthModal(); return; }
    if (saveProjectMutation.isPending) return;
    if (!projectName.trim()) {
      toast({ description: "请输入项目名称", variant: "destructive" });
      return;
    }
    saveProjectMutation.mutate({ saveName: projectName.trim(), confirmed });
  }, [isLoggedIn, projectName, saveProjectMutation, showAuthModal, toast]);

  const loadProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const res = await fetch(`${API_URLS.PROJECTS_LOAD}?project_id=${projectId}`);
      if (!res.ok) throw new Error("加载失败");
      return res.json();
    },
    onSuccess: async (data, projectId) => {
      suppressWorkspaceRefreshCount.current += 1;
      try {
        await clearWorkspace(sessionId, currentUser || "default");
      } finally {
        suppressWorkspaceRefreshCount.current -= 1;
      }

      const newSessionId = data.session_id;
      setSessionId(newSessionId);
      localStorage.setItem("sessionId", newSessionId);

      const restoredMessages = data.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
      setMessages(restoredMessages);
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(restoredMessages));

      if (data.side_tasks && Array.isArray(data.side_tasks)) {
        setSideGuidanceHistory(data.side_tasks);
      } else {
        setSideGuidanceHistory([]);
      }

      setShowProjectManager(false);
      const proj = (userProjects as any[]).find((p: any) => p.id === projectId);
      if (proj) setProjectName(proj.name);

      toast({ description: "正在恢复项目文件..." });

      setTimeout(async () => {
        try {
          const restoreUrl = `${API_URLS.PROJECTS_RESTORE_TO_WORKSPACE}?project_id=${projectId}&session_id=${newSessionId}&username=${currentUser || "default"}`;
          const restoreRes = await fetch(restoreUrl, { method: "POST" });
          if (!restoreRes.ok) throw new Error("Restoration failed");
          setTimeout(() => {
            onRefreshWorkspace();
            toast({ description: "项目已加载，文件已全部恢复" });
          }, 500);
        } catch { toast({ description: "项目文件恢复失败", variant: "destructive" }); }
      }, 300);
    },
    onError: (error: Error) => {
      if (error.message !== "cancelled") {
        toast({ description: error.message, variant: "destructive" });
      }
    },
  });

  const loadProject = useCallback((projectId: number) => {
    loadProjectMutation.mutate(projectId);
  }, [loadProjectMutation]);

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const res = await fetch(`${API_URLS.PROJECTS_DELETE}?project_id=${projectId}&username=${currentUser}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
    },
    onSuccess: () => {
      toast({ description: "项目已删除" });
      queryClient.invalidateQueries({ queryKey: ["projects", currentUser] });
    },
    onError: (error: Error) => {
      toast({ description: error.message, variant: "destructive" });
    },
  });

  const deleteProject = useCallback((projectId: number) => {
    deleteProjectMutation.mutate(projectId);
  }, [deleteProjectMutation]);

  return {
    projectName, setProjectName,
    showSaveDialog, setShowSaveDialog,
    showProjectManager, setShowProjectManager,
    userProjects,
    saveConfirmOpen, setSaveConfirmOpen,
    pendingSaveData, setPendingSaveData,
    saveProject, loadProject, deleteProject, listProjects,
  };
}
