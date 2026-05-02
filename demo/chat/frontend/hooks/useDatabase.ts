"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { API_URLS, type ModelProviderConfig } from "@/lib/config";
import { useToast } from "@/hooks/use-toast";

interface DbConfig {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

interface UseDatabaseOptions {
  sessionId: string;
  currentUser: string | null;
  modelProviderConfig: ModelProviderConfig;
  onRefreshWorkspace: () => Promise<void>;
}

export const normalizeDbType = (type: string) => {
  const normalized = (type || "").toLowerCase();
  if (normalized === "postgres") return "postgresql";
  if (normalized === "sqlserver") return "mssql";
  return normalized || "mysql";
};

export const getDefaultPort = (type: string) => {
  const map: Record<string, string> = {
    mysql: "3306", postgresql: "5432", mssql: "1433", oracle: "1521",
  };
  return map[normalizeDbType(type)] || "";
};

export function useDatabase({ sessionId, currentUser, modelProviderConfig, onRefreshWorkspace }: UseDatabaseOptions) {
  const { toast } = useToast();

  const [showDialog, setShowDialog] = useState(false);
  const [dbType, setDbType] = useState("mysql");
  const [dbConfig, setDbConfig] = useState<DbConfig>({
    host: "localhost", port: "3306", user: "root", password: "", database: "",
  });
  const [dbPrompt, setDbPrompt] = useState("");
  const [dbGeneratedSql, setDbGeneratedSql] = useState("");
  const [dbDatasetName, setDbDatasetName] = useState("query_result");
  const [dbExecuteMode, setDbExecuteMode] = useState<"overwrite" | "append">("overwrite");
  const [isDbTested, setIsDbTested] = useState(false);

  const workspaceFilesRef = useRef<{ name: string }[]>([]);

  const handleDbTypeChange = useCallback((nextType: string) => {
    const normalizedNextType = normalizeDbType(nextType);
    const previousDefaultPort = getDefaultPort(dbType);
    const nextDefaultPort = getDefaultPort(normalizedNextType);

    setDbType(normalizedNextType);
    setDbConfig((prev) => {
      const currentPort = (prev.port || "").trim();
      const shouldUseNextDefault =
        !currentPort || currentPort === previousDefaultPort || currentPort === "0";
      return {
        ...prev,
        port: shouldUseNextDefault ? nextDefaultPort : prev.port,
      };
    });
  }, [dbType]);

  const buildPayload = useCallback(() => {
    const normalizedType = normalizeDbType(dbType);
    const trimmedDatabase = (dbConfig.database || "").trim();
    if (!trimmedDatabase) {
      toast({
        description: normalizedType === "sqlite" ? "请填写 SQLite 文件路径" : "请填写数据库名称",
        variant: "destructive",
      });
      return null;
    }
    if (normalizedType === "sqlite") {
      return { db_type: normalizedType, config: { database: trimmedDatabase } };
    }
    const host = (dbConfig.host || "").trim() || "localhost";
    const user = (dbConfig.user || "").trim();
    const port = (dbConfig.port || "").trim() || getDefaultPort(normalizedType);
    if (port && !/^\d+$/.test(port)) {
      toast({ description: "端口必须为数字", variant: "destructive" });
      return null;
    }
    return {
      db_type: normalizedType,
      config: { host, port, user, password: dbConfig.password || "", database: trimmedDatabase },
    };
  }, [dbType, dbConfig, toast]);

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (!payload) throw new Error("invalid_payload");
      const res = await fetch(API_URLS.DB_TEST, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.detail || "未知错误");
      }
      return data;
    },
    onSuccess: () => {
      toast({ description: "数据库连接测试成功！" });
      setIsDbTested(true);
    },
    onError: (error) => {
      if (error.message !== "invalid_payload") {
        toast({ description: `连接失败: ${error.message}`, variant: "destructive" });
      }
    },
  });

  const generateSqlMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(API_URLS.DB_GENERATE_SQL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          db_type: normalizeDbType(dbType),
          prompt: dbPrompt,
          schema_info: "",
          model_provider: modelProviderConfig,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      return data;
    },
    onSuccess: (data) => {
      setDbGeneratedSql(data.sql);
    },
    onError: (error) => {
      toast({ description: `生成失败: ${error.message}`, variant: "destructive" });
    },
  });

  const executeSqlMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (!payload) throw new Error("invalid_payload");

      const fileName = `${dbDatasetName}.csv`;
      const fileExists = workspaceFilesRef.current.some(f => f.name === fileName);
      if (fileExists && dbExecuteMode === "overwrite") {
        if (!window.confirm(`文件 "${fileName}" 已存在，确定要覆盖它吗？`)) throw new Error("cancelled");
      }

      const res = await fetch(API_URLS.DB_EXECUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          sql: dbGeneratedSql,
          dataset_name: dbDatasetName,
          mode: dbExecuteMode,
          format: "csv",
          session_id: sessionId,
          username: currentUser || "default",
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.detail || "未知错误");
      return data;
    },
    onSuccess: async (data) => {
      toast({ description: `执行成功！结果已保存为 ${data.filename} (${data.row_count} 行)` });
      setShowDialog(false);
      await onRefreshWorkspace();
    },
    onError: (error) => {
      if (error.message !== "invalid_payload" && error.message !== "cancelled") {
        toast({ description: `执行失败: ${error.message}`, variant: "destructive" });
      }
    },
  });

  useEffect(() => {
    setIsDbTested(false);
  }, [dbConfig, dbType]);

  const testConnection = useCallback(() => {
    if (!testConnectionMutation.isPending) testConnectionMutation.mutate();
  }, [testConnectionMutation]);

  const generateSql = useCallback(() => {
    if (!generateSqlMutation.isPending && dbPrompt.trim()) generateSqlMutation.mutate();
  }, [generateSqlMutation, dbPrompt]);

  const executeSql = useCallback(() => {
    if (!executeSqlMutation.isPending && dbGeneratedSql.trim()) executeSqlMutation.mutate();
  }, [executeSqlMutation, dbGeneratedSql]);

  return {
    showDialog, setShowDialog,
    dbType, setDbType: handleDbTypeChange,
    dbConfig, setDbConfig,
    dbPrompt, setDbPrompt,
    dbGeneratedSql, setDbGeneratedSql,
    dbDatasetName, setDbDatasetName,
    dbExecuteMode, setDbExecuteMode,
    isTestingDb: testConnectionMutation.isPending,
    isGeneratingSql: generateSqlMutation.isPending,
    isExecutingDbSql: executeSqlMutation.isPending,
    isDbTested,
    testConnection, generateSql, executeSql,
    buildPayload,
    workspaceFilesRef,
  };
}
