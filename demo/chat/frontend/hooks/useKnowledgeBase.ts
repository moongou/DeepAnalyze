"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_URLS } from "@/lib/config";
import { useToast } from "@/hooks/use-toast";

interface UseKnowledgeBaseOptions {
  currentUser: string | null;
}

export function useKnowledgeBase({ currentUser }: UseKnowledgeBaseOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showYutuPanel, setShowYutuPanel] = useState(false);
  const [yutuRecords, setYutuRecords] = useState<any[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [editRecord, setEditRecord] = useState<any>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [yutuViewAsRegular, setYutuViewAsRegular] = useState(false);
  const [showOrganizePreview, setShowOrganizePreview] = useState(false);
  const [organizedRecords, setOrganizedRecords] = useState<any[]>([]);
  const [organizingProgress, setOrganizingProgress] = useState("");
  const [organizeProgressPercent, setOrganizeProgressPercent] = useState(0);
  const [hasAnalysisCompleted, setHasAnalysisCompleted] = useState(false);
  const [knowledgeBaseEnabled, setKnowledgeBaseEnabled] = useState(true);
  const [externalKnowledgeEnabled, setExternalKnowledgeEnabled] = useState(true);
  const [isRecordingKnowledge, setIsRecordingKnowledge] = useState(false);

  const isSuperUser = currentUser === "rainforgrain";

  const { data: yutuHtmlData } = useQuery({
    queryKey: ["yutu-html"],
    queryFn: async () => {
      const res = await fetch(API_URLS.YUTU_HTML);
      if (!res.ok) throw new Error("Failed to load HTML");
      const data = await res.json();
      return data.html || "";
    },
    staleTime: 60 * 1000,
    enabled: showYutuPanel,
  });
  const yutuHtmlContent = yutuHtmlData || "";

  const loadYutuHtml = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["yutu-html"] });
  }, [queryClient]);

  const loadYutuRecords = useCallback(async (keywords: string[] = [], errorType = "") => {
    try {
      const res = await fetch(API_URLS.YUTU_SEARCH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, error_type: errorType, page: 1, page_size: 50 }),
      });
      if (res.ok) {
        const data = await res.json();
        setYutuRecords(data.data?.items || []);
      }
    } catch (e) {
      console.error("加载记录失败:", e);
    }
  }, []);

  const invalidateYutu = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["yutu-html"] });
  }, [queryClient]);

  const saveRecordMutation = useMutation({
    mutationFn: async (record: any) => {
      const res = await fetch(`${API_URLS.YUTU_ADD}?username=${encodeURIComponent(currentUser || "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error_type: record.error_type, error_message: record.error_message,
          error_context: record.error_context, solution: record.solution,
          solution_code: record.solution_code, confidence: record.confidence,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "保存失败");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ description: "记录保存成功" });
      invalidateYutu();
      loadYutuRecords();
    },
    onError: (error: Error) => {
      toast({ description: error.message, variant: "destructive" });
    },
  });

  const updateRecordMutation = useMutation({
    mutationFn: async (record: any) => {
      const res = await fetch(`${API_URLS.YUTU_UPDATE}?username=${encodeURIComponent(currentUser || "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error_hash: record.error_hash, solution: record.solution,
          solution_code: record.solution_code, confidence: record.confidence,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "更新失败");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ description: "记录更新成功" });
      invalidateYutu();
      loadYutuRecords();
    },
    onError: (error: Error) => {
      toast({ description: error.message, variant: "destructive" });
    },
  });

  const deleteRecordMutation = useMutation({
    mutationFn: async (errorHash: string) => {
      const res = await fetch(`${API_URLS.YUTU_DELETE}?username=${encodeURIComponent(currentUser || "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error_hash: errorHash }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "删除失败");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ description: "记录已删除" });
      invalidateYutu();
      loadYutuRecords();
    },
    onError: (error: Error) => {
      toast({ description: error.message, variant: "destructive" });
    },
  });

  const organizeNotesMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_URLS.YUTU_ORGANIZE}?username=${encodeURIComponent(currentUser || "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: yutuRecords }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`${res.status} - ${errorText.substring(0, 100)}`);
      }
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("服务器返回非JSON响应");
      }
      const data = await res.json();
      if (!data.records || data.records.length === 0) {
        throw new Error(data.detail || "整理失败：无可用记录");
      }
      return data;
    },
    onSuccess: (data) => {
      setOrganizeProgressPercent(100);
      setOrganizedRecords(data.records);
      setShowOrganizePreview(true);
      setOrganizingProgress("整理完毕");
      toast({ description: "整理完成，请预览并确认" });
    },
    onError: (error: Error) => {
      setOrganizeProgressPercent(0);
      toast({ description: `整理失败: ${error.message}`, variant: "destructive" });
    },
  });

  const isOrganizing = organizeNotesMutation.isPending;

  const saveRecord = useCallback((record: any) => {
    if (!isSuperUser) { toast({ description: "只有超级用户可以添加记录", variant: "destructive" }); return false; }
    saveRecordMutation.mutate(record);
    return true;
  }, [isSuperUser, toast, saveRecordMutation]);

  const updateRecord = useCallback((record: any) => {
    if (!isSuperUser) { toast({ description: "只有超级用户可以更新记录", variant: "destructive" }); return false; }
    updateRecordMutation.mutate(record);
    return true;
  }, [isSuperUser, toast, updateRecordMutation]);

  const deleteRecord = useCallback((errorHash: string) => {
    if (!isSuperUser) { toast({ description: "只有超级用户可以删除记录", variant: "destructive" }); return false; }
    deleteRecordMutation.mutate(errorHash);
    return true;
  }, [isSuperUser, toast, deleteRecordMutation]);

  const organizeNotes = useCallback(() => {
    if (!isSuperUser) { toast({ description: "只有超级用户可以整理笔记", variant: "destructive" }); return; }
    if (yutuRecords.length === 0) { toast({ description: "暂无记录可整理", variant: "destructive" }); return; }

    setOrganizeProgressPercent(2);
    setOrganizingProgress("开始整理...");

    const progressInterval = setInterval(() => {
      setOrganizeProgressPercent(prev => {
        if (prev >= 95) return prev;
        const increment = Math.random() * 3 + 1;
        const next = prev + increment;
        return next > 95 ? 95 : Math.floor(next);
      });
    }, 600);

    organizeNotesMutation.mutate(undefined, {
      onSettled: () => clearInterval(progressInterval),
    });
  }, [isSuperUser, yutuRecords, toast, organizeNotesMutation]);

  useEffect(() => {
    if (hasAnalysisCompleted && knowledgeBaseEnabled) {
      setIsRecordingKnowledge(true);
    }
  }, [hasAnalysisCompleted, knowledgeBaseEnabled]);

  return {
    showYutuPanel, setShowYutuPanel,
    yutuHtmlContent,
    yutuRecords, setYutuRecords,
    searchKeyword, setSearchKeyword,
    editRecord, setEditRecord, showEditDialog, setShowEditDialog,
    showDeleteConfirm, setShowDeleteConfirm,
    yutuViewAsRegular, setYutuViewAsRegular,
    showOrganizePreview, setShowOrganizePreview,
    organizedRecords, setOrganizedRecords,
    isOrganizing, organizingProgress, setOrganizingProgress,
    organizeProgressPercent, setOrganizeProgressPercent,
    hasAnalysisCompleted, setHasAnalysisCompleted,
    knowledgeBaseEnabled, setKnowledgeBaseEnabled,
    externalKnowledgeEnabled, setExternalKnowledgeEnabled,
    isRecordingKnowledge, setIsRecordingKnowledge,
    isSuperUser,
    loadYutuHtml, loadYutuRecords,
    saveRecord, updateRecord, deleteRecord,
    organizeNotes,
  };
}
