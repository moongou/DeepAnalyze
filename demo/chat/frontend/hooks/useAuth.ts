"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_URLS } from "@/lib/config";
import { useToast } from "@/hooks/use-toast";

interface UseAuthOptions {
  onWorkspaceRefresh: (sessionId: string, username: string) => Promise<void>;
  clearMessages: () => void;
  setSessionId: (id: string) => void;
}

export function useAuth({ onWorkspaceRefresh, clearMessages, setSessionId }: UseAuthOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const userRef = useRef<string | null>(null);
  useEffect(() => { userRef.current = currentUser; }, [currentUser]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const { data: registeredUsersData } = useQuery({
    queryKey: ["registered-users"],
    queryFn: async () => {
      const res = await fetch(API_URLS.USERS_LIST);
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      return data.users || [];
    },
    staleTime: 60 * 1000,
    enabled: showAuthModal,
  });
  const registeredUsers = registeredUsersData || [];

  const loadRegisteredUsers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["registered-users"] });
  }, [queryClient]);

  const authMutation = useMutation({
    mutationFn: async () => {
      const url = isLoginMode ? API_URLS.AUTH_LOGIN : API_URLS.AUTH_REGISTER;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: authUsername, password: authPassword }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`服务器响应错误 (${res.status})`);
      }

      if (!res.ok) {
        const detail = data.detail;
        const errorMessage =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((d: any) => `${d.loc.join(".")}: ${d.msg}`).join("; ")
              : "认证失败";
        throw new Error(errorMessage);
      }
      return data;
    },
    onSuccess: async (data) => {
      if (isLoginMode) {
        setCurrentUser(data.username);
        setIsLoggedIn(true);
        setShowAuthModal(false);
        toast({ description: `欢迎回来, ${data.username}` });
        await onWorkspaceRefresh(data.session_id || "", data.username);
      } else {
        toast({ description: "注册成功，请登录" });
        setIsLoginMode(true);
      }
    },
    onError: (error: Error) => {
      toast({ description: error.message, variant: "destructive" });
    },
  });

  const handleAuth = useCallback(() => {
    if (!authUsername) {
      toast({ description: "请输入用户名", variant: "destructive" });
      return;
    }
    if (!authMutation.isPending) authMutation.mutate();
  }, [authUsername, authMutation, toast]);

  const performLogout = useCallback(async (sessionId: string) => {
    const oldUsername = currentUser || "default";
    try {
      await fetch(
        `${API_URLS.WORKSPACE_CLEAR}?session_id=${sessionId}&username=${oldUsername}`,
        { method: "DELETE" }
      );
    } catch (e) {
      console.warn("Failed to clear workspace on logout", e);
    }

    setCurrentUser(null);
    setIsLoggedIn(false);
    setAuthUsername("");
    setAuthPassword("");
    clearMessages();
    setShowLogoutConfirm(false);
    setShowAuthModal(true);

    const newSid = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem("sessionId", newSid);
    setSessionId(newSid);

    toast({ description: "已退出登录，工作区已清空" });
  }, [currentUser, clearMessages, setSessionId, toast]);

  const handleLogout = useCallback(() => {
    setShowLogoutConfirm(true);
  }, []);

  return {
    currentUser, setCurrentUser,
    isLoggedIn, setIsLoggedIn,
    showAuthModal, setShowAuthModal,
    isLoginMode, setIsLoginMode,
    authUsername, setAuthUsername,
    authPassword, setAuthPassword,
    registeredUsers,
    showLogoutConfirm, setShowLogoutConfirm,
    handleAuth, handleLogout, performLogout,
    loadRegisteredUsers,
    userRef,
  };
}
