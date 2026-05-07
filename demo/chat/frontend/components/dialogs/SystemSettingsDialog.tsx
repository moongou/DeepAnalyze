"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MODEL_PROVIDER_PRESETS, parseModelHeadersInput, type ModelProviderConfig } from "@/lib/config";
import { Database, RefreshCw, Sparkles, Play, ChevronDown, ChevronRight } from "lucide-react";
import {
  AnalysisHistorySettingsPanel,
  type AnalysisHistoryEvent,
  type AnalysisHistoryRunSummary,
  type AnalysisHistorySettings,
} from "./AnalysisHistorySettingsPanel";
import {
  DataDictionarySettingsPanel,
  type DataDictionaryKnowledgeEntry,
} from "./DataDictionarySettingsPanel";

interface DbConfig {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

interface SavedDatabaseConnection {
  id: string;
  dbType: string;
  label: string;
  config: {
    host?: string;
    port?: string;
    user?: string;
    password?: string;
    database: string;
  };
}

interface OnyxConfig {
  enabled: boolean;
  base_url: string;
  api_key: string;
  search_path: string;
  has_api_key: boolean;
}

interface DifyConfig {
  enabled: boolean;
  base_url: string;
  api_key: string;
  workflow_id: string;
  has_api_key: boolean;
}

interface ModelTestStatus {
  status: string;
  message: string;
  testedAt: string | null;
}

interface SystemSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemSettingsTab: "model" | "database" | "knowledge" | "history" | "dictionary";
  setSystemSettingsTab: (tab: "model" | "database" | "knowledge" | "history" | "dictionary") => void;
  // Model tab
  modelProviderConfig: ModelProviderConfig;
  setModelProviderConfig: React.Dispatch<React.SetStateAction<ModelProviderConfig>>;
  applyModelPreset: (presetId: string) => void;
  showRawModelHeaders: boolean;
  setShowRawModelHeaders: (v: boolean) => void;
  modelHeadersInput: string;
  setModelHeadersInput: (v: string) => void;
  handleFetchModelList: () => void;
  isFetchingModelList: boolean;
  handleSaveModelConfig: () => void;
  modelTestStatus: ModelTestStatus;
  availableModels: string[];
  // Database tab
  dbType: string;
  handleDbTypeChange: (type: string) => void;
  dbConfig: DbConfig;
  setDbConfig: (config: DbConfig) => void;
  getDefaultPort: (type: string) => string;
  availableDatabaseNames: string[];
  isLoadingDatabaseNames: boolean;
  databaseListError: string;
  dbContextSummary: string;
  dbKnowledgeSummary: string;
  dbKnowledgeUpdatedAt: string | null;
  isLoadingDbContext: boolean;
  handleLoadDbContext: () => void;
  handleFetchDatabaseNames: () => void;
  handleTestConnection: () => void;
  isTestingDb: boolean;
  isDbTested: boolean;
  dbPrompt: string;
  setDbPrompt: (v: string) => void;
  handleGenerateSql: () => void;
  isGeneratingSql: boolean;
  dbGeneratedSql: string;
  setDbGeneratedSql: (v: string) => void;
  dbDatasetName: string;
  setDbDatasetName: (v: string) => void;
  dbExecuteMode: "overwrite" | "append";
  setDbExecuteMode: (v: any) => void;
  handleExecuteDbSql: () => void;
  isExecutingDbSql: boolean;
  handleSaveDatabaseConfig: () => void;
  savedDbConnections: SavedDatabaseConnection[];
  selectedDbSourceIds: string[];
  handleToggleSavedDbSourceSelection: (connectionId: string, checked: boolean) => void;
  handleApplySavedDbConnection: (connectionId: string) => void;
  handleDeleteSavedDbConnection: (connectionId: string) => void;
  deletingDbConnectionId: string | null;
  // Analysis history tab
  analysisHistorySettings: AnalysisHistorySettings;
  setAnalysisHistorySettings: React.Dispatch<React.SetStateAction<AnalysisHistorySettings>>;
  analysisHistoryRuns: AnalysisHistoryRunSummary[];
  analysisHistoryStats: { total: number; completed: number; failed: number; warning: number };
  selectedAnalysisHistoryRun: AnalysisHistoryRunSummary | null;
  analysisHistoryEvents: AnalysisHistoryEvent[];
  isLoadingAnalysisHistory: boolean;
  isLoadingAnalysisHistoryDetail: boolean;
  isSavingAnalysisHistorySettings: boolean;
  handleRefreshAnalysisHistory: () => void;
  handleSelectAnalysisHistoryRun: (runId: string) => void;
  handleSaveAnalysisHistorySettings: () => void;
  // Data dictionary tab
  dataDictionaryEntries: DataDictionaryKnowledgeEntry[];
  dataDictionaryTotal: number;
  isLoadingDataDictionary: boolean;
  isDeletingDataDictionary: boolean;
  isImportingDataDictionary: boolean;
  handleRefreshDataDictionary: () => void;
  handleDeleteDataDictionaryEntries: (ids: string[]) => Promise<void>;
  handleSaveDataDictionaryEntry: (id: string, aiUnderstanding: string) => Promise<void>;
  handleImportDataDictionaryFile: (file: File) => Promise<void>;
  // Knowledge tab
  isLoadingKnowledgeConfig: boolean;
  loadKnowledgeConfig: () => void;
  knowledgeBaseEnabled: boolean;
  setKnowledgeBaseEnabled: (v: boolean) => void;
  yutuRecords: any[];
  currentUser: string | null;
  isRecordingKnowledge: boolean;
  knowledgePreferredView: "html" | "table";
  setKnowledgePreferredView: (v: "html" | "table") => void;
  showKnowledgeHints: boolean;
  setShowKnowledgeHints: (v: boolean) => void;
  autoOpenYutuAfterAnalysis: boolean;
  setAutoOpenYutuAfterAnalysis: (v: boolean) => void;
  externalKnowledgeEnabled: boolean;
  setExternalKnowledgeEnabled: (v: boolean) => void;
  onyxConfig: OnyxConfig;
  setOnyxConfig: React.Dispatch<React.SetStateAction<OnyxConfig>>;
  difyConfig: DifyConfig;
  setDifyConfig: React.Dispatch<React.SetStateAction<DifyConfig>>;
  knowledgeTestResults: Record<string, { status: string; message: string; tested_at: string | null }>;
  handleTestKnowledgeProvider: (provider: "onyx" | "dify" | "all") => void;
  knowledgeTestTarget: "onyx" | "dify" | "all" | null;
  isSavingKnowledgeConfig: boolean;
  handleSaveKnowledgeConfig: () => void;
  knowledgeSettingsLoaded: boolean;
}

