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
  const [availableDatabaseNames, setAvailableDatabaseNames] = useState<string[]>([]);
  const [isLoadingDatabaseNames, setIsLoadingDatabaseNames] = useState(false);
  const [databaseListError, setDatabaseListError] = useState("");
  const [dbContextSummary, setDbContextSummary] = useState("");
  const [dbKnowledgeSummary, setDbKnowledgeSummary] = useState("");
  const [dbKnowledgeUpdatedAt, setDbKnowledgeUpdatedAt] = useState<string | null>(null);
  const [dbSchemaGraph, setDbSchemaGraph] = useState<any | null>(null);

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

  const fetchDatabaseNames = useCallback(async (options?: { silent?: boolean }) => {
    const normalizedType = normalizeDbType(dbType);
    const host = (dbConfig.host || "").trim() || "localhost";
    const user = (dbConfig.user || "").trim();
    const port = (dbConfig.port || "").trim() || getDefaultPort(normalizedType);
    const database = (dbConfig.database || "").trim();

    if (normalizedType === "sqlite") {
      setAvailableDatabaseNames(database ? [database] : []);
      setDatabaseListError("");
      return;
    }

    if (!host || !user) {
      setAvailableDatabaseNames([]);
      setDatabaseListError("");
      return;
    }

    if (port && !/^\d+$/.test(port)) {
      setAvailableDatabaseNames([]);
      setDatabaseListError("端口必须为数字");
      return;
    }

    setIsLoadingDatabaseNames(true);
    setDatabaseListError("");
    try {
      const res = await fetch(API_URLS.DB_LIST, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          db_type: normalizedType,
          config: {
            host,
            port,
            user,
            password: dbConfig.password || "",
            database,
          },
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.detail || "无法获取数据库列表");
      }

      const databaseItems: unknown[] = Array.isArray(data.databases) ? data.databases : [];
      const uniqueNames = new Set<string>();
      for (const item of databaseItems) {
        const normalizedName = String(item || "").trim();
        if (normalizedName) {
          uniqueNames.add(normalizedName);
        }
      }
      const names = Array.from(uniqueNames);

      setAvailableDatabaseNames(names);
      setDatabaseListError("");

      const firstDatabaseName = names[0] || "";
      if (!database && firstDatabaseName) {
        setDbConfig((prev) => ({ ...prev, database: firstDatabaseName }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法获取数据库列表";
      setAvailableDatabaseNames([]);
      setDatabaseListError(message);
      if (!options?.silent) {
        toast({ description: `获取数据库列表失败: ${message}`, variant: "destructive" });
      }
    } finally {
      setIsLoadingDatabaseNames(false);
    }
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
      void fetchDatabaseNames({ silent: true });
    },
    onError: (error) => {
      if (error.message !== "invalid_payload") {
        toast({ description: `连接失败: ${error.message}`, variant: "destructive" });
      }
    },
  });

  const generateSqlMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (!payload) throw new Error("invalid_payload");
      const res = await fetch(API_URLS.DB_GENERATE_SQL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          prompt: dbPrompt,
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

  const loadDbContextMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (!payload) throw new Error("invalid_payload");

      const res = await fetch(API_URLS.DB_CONTEXT_LOAD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          session_id: sessionId,
          username: currentUser || "default",
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.detail || "导入上下文失败");
      return data;
    },
    onSuccess: async (data) => {
      const summary = `已导入 ${data.table_count ?? 0} 张表、${data.column_count ?? 0} 个字段到当前上下文`;
      setDbContextSummary(summary);
      const knowledgeSummary = String(data.knowledge_summary || "").trim();
      setDbKnowledgeSummary(knowledgeSummary || summary);

      const loadedAtRaw = String(data.loaded_at || "").trim();
      if (loadedAtRaw) {
        setDbKnowledgeUpdatedAt(loadedAtRaw);
      } else {
        setDbKnowledgeUpdatedAt(new Date().toISOString());
      }

      toast({ description: `${summary}。后续分析将自动使用该数据库知识库。` });
      await onRefreshWorkspace();
    },
    onError: (error) => {
      if (error.message !== "invalid_payload") {
        toast({ description: `导入数据库上下文失败: ${error.message}`, variant: "destructive" });
      }
    },
  });

  const loadSchemaGraphMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (!payload) throw new Error("invalid_payload");

      const res = await fetch(API_URLS.DB_SCHEMA_GRAPH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.detail || "关系图生成失败");
      return data;
    },
    onSuccess: (data) => {
      setDbSchemaGraph(data.graph || null);
      toast({ description: data.message || "数据库表关系图已生成" });
    },
    onError: (error) => {
      if (error.message !== "invalid_payload") {
        toast({ description: `数据库关系图生成失败: ${error.message}`, variant: "destructive" });
      }
    },
  });

  useEffect(() => {
    setIsDbTested(false);
    setDbSchemaGraph(null);
  }, [dbConfig, dbType]);

  useEffect(() => {
    const normalizedType = normalizeDbType(dbType);
    if (normalizedType === "sqlite") {
      setAvailableDatabaseNames((dbConfig.database || "").trim() ? [(dbConfig.database || "").trim()] : []);
      setDatabaseListError("");
      return;
    }

    const host = (dbConfig.host || "").trim() || "localhost";
    const user = (dbConfig.user || "").trim();
    const port = (dbConfig.port || "").trim();
    if (!host || !user || (port && !/^\d+$/.test(port))) {
      setAvailableDatabaseNames([]);
      setDatabaseListError(port && !/^\d+$/.test(port) ? "端口必须为数字" : "");
      return;
    }

    const timer = window.setTimeout(() => {
      void fetchDatabaseNames({ silent: true });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [dbType, dbConfig.host, dbConfig.port, dbConfig.user, dbConfig.password, fetchDatabaseNames]);

  const testConnection = useCallback(() => {
    if (!testConnectionMutation.isPending) testConnectionMutation.mutate();
  }, [testConnectionMutation]);

  const generateSql = useCallback(() => {
    if (!generateSqlMutation.isPending && dbPrompt.trim()) generateSqlMutation.mutate();
  }, [generateSqlMutation, dbPrompt]);

  const executeSql = useCallback(() => {
    if (!executeSqlMutation.isPending && dbGeneratedSql.trim()) executeSqlMutation.mutate();
  }, [executeSqlMutation, dbGeneratedSql]);

  const loadDbContext = useCallback(() => {
    if (!loadDbContextMutation.isPending) loadDbContextMutation.mutate();
  }, [loadDbContextMutation]);

  const loadSchemaGraph = useCallback(() => {
    if (!loadSchemaGraphMutation.isPending) loadSchemaGraphMutation.mutate();
  }, [loadSchemaGraphMutation]);

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
    availableDatabaseNames,
    isLoadingDatabaseNames,
    databaseListError,
    dbContextSummary,
    dbKnowledgeSummary,
    dbKnowledgeUpdatedAt,
    dbSchemaGraph,
    testConnection, generateSql, executeSql,
    isLoadingDbContext: loadDbContextMutation.isPending,
    loadDbContext,
    isLoadingSchemaGraph: loadSchemaGraphMutation.isPending,
    loadSchemaGraph,
    fetchDatabaseNames,
    buildPayload,
    workspaceFilesRef,
  };
}