const DB_TYPES = [
  { id: "mysql", label: "MySQL", icon: "🐬" },
  { id: "mssql", label: "SQL Server", icon: "🪟" },
  { id: "postgresql", label: "PostgreSQL", icon: "🐘" },
  { id: "oracle", label: "Oracle", icon: "🏢" },
  { id: "sqlite", label: "SQLite", icon: "📂" },
];

export function SystemSettingsDialog({
  open, onOpenChange, systemSettingsTab, setSystemSettingsTab,
  modelProviderConfig, setModelProviderConfig, applyModelPreset,
  showRawModelHeaders, setShowRawModelHeaders, modelHeadersInput, setModelHeadersInput,
  handleFetchModelList, isFetchingModelList, handleSaveModelConfig,
  modelTestStatus, availableModels,
  dbType, handleDbTypeChange, dbConfig, setDbConfig, getDefaultPort,
  availableDatabaseNames, isLoadingDatabaseNames, databaseListError,
  dbContextSummary, dbKnowledgeSummary, dbKnowledgeUpdatedAt,
  isLoadingDbContext, handleLoadDbContext, handleFetchDatabaseNames,
  handleTestConnection, isTestingDb, isDbTested,
  dbPrompt, setDbPrompt, handleGenerateSql, isGeneratingSql,
  dbGeneratedSql, setDbGeneratedSql, dbDatasetName, setDbDatasetName,
  dbExecuteMode, setDbExecuteMode, handleExecuteDbSql, isExecutingDbSql,
  handleSaveDatabaseConfig,
  savedDbConnections, selectedDbSourceIds,
  handleToggleSavedDbSourceSelection, handleApplySavedDbConnection, handleDeleteSavedDbConnection,
  deletingDbConnectionId,
  analysisHistorySettings, setAnalysisHistorySettings,
  analysisHistoryRuns, analysisHistoryStats,
  selectedAnalysisHistoryRun, analysisHistoryEvents,
  isLoadingAnalysisHistory, isLoadingAnalysisHistoryDetail,
  isSavingAnalysisHistorySettings,
  handleRefreshAnalysisHistory, handleSelectAnalysisHistoryRun, handleSaveAnalysisHistorySettings,
  dataDictionaryEntries, dataDictionaryTotal,
  isLoadingDataDictionary, isDeletingDataDictionary, isImportingDataDictionary,
  handleRefreshDataDictionary, handleDeleteDataDictionaryEntries, handleSaveDataDictionaryEntry, handleImportDataDictionaryFile,
  isLoadingKnowledgeConfig, loadKnowledgeConfig,
  knowledgeBaseEnabled, setKnowledgeBaseEnabled,
  yutuRecords, currentUser, isRecordingKnowledge,
  knowledgePreferredView, setKnowledgePreferredView,
  showKnowledgeHints, setShowKnowledgeHints,
  autoOpenYutuAfterAnalysis, setAutoOpenYutuAfterAnalysis,
  externalKnowledgeEnabled, setExternalKnowledgeEnabled,
  onyxConfig, setOnyxConfig, difyConfig, setDifyConfig,
  knowledgeTestResults, handleTestKnowledgeProvider, knowledgeTestTarget,
  isSavingKnowledgeConfig, handleSaveKnowledgeConfig, knowledgeSettingsLoaded,
}: SystemSettingsDialogProps) {
  const formattedDbKnowledgeUpdatedAt = dbKnowledgeUpdatedAt
    ? (() => {
        const parsed = new Date(dbKnowledgeUpdatedAt);
        if (Number.isNaN(parsed.getTime())) {
          return dbKnowledgeUpdatedAt;
        }
        return parsed.toLocaleString("zh-CN", { hour12: false });
      })()
    : "-";

  const [expandedDbGroups, setExpandedDbGroups] = useState<Record<string, boolean>>({});
  const [pendingDeleteConnection, setPendingDeleteConnection] = useState<SavedDatabaseConnection | null>(null);
  const dbGroupStateStorageKey = useMemo(() => {
    const normalizedUser = String(currentUser || "default").trim() || "default";
    return `dbGroupExpandedState:${normalizedUser}`;
  }, [currentUser]);

  const dbTypeMeta = useMemo(() => {
    const typeMap: Record<string, { label: string; icon: string }> = {};
    DB_TYPES.forEach((item) => {
      typeMap[item.id] = { label: item.label, icon: item.icon };
    });
    return typeMap;
  }, []);

  const groupedSavedConnections = useMemo(() => {
    const grouped: Record<string, SavedDatabaseConnection[]> = {};
    savedDbConnections.forEach((connection) => {
      const key = connection.dbType || "unknown";
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(connection);
    });

    const order = DB_TYPES.map((item) => item.id);
    return Object.entries(grouped).sort((left, right) => {
      const leftIndex = order.indexOf(left[0]);
      const rightIndex = order.indexOf(right[0]);
      const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
      if (normalizedLeft !== normalizedRight) {
        return normalizedLeft - normalizedRight;
      }
      return left[0].localeCompare(right[0]);
    });
  }, [savedDbConnections]);

  const selectedDbSourceIdSet = useMemo(() => new Set(selectedDbSourceIds), [selectedDbSourceIds]);

  const isGroupExpanded = (groupType: string) => {
    if (expandedDbGroups[groupType] !== undefined) {
      return expandedDbGroups[groupType];
    }
    return groupType === dbType;
  };

  const toggleDbGroup = (groupType: string) => {
    setExpandedDbGroups((prev) => {
      const nextValue = !(prev[groupType] ?? groupType === dbType);
      return {
        ...prev,
        [groupType]: nextValue,
      };
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = localStorage.getItem(dbGroupStateStorageKey);
      if (!raw) {
        setExpandedDbGroups({});
        return;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setExpandedDbGroups({});
        return;
      }

      const normalized: Record<string, boolean> = {};
      Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
        if (typeof value === "boolean") {
          normalized[key] = value;
        }
      });

      setExpandedDbGroups(normalized);
    } catch {
      setExpandedDbGroups({});
    }
  }, [dbGroupStateStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      localStorage.setItem(dbGroupStateStorageKey, JSON.stringify(expandedDbGroups));
    } catch {
      // 忽略浏览器存储异常，保持界面可用
    }
  }, [dbGroupStateStorageKey, expandedDbGroups]);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-page-like max-w-none w-auto h-auto p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            系统设置
          </DialogTitle>
          <DialogDescription>
            统一管理模型配置、数据库连接、知识库、数据字典与分析历史追踪设置。
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden px-6 py-4">
          <Tabs value={systemSettingsTab} onValueChange={(value) => setSystemSettingsTab(value as "model" | "database" | "knowledge" | "history" | "dictionary")} className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-5 max-w-[920px]">
              <TabsTrigger value="model">模型设置</TabsTrigger>
              <TabsTrigger value="database">数据库设置</TabsTrigger>
              <TabsTrigger value="knowledge">知识库设置</TabsTrigger>
              <TabsTrigger value="dictionary">数据字典</TabsTrigger>
              <TabsTrigger value="history">分析历史</TabsTrigger>
            </TabsList>

            <TabsContent value="model" className="mt-4 flex-1 overflow-y-auto">
              <section className="space-y-4">
                <div className="rounded-lg border bg-white p-4 dark:bg-gray-950">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">模型配置测试</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        先获取当前提供商可用模型，再直接选择目标模型。
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleFetchModelList}
                        disabled={isFetchingModelList}
                      >
                        {isFetchingModelList ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : null}
                        获取模型名称
                      </Button>
                      <Button size="sm" onClick={handleSaveModelConfig}>
                        保存当前提供商
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-gray-600 dark:text-gray-300 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-md border bg-gray-50 px-3 py-2 dark:bg-gray-900/30">状态：{modelTestStatus.status}</div>
                    <div className="rounded-md border bg-gray-50 px-3 py-2 dark:bg-gray-900/30">结果：{modelTestStatus.message}</div>
                    <div className="rounded-md border bg-gray-50 px-3 py-2 dark:bg-gray-900/30">时间：{modelTestStatus.testedAt || "-"}</div>
                    <div className="rounded-md border bg-gray-50 px-3 py-2 dark:bg-gray-900/30">当前模型：{modelProviderConfig.model || "-"}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="model-preset">预设模型</Label>
                    <Select value={modelProviderConfig.id} onValueChange={applyModelPreset}>
                      <SelectTrigger id="model-preset">
                        <SelectValue placeholder="选择模型预设" />
                      </SelectTrigger>
                      <SelectContent>
                        {MODEL_PROVIDER_PRESETS.map((preset) => (
                          <SelectItem key={preset.id} value={preset.id}>
                            {preset.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="model-provider-type">Provider 类型</Label>
                    <Input
                      id="model-provider-type"
                      value={modelProviderConfig.providerType}
                      onChange={(e) =>
                        setModelProviderConfig((prev) => ({
                          ...prev,
                          providerType: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="model-label">显示名称</Label>
                    <Input
                      id="model-label"
                      value={modelProviderConfig.label}
                      onChange={(e) =>
                        setModelProviderConfig((prev) => ({ ...prev, label: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="model-name">模型名</Label>
                    {availableModels.length > 0 ? (
                      <Select
                        value={modelProviderConfig.model}
                        onValueChange={(value) =>
                          setModelProviderConfig((prev) => ({ ...prev, model: value }))
                        }
                      >
                        <SelectTrigger id="model-name">
                          <SelectValue placeholder="从已获取模型列表中选择" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableModels.map((modelName) => (
                            <SelectItem key={modelName} value={modelName}>
                              {modelName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="model-name"
                        value={modelProviderConfig.model}
                        onChange={(e) =>
                          setModelProviderConfig((prev) => ({ ...prev, model: e.target.value }))
                        }
                      />
                    )}
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      {availableModels.length > 0
                        ? `已获取 ${availableModels.length} 个模型，选择即生效。`
                        : "未获取模型列表时可手动输入模型名称。"}
                    </div>
                  </div>

                  <div className="space-y-1.5 md:col-span-2 xl:col-span-2">
                    <Label htmlFor="model-base-url">Base URL</Label>
                    <Input
                      id="model-base-url"
                      value={modelProviderConfig.baseUrl}
                      onChange={(e) =>
                        setModelProviderConfig((prev) => ({ ...prev, baseUrl: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
                    <Label htmlFor="model-api-key">API Key</Label>
                    <Input
                      id="model-api-key"
                      type="password"
                      value={modelProviderConfig.apiKey}
                      onChange={(e) =>
                        setModelProviderConfig((prev) => ({ ...prev, apiKey: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
                    <Label htmlFor="model-description">描述</Label>
                    <Input
                      id="model-description"
                      value={modelProviderConfig.description}
                      onChange={(e) =>
                        setModelProviderConfig((prev) => ({ ...prev, description: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="rounded-lg border bg-gray-50 p-4 dark:bg-gray-900/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">自定义请求头</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        用于兼容自定义 OpenAI 接口、网关或厂商额外认证头。
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowRawModelHeaders(!showRawModelHeaders)}>
                      {showRawModelHeaders ? "收起" : "展开"}
                    </Button>
                  </div>
                  {showRawModelHeaders ? (
                    <Textarea
                      value={modelHeadersInput}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setModelHeadersInput(nextValue);
                        setModelProviderConfig((prev) => ({
                          ...prev,
                          headers: parseModelHeadersInput(nextValue),
                        }));
                      }}
                      className="mt-3 min-h-[96px] font-mono text-xs"
                      placeholder={"Authorization: Bearer xxx\nX-Trace-Id: demo"}
                    />
                  ) : null}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="database" className="mt-4 flex-1 overflow-y-auto">
              <div className="h-full min-h-0 overflow-hidden rounded-lg border">
                <ResizablePanelGroup direction="horizontal" className="h-full min-h-[560px]">
                  <ResizablePanel defaultSize={20} minSize={15} className="bg-gray-50 dark:bg-gray-900/20 border-r">
                    <div className="p-4 space-y-4">
                      <Label className="text-sm font-semibold">选择数据库类型</Label>
                      <RadioGroup value={dbType} onValueChange={handleDbTypeChange} className="space-y-2">
                        {DB_TYPES.map((item) => (
                          <div key={item.id} className="flex items-center space-x-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <RadioGroupItem value={item.id} id={`system-${item.id}`} />
                            <Label htmlFor={`system-${item.id}`} className="flex-1 cursor-pointer flex items-center gap-2">
                              <span>{item.icon}</span>
                              <span>{item.label}</span>
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  </ResizablePanel>

                  <ResizableHandle withHandle />

                  <ResizablePanel defaultSize={80} minSize={50}>
                    <div className="h-full flex flex-col overflow-hidden">
                      <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        <section className="space-y-3">
                          <h3 className="text-sm font-semibold flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">1</span>
                            配置连接信息
                          </h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label htmlFor="system-db-host">主机名 / 地址</Label>
                              <Input id="system-db-host" placeholder="localhost" value={dbConfig.host} onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="system-db-port">端口</Label>
                              <Input id="system-db-port" placeholder={getDefaultPort(dbType)} value={dbConfig.port} onChange={(e) => setDbConfig({ ...dbConfig, port: e.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="system-db-user">用户名</Label>
                              <Input id="system-db-user" value={dbConfig.user} onChange={(e) => setDbConfig({ ...dbConfig, user: e.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="system-db-pass">密码</Label>
                              <Input id="system-db-pass" type="password" value={dbConfig.password} onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })} />
                            </div>
                            <div className="col-span-2 space-y-1.5">
                              <Label htmlFor="system-db-name">{dbType === "sqlite" ? "SQLite 文件绝对路径" : "数据库名称"}</Label>
                              {dbType !== "sqlite" && availableDatabaseNames.length > 0 ? (
                                <Select
                                  value={dbConfig.database || undefined}
                                  onValueChange={(value) => setDbConfig({ ...dbConfig, database: value })}
                                >
                                  <SelectTrigger id="system-db-name">
                                    <SelectValue placeholder="请选择数据库名称" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableDatabaseNames.map((name) => (
                                      <SelectItem key={name} value={name}>
                                        {name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input id="system-db-name" value={dbConfig.database} onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })} />
                              )}
                              {databaseListError ? <div className="text-xs text-amber-600">数据库列表加载失败：{databaseListError}</div> : null}
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleLoadDbContext}
                              disabled={isLoadingDbContext}
                            >
                              {isLoadingDbContext ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : null}
                              将当前数据库所有信息作为上下文
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleFetchDatabaseNames} disabled={isLoadingDatabaseNames || dbType === "sqlite"}>
                              {isLoadingDatabaseNames ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : null}
                              刷新数据库列表
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={isTestingDb}>
                              {isTestingDb ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : null}
                              测试连接
                            </Button>
                          </div>
                          <div className="rounded-lg border p-4 space-y-3 bg-white dark:bg-gray-950">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-medium">已保存连接管理</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  共 {savedDbConnections.length} 条连接，已勾选 {selectedDbSourceIds.length} 条作为分析数据源
                                </div>
                              </div>
                              <Button size="sm" variant="outline" onClick={handleSaveDatabaseConfig}>
                                保存当前连接
                              </Button>
                            </div>

                            {groupedSavedConnections.length === 0 ? (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                当前暂无已保存连接。可先填写上方配置并点击“保存当前连接”。
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {groupedSavedConnections.map(([groupType, connections]) => {
                                  const expanded = isGroupExpanded(groupType);
                                  const selectedCount = connections.filter((item) => selectedDbSourceIdSet.has(item.id)).length;
                                  const typeInfo = dbTypeMeta[groupType] || {
                                    label: groupType.toUpperCase(),
                                    icon: "🗂️",
                                  };

                                  return (
                                    <div key={groupType} className="rounded-md border border-gray-200 dark:border-gray-800 overflow-hidden">
                                      <button
                                        type="button"
                                        onClick={() => toggleDbGroup(groupType)}
                                        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-900/70 transition-colors"
                                      >
                                        <div className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-100">
                                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                          <span>{typeInfo.icon}</span>
                                          <span>{typeInfo.label}</span>
                                          <span className="text-xs text-gray-500 dark:text-gray-400">({connections.length})</span>
                                        </div>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">已选 {selectedCount} 条</span>
                                      </button>

                                      {expanded ? (
                                        <div className="p-3 space-y-2 border-t border-gray-200 dark:border-gray-800">
                                          {connections.map((connection) => {
                                            const selected = selectedDbSourceIdSet.has(connection.id);
                                            const deleting = deletingDbConnectionId === connection.id;
                                            const endpointText =
                                              connection.dbType === "sqlite"
                                                ? `文件: ${connection.config.database}`
                                                : `用户: ${connection.config.user || "(未填写)"} | ${connection.config.host || "localhost"}:${connection.config.port || "default"}/${connection.config.database}`;

                                            return (
                                              <div
                                                key={connection.id}
                                                className="rounded-md border border-gray-200 dark:border-gray-800 p-3 space-y-2"
                                              >
                                                <div className="flex items-start justify-between gap-3">
                                                  <div className="min-w-0">
                                                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100 break-all">
                                                      {connection.label}
                                                    </div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-all">
                                                      {endpointText}
                                                    </div>
                                                  </div>
                                                  <Switch
                                                    checked={selected}
                                                    onCheckedChange={(checked) =>
                                                      handleToggleSavedDbSourceSelection(connection.id, Boolean(checked))
                                                    }
                                                  />
                                                </div>
                                                <div className="flex justify-end gap-2">
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleApplySavedDbConnection(connection.id)}
                                                  >
                                                    应用
                                                  </Button>
                                                  <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() => setPendingDeleteConnection(connection)}
                                                    disabled={deleting}
                                                  >
                                                    {deleting ? "删除中..." : "删除"}
                                                  </Button>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          {dbContextSummary ? (
                            <div className="space-y-1 text-right">
                              <div className="text-xs text-emerald-600 dark:text-emerald-400">{dbContextSummary}</div>
                              {dbKnowledgeSummary ? (
                                <div className="text-xs text-sky-600 dark:text-sky-400">知识库摘要：{dbKnowledgeSummary}</div>
                              ) : null}
                              <div className="text-xs text-gray-500 dark:text-gray-400">最近一次知识库更新时间：{formattedDbKnowledgeUpdatedAt}</div>
                            </div>
                          ) : null}
                        </section>

                        <section className={`space-y-3 transition-opacity ${!isDbTested ? "opacity-50 pointer-events-none" : ""}`}>
                          <h3 className="text-sm font-semibold flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">2</span>
                            智能生成查询语句
                            {!isDbTested && <span className="text-xs font-normal text-amber-600 ml-2">(请先完成步骤 1 测试连接)</span>}
                          </h3>
                          <div className="space-y-2">
                            <Textarea
                              placeholder="描述您的查询需求，例如：统计过去三个月每个月的进出口额总计，并按月份排序"
                              className="min-h-[80px] resize-none"
                              value={dbPrompt}
                              onChange={(e) => setDbPrompt(e.target.value)}
                            />
                            <div className="flex justify-end">
                              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleGenerateSql} disabled={isGeneratingSql || !dbPrompt.trim()}>
                                {isGeneratingSql ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : <Sparkles className="mr-2 h-3 w-3" />}
                                生成 SQL
                              </Button>
                            </div>
                          </div>
                        </section>

                        <section className={`space-y-3 transition-opacity ${!isDbTested ? "opacity-50 pointer-events-none" : ""}`}>
                          <h3 className="text-sm font-semibold flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">3</span>
                            预览并执行 SQL
                          </h3>
                          <div className="space-y-2">
                            <Textarea className="min-h-[120px] font-mono text-sm" value={dbGeneratedSql} onChange={(e) => setDbGeneratedSql(e.target.value)} spellCheck={false} />
                            <div className="grid grid-cols-2 gap-4 items-end bg-gray-50 dark:bg-gray-900/40 p-4 rounded-lg border">
                              <div className="space-y-1.5">
                                <Label htmlFor="system-dataset-name">保存为数据集名称</Label>
                                <Input id="system-dataset-name" value={dbDatasetName} onChange={(e) => setDbDatasetName(e.target.value)} />
                              </div>
                              <div className="space-y-1.5">
                                <Label>执行模式</Label>
                                <Select value={dbExecuteMode} onValueChange={setDbExecuteMode}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="overwrite">覆盖现有文件</SelectItem>
                                    <SelectItem value="append">追加到现有文件</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        </section>
                      </div>

                      <div className="px-6 py-4 border-t bg-gray-50 dark:bg-gray-950 flex justify-end gap-3">
                        <Button
                          className="bg-green-600 hover:bg-green-700 text-white min-w-[120px]"
                          onClick={handleExecuteDbSql}
                          disabled={isExecutingDbSql || !dbGeneratedSql.trim()}
                        >
                          {isExecutingDbSql ? (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                              正在导入...
                            </>
                          ) : (
                            <>
                              <Play className="mr-2 h-4 w-4" />
                              立即执行并导入
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-0 flex-1 min-h-0 overflow-hidden">
              <AnalysisHistorySettingsPanel
                settings={analysisHistorySettings}
                setSettings={setAnalysisHistorySettings}
                runs={analysisHistoryRuns}
                stats={analysisHistoryStats}
                selectedRun={selectedAnalysisHistoryRun}
                events={analysisHistoryEvents}
                isLoading={isLoadingAnalysisHistory}
                isLoadingDetail={isLoadingAnalysisHistoryDetail}
                isSaving={isSavingAnalysisHistorySettings}
                onRefresh={handleRefreshAnalysisHistory}
                onSave={handleSaveAnalysisHistorySettings}
                onSelectRun={handleSelectAnalysisHistoryRun}
              />
            </TabsContent>

            <TabsContent value="dictionary" className="mt-0 flex-1 overflow-hidden">
              <DataDictionarySettingsPanel
                entries={dataDictionaryEntries}
                total={dataDictionaryTotal}
                isLoading={isLoadingDataDictionary}
                isDeleting={isDeletingDataDictionary}
                isImporting={isImportingDataDictionary}
                onRefresh={handleRefreshDataDictionary}
                onDelete={handleDeleteDataDictionaryEntries}
                onSaveUnderstanding={handleSaveDataDictionaryEntry}
                onImportFile={handleImportDataDictionaryFile}
              />
            </TabsContent>

            <TabsContent value="knowledge" className="mt-4 flex-1 overflow-y-auto space-y-6">
              <section className="space-y-6">
                <div className="rounded-lg border p-4 bg-white dark:bg-gray-950 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium">内部知识库（雨途斩棘录）</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">保留当前 Yutu 注入与右上角独立入口。这里负责正式配置与状态查看。</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isLoadingKnowledgeConfig ? <RefreshCw className="h-4 w-4 animate-spin text-gray-400" /> : null}
                      <Button variant="outline" size="sm" onClick={loadKnowledgeConfig} disabled={isLoadingKnowledgeConfig}>
                        刷新配置
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <div className="text-sm font-medium">启用内部知识库</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">控制当前会话是否继续使用雨途知识注入。</div>
                      </div>
                      <Switch checked={knowledgeBaseEnabled} onCheckedChange={setKnowledgeBaseEnabled} />
                    </div>
                    <div className="rounded-lg border p-4 space-y-2 bg-gray-50 dark:bg-gray-900/30">
                      <div className="text-sm font-medium">当前状态摘要</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">内部知识库：{knowledgeBaseEnabled ? "已启用" : "已停用"}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">雨途记录数：{yutuRecords.length}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">当前用户：{currentUser === "rainforgrain" ? "超级用户" : "普通用户"}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">知识记录中：{isRecordingKnowledge ? "是" : "否"}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>默认知识库视图</Label>
                      <Select value={knowledgePreferredView} onValueChange={(value: "html" | "table") => setKnowledgePreferredView(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="html">HTML 视图</SelectItem>
                          <SelectItem value="table">表格视图</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-md border p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">显示知识提示</div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400">仅影响前端提示文案显示。</div>
                        </div>
                        <Switch checked={showKnowledgeHints} onCheckedChange={setShowKnowledgeHints} />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">分析后提示打开雨途</div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400">仅影响界面提示，不强制自动打开。</div>
                        </div>
                        <Switch checked={autoOpenYutuAfterAnalysis} onCheckedChange={setAutoOpenYutuAfterAnalysis} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-4 bg-white dark:bg-gray-950 space-y-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium">外部知识服务（本地 Docker）</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">正式保存并测试本地 Docker 下的 Onyx 与 Dify Workflow 配置。</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 dark:text-gray-400">启用外部知识服务</span>
                      <Switch checked={externalKnowledgeEnabled} onCheckedChange={setExternalKnowledgeEnabled} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg border p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">Onyx</div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400">测试服务可达性 + 检索接口。</div>
                        </div>
                        <Switch checked={onyxConfig.enabled} onCheckedChange={(checked) => setOnyxConfig((prev) => ({ ...prev, enabled: checked }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Base URL</Label>
                        <Input value={onyxConfig.base_url} onChange={(e) => setOnyxConfig((prev) => ({ ...prev, base_url: e.target.value }))} placeholder="http://localhost:3000" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>API Key</Label>
                        <Input
                          type="password"
                          value={onyxConfig.api_key}
                          onChange={(e) => setOnyxConfig((prev) => ({ ...prev, api_key: e.target.value, has_api_key: prev.has_api_key || Boolean(e.target.value) }))}
                          placeholder={onyxConfig.has_api_key ? "已保存，留空则保持不变" : "按需填写 API Key"}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>检索路径</Label>
                        <Input value={onyxConfig.search_path} onChange={(e) => setOnyxConfig((prev) => ({ ...prev, search_path: e.target.value }))} placeholder="/api/chat/search" />
                      </div>
                      <div className="rounded-md border bg-gray-50 dark:bg-gray-900/30 p-3 text-xs text-gray-600 dark:text-gray-300 space-y-1">
                        <div>状态：{knowledgeTestResults.onyx?.status || "never_tested"}</div>
                        <div>结果：{knowledgeTestResults.onyx?.message || "尚未测试"}</div>
                        <div>时间：{knowledgeTestResults.onyx?.tested_at || "-"}</div>
                      </div>
                      <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => handleTestKnowledgeProvider("onyx")} disabled={knowledgeTestTarget !== null || isSavingKnowledgeConfig}>
                          {knowledgeTestTarget === "onyx" ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : null}
                          测试 Onyx
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-lg border p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">Dify Workflow</div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400">测试 Workflow API、鉴权和 workflow_id。</div>
                        </div>
                        <Switch checked={difyConfig.enabled} onCheckedChange={(checked) => setDifyConfig((prev) => ({ ...prev, enabled: checked }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Base URL</Label>
                        <Input value={difyConfig.base_url} onChange={(e) => setDifyConfig((prev) => ({ ...prev, base_url: e.target.value }))} placeholder="http://localhost:5000" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>API Key</Label>
                        <Input
                          type="password"
                          value={difyConfig.api_key}
                          onChange={(e) => setDifyConfig((prev) => ({ ...prev, api_key: e.target.value, has_api_key: prev.has_api_key || Boolean(e.target.value) }))}
                          placeholder={difyConfig.has_api_key ? "已保存，留空则保持不变" : "请输入 Dify API Key"}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Workflow ID</Label>
                        <Input value={difyConfig.workflow_id} onChange={(e) => setDifyConfig((prev) => ({ ...prev, workflow_id: e.target.value }))} placeholder="workflow-xxxx" />
                      </div>
                      <div className="rounded-md border bg-gray-50 dark:bg-gray-900/30 p-3 text-xs text-gray-600 dark:text-gray-300 space-y-1">
                        <div>状态：{knowledgeTestResults.dify?.status || "never_tested"}</div>
                        <div>结果：{knowledgeTestResults.dify?.message || "尚未测试"}</div>
                        <div>时间：{knowledgeTestResults.dify?.tested_at || "-"}</div>
                      </div>
                      <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => handleTestKnowledgeProvider("dify")} disabled={knowledgeTestTarget !== null || isSavingKnowledgeConfig}>
                          {knowledgeTestTarget === "dify" ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : null}
                          测试 Dify
                        </Button>
                      </div>
                    </div>
                  </div>

                  {showKnowledgeHints ? (
                    <div className="rounded-lg border border-dashed p-4 text-xs text-gray-500 dark:text-gray-400">
                      建议先保存，再分别测试 Onyx 与 Dify。保存成功不代表可用，只有测试通过才会更新最近测试状态。
                    </div>
                  ) : null}
                </div>
              </section>
            </TabsContent>
          </Tabs>
        </div>
        <AlertDialog
          open={Boolean(pendingDeleteConnection)}
          onOpenChange={(open) => {
            if (!open) {
              setPendingDeleteConnection(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除数据库连接？</AlertDialogTitle>
              <AlertDialogDescription>
                将删除连接“{pendingDeleteConnection?.label || ""}”，此操作不可撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  variant="destructive"
                  disabled={
                    !pendingDeleteConnection || deletingDbConnectionId === pendingDeleteConnection.id
                  }
                  onClick={async () => {
                    if (!pendingDeleteConnection) {
                      return;
                    }
                    const target = pendingDeleteConnection;
                    await handleDeleteSavedDbConnection(target.id);
                    setPendingDeleteConnection(null);
                  }}
                >
                  {pendingDeleteConnection && deletingDbConnectionId === pendingDeleteConnection.id
                    ? "删除中..."
                    : "确认删除"}
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <DialogFooter className="px-6 py-4 border-t justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            {systemSettingsTab === "model"
              ? "模型提供商配置编辑中"
              : systemSettingsTab === "database"
                ? `数据库测试状态：${isDbTested ? "已通过" : "未测试"}`
                : systemSettingsTab === "dictionary"
                  ? `AI 数据字典理解 ${dataDictionaryTotal} 条`
                : systemSettingsTab === "history"
                  ? `已加载分析历史 ${analysisHistoryRuns.length} 条`
                : knowledgeSettingsLoaded
                  ? "配置已加载"
                  : "尚未加载配置"}
          </div>
          <div className="flex items-center gap-2">
            {systemSettingsTab === "model" ? (
              <Button onClick={handleSaveModelConfig}>保存模型配置</Button>
            ) : null}
            {systemSettingsTab === "database" ? (
              <Button onClick={handleSaveDatabaseConfig}>保存数据库配置</Button>
            ) : null}
            {systemSettingsTab === "history" ? (
              <Button onClick={handleSaveAnalysisHistorySettings} disabled={isSavingAnalysisHistorySettings}>
                {isSavingAnalysisHistorySettings ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                保存历史配置
              </Button>
            ) : null}
            {systemSettingsTab === "knowledge" ? (
              <Button onClick={handleSaveKnowledgeConfig} disabled={isSavingKnowledgeConfig || isLoadingKnowledgeConfig}>
                {isSavingKnowledgeConfig ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                保存知识库配置
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
