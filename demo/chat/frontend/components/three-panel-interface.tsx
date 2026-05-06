"use client";

import type React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import Editor from "@monaco-editor/react";
import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { configureMonaco } from "@/lib/monaco-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_URLS, API_CONFIG, MODEL_PROVIDER_PRESETS, cloneModelProviderConfig, stringifyModelHeaders, parseModelHeadersInput, type ModelProviderConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  Send,
  Sparkles,
  User,
  Paperclip,
  X,
  FileText,
  ImageIcon,
  ChevronDown,
  ChevronRight,
  Trash2,
  Database,
  Download,
  Play,
  Save,
  FolderOpen,
  RefreshCw,
  Moon,
  Sun,
  Eraser,
  Copy,
  Check,
  Edit,
  ChevronLeft,
  Upload,
  Square,
  Code2,
  Terminal,
  BookOpen,
  Bot,
  Languages,
  GitBranch,
  ListTree,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Tree, NodeApi } from "react-arborist";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useDatabase, normalizeDbType as normalizeDbTypeForRequest, getDefaultPort as getDefaultPortForDbType } from "@/hooks/useDatabase";
import { useProjects } from "@/hooks/useProjects";
import { useKnowledgeBase } from "@/hooks/useKnowledgeBase";
import { useWorkspace } from "@/hooks/useWorkspace";
import { AgentIntroDialog } from "@/components/dialogs/AgentIntroDialog";
import { SideGuidanceDialog } from "@/components/dialogs/SideGuidanceDialog";
import { TaskTreeDialog, type TaskTreeNode, parseTaskTreeContent } from "@/components/dialogs/TaskTreeDialog";
import { DataDictionaryDialog, type DataDictionaryItem, parseDataDictionaryContent } from "@/components/dialogs/DataDictionaryDialog";
import { ProjectSaveDialog } from "@/components/dialogs/ProjectSaveDialog";
import { ProjectManagerDialog } from "@/components/dialogs/ProjectManagerDialog";
import { BackupRestoreDialog } from "@/components/dialogs/BackupRestoreDialog";
import { AuthDialog } from "@/components/dialogs/AuthDialog";
import { LogoutConfirmDialog } from "@/components/dialogs/LogoutConfirmDialog";
import { DatabaseDialog } from "@/components/dialogs/DatabaseDialog";
import { YutuPanel } from "@/components/dialogs/YutuPanel";
import { SimpleSettingsDialog } from "@/components/dialogs/SimpleSettingsDialog";
import { KnowledgeSettingsDialog } from "@/components/dialogs/KnowledgeSettingsDialog";
import { SystemSettingsDialog } from "@/components/dialogs/SystemSettingsDialog";
import { type DataDictionaryKnowledgeEntry } from "@/components/dialogs/DataDictionarySettingsPanel";
import { DatabaseRelationshipDialog } from "@/components/dialogs/DatabaseRelationshipDialog";
import {
  type AnalysisHistoryEvent,
  type AnalysisHistoryRunSummary,
  type AnalysisHistorySettings,
} from "@/components/dialogs/AnalysisHistorySettingsPanel";
import { AnalysisRuntimeSidebar } from "@/components/dialogs/AnalysisRuntimeSidebar";
import { FileIcon, defaultStyles } from "react-file-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

interface Message {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  attachments?: FileAttachment[];
  localOnly?: boolean;
}

interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

interface WorkspaceFile {
  name: string;
  size: number;
  extension: string;
  icon: string;
  download_url: string;
  preview_url?: string;
}

const DATA_PROFILE_REPORT_PATTERN = /^Data_Exploration_SKILL_.*\.md$/i;
const DATA_SOURCE_FILE_EXTENSIONS = new Set([
  "csv",
  "tsv",
  "txt",
  "json",
  "jsonl",
  "xls",
  "xlsx",
  "parquet",
  "feather",
  "orc",
  "db",
  "sqlite",
]);

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

interface DataSourceSelectionState {
  selectedDbSourceIds: string[];
  allowFilesOnly: boolean;
}

type WorkspaceNode = {
  name: string;
  path: string; // relative path
  is_dir: boolean;
  size?: number;
  extension?: string;
  icon?: string;
  download_url?: string;
  children?: WorkspaceNode[];
  is_generated?: boolean; // 标识是否为代码生成的文件或文件夹
  is_converted?: boolean; // 标识是否为 UTF-8 编码转换后的文件
};

interface AnalysisSection {
  type: "Analyze" | "Understand" | "Code" | "Execute" | "Answer";
  content: string;
  icon: string;
  color: string;
}

const DEFAULT_ANALYSIS_HISTORY_SETTINGS: AnalysisHistorySettings = {
  enabled: true,
  capture_stream_progress: true,
  capture_prompt_preview: true,
  max_runs: 120,
  stream_progress_chunk_interval: 40,
  stream_progress_char_interval: 1600,
};

const createClientId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const MODEL_PROVIDER_STORE_KEY = "modelProviderStore";
const ANALYSIS_LANGUAGE_STORE_KEY = "analysisLanguage";
const LEGACY_DB_SETTINGS_STORE_KEY = "systemDbSettings";
const LEFT_PANEL_DOCKED_STORE_KEY = "leftPanelDocked";
const LEFT_PANEL_DOCKED_DEFAULT_SIZE = 6;
const LEFT_PANEL_DOCKED_MIN_SIZE = 4;

const getUserDbSettingsStorageKey = (username?: string | null) => {
  const normalized = String(username || "default").trim() || "default";
  return `systemDbSettings:${normalized}`;
};

const getUserDataSourceSelectionStorageKey = (username?: string | null) => {
  const normalized = String(username || "default").trim() || "default";
  return `dataSourceSelection:${normalized}`;
};

const sanitizeDbSourceToken = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const buildDatabaseConnectionId = (
  dbType: string,
  config: Record<string, unknown>
) => {
  const normalizedType = normalizeDbTypeForRequest(dbType);
  const dbName = sanitizeDbSourceToken(config.database);
  if (normalizedType === "sqlite") {
    return `db_${normalizedType}_${dbName || "local"}`;
  }
  const host = sanitizeDbSourceToken(config.host);
  const port = sanitizeDbSourceToken(config.port);
  const user = sanitizeDbSourceToken(config.user);
  return `db_${normalizedType}_${host || "localhost"}_${port || "default"}_${user || "user"}_${dbName || "database"}`;
};

const normalizeSavedDbConnections = (connections: unknown): SavedDatabaseConnection[] => {
  if (!Array.isArray(connections)) {
    return [];
  }

  const normalized: SavedDatabaseConnection[] = [];
  const seenIds = new Set<string>();

  connections.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") {
      return;
    }

    const source = raw as Record<string, unknown>;
    const dbType = normalizeDbTypeForRequest(String(source.dbType || source.db_type || "mysql"));
    const sourceConfig =
      source.config && typeof source.config === "object"
        ? (source.config as Record<string, unknown>)
        : {};

    const normalizedConfig = {
      host: String(sourceConfig.host || "").trim(),
      port: String(sourceConfig.port || "").trim(),
      user: String(sourceConfig.user || "").trim(),
      password: String(sourceConfig.password || ""),
      database: String(sourceConfig.database || "").trim(),
    };

    if (!normalizedConfig.database) {
      return;
    }

    const fallbackId = buildDatabaseConnectionId(dbType, normalizedConfig as Record<string, unknown>);
    const incomingId = String(source.id || "").trim();
    const candidateId = incomingId || fallbackId || `db_source_${index + 1}`;
    const uniqueId = seenIds.has(candidateId) ? `${candidateId}_${index + 1}` : candidateId;
    seenIds.add(uniqueId);

    const defaultLabel =
      dbType === "sqlite"
        ? `${dbType}@${normalizedConfig.database}`
        : `${dbType}@${normalizedConfig.user || "anonymous"}@${normalizedConfig.host || "localhost"}:${normalizedConfig.port || "default"}/${normalizedConfig.database}`;

    normalized.push({
      id: uniqueId,
      dbType,
      label: String(source.label || "").trim() || defaultLabel,
      config: normalizedConfig,
    });
  });

  return normalized;
};

const areSameStringArrays = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => item === right[index]);
};

type AnalysisLanguage = "zh-CN" | "en";

const normalizeAnalysisLanguage = (value?: string | null): AnalysisLanguage => {
  const normalized = String(value || "").trim().toLowerCase().replace("_", "-");
  if (normalized === "en" || normalized === "en-us" || normalized === "en-gb" || normalized === "english") {
    return "en";
  }
  return "zh-CN";
};

const ANALYSIS_LANGUAGE_OPTIONS: Array<{
  value: AnalysisLanguage;
  label: string;
  description: string;
}> = [
  {
    value: "zh-CN",
    label: "中文（简体）",
    description: "用于分析思考、交互提示与报告输出",
  },
  {
    value: "en",
    label: "English",
    description: "Use English for analysis reasoning, interactive prompts, and report output",
  },
];

const getAnalysisLanguageLabel = (value: AnalysisLanguage) => {
  return value === "en" ? "English" : "中文（简体）";
};

const getPresetByProviderId = (id?: string) => {
  if (!id) return undefined;
  return MODEL_PROVIDER_PRESETS.find((item) => item.id === id);
};

const getPresetByProviderType = (providerType?: string) => {
  if (!providerType) return undefined;
  return MODEL_PROVIDER_PRESETS.find((item) => item.providerType === providerType);
};

const normalizeModelProviderEntry = (
  input?: Partial<ModelProviderConfig> | null
): ModelProviderConfig => {
  const source = input && typeof input === "object" ? input : {};
  const preset =
    getPresetByProviderId(source.id) ||
    getPresetByProviderType(source.providerType) ||
    MODEL_PROVIDER_PRESETS[0];

  const rawHeaders =
    source.headers && typeof source.headers === "object"
      ? (source.headers as Record<string, string>)
      : {};

  return cloneModelProviderConfig({
    ...preset,
    ...source,
    id: source.id || preset.id,
    headers: {
      ...(preset.headers || {}),
      ...rawHeaders,
    },
  });
};

const buildModelProviderLibrary = (
  providers: Array<Partial<ModelProviderConfig>>
): Record<string, ModelProviderConfig> => {
  const library: Record<string, ModelProviderConfig> = {};
  providers.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const normalized = normalizeModelProviderEntry(item);
    if (!normalized.id) return;
    library[normalized.id] = normalized;
  });
  return library;
};

const orderModelProviders = (
  library: Record<string, ModelProviderConfig>,
  selectedId?: string
): ModelProviderConfig[] => {
  const providers = Object.values(library);
  if (!providers.length) return [];
  if (!selectedId) return providers;

  const selected = providers.find((item) => item.id === selectedId);
  if (!selected) return providers;

  return [selected, ...providers.filter((item) => item.id !== selectedId)];
};

type CodeBlockViewProps = {
  language: string;
  code: string;
  showHeader?: boolean;
  isDarkMode: boolean;
  onEdit: (code: string) => void;
};

const CodeBlockView = memo(function CodeBlockView({
  language,
  code,
  showHeader = false,
  isDarkMode,
  onEdit,
}: CodeBlockViewProps) {
  const { toast } = useToast();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code.trim());
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
      toast({ description: "已复制代码" });
    } catch {
      toast({ description: "复制失败", variant: "destructive" });
    }
  };

  const isLargeCode = code.length > 8000;

  return (
    <div className="code-block my-3 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {showHeader && (
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="h-5 w-5 p-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
            <span className="text-gray-600 dark:text-gray-300">Code</span>
            <span className="text-gray-500 font-mono">{language || "text"}</span>
            {isLargeCode && (
              <span className="text-[10px] text-gray-400">
                （代码较长，已关闭高亮）
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-5 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {isCopied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(code.trim())}
              className="h-5 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <Edit className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
      {!showHeader || !isCollapsed ? (
        isLargeCode ? (
          <pre className="m-0 p-3 text-xs overflow-x-auto whitespace-pre-wrap font-mono bg-transparent">
            {code.trim()}
          </pre>
        ) : (
          <SyntaxHighlighter
            language={language || "text"}
            style={isDarkMode ? oneDark : oneLight}
            customStyle={{
              margin: 0,
              background: "transparent",
              overflowX: "hidden",
              whiteSpace: "pre-wrap",
            }}
            codeTagProps={{
              style: {
                fontFamily: "var(--font-mono)",
                fontSize: "0.875rem",
                whiteSpace: "pre-wrap",
              },
            }}
          >
            {code.trim()}
          </SyntaxHighlighter>
        )
      ) : null}
    </div>
  );
});

type ChatMessageItemProps = {
  message: Message;
  messageIndex: number;
  isStreaming: boolean;
  renderAssistant: (content: string, messageIndex?: number) => React.ReactNode;
  renderAssistantStreaming: (content: string, messageIndex?: number) => React.ReactNode;
};

const ChatMessageItem = memo(
  function ChatMessageItem({
    message,
    messageIndex,
    isStreaming,
    renderAssistant,
    renderAssistantStreaming,
  }: ChatMessageItemProps) {
    return (
      <div className="space-y-2">
        {message.sender === "user" ? (
          <div className="flex items-start justify-end gap-2">
            <div className="max-w-[80%] bg-black text-white dark:bg-white dark:text-black rounded-lg px-4 py-3 message-bubble message-appear">
              <div className="text-sm break-words whitespace-pre-wrap">
                {message.content}
              </div>
            </div>
            <Avatar>
              <AvatarImage src="/placeholder-user.jpg" alt="User" />
              <AvatarFallback className="text-[10px]">U</AvatarFallback>
            </Avatar>
          </div>
        ) : (
          <div className="flex items-start gap-2 min-w-0">
            <Avatar>
              <AvatarImage src="/placeholder-logo.png" alt="AI Assistant" />
              <AvatarFallback className="text-[10px]">
                <Sparkles className="h-3 w-3" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 message-appear">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                观雨
              </div>
              <div className="space-y-4 min-w-0">
                {isStreaming ? (
                  renderAssistantStreaming(message.content, messageIndex)
                ) : (
                  renderAssistant(message.content, messageIndex)
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.message === next.message &&
      prev.messageIndex === next.messageIndex &&
      prev.isStreaming === next.isStreaming &&
      prev.renderAssistant === next.renderAssistant &&
      prev.renderAssistantStreaming === next.renderAssistantStreaming
    );
  }
);

type StructuredSectionType =
  | "Analyze"
  | "Understand"
  | "Code"
  | "Execute"
  | "Answer"
  | "File"
  | "TaskTree"
  | "DataDictionary";

const StreamingMarkdownBlock = memo(
  function StreamingMarkdownBlock({
    content,
    renderMarkdownContent,
    className,
  }: {
    content: string;
    renderMarkdownContent: (content: string) => React.ReactNode;
    className?: string;
  }) {
    if (!content.trim()) return null;
    return <div className={className}>{renderMarkdownContent(content)}</div>;
  },
  (prev, next) =>
    prev.content === next.content &&
    prev.renderMarkdownContent === next.renderMarkdownContent &&
    prev.className === next.className
);

const StreamingSectionBody = memo(
  function StreamingSectionBody({
    type,
    content,
    isComplete,
    renderSectionContent,
  }: {
    type: StructuredSectionType;
    content: string;
    isComplete: boolean;
    renderSectionContent: (content: string) => React.ReactNode;
  }) {
    if (!content.trim()) return null;
    if (!isComplete) {
      if (type === "TaskTree") {
        return (
          <div className="p-3 text-sm text-amber-600 dark:text-amber-400 animate-pulse">
            正在生成分析任务树...
          </div>
        );
      }
      if (type === "DataDictionary") {
        return (
          <div className="p-3 text-sm text-amber-600 dark:text-amber-400 animate-pulse">
            正在生成待确认数据字典...
          </div>
        );
      }
      if (type === "Code" || type === "Execute") {
        return (
          <pre className="m-0 text-xs overflow-x-auto whitespace-pre-wrap font-mono">
            {content}
          </pre>
        );
      }
      return (
        <div className="text-sm break-words whitespace-pre-wrap">{content}</div>
      );
    }
    // Completed TaskTree: show structured summary instead of raw JSON
    if (type === "TaskTree") {
      const parsed = parseTaskTreeContent(content);
      if (parsed) {
        const tasks = parsed.tasks;
        const countAll = (nodes: TaskTreeNode[]): number =>
          nodes.reduce((s, n) => s + 1 + (n.children ? countAll(n.children) : 0), 0);
        return (
          <div className="text-sm text-amber-700 dark:text-amber-300">
            <div className="mb-2 font-medium">
              已生成 {tasks.length} 个主任务，共 {countAll(tasks)} 个分析步骤
            </div>
            <div className="space-y-1">
              {tasks.map((t: TaskTreeNode) => (
                <div key={t.id} className="flex items-start gap-2">
                  <span className="text-amber-500 font-mono shrink-0">[{t.id}]</span>
                  <span>{t.name}</span>
                  {t.description && (
                    <span className="text-gray-400 text-xs ml-1">— {t.description}</span>
                  )}
                  {t.children && (
                    <span className="text-xs text-gray-400">(+{t.children.length} 子任务)</span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-gray-500">
              任务选择面板已自动弹出，请勾选要执行的分析步骤
            </div>
          </div>
        );
      }
      return <div className="text-sm text-gray-500">任务树数据格式异常，请重新生成</div>;
    }
    if (type === "DataDictionary") {
      const parsed = parseDataDictionaryContent(content);
      if (parsed) {
        const items = parsed.items;
        return (
          <div className="text-sm text-amber-700 dark:text-amber-300">
            <div className="mb-2 font-medium">已生成 {items.length} 条待确认数据语义</div>
            <div className="space-y-1">
              {items.slice(0, 8).map((item) => {
                const subject = [item.table, item.field].filter(Boolean).join(".") || "(未命名字段)";
                return (
                  <div key={item.id} className="flex items-start gap-2">
                    <span className="text-amber-500 font-mono shrink-0">[{item.id}]</span>
                    <span>{subject}</span>
                    {item.proposed_meaning ? (
                      <span className="text-gray-400 text-xs ml-1">→ {item.proposed_meaning}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 text-xs text-gray-500">数据字典确认面板已自动弹出，请勾选后继续分析</div>
          </div>
        );
      }
      return <div className="text-sm text-gray-500">数据字典数据格式异常，请重新生成</div>;
    }
    return <div className="markdown-content">{renderSectionContent(content)}</div>;
  },
  (prev, next) =>
    prev.type === next.type &&
    prev.content === next.content &&
    prev.isComplete === next.isComplete &&
    prev.renderSectionContent === next.renderSectionContent
);

// 智能体行为原则配置
const ANALYSIS_PRINCIPLES = [
  { label: "自我纠错", desc: "自动检测错误并尝试修复，最多重试3次", key: "selfCorrectionEnabled" },
  { label: "短代码预测试", desc: "执行复杂分析前，先用小样本验证关键假设", key: "shortTestEnabled" },
  { label: "大任务拆分", desc: "将复杂目标分解为结构化任务树逐步执行", key: "taskDecompositionEnabled" },
  { label: "可解释性输出", desc: "输出特征重要性、判断依据链条等解释信息", key: "explainabilityEnabled" },
  { label: "高效处理", desc: "复用中间结果，避免重复代码，并行执行", key: "efficientProcessingEnabled" },
  { label: "死循环检测", desc: "自动检测并跳出分析死循环，更换分析策略", key: "deadLoopDetectionEnabled" },
] as const;

export function ThreePanelInterface() {
  const { toast } = useToast();
  const [isDarkMode, setIsDarkMode] = useState(false); // 服务端默认 false
  const [mounted, setMounted] = useState(false);
  const [editorHeight, setEditorHeight] = useState(60); // 编辑器高度百分比
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});
  const [autoCollapseEnabled, setAutoCollapseEnabled] = useState(true);
  const [manualLocks, setManualLocks] = useState<Record<string, boolean>>({});

  // Session ID：用于区分不同浏览器用户（无需登录）
  const [sessionId, setSessionId] = useState<string>("");
  const CHAT_STORAGE_KEY = "chat_messages_v1";

  const {
    currentUser, setCurrentUser, isLoggedIn, setIsLoggedIn,
    showAuthModal, setShowAuthModal,
    isLoginMode, setIsLoginMode,
    authUsername, setAuthUsername,
    authPassword, setAuthPassword,
    registeredUsers,
    showLogoutConfirm, setShowLogoutConfirm,
    handleAuth, handleLogout, performLogout: performLogoutRaw,
    loadRegisteredUsers,
    userRef,
  } = useAuth({
    onWorkspaceRefresh: async () => {
      // Workspace refresh is handled by the polling useEffect
    },
    clearMessages: () => {
      setMessages([{
        id: "welcome-1",
        content: "您好！很高兴和您一起运用大数据开展海关风险分析。我将按您的分析目标和要求，协助您深入分析进出口业务数据，运用规律分析、统计分析、对比分析、关联分析等方法，开展多角度逻辑推理，协助您挖掘走私违规、逃证逃税及违反安全准入等潜在风险，维护贸易秩序。请上传数据，让我们开始深度洞察。",
        sender: "ai",
        timestamp: new Date(),
        localOnly: true,
      }]);
    },
    setSessionId,
  });

  // 步骤导航相关状态
  const [activeSection, setActiveSection] = useState<string>("");
  const stepNavigatorRef = useRef<HTMLDivElement>(null);
  const activeStepRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome-1",
      content: "您好！很高兴和您一起运用大数据开展海关风险分析。我将按您的分析目标和要求，协助您深入分析进出口业务数据，运用规律分析、统计分析、对比分析、关联分析等方法，开展多角度逻辑推理，协助您挖掘走私违规、逃证逃税及违反安全准入等潜在风险，维护贸易秩序。请上传数据，让我们开始深度洞察。",
      sender: "ai",
      timestamp: new Date(),
      localOnly: true,
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [historyInputs, setHistoryInputs] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isLeftPanelDocked, setIsLeftPanelDocked] = useState(false);
  const [showModelConfigAlert, setShowModelConfigAlert] = useState(false);
  // 抑制轮询刷新的计数器（>0 时轮询不更新状态）
  const {
    attachments, setAttachments,
    workspaceFiles, setWorkspaceFiles,
    workspaceTree, setWorkspaceTree,
    expanded, toggleExpand,
    isUploading, setIsUploading,
    treeContainerRef, treeSize,
    suppressRefreshCount: suppressWorkspaceRefreshCount,
    suppressDuringFileRestore,
    loadFiles: loadWorkspaceFiles,
    loadTree: loadWorkspaceTree,
    refresh: refreshWorkspace,
    deleteFile,
    deleteDir,
  } = useWorkspace({ sessionId, userRef });

  const [selectedCodeSection, setSelectedCodeSection] = useState<string>("");
  const [codeEditorContent, setCodeEditorContent] = useState("");
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [isExecutingCode, setIsExecutingCode] = useState(false);
  const [codeExecutionResult, setCodeExecutionResult] = useState("");
  const [analysisStrategy, setAnalysisStrategy] = useState<string>("聚焦诉求");
  const [temperature, setTemperature] = useState<number | null>(null); // null means auto based on strategy
  const [analysisMode, setAnalysisMode] = useState<string>("full_agent"); // "interactive" or "full_agent"
  const [modelVersion, setModelVersion] = useState<string>("mlx"); // "mlx" or "gpu"
  const [showSettingsDialog, setShowSettingsDialog] = useState(false); // 系统设置弹窗
  // 七大原则开关
  const [selfCorrectionEnabled, setSelfCorrectionEnabled] = useState(true);
  const [shortTestEnabled, setShortTestEnabled] = useState(true);
  const [taskDecompositionEnabled, setTaskDecompositionEnabled] = useState(true);
  const [explainabilityEnabled, setExplainabilityEnabled] = useState(true);
  const [efficientProcessingEnabled, setEfficientProcessingEnabled] = useState(true);
  const [deadLoopDetectionEnabled, setDeadLoopDetectionEnabled] = useState(true);

  // 过程指导 (Side Guidance) 历史
  const [sideGuidanceHistory, setSideGuidanceHistory] = useState<string[]>([]);
  const [sideGuidanceIndex, setSideGuidanceIndex] = useState(-1);

  // 数据库连接相关状态
  const [showSystemSettings, setShowSystemSettings] = useState(false);
  const [showDatabaseRelationshipDialog, setShowDatabaseRelationshipDialog] = useState(false);
  const [systemSettingsTab, setSystemSettingsTab] = useState<"model" | "database" | "knowledge" | "history" | "dictionary">("model");
  const [modelProviderConfig, setModelProviderConfig] = useState<ModelProviderConfig>(
    cloneModelProviderConfig()
  );
  const [modelProviderLibrary, setModelProviderLibrary] = useState<Record<string, ModelProviderConfig>>({});
  const [modelHeadersInput, setModelHeadersInput] = useState("");
  const [showRawModelHeaders, setShowRawModelHeaders] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModelList, setIsFetchingModelList] = useState(false);
  const [modelTestStatus, setModelTestStatus] = useState<{
    status: string;
    message: string;
    testedAt: string | null;
  }>({
    status: "never_tested",
    message: "尚未获取模型列表",
    testedAt: null,
  });
  const {
    showDialog: showDatabaseDialog,
    setShowDialog: setShowDatabaseDialog,
    dbType, setDbType: handleDbTypeChange,
    dbConfig, setDbConfig,
    dbPrompt, setDbPrompt,
    dbGeneratedSql, setDbGeneratedSql,
    dbDatasetName, setDbDatasetName,
    dbExecuteMode, setDbExecuteMode,
    isTestingDb, isGeneratingSql, isExecutingDbSql, isDbTested,
    availableDatabaseNames,
    isLoadingDatabaseNames,
    databaseListError,
    dbContextSummary,
    dbKnowledgeSummary,
    dbKnowledgeUpdatedAt,
    dbSchemaGraph,
    testConnection: handleTestConnection,
    generateSql: handleGenerateSql,
    executeSql: handleExecuteDbSql,
    isLoadingDbContext,
    loadDbContext: handleLoadDbContext,
    isLoadingSchemaGraph,
    loadSchemaGraph: handleLoadSchemaGraph,
    fetchDatabaseNames: handleFetchDatabaseNames,
    buildPayload: buildDbRequestPayload,
    workspaceFilesRef,
  } = useDatabase({
    sessionId,
    currentUser,
    modelProviderConfig,
    onRefreshWorkspace: refreshWorkspace,
  });

  const [savedDbConnections, setSavedDbConnections] = useState<SavedDatabaseConnection[]>([]);
  const [selectedDbSourceIds, setSelectedDbSourceIds] = useState<string[]>([]);
  const [sourceSelectionExplicit, setSourceSelectionExplicit] = useState(false);
  const [showDataSourceDialog, setShowDataSourceDialog] = useState(false);
  const [pendingDataSourceSelection, setPendingDataSourceSelection] = useState<DataSourceSelectionState>({
    selectedDbSourceIds: [],
    allowFilesOnly: false,
  });
  const [dataSourceSelection, setDataSourceSelection] = useState<DataSourceSelectionState>({
    selectedDbSourceIds: [],
    allowFilesOnly: false,
  });
  const [pendingSendOverrideMessage, setPendingSendOverrideMessage] = useState<string | null>(null);
  const [deletingDbConnectionId, setDeletingDbConnectionId] = useState<string | null>(null);
  const [isGeneratingDataProfileReport, setIsGeneratingDataProfileReport] = useState(false);
  const [analysisHistorySettings, setAnalysisHistorySettings] = useState<AnalysisHistorySettings>({
    ...DEFAULT_ANALYSIS_HISTORY_SETTINGS,
  });
  const [analysisHistoryRuns, setAnalysisHistoryRuns] = useState<AnalysisHistoryRunSummary[]>([]);
  const [analysisHistoryStats, setAnalysisHistoryStats] = useState({ total: 0, completed: 0, failed: 0, warning: 0 });
  const [selectedAnalysisHistoryRun, setSelectedAnalysisHistoryRun] = useState<AnalysisHistoryRunSummary | null>(null);
  const [analysisHistoryEvents, setAnalysisHistoryEvents] = useState<AnalysisHistoryEvent[]>([]);
  const [isLoadingAnalysisHistory, setIsLoadingAnalysisHistory] = useState(false);
  const [isLoadingAnalysisHistoryDetail, setIsLoadingAnalysisHistoryDetail] = useState(false);
  const [isSavingAnalysisHistorySettings, setIsSavingAnalysisHistorySettings] = useState(false);
  const [dataDictionaryEntries, setDataDictionaryEntries] = useState<DataDictionaryKnowledgeEntry[]>([]);
  const [dataDictionaryTotal, setDataDictionaryTotal] = useState(0);
  const [isLoadingDataDictionary, setIsLoadingDataDictionary] = useState(false);
  const [isDeletingDataDictionary, setIsDeletingDataDictionary] = useState(false);
  const [runtimeAnalysisRun, setRuntimeAnalysisRun] = useState<AnalysisHistoryRunSummary | null>(null);
  const [runtimeAnalysisEvents, setRuntimeAnalysisEvents] = useState<AnalysisHistoryEvent[]>([]);
  const [isLoadingRuntimeAnalysisTrace, setIsLoadingRuntimeAnalysisTrace] = useState(false);

  const workspaceDataSourceFiles = useMemo(() => {
    return workspaceFiles.filter((file) => {
      const name = String(file.name || "").trim();
      if (!name) {
        return false;
      }
      // 隐藏文件属于系统元数据（如 .encoding_map.json），不计入数据源数量。
      if (name.startsWith(".")) {
        return false;
      }
      const ext = String(file.extension || "").replace(/^\./, "").toLowerCase();
      return Boolean(ext) && DATA_SOURCE_FILE_EXTENSIONS.has(ext);
    });
  }, [workspaceFiles]);

  const hasWorkspaceDataSource = workspaceDataSourceFiles.length > 0;

  const effectiveSelectedDbSourceIds = useMemo(() => {
    if (!savedDbConnections.length) {
      return [] as string[];
    }
    const validIds = new Set(savedDbConnections.map((item) => item.id));
    return selectedDbSourceIds.filter((id) => validIds.has(id));
  }, [savedDbConnections, selectedDbSourceIds]);

  const selectedDatabaseSources = useMemo(() => {
    if (!savedDbConnections.length || !effectiveSelectedDbSourceIds.length) {
      return [] as SavedDatabaseConnection[];
    }
    const selectedIdSet = new Set(effectiveSelectedDbSourceIds);
    return savedDbConnections.filter((item) => selectedIdSet.has(item.id));
  }, [effectiveSelectedDbSourceIds, savedDbConnections]);

  const hasSelectedDataSource = selectedDatabaseSources.length > 0 || hasWorkspaceDataSource;

  const isModelProviderConfigured = useMemo(() => {
    const normalized = normalizeModelProviderEntry(modelProviderConfig);
    const baseUrl = String(normalized.baseUrl || "").trim();
    const modelName = String(normalized.model || "").trim();
    if (!baseUrl || !modelName || modelName === "your-model-name") {
      return false;
    }

    const providerType = String(normalized.providerType || "").toLowerCase();
    const requiresApiKey =
      !normalized.isLocal && !["deepanalyze", "ollama"].includes(providerType);
    if (requiresApiKey && !String(normalized.apiKey || "").trim()) {
      return false;
    }
    return true;
  }, [modelProviderConfig]);

  useEffect(() => {
    workspaceFilesRef.current = workspaceFiles;
  }, [workspaceFiles, workspaceFilesRef]);

  // 项目管理
  const {
    projectName, setProjectName,
    showSaveDialog, setShowSaveDialog,
    showProjectManager, setShowProjectManager,
    userProjects,
    saveConfirmOpen, setSaveConfirmOpen,
    pendingSaveData, setPendingSaveData,
    saveProject, loadProject, deleteProject, listProjects,
  } = useProjects({
    isLoggedIn, currentUser, sessionId, messages, sideGuidanceHistory,
    setSessionId, setMessages, setSideGuidanceHistory,
    onRefreshWorkspace: refreshWorkspace,
    clearWorkspace: async (sid: string, username: string) => {
      await fetch(`${API_URLS.WORKSPACE_CLEAR}?session_id=${sid}&username=${username}`, { method: "DELETE" });
    },
    showAuthModal: () => setShowAuthModal(true),
    CHAT_STORAGE_KEY,
    suppressWorkspaceRefreshCount,
  });

  // TaskTree 交互式任务选择对话框状态
  const [showTaskTreeDialog, setShowTaskTreeDialog] = useState(false);
  const [taskTreeData, setTaskTreeData] = useState<TaskTreeNode[] | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [showDataDictionaryDialog, setShowDataDictionaryDialog] = useState(false);
  const [dataDictionaryItems, setDataDictionaryItems] = useState<DataDictionaryItem[] | null>(null);
  const [selectedDictionaryItems, setSelectedDictionaryItems] = useState<Set<string>>(new Set());
  // 报告类型选择状态
  const [reportTypes, setReportTypes] = useState<string[]>(["pdf"]);
  const [showReportTypePicker, setShowReportTypePicker] = useState(false);
  const [pendingReportTypes, setPendingReportTypes] = useState<string[]>(["pdf"]);
  // 分析语言选择状态
  const [analysisLanguage, setAnalysisLanguage] = useState<AnalysisLanguage>("zh-CN");
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [pendingAnalysisLanguage, setPendingAnalysisLanguage] = useState<AnalysisLanguage>("zh-CN");
  // 雨途斩棘录知识库
  const {
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
    loadYutuHtml, loadYutuRecords,
    saveRecord: handleSaveYutuRecord,
    updateRecord: handleUpdateYutuRecord,
    deleteRecord: handleDeleteYutuRecord,
    organizeNotes: organizeYutuNotes,
  } = useKnowledgeBase({ currentUser });
  const [showKnowledgeSettings, setShowKnowledgeSettings] = useState(false); // 知识库设置弹窗
  const [knowledgePreferredView, setKnowledgePreferredView] = useState<"html" | "table">("html");
  const [showKnowledgeHints, setShowKnowledgeHints] = useState(true);
  const [autoOpenYutuAfterAnalysis, setAutoOpenYutuAfterAnalysis] = useState(false);
  const [knowledgeSettingsLoaded, setKnowledgeSettingsLoaded] = useState(false);
  const [isLoadingKnowledgeConfig, setIsLoadingKnowledgeConfig] = useState(false);
  const [isSavingKnowledgeConfig, setIsSavingKnowledgeConfig] = useState(false);
  const [knowledgeTestTarget, setKnowledgeTestTarget] = useState<"onyx" | "dify" | "all" | null>(null);
  const [knowledgeTestResults, setKnowledgeTestResults] = useState<Record<string, { status: string; message: string; tested_at: string | null }>>({});
  const [onyxConfig, setOnyxConfig] = useState({
    enabled: false,
    base_url: "http://localhost:3000",
    api_key: "",
    search_path: "/api/chat/search",
    has_api_key: false,
  });
  const [difyConfig, setDifyConfig] = useState({
    enabled: false,
    base_url: "http://localhost:5000",
    api_key: "",
    workflow_id: "",
    has_api_key: false,
  });

  const applyModelPreset = (presetId: string) => {
    const nextConfig = modelProviderLibrary[presetId]
      ? cloneModelProviderConfig(modelProviderLibrary[presetId])
      : normalizeModelProviderEntry(
        MODEL_PROVIDER_PRESETS.find((item) => item.id === presetId) || MODEL_PROVIDER_PRESETS[0]
      );

    setModelProviderConfig(nextConfig);
    setModelHeadersInput(stringifyModelHeaders(nextConfig.headers));
  };

  const handleFetchModelList = async () => {
    setIsFetchingModelList(true);
    try {
      const response = await fetch(API_URLS.MODEL_LIST, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: modelProviderConfig }),
      });
      const data = await response.json();
      if (data.success) {
        const models = Array.isArray(data.models) ? data.models.filter(Boolean) : [];
        setAvailableModels(models);
        if (data.selected_model && !models.includes(data.selected_model)) {
          setAvailableModels((prev) => [data.selected_model, ...prev]);
        }
        setModelTestStatus({
          status: "success",
          message: data.message || "模型列表获取成功",
          testedAt: data.tested_at || new Date().toISOString(),
        });
        if (data.selected_model) {
          setModelProviderConfig((prev) => ({ ...prev, model: data.selected_model }));
        }
        toast({ description: data.message || "模型列表获取成功" });
      } else {
        setModelTestStatus({
          status: "failed",
          message: data.message || "模型列表获取失败",
          testedAt: new Date().toISOString(),
        });
        toast({ description: data.message || "模型列表获取失败", variant: "destructive" });
      }
    } catch (error) {
      console.error("Fetch model list error:", error);
      setModelTestStatus({
        status: "failed",
        message: "模型列表请求失败",
        testedAt: new Date().toISOString(),
      });
      toast({ description: "模型列表请求失败", variant: "destructive" });
    } finally {
      setIsFetchingModelList(false);
    }
  };

  const handleSaveModelConfig = async () => {
    // 同时保存到 localStorage（快速恢复）和后端（永久持久化）
    const normalizedCurrent = normalizeModelProviderEntry(modelProviderConfig);
    const nextLibrary = {
      ...modelProviderLibrary,
      [normalizedCurrent.id]: normalizedCurrent,
    };
    const providers = orderModelProviders(nextLibrary, normalizedCurrent.id);

    setModelProviderLibrary(nextLibrary);
    setModelProviderConfig(normalizedCurrent);

    if (typeof window !== "undefined") {
      localStorage.setItem("modelProviderConfig", JSON.stringify(normalizedCurrent));
      localStorage.setItem(
        MODEL_PROVIDER_STORE_KEY,
        JSON.stringify({
          selectedId: normalizedCurrent.id,
          providers,
        })
      );
    }
    try {
      await fetch(
        `${API_URLS.CONFIG_MODELS_SAVE}?username=${currentUser || "default"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: currentUser || "default",
            selected_id: normalizedCurrent.id,
            providers,
          }),
        }
      );
      toast({ description: `当前分析模型已设置为 ${normalizedCurrent.model} 并保存到本地` });
    } catch {
      toast({ description: `当前分析模型已设置为 ${normalizedCurrent.model}（仅浏览器保存）` });
    }
  };

  const handleSaveDatabaseConfig = useCallback(async (options?: { silent?: boolean }) => {
    const username = (currentUser || "default").trim() || "default";
    const normalizedType = normalizeDbTypeForRequest(dbType);
    const normalizedConfig = {
      host: (dbConfig.host || "").trim() || "localhost",
      port: (dbConfig.port || "").trim() || getDefaultPortForDbType(normalizedType),
      user: (dbConfig.user || "").trim(),
      password: dbConfig.password || "",
      database: (dbConfig.database || "").trim(),
    };
    const connectionId = buildDatabaseConnectionId(
      normalizedType,
      normalizedConfig as unknown as Record<string, unknown>
    );
    const snapshot = { dbType: normalizedType, dbConfig: normalizedConfig };

    if (typeof window !== "undefined") {
      localStorage.setItem(
        getUserDbSettingsStorageKey(username),
        JSON.stringify(snapshot)
      );
      // 兼容历史版本默认用户缓存，避免升级后丢失旧配置
      if (username === "default") {
        localStorage.setItem(LEGACY_DB_SETTINGS_STORE_KEY, JSON.stringify(snapshot));
      }
    }

    try {
      await fetch(
        `${API_URLS.CONFIG_DATABASES_SAVE}?username=${username}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            connection: {
              id: connectionId,
              dbType: normalizedType,
              config: normalizedConfig,
              label:
                normalizedType === "sqlite"
                  ? `${normalizedType}@${normalizedConfig.database}`
                  : `${normalizedType}@${normalizedConfig.user || "anonymous"}@${normalizedConfig.host || "localhost"}:${normalizedConfig.port || getDefaultPortForDbType(normalizedType)}/${normalizedConfig.database}`,
            },
          }),
        }
      );

      const normalizedSaved = normalizeSavedDbConnections([
        {
          id: connectionId,
          dbType: normalizedType,
          config: normalizedConfig,
        },
      ]);
      const savedItem = normalizedSaved[0];
      if (savedItem) {
        setSavedDbConnections((prev) => {
          const existing = prev.filter((item) => item.id !== savedItem.id);
          return [...existing, savedItem];
        });
        setSelectedDbSourceIds((prev) => {
          if (prev.includes(savedItem.id)) {
            return prev;
          }
          return [...prev, savedItem.id];
        });
        setDataSourceSelection((prev) => {
          if (prev.selectedDbSourceIds.includes(savedItem.id)) {
            return prev;
          }
          return {
            ...prev,
            selectedDbSourceIds: [...prev.selectedDbSourceIds, savedItem.id],
          };
        });
        setSourceSelectionExplicit(true);
      }

      if (!options?.silent) {
        toast({ description: "数据库配置已保存到本地" });
      }
    } catch {
      if (!options?.silent) {
        toast({ description: "数据库配置已保存到当前浏览器" });
      }
    }
  }, [currentUser, dbConfig, dbType, toast]);

  const prevDbTestedRef = useRef(false);
  useEffect(() => {
    if (isDbTested && !prevDbTestedRef.current) {
      void handleSaveDatabaseConfig({ silent: true });
    }
    prevDbTestedRef.current = isDbTested;
  }, [isDbTested, handleSaveDatabaseConfig]);

  const handleApplySavedDbConnection = useCallback((connectionId: string) => {
    const target = savedDbConnections.find((item) => item.id === connectionId);
    if (!target) {
      return;
    }

    handleDbTypeChange(target.dbType);
    setDbConfig((prev) => ({
      ...prev,
      host: target.config.host || "localhost",
      port: target.config.port || getDefaultPortForDbType(target.dbType),
      user: target.config.user || "",
      password: target.config.password || "",
      database: target.config.database || "",
    }));

    setSelectedDbSourceIds((prev) => {
      if (prev.includes(connectionId)) {
        return prev;
      }
      return [...prev, connectionId];
    });

    setDataSourceSelection((prev) => {
      if (prev.selectedDbSourceIds.includes(connectionId)) {
        return prev;
      }
      return {
        ...prev,
        selectedDbSourceIds: [...prev.selectedDbSourceIds, connectionId],
      };
    });

    setSourceSelectionExplicit(true);
    toast({ description: `已切换到连接: ${target.label}` });
  }, [savedDbConnections, handleDbTypeChange, setDbConfig, toast]);

  const handleToggleSavedDbSourceSelection = useCallback((connectionId: string, checked: boolean) => {
    setSelectedDbSourceIds((prev) => {
      const idSet = new Set(prev);
      if (checked) {
        idSet.add(connectionId);
      } else {
        idSet.delete(connectionId);
      }
      return Array.from(idSet);
    });

    setDataSourceSelection((prev) => {
      const idSet = new Set(prev.selectedDbSourceIds);
      if (checked) {
        idSet.add(connectionId);
      } else {
        idSet.delete(connectionId);
      }
      return {
        ...prev,
        selectedDbSourceIds: Array.from(idSet),
      };
    });

    setSourceSelectionExplicit(true);
  }, []);

  const handleDeleteSavedDbConnection = useCallback(async (connectionId: string) => {
    const username = (currentUser || "default").trim() || "default";
    const target = savedDbConnections.find((item) => item.id === connectionId);

    if (!target) {
      return;
    }

    setDeletingDbConnectionId(connectionId);
    try {
      const response = await fetch(API_URLS.CONFIG_DATABASES_DELETE, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, id: connectionId }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "删除连接失败");
      }

      setSavedDbConnections((prev) => prev.filter((item) => item.id !== connectionId));
      setSelectedDbSourceIds((prev) => prev.filter((id) => id !== connectionId));
      setDataSourceSelection((prev) => ({
        ...prev,
        selectedDbSourceIds: prev.selectedDbSourceIds.filter((id) => id !== connectionId),
      }));

      toast({ description: `已删除连接: ${target.label}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除连接失败";
      toast({ description: message, variant: "destructive" });
    } finally {
      setDeletingDbConnectionId(null);
    }
  }, [currentUser, savedDbConnections, toast]);

  const handleGenerateDataProfileReport = useCallback(async () => {
    if (isGeneratingDataProfileReport) {
      return;
    }

    const existingDataProfileReport = workspaceFiles.find((file) => DATA_PROFILE_REPORT_PATTERN.test(file.name));
    if (existingDataProfileReport) {
      toast({ description: `已生成数据探查报告：${existingDataProfileReport.name}，无需重复生成。` });
      return;
    }

    const selectedIdSet = new Set(effectiveSelectedDbSourceIds);
    const databaseSourcesForReport = savedDbConnections
      .filter((connection) => selectedIdSet.has(connection.id))
      .map((connection) => ({
        id: connection.id,
        label: connection.label,
        dbType: connection.dbType,
        config: connection.config,
      }));

    let fallbackPayload: ReturnType<typeof buildDbRequestPayload> | null = null;
    if (!databaseSourcesForReport.length && dbConfig.database?.trim()) {
      fallbackPayload = buildDbRequestPayload();
    }

    if (!databaseSourcesForReport.length && !fallbackPayload && workspaceDataSourceFiles.length === 0) {
      toast({ description: "请先连接数据库或上传数据文件后再生成数据探查报告", variant: "destructive" });
      return;
    }

    setIsGeneratingDataProfileReport(true);
    try {
      const response = await fetch(API_URLS.DATA_PROFILE_REPORT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          username: currentUser || "default",
          selected_database_sources: databaseSourcesForReport,
          db_type: fallbackPayload?.db_type,
          config: fallbackPayload?.config,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || payload?.detail || "数据探查报告生成失败");
      }

      await refreshWorkspace();
      if (payload?.skipped && payload?.filename) {
        toast({ description: `已生成数据探查报告：${payload.filename}，无需重复生成。` });
        return;
      }
      toast({ description: payload.summary || payload.message || "数据探查 SKILL 文档已生成" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "数据探查报告生成失败";
      toast({ description: message, variant: "destructive" });
    } finally {
      setIsGeneratingDataProfileReport(false);
    }
  }, [
    buildDbRequestPayload,
    currentUser,
    dbConfig.database,
    effectiveSelectedDbSourceIds,
    isGeneratingDataProfileReport,
    refreshWorkspace,
    savedDbConnections,
    sessionId,
    toast,
    workspaceDataSourceFiles.length,
  ]);

  const loadAnalysisHistoryDetail = useCallback(async (runId: string, options?: { silent?: boolean }) => {
    if (!runId) {
      setSelectedAnalysisHistoryRun(null);
      setAnalysisHistoryEvents([]);
      return;
    }
    setIsLoadingAnalysisHistoryDetail(true);
    try {
      const username = encodeURIComponent((currentUser || "default").trim() || "default");
      const response = await fetch(`${API_URLS.ANALYSIS_HISTORY_LIST}/${encodeURIComponent(runId)}?username=${username}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || payload?.message || "分析历史详情加载失败");
      }
      setSelectedAnalysisHistoryRun(payload.run || null);
      setAnalysisHistoryEvents(Array.isArray(payload.events) ? payload.events : []);
    } catch (error) {
      if (!options?.silent) {
        const message = error instanceof Error ? error.message : "分析历史详情加载失败";
        toast({ description: message, variant: "destructive" });
      }
    } finally {
      setIsLoadingAnalysisHistoryDetail(false);
    }
  }, [currentUser, toast]);

  const loadAnalysisHistory = useCallback(async (options?: { preferredRunId?: string; silent?: boolean }) => {
    setIsLoadingAnalysisHistory(true);
    try {
      const username = encodeURIComponent((currentUser || "default").trim() || "default");
      const response = await fetch(`${API_URLS.ANALYSIS_HISTORY_LIST}?username=${username}&limit=40`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || payload?.message || "分析历史加载失败");
      }

      setAnalysisHistorySettings({
        ...DEFAULT_ANALYSIS_HISTORY_SETTINGS,
        ...(payload.settings || {}),
      });
      const runs = Array.isArray(payload.runs) ? payload.runs : [];
      setAnalysisHistoryRuns(runs);
      setAnalysisHistoryStats({
        total: Number(payload.stats?.total || 0),
        completed: Number(payload.stats?.completed || 0),
        failed: Number(payload.stats?.failed || 0),
        warning: Number(payload.stats?.warning || 0),
      });

      const preferredRunId =
        options?.preferredRunId ||
        selectedAnalysisHistoryRun?.run_id ||
        (runs[0]?.run_id as string | undefined) ||
        "";

      if (preferredRunId) {
        await loadAnalysisHistoryDetail(preferredRunId, { silent: true });
      } else {
        setSelectedAnalysisHistoryRun(null);
        setAnalysisHistoryEvents([]);
      }
    } catch (error) {
      if (!options?.silent) {
        const message = error instanceof Error ? error.message : "分析历史加载失败";
        toast({ description: message, variant: "destructive" });
      }
    } finally {
      setIsLoadingAnalysisHistory(false);
    }
  }, [currentUser, loadAnalysisHistoryDetail, selectedAnalysisHistoryRun?.run_id, toast]);

  const handleSelectAnalysisHistoryRun = useCallback((runId: string) => {
    const existingRun = analysisHistoryRuns.find((item) => item.run_id === runId) || null;
    if (existingRun) {
      setSelectedAnalysisHistoryRun(existingRun);
    }
    void loadAnalysisHistoryDetail(runId);
  }, [analysisHistoryRuns, loadAnalysisHistoryDetail]);

  const handleSaveAnalysisHistorySettings = useCallback(async () => {
    setIsSavingAnalysisHistorySettings(true);
    try {
      const response = await fetch(API_URLS.CONFIG_ANALYSIS_HISTORY_SAVE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: currentUser || "default",
          settings: analysisHistorySettings,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || payload?.message || "分析历史配置保存失败");
      }
      setAnalysisHistorySettings({
        ...DEFAULT_ANALYSIS_HISTORY_SETTINGS,
        ...(payload.settings || {}),
      });
      toast({ description: payload.message || "分析历史配置已保存" });
      await loadAnalysisHistory({ preferredRunId: selectedAnalysisHistoryRun?.run_id, silent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "分析历史配置保存失败";
      toast({ description: message, variant: "destructive" });
    } finally {
      setIsSavingAnalysisHistorySettings(false);
    }
  }, [analysisHistorySettings, currentUser, loadAnalysisHistory, selectedAnalysisHistoryRun?.run_id, toast]);

  useEffect(() => {
    if (showSystemSettings && systemSettingsTab === "history") {
      void loadAnalysisHistory({ silent: true });
    }
  }, [showSystemSettings, systemSettingsTab, loadAnalysisHistory]);

  const loadDataDictionary = useCallback(async (options?: { silent?: boolean }) => {
    setIsLoadingDataDictionary(true);
    try {
      const username = encodeURIComponent((currentUser || "default").trim() || "default");
      const response = await fetch(`${API_URLS.CONFIG_DATA_DICTIONARY_GET}?username=${username}&limit=800`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || payload?.message || "数据字典加载失败");
      }

      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      setDataDictionaryEntries(entries);
      setDataDictionaryTotal(Number(payload.total || entries.length || 0));
    } catch (error) {
      if (!options?.silent) {
        const message = error instanceof Error ? error.message : "数据字典加载失败";
        toast({ description: message, variant: "destructive" });
      }
    } finally {
      setIsLoadingDataDictionary(false);
    }
  }, [currentUser, toast]);

  const handleDeleteDataDictionaryEntries = useCallback(async (ids: string[]) => {
    if (!ids.length) {
      return;
    }

    setIsDeletingDataDictionary(true);
    try {
      const response = await fetch(API_URLS.CONFIG_DATA_DICTIONARY_DELETE, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: currentUser || "default",
          ids,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || payload?.message || "撤销数据字典失败");
      }

      toast({ description: payload.message || `已撤销 ${ids.length} 条数据字典记录` });
      await loadDataDictionary({ silent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "撤销数据字典失败";
      toast({ description: message, variant: "destructive" });
    } finally {
      setIsDeletingDataDictionary(false);
    }
  }, [currentUser, loadDataDictionary, toast]);

  useEffect(() => {
    if (showSystemSettings && systemSettingsTab === "dictionary") {
      void loadDataDictionary({ silent: true });
    }
  }, [showSystemSettings, systemSettingsTab, loadDataDictionary]);

  const loadRuntimeAnalysisTrace = useCallback(async (options?: { silent?: boolean }) => {
    if (!currentUser) {
      setRuntimeAnalysisRun(null);
      setRuntimeAnalysisEvents([]);
      return;
    }

    setIsLoadingRuntimeAnalysisTrace(true);
    try {
      const username = encodeURIComponent((currentUser || "default").trim() || "default");
      const response = await fetch(`${API_URLS.ANALYSIS_HISTORY_LIST}?username=${username}&limit=20`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || payload?.message || "运行态分析历史加载失败");
      }

      const runs = Array.isArray(payload.runs) ? payload.runs : [];
      const latestRunForSession = runs.find((item: AnalysisHistoryRunSummary) => item.session_id === sessionId) || null;
      if (!latestRunForSession) {
        setRuntimeAnalysisRun(null);
        setRuntimeAnalysisEvents([]);
        return;
      }

      const unchanged =
        runtimeAnalysisRun?.run_id === latestRunForSession.run_id &&
        runtimeAnalysisRun?.event_count === latestRunForSession.event_count &&
        runtimeAnalysisRun?.updated_at === latestRunForSession.updated_at &&
        runtimeAnalysisEvents.length > 0;

      setRuntimeAnalysisRun(latestRunForSession);
      if (unchanged) {
        return;
      }

      const detailResponse = await fetch(`${API_URLS.ANALYSIS_HISTORY_LIST}/${encodeURIComponent(latestRunForSession.run_id)}?username=${username}`);
      const detailPayload = await detailResponse.json().catch(() => ({}));
      if (!detailResponse.ok || !detailPayload?.success) {
        throw new Error(detailPayload?.detail || detailPayload?.message || "运行态分析详情加载失败");
      }

      setRuntimeAnalysisRun(detailPayload.run || latestRunForSession);
      setRuntimeAnalysisEvents(Array.isArray(detailPayload.events) ? detailPayload.events : []);
    } catch (error) {
      if (!options?.silent) {
        const message = error instanceof Error ? error.message : "运行态分析历史加载失败";
        toast({ description: message, variant: "destructive" });
      }
    } finally {
      setIsLoadingRuntimeAnalysisTrace(false);
    }
  }, [currentUser, runtimeAnalysisEvents.length, runtimeAnalysisRun?.event_count, runtimeAnalysisRun?.run_id, runtimeAnalysisRun?.updated_at, sessionId, toast]);

  const [isAnalyzing, setIsAnalyzing] = useState(false); // 是否正在分析中

  useEffect(() => {
    const shouldPollRuntimeTrace = isAnalyzing || runtimeAnalysisRun?.status === "running";
    if (!shouldPollRuntimeTrace) {
      return;
    }

    void loadRuntimeAnalysisTrace({ silent: true });
    const timer = window.setInterval(() => {
      void loadRuntimeAnalysisTrace({ silent: true });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [isAnalyzing, loadRuntimeAnalysisTrace, runtimeAnalysisRun?.status]);

  useEffect(() => {
    setAnalysisHistoryRuns([]);
    setAnalysisHistoryEvents([]);
    setSelectedAnalysisHistoryRun(null);
    setAnalysisHistoryStats({ total: 0, completed: 0, failed: 0, warning: 0 });
    setAnalysisHistorySettings({ ...DEFAULT_ANALYSIS_HISTORY_SETTINGS });
    setDataDictionaryEntries([]);
    setDataDictionaryTotal(0);
    setRuntimeAnalysisRun(null);
    setRuntimeAnalysisEvents([]);
  }, [currentUser]);

  useEffect(() => {
    setRuntimeAnalysisRun(null);
    setRuntimeAnalysisEvents([]);
  }, [sessionId]);

  // 智能体介绍面板状态
  const [showAgentIntro, setShowAgentIntro] = useState(false);

  // 过程指导（Side Guidance / Side Task）状态
  const [sideGuidanceOpen, setSideGuidanceOpen] = useState(false);
  const [sideGuidanceText, setSideGuidanceText] = useState("");
  const [isSubmittingGuidance, setIsSubmittingGuidance] = useState(false);

  // 预览弹窗状态
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState<string>("");
  const [previewContent, setPreviewContent] = useState<string>("");
  const [previewType, setPreviewType] = useState<
    "text" | "image" | "pdf" | "binary"
  >("text");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewDownloadUrl, setPreviewDownloadUrl] = useState<string>("");
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(
    null
  );
  const [deleteIsDir, setDeleteIsDir] = useState<boolean>(false);
  const fileRefreshTimerRef = useRef<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const singleClickTimerRef = useRef<number | null>(null);
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [contextTarget, setContextTarget] = useState<WorkspaceNode | null>(
    null
  );
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string>("");

  const lastScrollTimeRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);
  const stickToBottomRef = useRef(true);
  // const aiUpdateTimerRef = useRef<number | null>(null); // Removed in favor of RAF
  const aiPendingContentRef = useRef<string>("");
  const aiDisplayedContentRef = useRef<string>("");
  const streamRafRef = useRef<number | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const exportReportBackendRef = useRef<any>(null); // Initialize as null
  const saveChatTimerRef = useRef<number | null>(null);
  // 雨途斩棘录相关ref
  const yutuPanelRef = useRef<HTMLDivElement>(null);

  // 组件挂载后从 localStorage 读取主题
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      // 配置 Monaco Editor
      configureMonaco();

      // 初始化或获取 sessionId
      let sid = localStorage.getItem("sessionId");
      if (!sid) {
        sid = `session_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        localStorage.setItem("sessionId", sid);
      }
      setSessionId(sid);

      const savedTheme = localStorage.getItem("theme");
      const shouldBeDark = savedTheme === "dark";
      setIsDarkMode(shouldBeDark);
      updateThemeClass(shouldBeDark);
      const savedAuto = localStorage.getItem("autoCollapseEnabled");
      if (savedAuto !== null) {
        setAutoCollapseEnabled(savedAuto !== "false");
      }
      // 加载分析模式和模型版本设置
      const savedAnalysisMode = localStorage.getItem("analysisMode");
      if (savedAnalysisMode) setAnalysisMode(savedAnalysisMode);
      const savedAnalysisLanguage = localStorage.getItem(ANALYSIS_LANGUAGE_STORE_KEY);
      if (savedAnalysisLanguage) {
        const normalizedLanguage = normalizeAnalysisLanguage(savedAnalysisLanguage);
        setAnalysisLanguage(normalizedLanguage);
        setPendingAnalysisLanguage(normalizedLanguage);
      }
      const savedModelVersion = localStorage.getItem("modelVersion");
      if (savedModelVersion) setModelVersion(savedModelVersion);
      // 加载七大原则设置
      const loadBoolSetting = (key: string, setter: (v: boolean) => void) => {
        const val = localStorage.getItem(key);
        if (val !== null) setter(val !== "false");
      };
      loadBoolSetting("selfCorrectionEnabled", setSelfCorrectionEnabled);
      loadBoolSetting("shortTestEnabled", setShortTestEnabled);
      loadBoolSetting("taskDecompositionEnabled", setTaskDecompositionEnabled);
      loadBoolSetting("explainabilityEnabled", setExplainabilityEnabled);
      loadBoolSetting("efficientProcessingEnabled", setEfficientProcessingEnabled);
      loadBoolSetting("deadLoopDetectionEnabled", setDeadLoopDetectionEnabled);
      // 加载雨途斩棘录HTML
      loadYutuHtml();
      loadYutuRecords();
    }
  }, []);

  // 按 session 维度持久化/恢复 折叠状态 与 手动锁
  useEffect(() => {
    if (!sessionId) return;
    try {
      const cs = localStorage.getItem(`collapsedSections:${sessionId}`);
      if (cs) setCollapsedSections(JSON.parse(cs));
      const ml = localStorage.getItem(`manualLocks:${sessionId}`);
      if (ml) setManualLocks(JSON.parse(ml));
    } catch { }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    try {
      localStorage.setItem(
        `collapsedSections:${sessionId}`,
        JSON.stringify(collapsedSections)
      );
      localStorage.setItem(
        `manualLocks:${sessionId}`,
        JSON.stringify(manualLocks)
      );
    } catch { }
  }, [sessionId, collapsedSections, manualLocks]);

  // 当 activeSection 变化时自动滚动到对应步骤
  useEffect(() => {
    if (activeSection && stepNavigatorRef.current) {
      const activeStepElement = activeStepRefs.current.get(activeSection);
      if (activeStepElement) {
        const container = stepNavigatorRef.current;
        const stepRect = activeStepElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // 计算需要滚动的距离
        const scrollLeft =
          activeStepElement.offsetLeft -
          containerRect.width / 2 +
          stepRect.width / 2;

        // 平滑滚动到目标位置
        container.scrollTo({
          left: scrollLeft,
          behavior: "smooth",
        });
      }
    }
  }, [activeSection]);

  // --- 雨途斩棘录函数 ---
  const [showBackupRestore, setShowBackupRestore] = useState(false);
  const [backups, setBackups] = useState<string[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<string>("");
  const [restoreMode, setRestoreMode] = useState<"append" | "overwrite">("append");
  const [backupName, setBackupName] = useState<string>("");
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  const createBackup = async () => {
    try {
      setIsCreatingBackup(true);
      const res = await fetch(`${API_URLS.YUTU_BACKUP_CREATE}?username=${encodeURIComponent(currentUser || "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: backupName })
      });
      if (res.ok) {
        toast({ description: "备份创建成功" });
        setBackupName("");
        loadBackups();
      }
    } catch (e) {
      toast({ description: "备份失败", variant: "destructive" });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const deleteBackupFile = async (filename: string) => {
    if (!window.confirm(`确定要删除备份文件 ${filename} 吗？此操作不可撤销。`)) return;
    try {
      const res = await fetch(`${API_URLS.YUTU_BACKUP_DELETE}?filename=${encodeURIComponent(filename)}&username=${encodeURIComponent(currentUser || "")}`, {
        method: "DELETE"
      });
      if (res.ok) {
        toast({ description: "备份已删除" });
        if (selectedBackup === filename) setSelectedBackup("");
        loadBackups();
      }
    } catch (e) {
      toast({ description: "删除失败", variant: "destructive" });
    }
  };

  const loadBackups = async () => {
    try {
      const res = await fetch(`${API_URLS.YUTU_BACKUP_LIST}?username=${encodeURIComponent(currentUser || "")}`);
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups || []);
      }
    } catch (e) {
      console.error("加载备份列表失败:", e);
    }
  };

  const restoreBackup = async () => {
    if (!selectedBackup) {
      toast({ description: "请选择备份文件", variant: "destructive" });
      return;
    }
    const confirmMsg = restoreMode === "overwrite"
      ? "警告：覆盖模式将清空当前所有记录！确定要继续吗？"
      : "确定要从备份追加记录吗？";
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`${API_URLS.YUTU_BACKUP_RESTORE}?username=${encodeURIComponent(currentUser || "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: selectedBackup, mode: restoreMode })
      });
      if (res.ok) {
        toast({ description: "恢复成功" });
        setShowBackupRestore(false);
        loadYutuHtml();
        loadYutuRecords();
      }
    } catch (e) {
      toast({ description: "恢复失败", variant: "destructive" });
    }
  };

  const initYutu = async () => {
    if (currentUser !== "rainforgrain") {
      toast({ description: "只有超级用户可以初始化", variant: "destructive" });
      return false;
    }
    // 确认初始化操作
    if (!window.confirm("确定要初始化雨途斩棘录吗？此操作将重置所有记录！")) {
      return false;
    }
    try {
      const res = await fetch(`${API_URLS.YUTU_INIT}?username=${encodeURIComponent(currentUser || "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (res.ok) {
        toast({ description: "雨途斩棘录初始化成功" });
        loadYutuHtml();
        loadYutuRecords();
        return true;
      } else {
        const data = await res.json();
        toast({ description: data.detail || "初始化失败", variant: "destructive" });
      }
    } catch (e) {
      toast({ description: "初始化失败: " + (e as Error).message, variant: "destructive" });
    }
    return false;
  };

  // 确认整理结果 - 使用完整URL
  const confirmOrganize = async () => {
    try {
      const confirmUrl = `${API_URLS.YUTU_ORGANIZE_CONFIRM}?username=${encodeURIComponent(currentUser || "")}`;
      const res = await fetch(confirmUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: organizedRecords })
      });
      if (res.ok) {
        toast({ description: "已确认整理结果" });
        setShowOrganizePreview(false);
        loadYutuRecords();
        loadYutuHtml();
      }
    } catch (e) {
      toast({ description: "确认失败", variant: "destructive" });
    }
  };

  // 总结分析任务完成情况和亮点
  const [showSuccessSummary, setShowSuccessSummary] = useState(false);
  const [successSummary, setSuccessSummary] = useState<string>("");
  const summarizeSuccessPoints = async () => {
    if (!hasAnalysisCompleted) return;
    setIsRecordingKnowledge(true);

    try {
      // 从消息中提取分析结果
      const aiMessages = messages.filter(m => m.sender === "ai" && m.content);
      if (aiMessages.length === 0) {
        toast({ description: "暂无分析内容", variant: "destructive" });
        setIsRecordingKnowledge(false);
        return;
      }

      const lastContent = aiMessages[aiMessages.length - 1].content;

      // 使用VLLM生成总结（简化版）
      const prompt = `请从以下分析内容中提取本次分析的亮点和成功要点（最多10条，总300字以内）。只列出要点，用简洁的中文描述。
分析内容摘要：${lastContent.slice(0, 2000)}
请直接输出要点列表，每条一行，不要有额外说明。`;

      try {
        const response = await fetch("/api/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: prompt }],
            max_tokens: 500,
            temperature: 0.3
          })
        });

        if (response.ok) {
          const data = await response.json();
          const summary = data.choices?.[0]?.message?.content || "";
          // 限制总长度
          const truncated = summary.length > 300 ? summary.slice(0, 300) + "..." : summary;
          setSuccessSummary(truncated);
        } else {
          // 如果API失败，使用本地简单提取
          setSuccessSummary(extractLocalSuccessPoints(lastContent));
        }
      } catch {
        setSuccessSummary(extractLocalSuccessPoints(lastContent));
      }

      setShowSuccessSummary(true);
    } finally {
      setIsRecordingKnowledge(false);
    }
  };

  // 本地提取亮点（API失败时的备选方案）
  const extractLocalSuccessPoints = (content: string): string => {
    const lines = content.split('\n').filter(l => l.trim().length > 10).slice(0, 10);
    return lines.map(l => `• ${l.trim().slice(0, 50)}${l.length > 50 ? "..." : ""}`).join('\n').slice(0, 300);
  };

  // 记录知识到雨途斩棘录
  const recordKnowledgeFromAnalysis = async () => {
    if (isRecordingKnowledge || !knowledgeBaseEnabled) return;

    setIsRecordingKnowledge(true);
    toast({ description: "正在分析并记录知识..." });

    try {
      // 获取当前的聊天消息
      const analysisContent = messages
        .filter(m => m.sender === "ai")
        .map(m => m.content)
        .join("\n\n---\n\n");

      if (!analysisContent) {
        toast({ description: "暂无分析内容可记录", variant: "destructive" });
        setIsRecordingKnowledge(false);
        return;
      }

      // 构造提示让AI分析并提取知识
      const prompt = `你是雨途斩棘录的知识提取助手。请分析以下智能体分析过程，提取其中出现的错误和解决方案。

分析过程：
${analysisContent}

请按以下JSON格式输出发现的错误和解决方案（每条记录包含error_type, error_message, solution, solution_code四个字段）：
[
  {
    "error_type": "错误类型",
    "error_message": "错误消息",
    "solution": "解决方案描述",
    "solution_code": "解决方案代码（如果没有则为空字符串）"
  }
]

如果没有发现任何错误，请返回空数组：[]`;

      const response = await fetch(API_URLS.CHAT_COMPLETIONS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "user", content: prompt }
          ],
          session_id: sessionId,
          username: currentUser || "default"
        })
      });

      if (response.ok) {
        // 解析返回的知识记录
        const reader = response.body?.getReader();
        if (reader) {
          let result = "";
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            result += decoder.decode(value);
          }

          // 提取JSON数组
          const jsonMatch = result.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            try {
              const knowledgeRecords = JSON.parse(jsonMatch[0]);

              if (!Array.isArray(knowledgeRecords) || knowledgeRecords.length === 0) {
                toast({ description: "未发现需要记录的知识" });
                setIsRecordingKnowledge(false);
                return;
              }

              // 检查重复并记录
              let recordedCount = 0;
              for (const record of knowledgeRecords) {
                if (record.error_type && record.error_message) {
                  // 检查是否已存在相似记录
                  const searchResult = await fetch(`${API_URLS.YUTU_SEARCH}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      keywords: [record.error_type, record.error_message.substring(0, 30)],
                      page: 1,
                      page_size: 5
                    })
                  });

                  if (searchResult.ok) {
                    const data = await searchResult.json();
                    const existingRecords = data.data?.items || [];
                    const isDuplicate = existingRecords.some((existing: any) =>
                      existing.error_type === record.error_type &&
                      (existing.error_message.includes(record.error_message.substring(0, 50)) ||
                       record.error_message.includes(existing.error_message.substring(0, 50)))
                    );

                    if (!isDuplicate) {
                      await handleSaveYutuRecord({
                        error_type: record.error_type,
                        error_message: record.error_message,
                        error_context: "通过分析过程自动提取",
                        solution: record.solution || "",
                        solution_code: record.solution_code || "",
                        confidence: 0.8
                      });
                      recordedCount++;
                    }
                  }
                }
              }

              toast({ description: `已记录 ${recordedCount} 条知识到雨途斩棘录` });
              loadYutuRecords();
            } catch (e) {
              console.error("解析知识记录失败:", e);
              toast({ description: "知识记录解析失败", variant: "destructive" });
            }
          }
        }
      }
    } catch (e) {
      console.error("记录知识失败:", e);
      toast({ description: "记录知识失败: " + (e as Error).message, variant: "destructive" });
    } finally {
      setIsRecordingKnowledge(false);
    }
  };

  // 更新分析完成状态（当有Answer区块时）
  useEffect(() => {
    const hasAnswer = messages.some(m =>
      m.sender === "ai" && m.content && /<answer>/i.test(m.content)
    );
    setHasAnalysisCompleted(hasAnswer);
  }, [messages]);

  // 登出后额外清理（组件级别的状态，不在 hooks 中管理）
  const performLogout = async () => {
    await performLogoutRaw(sessionId);
    setWorkspaceFiles([]);
    setWorkspaceTree(null);
    setAttachments([]);
    setInputValue("");
    setSideGuidanceHistory([]);
    setProjectName("");
    setShowSaveDialog(false);
    setShowProjectManager(false);
    setShowTaskTreeDialog(false);
    setTaskTreeData(null);
    setSelectedTasks(new Set());
    setShowDataDictionaryDialog(false);
    setDataDictionaryItems(null);
    setSelectedDictionaryItems(new Set());
    loadRegisteredUsers();
  };


  const applyKnowledgeSettings = (settings: any) => {
    setKnowledgeBaseEnabled(Boolean(settings?.knowledge_base_enabled));
    setExternalKnowledgeEnabled(Boolean(settings?.providers_enabled));
    const internalPreferences = settings?.internal_preferences || {};
    if (internalPreferences.preferred_view === "html" || internalPreferences.preferred_view === "table") {
      setKnowledgePreferredView(internalPreferences.preferred_view);
    }
    setShowKnowledgeHints(Boolean(internalPreferences.show_hints));
    setAutoOpenYutuAfterAnalysis(Boolean(internalPreferences.auto_open_yutu_after_analysis));

    const nextOnyx = settings?.onyx || {};
    setOnyxConfig({
      enabled: Boolean(nextOnyx.enabled),
      base_url: nextOnyx.base_url || "http://localhost:3000",
      api_key: "",
      search_path: nextOnyx.search_path || "/api/chat/search",
      has_api_key: Boolean(nextOnyx.has_api_key),
    });

    const nextDify = settings?.dify || {};
    setDifyConfig({
      enabled: Boolean(nextDify.enabled),
      base_url: nextDify.base_url || "http://localhost:5000",
      api_key: "",
      workflow_id: nextDify.workflow_id || "",
      has_api_key: Boolean(nextDify.has_api_key),
    });

    setKnowledgeTestResults(settings?.test_status || {});
    setKnowledgeSettingsLoaded(true);
  };

  const loadKnowledgeConfig = useCallback(async () => {
    setIsLoadingKnowledgeConfig(true);
    try {
      const response = await fetch(API_URLS.KB_SETTINGS_GET);
      const data = await response.json();
      if (data.success) {
        applyKnowledgeSettings(data.settings || {});
      } else {
        toast({ description: `知识库配置加载失败: ${data.message || "未知错误"}`, variant: "destructive" });
      }
    } catch (error) {
      console.error("Load knowledge config error:", error);
      toast({ description: "知识库配置加载失败", variant: "destructive" });
    } finally {
      setIsLoadingKnowledgeConfig(false);
    }
  }, []);

  const buildKnowledgeSettingsPayload = () => ({
    knowledge_base_enabled: knowledgeBaseEnabled,
    providers_enabled: externalKnowledgeEnabled,
    internal_preferences: {
      preferred_view: knowledgePreferredView,
      show_hints: showKnowledgeHints,
      auto_open_yutu_after_analysis: autoOpenYutuAfterAnalysis,
    },
    onyx: {
      enabled: onyxConfig.enabled,
      base_url: onyxConfig.base_url,
      api_key: onyxConfig.api_key || (onyxConfig.has_api_key ? "••••••••" : ""),
      search_path: onyxConfig.search_path,
    },
    dify: {
      enabled: difyConfig.enabled,
      base_url: difyConfig.base_url,
      api_key: difyConfig.api_key || (difyConfig.has_api_key ? "••••••••" : ""),
      workflow_id: difyConfig.workflow_id,
    },
  });

  const handleSaveKnowledgeConfig = async () => {
    setIsSavingKnowledgeConfig(true);
    try {
      const payload = buildKnowledgeSettingsPayload();
      // 保存到全局设置（兼容旧行为）
      const response = await fetch(API_URLS.KB_SETTINGS_SAVE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (data.success) {
        applyKnowledgeSettings(data.settings || {});
        if (typeof window !== "undefined") {
          localStorage.setItem("knowledgeBaseEnabled", knowledgeBaseEnabled ? "true" : "false");
          localStorage.setItem(
            "knowledgeSettings",
            JSON.stringify({
              preferredView: knowledgePreferredView,
              showKnowledgeHints,
              autoOpenYutuAfterAnalysis,
            })
          );
        }
        // 同时保存到用户本地配置文件
        try {
          await fetch(
            `${API_URLS.CONFIG_KNOWLEDGE_SAVE}?username=${currentUser || "default"}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: currentUser || "default", settings: payload }),
            }
          );
        } catch { /* non-critical */ }
        toast({ description: data.message || "知识库配置已保存" });
      } else {
        toast({ description: `保存失败: ${data.message || "未知错误"}`, variant: "destructive" });
      }
    } catch (error) {
      console.error("Save knowledge config error:", error);
      toast({ description: "知识库配置保存失败", variant: "destructive" });
    } finally {
      setIsSavingKnowledgeConfig(false);
    }
  };

  const handleTestKnowledgeProvider = async (provider: "onyx" | "dify" | "all") => {
    setKnowledgeTestTarget(provider);
    try {
      const response = await fetch(API_URLS.KB_TEST, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, settings: buildKnowledgeSettingsPayload() }),
      });
      const data = await response.json();
      if (Array.isArray(data.results)) {
        const nextResults: Record<string, { status: string; message: string; tested_at: string | null }> = {};
        data.results.forEach((item: any) => {
          nextResults[item.provider] = {
            status: item.status,
            message: item.message,
            tested_at: item.tested_at || null,
          };
        });
        setKnowledgeTestResults((prev) => ({ ...prev, ...nextResults }));
      }
      if (data.settings) {
        applyKnowledgeSettings(data.settings);
      }
      if (data.success) {
        toast({ description: provider === "all" ? "知识服务测试通过" : `${provider === "onyx" ? "Onyx" : "Dify"} 测试通过` });
      } else {
        const errorMessage = data.message || data.results?.find((item: any) => !item.success)?.message || "测试失败";
        toast({ description: errorMessage, variant: "destructive" });
      }
    } catch (error) {
      console.error("Test knowledge provider error:", error);
      toast({ description: "知识服务测试请求失败", variant: "destructive" });
    } finally {
      setKnowledgeTestTarget(null);
    }
  };


  // 监听登录状态变化以同步项目列表
  useEffect(() => {
    if (showProjectManager && isLoggedIn) {
      listProjects();
    }
  }, [showProjectManager, isLoggedIn]);

  // 更新主题 class
  const updateThemeClass = (isDark: boolean) => {
    if (typeof document !== "undefined") {
      if (isDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  };

  // 获取某条消息之前最近的用户问题内容
  const getPrevUserQuestionText = (index: number): string => {
    for (let i = index - 1; i >= 0; i--) {
      const m = messages[i];
      if (m && m.sender === "user") return m.content || "";
    }
    return "";
  };

  const buildReportFilename = (question: string) => {
    const clean = (question || "").replace(/\s+/g, " ").trim();
    let tokens = clean.split(/\s+/).filter(Boolean);
    let base = "";
    if (tokens.length <= 1) {
      // 中文/无空格：直接取前 5 个字符，不再用下划线
      base = clean.replace(/\s+/g, "").slice(0, 5);
    } else {
      // 英文/有空格：取前 5 个词，用下划线连接
      base = tokens
        .slice(0, 5)
        .map((t) => t.replace(/[\\/:*?"<>|]/g, ""))
        .filter(Boolean)
        .join("_");
    }
    base = base.slice(0, 120);
    return `Report_${base || "Untitled"}.pdf`;
  };

  const exportReportBackend = async () => {
    try {
      const payloadMessages = messages
        .filter((m) => !m.localOnly)
        .map((msg) => ({
          role: msg.sender === "user" ? "user" : "assistant",
          content: msg.content,
        }));
      const title = getPrevUserQuestionText(messages.length);
      const res = await fetch(API_URLS.EXPORT_REPORT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: payloadMessages,
          title,
          session_id: sessionId,
          analysis_language: analysisLanguage,
          report_types: reportTypes,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const md = data?.md;
      toast({ description: `已提交并生成: ${md}` });
      await loadWorkspaceFiles();
      await loadWorkspaceTree?.();
    } catch (e) {
      console.error("backend export error", e);
      toast({ description: "导出失败", variant: "destructive" });
    }
  };

  useEffect(() => {
    exportReportBackendRef.current = exportReportBackend;
  }, [exportReportBackend]);

  // 切换主题
  const toggleTheme = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    updateThemeClass(newDarkMode);

    // 保存到 localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("theme", newDarkMode ? "dark" : "light");
    }
  };

  // 处理拖动调整大小
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = editorHeight;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector(".editor-container");
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const deltaY = e.clientY - startY;
      const containerHeight = containerRect.height;
      const deltaPercent = (deltaY / containerHeight) * 100;

      const newHeight = Math.min(Math.max(startHeight + deltaPercent, 20), 80);
      setEditorHeight(newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsTyping(false);
    setStreamingMessageId(null);
    if (streamRafRef.current) {
      cancelAnimationFrame(streamRafRef.current);
      streamRafRef.current = null;
    }
    toast({ description: "已停止生成" });
  };

  // 节流滚动到底部

  const scrollToBottom = useCallback((force: boolean = false) => {
    const now = Date.now();
    const timeSinceLastScroll = now - lastScrollTimeRef.current;

    // 节流：默认 100ms，强制模式下忽略
    if (!force && timeSinceLastScroll < 100) {
      return;
    }

    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
    }

    scrollRafRef.current = requestAnimationFrame(() => {
      if (messagesContainerRef.current) {
        const container = messagesContainerRef.current;
        // 使用 behavior: auto (默认) 以确保瞬间跳转，避免 smooth 带来的滞后叠加
        container.scrollTop = container.scrollHeight;
        stickToBottomRef.current = true;
        lastScrollTimeRef.current = Date.now();
      }
      scrollRafRef.current = null;
    });
  }, []);

  // 输入完成后平滑滚动到底部（避免流式期间 setInterval 导致频繁布局计算）
  useEffect(() => {
    if (isTyping) return;
    if (!stickToBottomRef.current) return;
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    }, 100);
  }, [isTyping]);

  // 监听消息变化
  useEffect(() => {
    if (stickToBottomRef.current) {
      // 流式输出时(streamingMessageId存在)强制滚动，消除滞后
      scrollToBottom(!!streamingMessageId);
    }
  }, [messages, scrollToBottom, streamingMessageId]);

  // 聊天消息本地缓存：加载与保存
  const [chatLoaded, setChatLoaded] = useState(false);

  // 挂载后再次从本地覆盖加载，避免 SSR 初始状态覆盖缓存
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as any[];
        if (Array.isArray(arr) && arr.length) {
          const restored = arr.map((m) => ({
            ...m,
            timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
          })) as Message[];
          setMessages(restored);
        }
      }
    } catch (e) {
      console.warn("post-mount load chat cache failed", e);
    }
    setChatLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (!chatLoaded) return; // 避免首屏用欢迎消息覆盖已有缓存
      if (typeof window === "undefined") return;

      if (saveChatTimerRef.current) {
        window.clearTimeout(saveChatTimerRef.current);
        saveChatTimerRef.current = null;
      }

      const delay = isTyping ? 1500 : 200;
      saveChatTimerRef.current = window.setTimeout(() => {
        try {
          const data = JSON.stringify(
            messages.map((m) => ({
              ...m,
              timestamp: (m.timestamp instanceof Date
                ? m.timestamp
                : new Date(m.timestamp as any)
              ).toISOString(),
            }))
          );
          localStorage.setItem(CHAT_STORAGE_KEY, data);
        } catch (e) {
          console.warn("save chat cache failed", e);
        } finally {
          saveChatTimerRef.current = null;
        }
      }, delay);
    } catch (e) {
      console.warn("save chat cache failed", e);
    }
  }, [messages, chatLoaded, isTyping]);

  // 一键清空聊天：保留欢迎消息（仅本地显示）
  const clearChat = () => {
    if (isTyping) {
      toast({ description: "执行中，暂时无法清空", variant: "destructive" });
      return;
    }
    const welcome: Message = {
      id: `welcome-${Date.now()}`,
      content: "您好！很高兴和您一起运用大数据开展海关风险分析。我将按您的分析目标和要求，协助您深入分析进出口业务数据，运用规律分析、统计分析、对比分析、关联分析等方法，开展多角度逻辑推理，协助您挖掘走私违规、逃证逃税及违反安全准入等潜在风险，维护贸易秩序。请上传数据，让我们开始深度洞察。",
      sender: "ai",
      timestamp: new Date(),
      localOnly: true,
    };
    setMessages([welcome]);
    setShowTaskTreeDialog(false);
    setTaskTreeData(null);
    setSelectedTasks(new Set());
    setShowDataDictionaryDialog(false);
    setDataDictionaryItems(null);
    setSelectedDictionaryItems(new Set());
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify([welcome]));
      }
    } catch { }
    toast({ description: "已清空聊天" });
  };

  // 创建全新 Session
  const createNewSession = async () => {
    if (isTyping) {
      toast({ description: "执行中，暂时无法开启新会话", variant: "destructive" });
      return;
    }

    // 1. 抑制轮询 + 清空当前工作区文件 (发送 DELETE 请求)
    suppressWorkspaceRefreshCount.current += 1;
    try {
      await fetch(`${API_URLS.WORKSPACE_CLEAR}?session_id=${sessionId}&username=${currentUser || "default"}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.warn("Failed to clear workspace for new session", e);
    } finally {
      suppressWorkspaceRefreshCount.current -= 1;
    }

    // 2. 重置 UI 状态（在设置新 sessionId 之前，防止轮询干扰）
    setWorkspaceFiles([]);
    setWorkspaceTree(null);
    setAttachments([]);
    setHistoryInputs([]);
    setCollapsedSections({});
    setManualLocks({});
    setProjectName("");
    setSideGuidanceHistory([]);
    setShowTaskTreeDialog(false);
    setTaskTreeData(null);
    setSelectedTasks(new Set());
    setShowDataDictionaryDialog(false);
    setDataDictionaryItems(null);
    setSelectedDictionaryItems(new Set());
    // 清空聊天区域、输入框、代码编辑器
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        content: "您好！很高兴和您一起运用大数据开展海关风险分析。我将按您的分析目标和要求，协助您深入分析进出口业务数据，运用规律分析、统计分析、对比分析、关联分析等方法，开展多角度逻辑推理，协助您挖掘走私违规、逃证逃税及违反安全准入等潜在风险，维护贸易秩序。请上传数据，让我们开始深度洞察。",
        sender: "ai",
        timestamp: new Date(),
        localOnly: true,
      },
    ]);
    localStorage.removeItem(CHAT_STORAGE_KEY);
    setInputValue("");
    setCodeEditorContent("");
    setActiveSection("");

    // 3. 生成新 Session ID（这会触发 useEffect 加载新工作区，但新工作区是空的）
    const newSid = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem("sessionId", newSid);
    setSessionId(newSid);

    toast({ description: "已开启全新分析会话" });
  };

  useEffect(() => {
    if (sessionId) {
      // 如果文件恢复正在进行，等待完成后再加载
      if (suppressDuringFileRestore.current) {
        const interval = setInterval(() => {
          if (!suppressDuringFileRestore.current) {
            loadWorkspaceFiles();
            loadWorkspaceTree();
            clearInterval(interval);
          }
        }, 100);
        return () => clearInterval(interval);
      }
      loadWorkspaceFiles();
      loadWorkspaceTree();
    }
  }, [sessionId]);

  // 页面加载时：弹出登录对话框（仅在首次加载时）
  useEffect(() => {
    const savedKnowledgeEnabled = localStorage.getItem("knowledgeBaseEnabled");
    if (savedKnowledgeEnabled !== null) {
      setKnowledgeBaseEnabled(savedKnowledgeEnabled === "true");
    }

    const savedKnowledgeSettings = localStorage.getItem("knowledgeSettings");
    if (savedKnowledgeSettings) {
      try {
        const parsed = JSON.parse(savedKnowledgeSettings);
        if (parsed.preferredView === "html" || parsed.preferredView === "table") {
          setKnowledgePreferredView(parsed.preferredView);
        }
        if (typeof parsed.showKnowledgeHints === "boolean") {
          setShowKnowledgeHints(parsed.showKnowledgeHints);
        }
        if (typeof parsed.autoOpenYutuAfterAnalysis === "boolean") {
          setAutoOpenYutuAfterAnalysis(parsed.autoOpenYutuAfterAnalysis);
        }
      } catch {
        // ignore invalid local knowledge settings
      }
    }

    const savedReportTypes = localStorage.getItem("reportTypes");
    if (savedReportTypes) {
      try {
        const parsed = JSON.parse(savedReportTypes);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setReportTypes(parsed.filter((item) => typeof item === "string"));
          setPendingReportTypes(parsed.filter((item) => typeof item === "string"));
        }
      } catch {
        // ignore invalid report types cache
      }
    }

    const savedDockedState = localStorage.getItem(LEFT_PANEL_DOCKED_STORE_KEY);
    if (savedDockedState !== null) {
      setIsLeftPanelDocked(savedDockedState === "true");
    }

    let hasLoadedModelProvider = false;
    const savedModelProviderStore = localStorage.getItem(MODEL_PROVIDER_STORE_KEY);
    if (savedModelProviderStore) {
      try {
        const parsedStore = JSON.parse(savedModelProviderStore);
        const providers = Array.isArray(parsedStore?.providers)
          ? parsedStore.providers
          : [];
        if (providers.length > 0) {
          const library = buildModelProviderLibrary(providers);
          const selectedId =
            typeof parsedStore?.selectedId === "string"
              ? parsedStore.selectedId
              : providers[0]?.id;

          const ordered = orderModelProviders(library, selectedId);
          const selected = ordered[0] || normalizeModelProviderEntry();
          setModelProviderLibrary(library);
          setModelProviderConfig(selected);
          setModelHeadersInput(stringifyModelHeaders(selected.headers));
          hasLoadedModelProvider = true;
        }
      } catch {
        // ignore invalid store cache
      }
    }

    if (!hasLoadedModelProvider) {
      const savedModelProvider = localStorage.getItem("modelProviderConfig");
      if (savedModelProvider) {
        try {
          const parsed = JSON.parse(savedModelProvider);
          const nextConfig = normalizeModelProviderEntry(parsed);
          setModelProviderLibrary({ [nextConfig.id]: nextConfig });
          setModelProviderConfig(nextConfig);
          setModelHeadersInput(stringifyModelHeaders(nextConfig.headers));
          hasLoadedModelProvider = true;
        } catch {
          // ignore invalid legacy cache
        }
      }
    }

    if (!hasLoadedModelProvider) {
      const fallback = normalizeModelProviderEntry();
      setModelProviderLibrary({ [fallback.id]: fallback });
      setModelProviderConfig(fallback);
      setModelHeadersInput(stringifyModelHeaders(fallback.headers));
    }

    loadKnowledgeConfig();

    if (!isLoggedIn) {
      setShowAuthModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 仅在挂载时执行一次

  // 用户登录后从后端加载持久化配置（覆盖 localStorage 缓存）
  useEffect(() => {
    if (!isLoggedIn || !currentUser) return;

    (async () => {
      try {
        // 1. 加载模型配置
        const modelRes = await fetch(
          `${API_URLS.CONFIG_MODELS_GET}?username=${currentUser}`
        );
        if (modelRes.ok) {
          const modelData = await modelRes.json();
          const providers = Array.isArray(modelData?.providers)
            ? modelData.providers
            : [];
          if (providers.length > 0) {
            const library = buildModelProviderLibrary(providers);
            const selectedId =
              typeof modelData?.selected_id === "string"
                ? modelData.selected_id
                : providers[0]?.id;
            const ordered = orderModelProviders(library, selectedId);
            const nextConfig = ordered[0] || normalizeModelProviderEntry();

            setModelProviderLibrary(library);
            setModelProviderConfig(nextConfig);
            setModelHeadersInput(stringifyModelHeaders(nextConfig.headers));

            if (typeof window !== "undefined") {
              localStorage.setItem("modelProviderConfig", JSON.stringify(nextConfig));
              localStorage.setItem(
                MODEL_PROVIDER_STORE_KEY,
                JSON.stringify({
                  selectedId: nextConfig.id,
                  providers: ordered,
                })
              );
            }
          }
        }

        // 2. 加载数据库配置与数据源选择状态
        const applyDbSettings = (typeValue: unknown, configValue: unknown) => {
          const normalizedType = normalizeDbTypeForRequest(String(typeValue || "mysql"));
          handleDbTypeChange(normalizedType);
          if (configValue && typeof configValue === "object") {
            setDbConfig((prev) => {
              const merged = { ...prev, ...(configValue as Record<string, unknown>) };
              const nextPort = String(merged.port || "").trim();
              return {
                ...merged,
                port: nextPort || getDefaultPortForDbType(normalizedType),
              } as typeof prev;
            });
          }
        };

        const restoreDataSourceSelection = (connections: SavedDatabaseConnection[]) => {
          if (typeof window === "undefined") {
            setSelectedDbSourceIds([]);
            setDataSourceSelection({ selectedDbSourceIds: [], allowFilesOnly: false });
            setSourceSelectionExplicit(false);
            return;
          }

          const selectionKey = getUserDataSourceSelectionStorageKey(currentUser);
          const selectionRaw = localStorage.getItem(selectionKey);
          let storedSelection: DataSourceSelectionState | null = null;

          if (selectionRaw) {
            try {
              const parsed = JSON.parse(selectionRaw);
              if (parsed && typeof parsed === "object") {
                const parsedIds = Array.isArray(parsed.selectedDbSourceIds)
                  ? parsed.selectedDbSourceIds.map((item: unknown) => String(item || "").trim()).filter(Boolean)
                  : [];
                storedSelection = {
                  selectedDbSourceIds: parsedIds,
                  allowFilesOnly: Boolean(parsed.allowFilesOnly),
                };
              }
            } catch {
              // ignore invalid storage payload
            }
          }

          const availableIds = new Set(connections.map((item) => item.id));
          const restoredIds = (storedSelection?.selectedDbSourceIds || []).filter((id) => availableIds.has(id));

          setSelectedDbSourceIds(restoredIds);
          setDataSourceSelection({
            selectedDbSourceIds: restoredIds,
            allowFilesOnly: Boolean(storedSelection?.allowFilesOnly),
          });
          setSourceSelectionExplicit(restoredIds.length > 0 || Boolean(storedSelection?.allowFilesOnly));
        };

        let dbLoadedFromBackend = false;
        const dbRes = await fetch(
          `${API_URLS.CONFIG_DATABASES_GET}?username=${currentUser}`
        );
        if (dbRes.ok) {
          const dbData = await dbRes.json();
          const normalizedConnections = normalizeSavedDbConnections(dbData.connections);
          setSavedDbConnections(normalizedConnections);
          restoreDataSourceSelection(normalizedConnections);

          if (normalizedConnections.length > 0) {
            const preferred = normalizedConnections[0];
            applyDbSettings(preferred.dbType, preferred.config);
            dbLoadedFromBackend = true;

            if (typeof window !== "undefined") {
              localStorage.setItem(
                getUserDbSettingsStorageKey(currentUser),
                JSON.stringify({
                  dbType: preferred.dbType,
                  dbConfig: preferred.config,
                })
              );
            }
          }
        }

        if (!dbLoadedFromBackend && typeof window !== "undefined") {
          const scopedKey = getUserDbSettingsStorageKey(currentUser);
          let savedDbSettings = localStorage.getItem(scopedKey);

          // 兼容旧版单 key 缓存：迁移到当前用户维度
          if (!savedDbSettings) {
            const legacy = localStorage.getItem(LEGACY_DB_SETTINGS_STORE_KEY);
            if (legacy) {
              savedDbSettings = legacy;
              localStorage.setItem(scopedKey, legacy);
            }
          }

          if (savedDbSettings) {
            try {
              const parsed = JSON.parse(savedDbSettings);
              applyDbSettings(parsed?.dbType, parsed?.dbConfig);

              const fallbackType = normalizeDbTypeForRequest(String(parsed?.dbType || "mysql"));
              const fallbackConfig = parsed?.dbConfig && typeof parsed.dbConfig === "object"
                ? (parsed.dbConfig as Record<string, unknown>)
                : {};
              const fallbackConnection = normalizeSavedDbConnections([
                {
                  id: buildDatabaseConnectionId(fallbackType, fallbackConfig),
                  dbType: fallbackType,
                  config: fallbackConfig,
                },
              ]);
              setSavedDbConnections(fallbackConnection);
              restoreDataSourceSelection(fallbackConnection);
            } catch {
              // ignore invalid per-user db settings cache
              setSavedDbConnections([]);
              setSelectedDbSourceIds([]);
            }
          } else {
            setSavedDbConnections([]);
            setSelectedDbSourceIds([]);
          }
        }

        // 3. 加载知识库配置
        const kbRes = await fetch(
          `${API_URLS.CONFIG_KNOWLEDGE_GET}?username=${currentUser}`
        );
        if (kbRes.ok) {
          const kbData = await kbRes.json();
          const settings = kbData.settings || {};
          if (typeof settings.knowledge_base_enabled === "boolean") {
            setKnowledgeBaseEnabled(settings.knowledge_base_enabled);
          }
          if (settings.internal_preferences) {
            const prefs = settings.internal_preferences;
            if (prefs.preferred_view) setKnowledgePreferredView(prefs.preferred_view);
            if (typeof prefs.show_hints === "boolean") setShowKnowledgeHints(prefs.show_hints);
            if (typeof prefs.auto_open_yutu_after_analysis === "boolean") setAutoOpenYutuAfterAnalysis(prefs.auto_open_yutu_after_analysis);
          }
        }
      } catch (e) {
        console.warn("Failed to load user configs from backend:", e);
      }
    })();
  }, [isLoggedIn, currentUser]);

  useEffect(() => {
    if (!savedDbConnections.length) {
      if (selectedDbSourceIds.length > 0) {
        setSelectedDbSourceIds([]);
      }
      setDataSourceSelection((prev) => {
        if (prev.selectedDbSourceIds.length === 0 && !prev.allowFilesOnly) {
          return prev;
        }
        return { selectedDbSourceIds: [], allowFilesOnly: false };
      });
      setSourceSelectionExplicit(false);
      return;
    }

    const validIds = new Set(savedDbConnections.map((item) => item.id));
    const sanitizedIds = selectedDbSourceIds.filter((id) => validIds.has(id));
    if (!areSameStringArrays(selectedDbSourceIds, sanitizedIds)) {
      setSelectedDbSourceIds(sanitizedIds);
    }
    setDataSourceSelection((prev) => {
      if (areSameStringArrays(prev.selectedDbSourceIds, sanitizedIds)) {
        return prev;
      }
      return {
        ...prev,
        selectedDbSourceIds: sanitizedIds,
      };
    });
  }, [savedDbConnections, selectedDbSourceIds]);

  useEffect(() => {
    if (typeof window === "undefined" || !currentUser) {
      return;
    }
    localStorage.setItem(
      getUserDataSourceSelectionStorageKey(currentUser),
      JSON.stringify({
        selectedDbSourceIds: dataSourceSelection.selectedDbSourceIds,
        allowFilesOnly: dataSourceSelection.allowFilesOnly,
      })
    );
  }, [currentUser, dataSourceSelection]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      "knowledgeSettings",
      JSON.stringify({
        preferredView: knowledgePreferredView,
        showKnowledgeHints,
        autoOpenYutuAfterAnalysis,
      })
    );
  }, [knowledgePreferredView, showKnowledgeHints, autoOpenYutuAfterAnalysis]);

  useEffect(() => {
    const normalizedCurrent = normalizeModelProviderEntry(modelProviderConfig);
    setModelProviderLibrary((prev) => {
      const existing = prev[normalizedCurrent.id];
      if (existing && JSON.stringify(existing) === JSON.stringify(normalizedCurrent)) {
        return prev;
      }
      return {
        ...prev,
        [normalizedCurrent.id]: normalizedCurrent,
      };
    });
  }, [modelProviderConfig]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const normalizedCurrent = normalizeModelProviderEntry(modelProviderConfig);
    const nextLibrary = {
      ...modelProviderLibrary,
      [normalizedCurrent.id]: normalizedCurrent,
    };
    const ordered = orderModelProviders(nextLibrary, normalizedCurrent.id);

    localStorage.setItem("modelProviderConfig", JSON.stringify(normalizedCurrent));
    localStorage.setItem(
      MODEL_PROVIDER_STORE_KEY,
      JSON.stringify({
        selectedId: normalizedCurrent.id,
        providers: ordered,
      })
    );
  }, [modelProviderConfig, modelProviderLibrary]);

  useEffect(() => {
    setAvailableModels([]);
    setModelTestStatus({
      status: "never_tested",
      message: "模型配置已变更，请重新获取模型名称",
      testedAt: null,
    });
  }, [
    modelProviderConfig.providerType,
    modelProviderConfig.baseUrl,
    modelProviderConfig.apiKey,
    modelProviderConfig.headers,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("reportTypes", JSON.stringify(reportTypes));
  }, [reportTypes]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(ANALYSIS_LANGUAGE_STORE_KEY, analysisLanguage);
  }, [analysisLanguage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(LEFT_PANEL_DOCKED_STORE_KEY, String(isLeftPanelDocked));
  }, [isLeftPanelDocked]);

  useEffect(() => {
    if (analysisMode !== "interactive") {
      setShowTaskTreeDialog(false);
      setTaskTreeData(null);
      setSelectedTasks(new Set());
      setShowDataDictionaryDialog(false);
      setDataDictionaryItems(null);
      setSelectedDictionaryItems(new Set());
    }
  }, [analysisMode]);

  useEffect(() => {
    if (showAuthModal) {
      loadRegisteredUsers();
    }
  }, [showAuthModal, loadRegisteredUsers]);

  useEffect(() => {
    const id = setInterval(() => {
      // 智能轮询：仅在页面可见且未上传时轮询
      const isVisible =
        typeof document !== "undefined" && document.visibilityState === "visible";
      if (!isUploading && isVisible) {
        loadWorkspaceTree();
        loadWorkspaceFiles();
      }
    }, 4000);
    return () => clearInterval(id);
  }, [isUploading, sessionId, currentUser, loadWorkspaceTree, loadWorkspaceFiles]);

  // 移动：将工作区内的文件/文件夹移动到指定目录（空字符串表示根目录）
  const moveToDir = async (srcPath: string, dstDir: string) => {
    try {
      const url = `${API_CONFIG.BACKEND_BASE_URL
        }/workspace/move?src=${encodeURIComponent(
          srcPath
        )}&dst_dir=${encodeURIComponent(dstDir)}&session_id=${encodeURIComponent(
          sessionId
        )}&username=${currentUser || "default"}`;
      const res = await fetch(url, { method: "POST" });
      if (res.ok) {
        await loadWorkspaceTree();
        await loadWorkspaceFiles();
      }
    } catch (e) {
      console.error("move to dir error", e);
    }
  };

  const uploadToDir = async (dirPath: string, files: FileList | File[]) => {
    try {
      setIsUploading(true);
      const form = new FormData();
      const arr: File[] = Array.from(files as File[]);
      arr.forEach((f) => form.append("files", f));
      const url = `${API_URLS.WORKSPACE_UPLOAD_TO}?dir=${encodeURIComponent(
        dirPath || ""
      )}&session_id=${encodeURIComponent(sessionId)}&username=${currentUser || "default"}`;
      await fetch(url, { method: "POST", body: form });
      await loadWorkspaceTree();
      await loadWorkspaceFiles();
      setUploadMsg(`上传成功 ${arr.length} 个文件`);
      setTimeout(() => setUploadMsg(""), 2000);
    } catch (e) {
      console.error("upload to dir error", e);
      setUploadMsg("上传失败");
      setTimeout(() => setUploadMsg(""), 2500);
    }
    setIsUploading(false);
  };

  const openNode = async (node: WorkspaceNode) => {
    if (node.is_dir) return;
    const ext = (node.extension || "").replace(/^\./, "").toLowerCase();
    // 修正 URL，确保包含 generated 路径
    const correctedUrl = ensureGeneratedInUrl(node.download_url || "");
    const mapped: WorkspaceFile = {
      name: node.name,
      size: node.size || 0,
      extension: ext,
      icon: node.icon || "",
      download_url: correctedUrl,
      preview_url: correctedUrl,
    };
    openPreview(mapped);
  };

  const onContextMenu = (e: React.MouseEvent, node: WorkspaceNode) => {
    e.preventDefault();
    setContextTarget(node);
    setContextPos({ x: e.clientX, y: e.clientY });
  };

  const closeContext = () => {
    setContextPos(null);
    setContextTarget(null);
  };

  // 将后端树转换为 Arborist 数据
  type ArborNode = {
    id: string;
    name: string;
    isDir: boolean;
    icon?: string;
    download_url?: string;
    extension?: string;
    size?: number;
    children?: ArborNode[];
    isGenerated?: boolean; // 标识是否为代码生成的文件
    isConverted?: boolean; // 标识是否为 UTF-8 编码转换后的文件
  };

  const toArbor = (node: WorkspaceNode): ArborNode => ({
    id: node.path || (node.is_dir ? "root_workspace" : `file_${node.name}`),
    name: node.name || "workspace",
    isDir: node.is_dir,
    icon: node.icon,
    download_url: node.download_url,
    extension: node.extension,
    size: node.size,
    isGenerated: node.is_generated,
    isConverted: node.is_converted,
    children: node.children?.map(toArbor),
  });

  const getExt = (name?: string, ext?: string) => {
    const fromExt = (ext || "").replace(/^\./, "").toLowerCase();
    if (fromExt) return fromExt;
    if (!name) return "txt";
    const p = name.lastIndexOf(".");
    return p > -1 ? name.slice(p + 1).toLowerCase() : "txt";
  };

  const Row = ({
    node,
    style,
    dragHandle,
  }: {
    node: NodeApi<ArborNode>;
    style: React.CSSProperties;
    dragHandle?: (el: HTMLDivElement | null) => void;
  }) => {
    const data = node.data;
    const isDir = data.isDir;
    const isGenerated = data.isGenerated || false;
    const isGeneratedFolder = isDir && data.name === "generated";
    const ext = getExt(data.name, data.extension);

    return (
      <div style={style} className="w-full">
        {/* Generated 分组标题 + 删除按钮（不遮挡、不受折叠影响） */}
        {isGeneratedFolder && (
          <div className="mt-2 mb-1 px-2 flex items-center justify-between select-none">
            <div className="flex items-center gap-2 text-[11px] text-purple-600 dark:text-purple-400">
              <span className="h-px w-4 bg-purple-200 dark:bg-purple-800" />
              <span className="font-medium">代码生成文件</span>
            </div>
            <button
              className="text-red-600 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20"
              aria-label="删除生成文件夹"
              title="删除生成文件夹"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteIsDir(true);
                setDeleteConfirmPath(data.id);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div
          className={`flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-900 rounded px-2 py-1 w-full ${isGenerated ? "bg-purple-50 dark:bg-purple-950/20" : ""
            }`}
          style={{ paddingLeft: `${node.level * 14}px` }}
          onClick={(e) => {
            if (isDir) {
              node.toggle();
              return;
            }
            if (singleClickTimerRef.current) {
              window.clearTimeout(singleClickTimerRef.current);
              singleClickTimerRef.current = null;
            }
            // 延迟触发预览，若短时间内发生双击会被取消
            singleClickTimerRef.current = window.setTimeout(() => {
              openNode({
                name: data.name,
                path: data.id,
                is_dir: false,
                download_url: data.download_url,
                extension: data.extension,
                size: data.size,
                icon: data.icon,
              } as any);
              singleClickTimerRef.current = null;
            }, 180);
          }}
          onDoubleClick={(e) => {
            if (isDir) return;
            e.stopPropagation();
            if (singleClickTimerRef.current) {
              window.clearTimeout(singleClickTimerRef.current);
              singleClickTimerRef.current = null;
            }
            if (data.download_url) {
              downloadFileByUrl(data.name, data.download_url);
            }
          }}
          onContextMenu={(e) =>
            onContextMenu(
              e as any,
              {
                name: data.name,
                path: data.id,
                is_dir: isDir,
                download_url: data.download_url,
                extension: data.extension,
                size: data.size,
                icon: data.icon,
              } as any
            )
          }
          onDragOver={(e) => {
            if (isDir) {
              e.preventDefault();
              e.dataTransfer.dropEffect = (e.dataTransfer.types || []).includes(
                "text/x-workspace-path"
              )
                ? "move"
                : "copy";
            }
          }}
          onDragEnter={(e) => {
            if (isDir) setDragOverPath(data.id);
          }}
          onDragLeave={(e) => {
            if (isDir) setDragOverPath(null);
          }}
          onDrop={(e) => {
            if (!isDir) return;
            e.preventDefault();
            uploadToDir(data.id, e.dataTransfer.files || []);
            setDragOverPath(null);
          }}
        >
          <div
            className="flex items-center gap-2 text-sm w-full min-w-0"
            ref={dragHandle}
            draggable={!isDir}
            onDragStart={(e) => {
              if (isDir) return;
              // 将工作区内路径放入自定义 MIME，供目标目录 onDrop 读取
              e.dataTransfer.setData("text/x-workspace-path", data.id);
              // 提示为移动操作
              e.dataTransfer.effectAllowed = "move";
            }}
          >
            {isDir ? (
              <>
                <span
                  className={
                    isGenerated
                      ? "text-purple-600 dark:text-purple-400"
                      : "text-gray-500"
                  }
                >
                  {node.isOpen ? "▾" : "▸"}
                </span>
                {isGenerated ? (
                  <Code2 className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                ) : (
                  <FolderOpen className="h-3.5 w-3.5 text-gray-500" />
                )}
              </>
              ) : (
                <div className="w-4 h-4">
                {/* 动态扩展样式，fallback 到 txt */}
                {/* @ts-ignore */}
                <FileIcon
                  extension={ext}
                  {...((defaultStyles as any)[ext] ||
                    (defaultStyles as any).txt)}
                />
              </div>
            )}
            <span
              className={`${isGenerated
                ? "text-purple-700 dark:text-purple-300 font-medium"
                : ""
                }`}
            >
              {data.name}
            </span>
            {typeof data.size === "number" && !isDir && (
              <span className="text-[10px] text-gray-400 ml-2 shrink-0">
                {formatFileSize(data.size)}
              </span>
            )}
            {isGenerated && !isDir && (
              <Sparkles className="h-3 w-3 text-purple-500 ml-1 shrink-0" />
            )}
          </div>
          {/* 行尾不再展示下载/删除按钮。双击/点击行为保持不变；右键菜单提供下载/删除。*/}
        </div>
      </div>
    );
  };

  const renderTree = (node: WorkspaceNode, depth = 0) => {
    const isDir = node.is_dir;
    const isGenerated = node.is_generated || false;
    const isConverted = node.is_converted || false;
    const isGeneratedFolder = isDir && node.name === "generated" && depth === 1;
    const isConvertedFolder = isDir && node.name === "converted" && depth === 1;
    const pad = { paddingLeft: `${8 + depth * 14}px` } as React.CSSProperties;

    return (
      <div key={node.path || "root"}>
        {/* Converted (UTF-8) 分隔线 */}
        {isConvertedFolder && (
          <div className="mb-2 mt-2 ml-2 border-t-2 border-green-200 dark:border-green-800 relative">
            <div className="absolute -top-2.5 left-2 bg-white dark:bg-gray-950 px-2 text-[10px] text-green-600 dark:text-green-400 font-medium">
              编码自动转换
            </div>
          </div>
        )}
        {/* Generated 分隔线 */}
        {isGeneratedFolder && (
          <div className="mb-2 mt-2 ml-2 border-t-2 border-purple-200 dark:border-purple-800 relative">
            <div className="absolute -top-2.5 left-2 bg-white dark:bg-gray-950 px-2 text-[10px] text-purple-600 dark:text-purple-400 font-medium">
              代码生成文件
            </div>
          </div>
        )}
        <div
          className={`flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-900 rounded px-2 py-1 cursor-default ${isGenerated ? "bg-purple-50 dark:bg-purple-950/20" : isConverted ? "bg-green-50 dark:bg-green-950/20" : ""}`}
          style={pad}
          onClick={(e) => {
            if (isDir) return toggleExpand(node.path);
            if (singleClickTimerRef.current) {
              window.clearTimeout(singleClickTimerRef.current);
              singleClickTimerRef.current = null;
            }
            singleClickTimerRef.current = window.setTimeout(() => {
              openNode(node);
              singleClickTimerRef.current = null;
            }, 180);
          }}
          onDoubleClick={(e) => {
            if (isDir) return;
            e.stopPropagation();
            if (singleClickTimerRef.current) {
              window.clearTimeout(singleClickTimerRef.current);
              singleClickTimerRef.current = null;
            }
            if (node.download_url) {
              downloadFileByUrl(node.name, node.download_url);
            } else {
              openNode(node);
            }
          }}
          onContextMenu={(e) => onContextMenu(e, node)}
          onDragOver={(e) => {
            if (isDir) e.preventDefault();
          }}
          onDrop={async (e) => {
            if (!isDir) return;
            e.preventDefault();
            const dt = e.dataTransfer;
            // 1) 如果是从 OS 拖入文件
            if (dt.files && dt.files.length) {
              uploadToDir(node.path, dt.files || []);
              return;
            }
            // 2) 如果是从 generated/ 内部拖动的文件，使用自定义 data 传递路径
            const srcPath = dt.getData("text/x-workspace-path");
            if (srcPath) {
              try {
                const url = `${API_CONFIG.BACKEND_BASE_URL
                  }/workspace/move?src=${encodeURIComponent(
                    srcPath
                  )}&dst_dir=${encodeURIComponent(
                    node.path
                  )}&session_id=${encodeURIComponent(sessionId)}`;
                const res = await fetch(url, { method: "POST" });
                if (res.ok) {
                  await loadWorkspaceTree();
                  await loadWorkspaceFiles();
                }
              } catch (err) {
                console.error("move error", err);
              }
            }
          }}
        >
          <div className="flex items-center gap-2 text-sm">
            {isDir ? (
              <>
                <span
                  className={
                    isGenerated
                      ? "text-purple-600 dark:text-purple-400"
                      : isConverted
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-500"
                  }
                >
                  {expanded[node.path] ? "▾" : "▸"}
                </span>
                {isGenerated ? (
                  <Code2
                    className={`h-3.5 w-3.5 ${isGenerated
                      ? "text-purple-600 dark:text-purple-400"
                      : isConverted
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-500"
                      }`}
                  />
                ) : isConverted ? (
                  <FileText className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                ) : (
                  <FolderOpen className="h-3.5 w-3.5 text-gray-500" />
                )}
              </>
            ) : (
              <span
                className={isGenerated ? "text-purple-400" : isConverted ? "text-green-400" : "text-gray-400"}
              >
                •
              </span>
            )}
            <span
              className={`truncate ${isGenerated
                ? "text-purple-700 dark:text-purple-300 font-medium"
                : isConverted
                ? "text-green-700 dark:text-green-300"
                : ""
                }`}
            >
              {node.icon && !isGenerated && !isConverted ? `${node.icon} ` : ""}
              {node.name || "workspace"}
            </span>
            {!isDir && typeof node.size === "number" && (
              <span className="text-[10px] text-gray-400 ml-2 shrink-0">
                {formatFileSize(node.size)}
              </span>
            )}
            {isGenerated && !isDir && (
              <Sparkles className="h-3 w-3 text-purple-500 ml-1 shrink-0" />
            )}
          </div>
          {/* 双击/点击行为已经在容器上：目录展开，文件预览/下载保持一致 */}
        </div>
        {isDir && expanded[node.path] && node.children && (
          <div>{node.children.map((c) => renderTree(c, depth + 1))}</div>
        )}
      </div>
    );
  };

  const clearWorkspace = async () => {
    if (!sessionId) return;
    suppressWorkspaceRefreshCount.current += 1;
    try {
      const response = await fetch(
        `${API_URLS.WORKSPACE_CLEAR}?session_id=${sessionId}&username=${currentUser || "default"}`,
        {
          method: "DELETE",
        }
      );
      if (response.ok) {
        setWorkspaceFiles([]);
        await loadWorkspaceTree();
        await loadWorkspaceFiles();
        toast({
          description: "工作区已清空",
        });
      }
    } catch (error) {
      console.error("Failed to clear workspace:", error);
      toast({
        description: "清空失败",
        variant: "destructive",
      });
    } finally {
      suppressWorkspaceRefreshCount.current -= 1;
    }
  };

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      // 优先使用安全的 Clipboard API
      if (
        typeof navigator !== "undefined" &&
        (navigator as any).clipboard &&
        typeof (navigator as any).clipboard.writeText === "function"
      ) {
        await (navigator as any).clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      // 继续尝试后备方案
    }
    try {
      // 后备方案：隐形 textarea + execCommand
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch (e) {
      return false;
    }
  };

  const extractCode = (content: string): string => {
    const codeBlockMatch = content.match(/```(?:python)?\n?([\s\S]*?)```/);
    return codeBlockMatch ? codeBlockMatch[1].trim() : content;
  };

  const guessLanguageByExtension = (ext: string): string => {
    const e = ext.toLowerCase();
    const map: Record<string, string> = {
      js: "javascript",
      jsx: "jsx",
      ts: "typescript",
      tsx: "tsx",
      json: "json",
      py: "python",
      md: "markdown",
      html: "html",
      css: "css",
      sh: "bash",
      yml: "yaml",
      yaml: "yaml",
      csv: "csv",
      txt: "text",
      go: "go",
      rs: "rust",
      java: "java",
      php: "php",
      sql: "sql",
    };
    return map[e] || "text";
  };

  const normalizeToLocalFileUrl = (rawUrl: string): string => {
    const base =
      (API_CONFIG as any).FILE_SERVER_BASE || "http://localhost:8100";
    const safeBase = base.replace(/\/$/, "");

    if (!rawUrl) return safeBase;
    const trimmed = String(rawUrl).trim();

    // 绝对 http/https 链接：若是 localhost/127.* 或端口为 8100，则重写到 FILE_SERVER_BASE
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const u = new URL(trimmed);
        const needRewrite =
          u.hostname === "localhost" ||
          u.hostname.startsWith("127.") ||
          u.port === "8100";
        if (needRewrite) {
          const b = new URL(safeBase + "/");
          return `${b.origin}${b.pathname.replace(/\/$/, "")}${u.pathname}${u.search
            }${u.hash}`;
        }
        return trimmed;
      } catch {
        // fallthrough to relative handling
      }
    }

    // 处理以 // 开头的协议相对链接
    if (/^\/\//.test(trimmed)) {
      const proto =
        typeof window !== "undefined" ? window.location.protocol : "http:";
      return proto + trimmed;
    }

    // 去掉开头的 ./
    const rel = trimmed.replace(/^\.\//, "");

    // 如果以 /workspace/ 开头，接到文件服务器
    if (/^\/workspace\//.test(rel)) return `${safeBase}${rel}`;
    if (/^workspace\//.test(rel)) return `${safeBase}/${rel}`;

    // 其它相对路径或文件名，也认为位于文件服务器根目录
    return `${safeBase}/${rel.replace(/^\//, "")}`;
  };

  // 若 URL 缺少 generated 目录，则在 session 段后注入 /generated
  const ensureGeneratedInUrl = (url: string): string => {
    try {
      const u = new URL(url);
      // 仅处理指向文件服务器(8100)的链接
      if (!(u.hostname === "localhost" || u.hostname.startsWith("127."))) {
        return url;
      }
      // 路径形如 /session_xxx/xxx.png，则插入 /generated
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        const [maybeSession, second] = parts;
        if (maybeSession.startsWith("session_") && second !== "generated") {
          const rest = parts.slice(1).join("/");
          u.pathname = `/${maybeSession}/generated/${rest}`;
          return u.toString();
        }
      }
      return url;
    } catch {
      return url;
    }
  };

  const openPreview = async (file: WorkspaceFile) => {
    setPreviewTitle(file.name);
    setPreviewDownloadUrl(file.download_url);
    setIsPreviewOpen(true);
    setPreviewLoading(true);

    const ext = (file.extension || "").toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) {
      setPreviewType("image");
      // 修正 URL
      const correctedUrl = ensureGeneratedInUrl(
        file.preview_url || file.download_url
      );
      setPreviewContent(correctedUrl);
      setPreviewLoading(false);
      return;
    }
    if (ext === "pdf") {
      setPreviewType("pdf");
      // 修正 URL
      const correctedUrl = ensureGeneratedInUrl(
        file.preview_url || file.download_url
      );
      setPreviewContent(correctedUrl);
      setPreviewLoading(false);
      return;
    }

    try {
      const normalized = normalizeToLocalFileUrl(
        file.preview_url || file.download_url
      );
      const target = ensureGeneratedInUrl(normalized);
      // 通过后端代理以避免 CORS
      const res = await fetch(
        `${API_CONFIG.BACKEND_BASE_URL}/proxy?url=${encodeURIComponent(target)}`
      );
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok) throw new Error("failed to fetch preview");
      if (
        contentType.startsWith("text/") ||
        contentType.includes("json") ||
        contentType.includes("xml")
      ) {
        const text = await res.text();
        setPreviewType("text");
        setPreviewContent(text);
      } else {
        // 非文本直接提示下载/打开
        setPreviewType("binary");
        setPreviewContent(file.download_url);
      }
    } catch (e) {
      setPreviewType("binary");
      setPreviewContent(file.download_url);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (isPreviewOpen && !previewLoading && previewScrollRef.current) {
      previewScrollRef.current.scrollTop = 0;
    }
  }, [isPreviewOpen, previewLoading, previewType, previewContent]);

  const handleDownload = async () => {
    try {
      if (previewType === "text" && typeof previewContent === "string") {
        const blob = new Blob([previewContent], {
          type: "text/plain;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = previewTitle || "file.txt";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }

      const normalized = normalizeToLocalFileUrl(
        previewDownloadUrl || previewContent
      );
      const target = ensureGeneratedInUrl(normalized);
      const res = await fetch(
        `${API_CONFIG.BACKEND_BASE_URL}/proxy?url=${encodeURIComponent(target)}`
      );
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = previewTitle || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      const url = ensureGeneratedInUrl(previewDownloadUrl || previewContent);
      window.open(url, "_blank");
    }
  };

  const downloadFileByUrl = async (fileName: string, rawUrl: string) => {
    try {
      const normalized = normalizeToLocalFileUrl(rawUrl);
      const target = ensureGeneratedInUrl(normalized);
      const res = await fetch(
        `${API_CONFIG.BACKEND_BASE_URL}/proxy?url=${encodeURIComponent(target)}`
      );
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      const fallbackUrl = ensureGeneratedInUrl(rawUrl);
      window.open(fallbackUrl, "_blank");
    }
  };

  const executeCode = async () => {
    setIsExecutingCode(true);
    try {
      const response = await fetch(API_URLS.EXECUTE_CODE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: codeEditorContent,
          session_id: sessionId,
          username: currentUser || "default",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCodeExecutionResult(data.result);
        await loadWorkspaceFiles(); // Refresh file list after execution
      } else {
        setCodeExecutionResult("Error: Failed to execute code");
      }
    } catch (error) {
      setCodeExecutionResult(`Error: ${error}`);
    } finally {
      setIsExecutingCode(false);
    }
  };

  const renderMarkdownContent = useCallback((
    content: string,
    options?: { withinSection?: boolean }
  ) => {
    const withinSection = options?.withinSection ?? false;
    // 先处理代码块，将其分离出来
    const parts = content.split(/(```[\w]*\n[\s\S]*?```)/g);

    return (
      <div className="prose prose-sm max-w-none dark:prose-invert break-words [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
        {parts.map((part, index) => {
          // 检查是否是代码块
          const codeBlockMatch = part.match(/```(\w+)?\n([\s\S]*?)```/);
          if (codeBlockMatch) {
            const [, language, code] = codeBlockMatch;
            return (
              <CodeBlockView
                key={index}
                language={language || "python"}
                code={code}
                showHeader={!withinSection}
                isDarkMode={isDarkMode}
                onEdit={(c) => {
                  setCodeEditorContent(c);
                  setSelectedCodeSection(c);
                  setShowCodeEditor(true);
                }}
              />
            );
          }

          // 处理普通 markdown 内容
          if (part.trim()) {
            return (
              <ReactMarkdown
                key={index}
                remarkPlugins={[remarkGfm]}
                components={{
                  code: ({ children, ...props }: any) => (
                    <code
                      className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono"
                      {...props}
                    >
                      {children}
                    </code>
                  ),
                  h1: ({ children }) => (
                    <h1 className="text-2xl font-bold mt-4 mb-2">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-xl font-semibold mt-4 mb-2">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-lg font-semibold mt-4 mb-2">
                      {children}
                    </h3>
                  ),
                  a: ({ href, children }) => {
                    const normalized = normalizeToLocalFileUrl(
                      String(href || "")
                    );
                    const corrected = ensureGeneratedInUrl(normalized);
                    const proxied = `${API_CONFIG.BACKEND_BASE_URL
                      }/proxy?url=${encodeURIComponent(corrected)}`;
                    return (
                      <a
                        href={proxied}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {children}
                      </a>
                    );
                  },
                  img: ({ src, alt }: any) => {
                    const normalizedSrc = normalizeToLocalFileUrl(src || "");
                    const correctedSrc = ensureGeneratedInUrl(normalizedSrc);
                    const proxiedSrc = `${API_CONFIG.BACKEND_BASE_URL
                      }/proxy?url=${encodeURIComponent(correctedSrc)}`;
                    return (
                      <img
                        src={proxiedSrc}
                        alt={alt || ""}
                        className="max-w-full h-auto rounded-lg my-2"
                      />
                    );
                  },
                  ol: ({ children }) => (
                    <ol className="list-decimal pl-5 space-y-1">{children}</ol>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc pl-5 space-y-1">{children}</ul>
                  ),
                }}
              >
                {part}
              </ReactMarkdown>
            );
          }

          return null;
        })}
      </div>
    );
  }, [isDarkMode]);

  const renderSectionContent = useCallback(
    (content: string) => {
      return renderMarkdownContent(content, { withinSection: true });
    },
    [renderMarkdownContent]
  );

  // 解析 Markdown 中的文件/图片链接，返回用于卡片渲染的数据
  const parseGeneratedFiles = (
    content: string
  ): Array<{ name: string; url: string; isImage: boolean }> => {
    const result: { name: string; url: string; isImage: boolean }[] = [];
    let m: RegExpExecArray | null;
    // 1) 列表形如: - [name](url)
    const linkRe = /\- \[(.*?)\]\((.*?)\)/g;
    while ((m = linkRe.exec(content)) !== null) {
      const name = m[1];
      const url = normalizeToLocalFileUrl(m[2]);
      const isImage = /\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i.test(url);
      result.push({ name, url, isImage });
    }
    // 2) 图片 Markdown: ![name](url)
    const imgRe = /!\[(.*?)\]\((.*?)\)/g;
    while ((m = imgRe.exec(content)) !== null) {
      const name = m[1];
      const url = normalizeToLocalFileUrl(m[2]);
      result.push({ name, url, isImage: true });
    }
    // 3) 兜底：文中出现的裸链接
    const urlRe = /(https?:\/\/[^\s)]+)/g;
    while ((m = urlRe.exec(content)) !== null) {
      const url = normalizeToLocalFileUrl(m[1]);
      const isImage = /\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i.test(url);
      if (isImage)
        result.push({ name: url.split("/")?.pop() || "image", url, isImage });
    }
    // 去重同 url
    const seen = new Set<string>();
    return result.filter((f) =>
      seen.has(f.url) ? false : (seen.add(f.url), true)
    );
  };

  // 提取消息中的所有步骤
  const extractSections = (content: string, messageIndex?: number) => {
    const sectionConfigs = {
      Analyze: { icon: "🔍", color: "bg-blue-500" },
      Understand: { icon: "🧠", color: "bg-cyan-500" },
      Code: { icon: "💻", color: "bg-gray-500" },
      Execute: { icon: "⚡", color: "bg-orange-500" },
      Answer: { icon: "✅", color: "bg-green-500" },
      File: { icon: "📎", color: "bg-purple-500" },
      TaskTree: { icon: "🌲", color: "bg-amber-500" },
      DataDictionary: { icon: "📚", color: "bg-amber-500" },
    };

    const allMatches: Array<{
      type: keyof typeof sectionConfigs;
      position: number;
    }> = [];

    Object.keys(sectionConfigs).forEach((type) => {
      const regex = new RegExp(`<${type}>([\\s\\S]*?)</${type}>`, "gi");
      let match;

      while ((match = regex.exec(content)) !== null) {
        allMatches.push({
          type: type as keyof typeof sectionConfigs,
          position: match.index,
        });
      }
    });

    // 按位置排序，然后生成 sectionKey（与 renderMessageWithSections 逻辑一致）
    allMatches.sort((a, b) => a.position - b.position);

    return allMatches.map((m, index) => ({
      type: m.type,
      sectionKey:
        messageIndex !== undefined
          ? `msg${messageIndex}-${m.type}-${index}` // 包含消息索引
          : `${m.type}-${index}`, // 兼容旧逻辑
      config: sectionConfigs[m.type],
    }));
  };

  // 滚动到指定步骤
  const scrollToSection = (sectionKey: string) => {
    const container = messagesContainerRef.current;
    if (!container) {
      console.warn("Container not found");
      return;
    }

    // 展开目标块（如果它是折叠的）
    setCollapsedSections((prev) => {
      const next = { ...prev };
      // 提取 baseKey（去掉 msg{index}- 前缀）
      const baseKey = sectionKey.replace(/^msg\d+-/, "");

      // 如果该块是折叠的，则展开它（同时更新两种格式的 key）
      if (prev[sectionKey] || prev[baseKey]) {
        next[sectionKey] = false;
        next[baseKey] = false;
        return next;
      }
      return prev;
    });

    // 标记为手动操作，防止自动折叠覆盖
    setManualLocks((prev) => {
      const baseKey = sectionKey.replace(/^msg\d+-/, "");
      return {
        ...prev,
        [sectionKey]: true,
        [baseKey]: true,
      };
    });

    // 使用延迟确保 DOM 已更新和展开动画完成
    setTimeout(() => {
      const element = document.querySelector(
        `[data-section-key="${sectionKey}"]`
      );

      if (!element) {
        console.warn(`Element with key ${sectionKey} not found`);
        return;
      }

      const elementRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const scrollTop = container.scrollTop;

      // 计算目标滚动位置（居中显示）
      const targetScroll =
        scrollTop +
        elementRect.top -
        containerRect.top -
        containerRect.height / 2 +
        elementRect.height / 2;

      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: "smooth",
      });

      setActiveSection(sectionKey);
    }, 150);
  };

  const updateActiveSectionFromScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const sections = document.querySelectorAll("[data-section-key]");
    const containerRect = container.getBoundingClientRect();
    const containerMiddle = containerRect.top + containerRect.height / 2;

    let closestSection = "";
    let closestDistance = Infinity;

    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      const sectionMiddle = rect.top + rect.height / 2;
      const distance = Math.abs(sectionMiddle - containerMiddle);

      // 找到离容器中心最近的 section
      if (
        distance < closestDistance &&
        rect.top < containerRect.bottom &&
        rect.bottom > containerRect.top
      ) {
        closestDistance = distance;
        closestSection = section.getAttribute("data-section-key") || "";
      }
    });

    if (closestSection) {
      setActiveSection(closestSection);
    }
  }, []);

  // 监听滚动，更新当前激活的步骤（避免 messages 更新时反复解绑/绑定 scroll 事件）
  const activeSectionRafRef = useRef<number | null>(null);
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const onScroll = () => {
      // 只有用户当前在底部时才自动跟随输出
      const distanceToBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      stickToBottomRef.current = distanceToBottom <= 24;

      if (activeSectionRafRef.current) return;
      activeSectionRafRef.current = window.requestAnimationFrame(() => {
        activeSectionRafRef.current = null;
        updateActiveSectionFromScroll();
      });
    };

    onScroll(); // 初始化
    container.addEventListener("scroll", onScroll);
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (activeSectionRafRef.current) {
        window.cancelAnimationFrame(activeSectionRafRef.current);
        activeSectionRafRef.current = null;
      }
    };
  }, [updateActiveSectionFromScroll]);

  // 新消息追加/清空时刷新一次 active section（不在流式内容每次变化时都跑）
  useEffect(() => {
    if (!messagesContainerRef.current) return;
    window.requestAnimationFrame(() => updateActiveSectionFromScroll());
  }, [messages.length, updateActiveSectionFromScroll]);

  // 流式阶段的轻量渲染：支持 <Analyze>/<Code> 等块，但避免高开销的 Markdown/高亮解析
  const renderMessageWithSectionsStreaming = useCallback(
    (content: string, messageIndex?: number) => {
      const sectionTypes = [
        "Analyze",
        "Understand",
        "Code",
        "Execute",
        "Answer",
        "File",
        "TaskTree",
        "DataDictionary",
      ] as const;
      const sectionConfigs: Record<
        (typeof sectionTypes)[number],
        { icon: string; color: string }
      > = {
        Analyze: {
          icon: "🔍",
          color:
            "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
        },
        Understand: {
          icon: "🧠",
          color:
            "bg-cyan-50 border-cyan-200 dark:bg-cyan-950/30 dark:border-cyan-800",
        },
        Code: {
          icon: "💻",
          color:
            "bg-gray-50 border-gray-200 dark:bg-gray-950/30 dark:border-gray-700",
        },
        Execute: {
          icon: "⚡",
          color:
            "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800",
        },
        Answer: {
          icon: "✅",
          color:
            "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
        },
        File: {
          icon: "📎",
          color:
            "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800",
        },
        TaskTree: {
          icon: "🌲",
          color:
            "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
        },
        DataDictionary: {
          icon: "📚",
          color:
            "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
        },
      };

      // 没有结构化标签时，保持最轻量文本渲染（避免每个 chunk 都触发 Markdown/高亮重解析）
      if (!content.includes("<")) {
        return (
          <div className="text-sm break-words whitespace-pre-wrap">
            {content}
          </div>
        );
      }

      const parts: React.ReactNode[] = [];
      const sectionTypeAliasMap: Record<string, StructuredSectionType> = {
        analyze: "Analyze",
        understand: "Understand",
        code: "Code",
        execute: "Execute",
        answer: "Answer",
        file: "File",
        tasktree: "TaskTree",
        datadictionary: "DataDictionary",
      };
      const openRe = /<(Analyze|Understand|Code|Execute|Answer|File|TaskTree|DataDictionary)>/gi;
      let cursor = 0;
      let sectionIndex = 0;
      let m: RegExpExecArray | null;

      while ((m = openRe.exec(content)) !== null) {
        const rawType = (m[1] || "").trim();
        const type = sectionTypeAliasMap[rawType.toLowerCase()];
        if (!type) {
          continue;
        }
        const start = m.index;

        if (start > cursor) {
          const before = content.slice(cursor, start);
          parts.push(
            <StreamingMarkdownBlock
              key={`stream-md-${cursor}`}
              className="markdown-content mb-2"
              content={before}
              renderMarkdownContent={renderMarkdownContent}
            />
          );
        }

        const openTag = m[0];
        const openEnd = start + openTag.length;
        const closeRe = new RegExp(`</${type}>`, "i");
        const closeMatch = closeRe.exec(content.slice(openEnd));
        const closeIdx = closeMatch ? openEnd + closeMatch.index : -1;
        const isComplete = closeIdx !== -1;
        const bodyEnd = isComplete ? closeIdx : content.length;
        const closeTagLength = closeMatch ? closeMatch[0].length : (`</${type}>`).length;
        const body = content.slice(openEnd, bodyEnd).trim();

        const baseKey = `${type}-${sectionIndex}`;
        const msgKey =
          messageIndex !== undefined ? `msg${messageIndex}-${type}-${sectionIndex}` : baseKey;
        const sectionKey = msgKey;
        const isCollapsed =
          (collapsedSections as any)[msgKey] ??
          (collapsedSections as any)[baseKey] ??
          false;
        const sectionConfig = sectionConfigs[type] || sectionConfigs.Analyze;

        const toggleSection = () => {
          setCollapsedSections((prev) => {
            const next = { ...prev } as Record<string, boolean>;
            const current = (prev as any)[msgKey] ?? (prev as any)[baseKey] ?? false;
            next[msgKey] = !current;
            next[baseKey] = !current;
            return next;
          });
        };

        parts.push(
          <div
            key={`stream-section-${sectionKey}`}
            className={`mb-4 border rounded-lg overflow-hidden ${sectionConfig.color}`}
            data-section={type}
            data-section-key={sectionKey}
          >
            <div className="flex items-center justify-between px-3 py-2 bg-white/60 dark:bg-black/30 border-b border-black/5 dark:border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleSection}
                  className="h-5 w-5 p-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </Button>
                <span className="text-sm">{sectionConfig.icon}</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {type}
                </span>
                {!isComplete && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    （生成中）
                  </span>
                )}
              </div>
            </div>
            {!isCollapsed && (
              <div className="p-3">
                <StreamingSectionBody
                  type={type}
                  content={body}
                  isComplete={isComplete}
                  renderSectionContent={renderSectionContent}
                />
              </div>
            )}
          </div>
        );

        sectionIndex += 1;
  cursor = isComplete ? closeIdx + closeTagLength : content.length;
        openRe.lastIndex = cursor;

        if (!isComplete) break;
      }

      if (cursor < content.length) {
        const after = content.slice(cursor);
        if (after.trim()) {
          parts.push(
            <div key="stream-text-end" className="text-sm break-words whitespace-pre-wrap">
              {after}
            </div>
          );
        }
      }

      if (parts.length === 0) {
        return (
          <div className="text-sm break-words whitespace-pre-wrap">
            {content}
          </div>
        );
      }

      return <>{parts}</>;
    },
    [collapsedSections, renderMarkdownContent, renderSectionContent]
  );

  const renderMessageWithSections = useCallback((
    content: string,
    messageIndex?: number
  ) => {
    const sectionConfigs = {
      Analyze: {
        icon: "🔍",
        color:
          "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
      },
      Understand: {
        icon: "🧠",
        color:
          "bg-cyan-50 border-cyan-200 dark:bg-cyan-950/30 dark:border-cyan-800",
      },
      Code: {
        icon: "💻",
        color:
          "bg-gray-50 border-gray-200 dark:bg-gray-950/30 dark:border-gray-700",
      },
      Execute: {
        icon: "⚡",
        color:
          "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800",
      },
      Answer: {
        icon: "✅",
        color:
          "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
      },
      File: {
        icon: "📎",
        color:
          "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800",
      },
      TaskTree: {
        icon: "🌲",
        color:
          "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
      },
      DataDictionary: {
        icon: "📚",
        color:
          "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
      },
    };

    // 首先分割内容，找出所有标签
    const allMatches: Array<{
      type: keyof typeof sectionConfigs;
      content: string;
      position: number;
      fullMatch: string;
    }> = [];

    Object.keys(sectionConfigs).forEach((type) => {
      // 使用 [\s\S]*? 以兼容不支持 s 标志的环境
      const regex = new RegExp(`<${type}>([\\s\\S]*?)</${type}>`, "gi");
      let match;

      while ((match = regex.exec(content)) !== null) {
        allMatches.push({
          type: type as keyof typeof sectionConfigs,
          content: match[1].trim(),
          position: match.index,
          fullMatch: match[0],
        });
      }
    });

    // 如果没有找到结构化标签，渲染为 Markdown
    if (allMatches.length === 0) {
      return (
        <div className="markdown-content">{renderMarkdownContent(content)}</div>
      );
    }

    // 按位置排序
    allMatches.sort((a, b) => a.position - b.position);

    const parts = [];
    let lastPosition = 0;

    allMatches.forEach((match, index) => {
      // 添加标签前的普通文本
      if (match.position > lastPosition) {
        const beforeText = content.slice(lastPosition, match.position);
        if (beforeText.trim()) {
          parts.push(
            <div key={`text-${index}`} className="markdown-content mb-2">
              {renderMarkdownContent(beforeText)}
            </div>
          );
        }
      }

      // 添加结构化标签
      const config = sectionConfigs[match.type];
      const baseKey = `${match.type}-${index}`;
      const msgKey =
        messageIndex !== undefined
          ? `msg${messageIndex}-${match.type}-${index}`
          : baseKey;
      const sectionKey = msgKey;
      const isCollapsed =
        (collapsedSections as any)[msgKey] ??
        (collapsedSections as any)[baseKey] ??
        false;

      const toggleSection = () => {
        setCollapsedSections((prev) => {
          const next = { ...prev } as Record<string, boolean>;
          const current =
            (prev as any)[msgKey] ?? (prev as any)[baseKey] ?? false;
          next[msgKey] = !current;
          next[baseKey] = !current;
          return next;
        });
        setManualLocks((prev) => ({
          ...prev,
          [msgKey]: true,
          [baseKey]: true,
        }));
      };

      // 如果是 File 标签，解析其中的链接为卡片
      let sectionBody = match.content;
      let fileGallery: JSX.Element | null = null;
      if (match.type === "File") {
        const files = parseGeneratedFiles(match.content);
        if (files.length) {
          fileGallery = (
            <div className="mt-3">
              <div className="text-xs text-gray-500 mb-2">相关文件</div>
              <div className="grid grid-cols-2 gap-2">
                {files.map((f, i) => {
                  // 通过代理访问图片，并自动修正缺少 generated 的 URL
                  const correctedUrl = ensureGeneratedInUrl(f.url);
                  const proxiedUrl = `${API_CONFIG.BACKEND_BASE_URL
                    }/proxy?url=${encodeURIComponent(correctedUrl)}`;
                  return (
                    <div
                      key={i}
                      className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden bg-white dark:bg-black"
                    >
                      {f.isImage ? (
                        <a href={proxiedUrl} target="_blank" rel="noreferrer">
                          <img
                            src={proxiedUrl}
                            alt={f.name}
                            className="w-full h-28 object-contain bg-white dark:bg-black"
                          />
                        </a>
                      ) : (
                        <a
                          href={proxiedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block p-2 text-xs truncate hover:bg-gray-50 dark:hover:bg-gray-900"
                        >
                          {f.name}
                        </a>
                      )}
                      <div className="flex items-center justify-between px-2 py-1 border-t border-gray-200 dark:border-gray-800">
                        <div className="text-[10px] truncate max-w-[70%] text-gray-500">
                          {f.name}
                        </div>
                        <a
                          href={proxiedUrl}
                          download
                          className="text-[10px] text-blue-600 hover:underline"
                        >
                          下载
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }
      }

      parts.push(
        <div
          key={`section-${index}`}
          className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
          data-section={match.type}
          data-section-key={sectionKey}
        >
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSection}
                className="h-5 w-5 p-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </Button>
              <span className="text-sm">{config.icon}</span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {match.type}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {match.type === "Answer" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (isTyping) {
                      toast({
                        description: "执行中，暂时无法导出",
                        variant: "destructive",
                      });
                      return;
                    }
                    await exportReportBackendRef.current();
                  }}
                  className="h-5 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  title="后端导出 PDF/MD 到 workspace"
                >
                  <Download className="h-3 w-3" />
                </Button>
              )}
              {(match.type === "Code" ||
                match.type === "Analyze" ||
                match.type === "Understand") && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const text =
                          match.type === "Code"
                            ? extractCode(match.content)
                            : match.content;
                        const ok = await copyToClipboard(text.trim());
                        toast({
                          description: ok ? "已复制" : "复制失败",
                          variant: ok ? undefined : "destructive",
                        });
                      }}
                      className="h-5 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    {match.type === "Code" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const code = extractCode(match.content);
                          setCodeEditorContent(code);
                          setSelectedCodeSection(match.content);
                          setShowCodeEditor(true);
                        }}
                        className="h-5 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    )}
                  </>
                )}
              {match.type === "Execute" && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const executionOutput = extractCode(
                        sectionBody || match.content || ""
                      );
                      const textToCopy = executionOutput || sectionBody || "";
                      if (textToCopy.trim()) {
                        const ok = await copyToClipboard(textToCopy.trim());
                        toast({
                          description: ok ? "已复制" : "复制失败",
                          variant: ok ? undefined : "destructive",
                        });
                      }
                    }}
                    className="h-5 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    title="复制此 Execute 的输出"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </>
              )}
              {match.type === "TaskTree" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const parsed = parseTaskTreeContent(match.content);
                    if (parsed) {
                      setTaskTreeData(parsed.tasks);
                      setSelectedTasks(new Set());
                      setShowTaskTreeDialog(true);
                    } else {
                      toast({ description: "任务树数据解析失败", variant: "destructive" });
                    }
                  }}
                  className="h-5 px-2 text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                  title="选择分析任务"
                >
                  <ListTree className="h-3 w-3 mr-1" />
                  选择任务
                </Button>
              )}
              {match.type === "DataDictionary" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const parsed = parseDataDictionaryContent(match.content);
                    if (parsed) {
                      setDataDictionaryItems(parsed.items);
                      setSelectedDictionaryItems(new Set(parsed.items.map((item) => item.id)));
                      setShowDataDictionaryDialog(true);
                    } else {
                      toast({ description: "数据字典数据解析失败", variant: "destructive" });
                    }
                  }}
                  className="h-5 px-2 text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                  title="确认数据字典"
                >
                  <BookOpen className="h-3 w-3 mr-1" />
                  确认语义
                </Button>
              )}
            </div>
          </div>
          {!isCollapsed && (
            <div
              className={`p-3 ${match.type === "Answer" ? "answer-body" : ""}`}
            >
              {match.type === "TaskTree" ? (() => {
                const parsed = parseTaskTreeContent(match.content);
                if (parsed) {
                  const tasks = parsed.tasks;
                  const countAll = (nodes: TaskTreeNode[]): number => nodes.reduce((s, n) => s + 1 + (n.children ? countAll(n.children) : 0), 0);
                  return (
                    <div className="text-sm text-amber-700 dark:text-amber-300">
                      <div className="mb-2 font-medium">已生成 {tasks.length} 个主任务，共 {countAll(tasks)} 个分析步骤</div>
                      <div className="space-y-1">
                        {tasks.map(t => (
                          <div key={t.id} className="flex items-start gap-2">
                            <span className="text-amber-500 font-mono shrink-0">[{t.id}]</span>
                            <span>{t.name}</span>
                            {t.description && <span className="text-gray-400 text-xs ml-1">— {t.description}</span>}
                            {t.children && <span className="text-xs text-gray-400">(+{t.children.length} 子任务)</span>}
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 text-xs text-gray-500">点击上方「选择任务」按钮来选择要执行的分析步骤</div>
                    </div>
                  );
                } else {
                  return <div className="text-sm text-gray-500">任务树数据格式异常，请重新生成</div>;
                }
              })() : match.type === "DataDictionary" ? (() => {
                const parsed = parseDataDictionaryContent(match.content);
                if (!parsed) {
                  return <div className="text-sm text-gray-500">数据字典数据格式异常，请重新生成</div>;
                }
                return (
                  <div className="text-sm text-amber-700 dark:text-amber-300">
                    <div className="mb-2 font-medium">已生成 {parsed.items.length} 条待确认数据语义</div>
                    <div className="space-y-1">
                      {parsed.items.slice(0, 8).map((item) => {
                        const subject = [item.table, item.field].filter(Boolean).join(".") || "(未命名字段)";
                        return (
                          <div key={item.id} className="flex items-start gap-2">
                            <span className="text-amber-500 font-mono shrink-0">[{item.id}]</span>
                            <span>{subject}</span>
                            {item.proposed_meaning ? <span className="text-gray-400 text-xs ml-1">→ {item.proposed_meaning}</span> : null}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 text-xs text-gray-500">点击上方「确认语义」按钮确认后继续分析</div>
                  </div>
                );
              })() : renderSectionContent(sectionBody)}
              {fileGallery}
            </div>
          )}
        </div>
      );

      lastPosition = match.position + match.fullMatch.length;
    });

    // 添加最后剩余的文本
    if (lastPosition < content.length) {
      const afterText = content.slice(lastPosition);
      if (afterText.trim()) {
        parts.push(
          <div key="text-end" className="markdown-content mt-2">
            {renderMarkdownContent(afterText)}
          </div>
        );
      }
    }

    return <>{parts}</>;
  }, [collapsedSections, isTyping, renderMarkdownContent, renderSectionContent, toast]);

  // 根据完整内容自动折叠：除最后一个块外全部折叠
  const autoCollapseForContent = useCallback(
    (content: string, messageIndex?: number) => {
      if (!autoCollapseEnabled) return;
      const sectionTypes = [
        "Analyze",
        "Understand",
        "Code",
        "Execute",
        "File",
        "Answer",
        "TaskTree",
        "DataDictionary",
      ] as const;
      const matches: Array<{ type: string; index: number; pos: number }> = [];
      sectionTypes.forEach((t) => {
        const re = new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, "g");
        let m: RegExpExecArray | null;
        let local = 0;
        while ((m = re.exec(content)) !== null) {
          matches.push({ type: t, index: local++, pos: m.index });
        }
      });
      if (matches.length === 0) return;
      matches.sort((a, b) => a.pos - b.pos);
      const next: Record<string, boolean> = {};
      matches.forEach((m, i) => {
        const baseKey = `${m.type}-${i}`;
        const msgKey =
          messageIndex !== undefined ? `msg${messageIndex}-${m.type}-${i}` : null;
        const key = msgKey || baseKey;
        next[key] = i !== matches.length - 1; // 最后一个不折叠
      });
      setCollapsedSections((prev) => {
        const merged: Record<string, boolean> = { ...prev };
        // 只在未手动锁定的 key 上更新，保留用户手动状态
        for (const key in next) {
          const baseKey = key.replace(/^msg\d+-/, "");
          if (!manualLocks[key] && !manualLocks[baseKey]) merged[key] = next[key];
        }
        return merged;
      });
    },
    [autoCollapseEnabled, manualLocks]
  );

  const openReportTypePicker = () => {
    setPendingReportTypes(reportTypes);
    setShowReportTypePicker(true);
  };

  const cancelReportTypePicker = () => {
    setPendingReportTypes(reportTypes);
    setShowReportTypePicker(false);
  };

  const confirmReportTypePicker = () => {
    if (pendingReportTypes.length === 0) {
      toast({ description: "请至少选择一种报告类型", variant: "destructive" });
      return;
    }
    setReportTypes(pendingReportTypes);
    setShowReportTypePicker(false);
    toast({ description: `报告类型已更新为 ${pendingReportTypes.map((item) => item.toUpperCase()).join(", ")}` });
  };

  const openLanguagePicker = () => {
    setPendingAnalysisLanguage(analysisLanguage);
    setShowLanguagePicker(true);
  };

  const cancelLanguagePicker = () => {
    setPendingAnalysisLanguage(analysisLanguage);
    setShowLanguagePicker(false);
  };

  const confirmLanguagePicker = () => {
    const nextLanguage = normalizeAnalysisLanguage(pendingAnalysisLanguage);
    setAnalysisLanguage(nextLanguage);
    setPendingAnalysisLanguage(nextLanguage);
    setShowLanguagePicker(false);
    if (nextLanguage === "en") {
      toast({ description: "Analysis language switched to English." });
      return;
    }
    toast({ description: "分析语言已切换为中文（简体）" });
  };

  const openDataSourcePicker = (overrideMessage?: string | null) => {
    setPendingDataSourceSelection({
      selectedDbSourceIds: effectiveSelectedDbSourceIds,
      allowFilesOnly: dataSourceSelection.allowFilesOnly || hasWorkspaceDataSource,
    });
    setPendingSendOverrideMessage(overrideMessage ?? null);
    setShowDataSourceDialog(true);
  };

  const cancelDataSourcePicker = () => {
    setShowDataSourceDialog(false);
    setPendingSendOverrideMessage(null);
    setPendingDataSourceSelection(dataSourceSelection);
  };

  const confirmDataSourcePicker = () => {
    const validIds = new Set(savedDbConnections.map((item) => item.id));
    const nextIds = pendingDataSourceSelection.selectedDbSourceIds.filter((id) => validIds.has(id));
    const hasAtLeastOneSource = nextIds.length > 0 || hasWorkspaceDataSource;

    if (!hasAtLeastOneSource) {
      toast({
        description: "请至少选择一个数据库数据源，或先上传文件后再开始分析。",
        variant: "destructive",
      });
      return;
    }

    setSelectedDbSourceIds(nextIds);
    setDataSourceSelection({
      selectedDbSourceIds: nextIds,
      allowFilesOnly: pendingDataSourceSelection.allowFilesOnly,
    });
    setSourceSelectionExplicit(true);
    setShowDataSourceDialog(false);

    const queuedOverride = pendingSendOverrideMessage ?? undefined;
    setPendingSendOverrideMessage(null);

    const shouldSendNow =
      typeof queuedOverride === "string"
        ? queuedOverride.trim().length > 0
        : inputValue.trim().length > 0 || attachments.length > 0;

    if (!shouldSendNow) {
      toast({ description: "数据源选择已生效" });
      return;
    }

    void handleSendMessage(queuedOverride, {
      bypassSourceSelectionDialog: true,
      sourceSelectionConfirmed: true,
      confirmedSelectedDbSourceIds: nextIds,
    });
  };

  const handleSendGuidance = async () => {
    if (!sideGuidanceText.trim()) return;
    setIsSubmittingGuidance(true);
    try {
      const response = await fetch(
        `${API_URLS.CHAT_GUIDANCE}?session_id=${encodeURIComponent(sessionId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guidance: sideGuidanceText }),
        }
      );
      if (response.ok) {
        setSideGuidanceHistory(prev => [...prev, sideGuidanceText]);
        toast({ description: "过程指导已提交，将在下一步分析中生效" });
        setSideGuidanceOpen(false);
        setSideGuidanceText("");
      } else {
        toast({ description: "提交失败，请重试", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error sending guidance:", error);
      toast({ description: "提交失败，请重试", variant: "destructive" });
    } finally {
      setIsSubmittingGuidance(false);
    }
  };

  // === TaskTree 交互式任务选择相关函数 ===
  const toggleTask = useCallback((id: string, node: TaskTreeNode) => {
    setSelectedTasks(prev => {
      const next = new Set(prev);
      if (prev.has(id)) {
        next.delete(id);
        const removeDescendants = (n: TaskTreeNode) => { next.delete(n.id); n.children?.forEach(removeDescendants); };
        node.children?.forEach(removeDescendants);
      } else {
        next.add(id);
        const addDescendants = (n: TaskTreeNode) => { next.add(n.id); n.children?.forEach(addDescendants); };
        node.children?.forEach(addDescendants);
      }
      return next;
    });
  }, []);

  const selectAllTasks = useCallback(() => {
    if (!taskTreeData) return;
    const all = new Set<string>();
    const collect = (nodes: TaskTreeNode[]) => nodes.forEach(n => { all.add(n.id); if (n.children) collect(n.children); });
    collect(taskTreeData);
    setSelectedTasks(all);
  }, [taskTreeData]);

  const deselectAllTasks = useCallback(() => setSelectedTasks(new Set()), []);

  const handleSendMessage = async (
    overrideMessage?: string,
    options?: {
      bypassSourceSelectionDialog?: boolean;
      sourceSelectionConfirmed?: boolean;
      confirmedSelectedDbSourceIds?: string[];
    }
  ) => {
    const messageText = overrideMessage ?? inputValue;
    const outgoingAttachments = overrideMessage ? [] : attachments;
    if (!messageText.trim() && outgoingAttachments.length === 0) return;

    if (!isModelProviderConfigured) {
      setShowModelConfigAlert(true);
      return;
    }

    const selectedSourceIdsForRequest = (() => {
      if (options?.confirmedSelectedDbSourceIds) {
        const availableIds = new Set(savedDbConnections.map((item) => item.id));
        return options.confirmedSelectedDbSourceIds.filter((id) => availableIds.has(id));
      }
      return effectiveSelectedDbSourceIds;
    })();

    const selectedIdSet = new Set(selectedSourceIdsForRequest);
    const selectedSourcesForRequest = savedDbConnections.filter((item) => selectedIdSet.has(item.id));
    const hasDataSource = selectedSourcesForRequest.length > 0 || hasWorkspaceDataSource;
    const shouldPromptSourceSelection =
      !options?.bypassSourceSelectionDialog &&
      savedDbConnections.length > 1 &&
      !sourceSelectionExplicit;

    const shouldPromptMissingSourceSelection =
      !options?.bypassSourceSelectionDialog &&
      savedDbConnections.length > 0 &&
      selectedSourcesForRequest.length === 0 &&
      !hasWorkspaceDataSource;

    if (shouldPromptSourceSelection || shouldPromptMissingSourceSelection) {
      openDataSourcePicker(overrideMessage ?? null);
      return;
    }

    if (!hasDataSource) {
      toast({
        description: "请至少选择一个数据库数据源，或先上传一个数据文件后再开始分析。",
        variant: "destructive",
      });
      setSystemSettingsTab("database");
      setShowSystemSettings(true);
      return;
    }

    if (options?.sourceSelectionConfirmed) {
      setSourceSelectionExplicit(true);
    }

    const databaseSourcesForRequest = selectedSourcesForRequest;

    setIsAnalyzing(true);
  setRuntimeAnalysisRun(null);
  setRuntimeAnalysisEvents([]);
    const baseMessageIndex = messages.length;
    const aiMessageIndex = baseMessageIndex + 1;

    // 检测用户消息中是否指定了报告类型
    const userInput = messageText.toLowerCase();
    const detectedTypes: string[] = [];
    if (userInput.includes("pdf")) detectedTypes.push("pdf");
    if (userInput.includes("docx") || userInput.includes("word")) detectedTypes.push("docx");
    if (userInput.includes("pptx") || userInput.includes("ppt")) detectedTypes.push("pptx");
    const effectiveReportTypes = detectedTypes.length > 0 ? detectedTypes : reportTypes;
    if (detectedTypes.length > 0) {
      setReportTypes(detectedTypes);
    }

    const newMessage: Message = {
      id: createClientId(),
      content: messageText,
      sender: "user",
      timestamp: new Date(),
      attachments: outgoingAttachments.length > 0 ? [...outgoingAttachments] : undefined,
    };

    if (messageText.trim()) {
      setHistoryInputs((prev) => [...prev, messageText.trim()]);
    }

    setMessages((prev) => [...prev, newMessage]);
    if (!overrideMessage) setInputValue("");
    setAttachments([]);
    setIsTyping(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(API_URLS.CHAT_COMPLETIONS, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: "DeepAnalyze-8B", // 修正模型名
          username: currentUser || "default", // 添加 username
          messages: [
            ...messages
              .filter((m) => !m.localOnly)
              .map((msg) => ({
                role: msg.sender === "user" ? "user" : "assistant",
                content: msg.content,
              })),
            {
              role: "user",
              content: messageText,
            },
          ],
          stream: true, // [修改] 明确开启流式模式
          session_id: sessionId,
          strategy: analysisStrategy,
          analysis_mode: analysisMode,
          analysis_language: analysisLanguage,
          report_types: effectiveReportTypes,
          selected_database_sources: databaseSourcesForRequest,
          source_selection_explicit:
            Boolean(options?.sourceSelectionConfirmed) ||
            sourceSelectionExplicit,
          model_provider: modelProviderConfig,
          ...(temperature !== null && { temperature }),
        }),
      });

      const contentType = response.headers.get("content-type") || "";
      console.log("[Chat] status=", response.status, "ctype=", contentType);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 情况1: 非流式 JSON (兜底)
      if (contentType.includes("application/json")) {
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || "";
        const fallbackAiId = createClientId();
        setMessages((prev) => [
          ...prev,
          {
            id: fallbackAiId,
            sender: "ai",
            content,
            timestamp: new Date(),
          },
        ]);
        autoCollapseForContent(content, aiMessageIndex);
        if (/<file>/i.test(content)) {
          await loadWorkspaceTree();
          await loadWorkspaceFiles();
        }
        void loadAnalysisHistory({ silent: true });
        void loadRuntimeAnalysisTrace({ silent: true });
        setIsTyping(false);
        setIsAnalyzing(false);
        return;
      }

      // 情况2: 流式响应 (NDJSON / SSE)
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        setIsTyping(false);
        setStreamingMessageId(null);
        return;
      }

      // 预先插入 AI 消息占位
      const aiMsgId = createClientId();
      setStreamingMessageId(aiMsgId);
      setMessages((prev) => [
        ...prev,
        {
          id: aiMsgId,
          sender: "ai",
          content: "",
          timestamp: new Date(),
        },
      ]);

      aiPendingContentRef.current = "";
      aiDisplayedContentRef.current = "";

      if (streamRafRef.current) {
        cancelAnimationFrame(streamRafRef.current);
        streamRafRef.current = null;
      }

      // [修改] 用于在本地累积完整的消息内容
      let accumulatedMessage = "";

      // 更新 UI 的辅助函数
      const flushAiMessage = (visibleText: string) => {
        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((m) => m.id === aiMsgId);
          if (idx >= 0) {
            next[idx] = { ...next[idx], content: visibleText };
          }
          return next;
        });

        if (/<file>/i.test(visibleText)) {
          if (fileRefreshTimerRef.current) {
            window.clearTimeout(fileRefreshTimerRef.current);
          }
          fileRefreshTimerRef.current = window.setTimeout(async () => {
            await loadWorkspaceTree();
            await loadWorkspaceFiles();
            fileRefreshTimerRef.current = null;
          }, 300);
        }
      };

      // 启动平滑动画循环
      const loop = () => {
        const pending = aiPendingContentRef.current;
        const displayed = aiDisplayedContentRef.current;

        if (displayed !== pending) {
          const diff = pending.length - displayed.length;
          // 若 pending 比 displayed 短（理论不应发生），或差异极小，则直接同步
          if (diff < 0) {
            aiDisplayedContentRef.current = pending;
            flushAiMessage(pending);
          } else {
            // 自适应速度：
            // 如果落后很多（网络卡顿后突然涌入），则步进大一些以快速追赶
            // 如果落后很少，则步进小，实现打字机效果
            // min=1 保证不卡死，max 限制瞬时渲染量
            // Math.ceil(diff / 10) 意味着每帧追赶 10% 的差距 -> 渐进式平滑
            const step = Math.max(1, Math.ceil(diff / 5));

            const next = pending.slice(0, displayed.length + step);
            aiDisplayedContentRef.current = next;
            flushAiMessage(next);


          }
        }
        streamRafRef.current = requestAnimationFrame(loop);
      };
      streamRafRef.current = requestAnimationFrame(loop);

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed === "data: [DONE]") continue;

          try {
            const json = JSON.parse(trimmed);
            const deltaContent = json.choices?.[0]?.delta?.content;

            if (deltaContent) {
              accumulatedMessage += deltaContent;
              // 仅更新 pending，不直接刷新 UI
              aiPendingContentRef.current = accumulatedMessage;
            }
          } catch (e) {
            console.warn("JSON parse error for line:", trimmed, e);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const json = JSON.parse(buffer.trim());
          const deltaContent = json.choices?.[0]?.delta?.content;
          if (deltaContent) {
            accumulatedMessage += deltaContent;
            aiPendingContentRef.current = accumulatedMessage;
          }
        } catch (e) { }
      }

      // 流束后，确保最终内容完全显示
      // 停止动画循环
      if (streamRafRef.current) {
        cancelAnimationFrame(streamRafRef.current);
        streamRafRef.current = null;
      }
      // 强制同步最后状态
      flushAiMessage(accumulatedMessage);
      autoCollapseForContent(accumulatedMessage, aiMessageIndex);

      // 检测 <TaskTree> 并自动弹出交互式任务选择对话框
      if (/<tasktree>/i.test(accumulatedMessage)) {
        const taskTreeMatch = accumulatedMessage.match(/<tasktree>([\s\S]*?)<\/tasktree>/i);
        if (taskTreeMatch) {
          const parsed = parseTaskTreeContent(taskTreeMatch[1]);
          if (parsed) {
            setTaskTreeData(parsed.tasks);
            setSelectedTasks(new Set());
            setTimeout(() => setShowTaskTreeDialog(true), 300);
          } else {
            console.warn("[TaskTree] JSON 解析失败, 原始内容:", taskTreeMatch[1].slice(0, 200));
          }
        }
      }

      // 检测 <DataDictionary> 并自动弹出语义确认对话框
      if (/<datadictionary>/i.test(accumulatedMessage)) {
        const dictionaryMatch = accumulatedMessage.match(/<datadictionary>([\s\S]*?)<\/datadictionary>/i);
        if (dictionaryMatch) {
          const parsed = parseDataDictionaryContent(dictionaryMatch[1]);
          if (parsed) {
            setDataDictionaryItems(parsed.items);
            setSelectedDictionaryItems(new Set(parsed.items.map((item) => item.id)));
            setTimeout(() => setShowDataDictionaryDialog(true), 320);
          } else {
            console.warn("[DataDictionary] JSON 解析失败, 原始内容:", dictionaryMatch[1].slice(0, 200));
          }
        }
      }

      // 结束后刷新一次文件列表确保无遗漏
      await loadWorkspaceFiles();
      await loadWorkspaceTree();
      void loadAnalysisHistory({ silent: true });
      void loadRuntimeAnalysisTrace({ silent: true });
      setIsTyping(false); // 结束加载状态
      setIsAnalyzing(false);
      setStreamingMessageId(null);

    } catch (error) {
      console.error("Error sending message:", error);
      void loadAnalysisHistory({ silent: true });
      void loadRuntimeAnalysisTrace({ silent: true });
      setIsTyping(false);
      setIsAnalyzing(false);
      setStreamingMessageId(null);
    }
  };

  const handleConfirmTaskSelection = useCallback(() => {
    if (!taskTreeData || selectedTasks.size === 0) return;
    const items: string[] = [];
    const collect = (nodes: TaskTreeNode[]) => nodes.forEach(n => { if (selectedTasks.has(n.id)) items.push(`[${n.id}] ${n.name}`); if (n.children) collect(n.children); });
    collect(taskTreeData);
    const msg = analysisLanguage === "en"
      ? `The user selected the following analysis tasks: ${items.join(", ")}`
      : `用户选择了以下分析任务：${items.join("，")}`;
    setShowTaskTreeDialog(false);
    setSelectedTasks(new Set());
    setTaskTreeData(null);
    handleSendMessage(msg);
  }, [taskTreeData, selectedTasks, analysisLanguage]);

  const toggleDataDictionaryItem = useCallback((id: string) => {
    setSelectedDictionaryItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const updateDataDictionaryItem = useCallback((id: string, patch: Partial<DataDictionaryItem>) => {
    setDataDictionaryItems((prev) => {
      if (!prev) return prev;
      return prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          ...patch,
        };
      });
    });
  }, []);

  const selectAllDataDictionaryItems = useCallback(() => {
    if (!dataDictionaryItems) return;
    setSelectedDictionaryItems(new Set(dataDictionaryItems.map((item) => item.id)));
  }, [dataDictionaryItems]);

  const clearAllDataDictionaryItems = useCallback(() => {
    setSelectedDictionaryItems(new Set());
  }, []);

  const handleConfirmDataDictionary = useCallback(async () => {
    if (!dataDictionaryItems || selectedDictionaryItems.size === 0) return;

    const normalizedDictionaryItems = dataDictionaryItems.map((item) => ({
      ...item,
      proposed_meaning: String(item.proposed_meaning || "").trim(),
      question: String(item.question || "").trim(),
      analysis_usage: String(item.analysis_usage || "").trim(),
      confidence: String(item.confidence || "").trim(),
    }));

    const selectedIdList = Array.from(selectedDictionaryItems);
    const confirmedItems = normalizedDictionaryItems.filter((item) => selectedDictionaryItems.has(item.id));

    const selectedSources = (() => {
      const selectedIdSet = new Set(effectiveSelectedDbSourceIds);
      return savedDbConnections.filter((item) => selectedIdSet.has(item.id));
    })();

    try {
      const response = await fetch(API_URLS.CONFIG_DATA_DICTIONARY_SAVE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: currentUser || "default",
          session_id: sessionId,
          source_labels: selectedSources.map((item) => item.label),
          dictionary: {
            items: normalizedDictionaryItems,
          },
          selected_ids: selectedIdList,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      const total = Number(result?.result?.total_count || 0);
      toast({ description: `已保存 ${selectedIdList.length} 条数据字典（累计 ${total} 条）` });
    } catch (error) {
      console.error("保存数据字典失败:", error);
      toast({ description: "保存数据字典失败，已跳过持久化", variant: "destructive" });
    }

    const summary = confirmedItems
      .slice(0, 16)
      .map((item) => {
        const subject = [item.table, item.field].filter(Boolean).join(".") || item.id;
        return `[${item.id}] ${subject} => ${item.proposed_meaning || "已确认"}`;
      });

    const msg = analysisLanguage === "en"
      ? `The user confirmed the following data dictionary entries: ${summary.join("; ")}. Continue analysis with these confirmed semantics.`
      : `用户已确认以下数据字典条目：${summary.join("；")}。请基于这些已确认语义继续分析。`;

    setShowDataDictionaryDialog(false);
    setDataDictionaryItems(null);
    setSelectedDictionaryItems(new Set());

    void handleSendMessage(msg, {
      bypassSourceSelectionDialog: true,
      sourceSelectionConfirmed: true,
      confirmedSelectedDbSourceIds: effectiveSelectedDbSourceIds,
    });
  }, [
    analysisLanguage,
    currentUser,
    dataDictionaryItems,
    effectiveSelectedDbSourceIds,
    savedDbConnections,
    selectedDictionaryItems,
    sessionId,
    handleSendMessage,
    toast,
  ]);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files) return;
    await uploadToDir("", files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (!isLoggedIn) {
    return (
      <>
        {/* 认证弹窗 */}
        <AuthDialog
          open={showAuthModal}
          onOpenChange={setShowAuthModal}
          isLoggedIn={isLoggedIn}
          isLoginMode={isLoginMode}
          authUsername={authUsername}
          setAuthUsername={setAuthUsername}
          authPassword={authPassword}
          setAuthPassword={setAuthPassword}
          registeredUsers={registeredUsers}
          onAuth={handleAuth}
          onToggleMode={() => setIsLoginMode(!isLoginMode)}
        />
      </>
    );
  }

  return (
    <>
      <div
        className="h-screen bg-white dark:bg-black text-black dark:text-white"
        suppressHydrationWarning
      >
        <ResizablePanelGroup
          key={isLeftPanelDocked ? "layout-docked" : "layout-expanded"}
          direction="horizontal"
          className="h-full min-h-0"
        >
          {/* Left Panel - Workspace Tree */}
          <ResizablePanel
            defaultSize={isLeftPanelDocked ? LEFT_PANEL_DOCKED_DEFAULT_SIZE : 25}
            minSize={isLeftPanelDocked ? LEFT_PANEL_DOCKED_MIN_SIZE : 10}
            className="min-h-0 min-w-0"
          >
            {isLeftPanelDocked ? (
              <div className="flex h-full flex-col items-center justify-between border-r border-gray-200 bg-white py-2 dark:border-gray-800 dark:bg-black">
                <div className="flex flex-col items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    accept="*"
                    aria-label="上传文件"
                    title="上传文件"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title="展开左侧面板"
                    onClick={() => setIsLeftPanelDocked(false)}
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title="文件区（点击展开）"
                    onClick={() => setIsLeftPanelDocked(false)}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title="上传文件"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title="风调雨顺"
                    onClick={() => setSideGuidanceOpen(true)}
                    disabled={messages.length <= 1}
                  >
                    <BookOpen className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title="系统设置"
                    onClick={() => {
                      setSystemSettingsTab("model");
                      setShowSystemSettings(true);
                    }}
                  >
                    <Database className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title="了解观雨"
                    onClick={() => setShowAgentIntro(true)}
                  >
                    <Sparkles className="h-4 w-4 text-blue-500" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-gray-500"
                        title="清空 workspace"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>清空 workspace？</AlertDialogTitle>
                        <AlertDialogDescription>
                          将删除 workspace 根目录下的所有文件与文件夹，此操作不可撤销。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700"
                          onClick={clearWorkspace}
                        >
                          确认清空
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900/60">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title={hasSelectedDataSource ? "已选择数据源，点击调整" : "数据源未选择，点击配置"}
                    onClick={() => openDataSourcePicker(null)}
                  >
                    <Database className="h-4 w-4" />
                  </Button>
                  <span
                    className={`h-2 w-2 rounded-full ${hasSelectedDataSource ? "bg-emerald-500" : "bg-amber-500"}`}
                    title={hasSelectedDataSource ? "数据源已就绪" : "请先选择数据源"}
                  />
                </div>
              </div>
            ) : (
            <div className="flex flex-col min-h-0 min-w-0 h-full">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 h-12">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Files
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
                    title="收起为工具栏"
                    onClick={() => setIsLeftPanelDocked(true)}
                  >
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400"
                    title="了解观雨"
                    onClick={() => setShowAgentIntro(true)}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    title="风调雨顺 - 过程指导"
                    onClick={() => setSideGuidanceOpen(true)}
                    disabled={messages.length <= 1}
                  >
                    <BookOpen className="h-3 w-3 mr-1" />
                    风调雨顺
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    title="系统设置"
                    onClick={() => {
                      setSystemSettingsTab("model");
                      setShowSystemSettings(true);
                    }}
                  >
                    <Database className="h-3 w-3 mr-1" />
                    系统设置
                  </Button>
                </div>
                <div
                  className="flex items-center gap-1"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const items = Array.from(e.dataTransfer.files || []);
                    if (!items.length) return;
                    const form = new FormData();
                    items.forEach((f) => form.append("files", f));
                    const dir = contextTarget?.is_dir ? contextTarget.path : "";
                    try {
                      const url = `${API_URLS.WORKSPACE_UPLOAD_TO
                        }?dir=${encodeURIComponent(
                          dir
                        )}&session_id=${encodeURIComponent(sessionId)}&username=${currentUser || "default"}`;
                      await fetch(url, { method: "POST", body: form });
                      await loadWorkspaceTree();
                      await loadWorkspaceFiles();
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    accept="*"
                    aria-label="上传文件"
                    title="上传文件"
                  />
                  {/* <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
                  >
                    <Paperclip className="h-3 w-3" />
                  </Button> */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
                        title="清空 workspace"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>清空 workspace？</AlertDialogTitle>
                        <AlertDialogDescription>
                          将删除 workspace
                          根目录下的所有文件与文件夹，此操作不可撤销。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700"
                          onClick={clearWorkspace}
                        >
                          确认清空
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              <div
                ref={treeContainerRef}
                className="flex-1 w-full min-h-0 overflow-hidden pl-3 pr-1 py-2"
              >
                <div className="mb-5 rounded-xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.96))] p-2.5 shadow-[0_12px_32px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.96),rgba(15,23,42,0.92))]">
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={handleGenerateDataProfileReport}
                      disabled={isGeneratingDataProfileReport}
                      className="group relative h-20 w-full overflow-hidden rounded-lg border border-amber-300/60 bg-[linear-gradient(135deg,rgba(41,28,16,1),rgba(88,52,19,0.94)_52%,rgba(17,24,39,1))] text-left text-amber-50 shadow-[0_10px_26px_rgba(120,53,15,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-[0_18px_34px_rgba(245,158,11,0.18)] active:translate-y-[1px] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 disabled:cursor-not-allowed disabled:opacity-70"
                      title="生成数据探查 SKILL 文档"
                    >
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_40%),linear-gradient(90deg,rgba(245,158,11,0.14)_1px,transparent_1px),linear-gradient(0deg,rgba(245,158,11,0.08)_1px,transparent_1px)] bg-[size:auto,18px_18px,18px_18px]" />
                      <div className="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.12),transparent_52%)]" />
                      <div className="absolute left-0 top-0 h-full w-24 bg-[linear-gradient(90deg,rgba(251,191,36,0.18),transparent)] opacity-90" />
                      <div className="absolute right-4 top-3 hidden gap-1.5 sm:flex transition-transform duration-200 group-hover:translate-x-0.5">
                        <span className="h-1.5 w-10 rounded-full bg-amber-100/60" />
                        <span className="h-1.5 w-4 rounded-full bg-amber-200/40" />
                      </div>
                      <div className="absolute right-4 bottom-3 hidden gap-1 sm:flex">
                        <span className="h-6 w-1 rounded-full bg-amber-100/30" />
                        <span className="h-6 w-1 rounded-full bg-amber-200/20" />
                        <span className="h-6 w-1 rounded-full bg-amber-100/30" />
                      </div>
                      <div className="absolute inset-x-3 bottom-2 h-px bg-gradient-to-r from-transparent via-amber-100/60 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                      <div className="relative z-10 flex h-full items-center gap-3 px-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-amber-200/50 bg-amber-100/10 shadow-inner shadow-amber-50/10 transition-transform duration-200 group-hover:scale-105">
                          {isGeneratingDataProfileReport ? (
                            <RefreshCw className="h-5 w-5 animate-spin text-amber-100" />
                          ) : (
                            <FileText className="h-5 w-5 text-amber-100" />
                          )}
                        </div>
                        <div className="min-w-0 transition-transform duration-200 group-hover:translate-x-0.5">
                          <div className="text-[10px] font-medium uppercase tracking-[0.24em] text-amber-200/70">Archive</div>
                          <div className="mt-1 text-sm font-semibold tracking-[0.02em] text-amber-50">沉淀数据探查</div>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowDatabaseRelationshipDialog(true);
                        void handleLoadSchemaGraph();
                      }}
                      disabled={isLoadingSchemaGraph || !isDbTested}
                      className="group relative h-20 w-full overflow-hidden rounded-lg border border-emerald-300/60 bg-[linear-gradient(135deg,rgba(8,27,30,1),rgba(5,88,91,0.92)_52%,rgba(15,23,42,1))] text-left text-emerald-50 shadow-[0_10px_26px_rgba(5,150,105,0.16)] transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_18px_34px_rgba(16,185,129,0.18)] active:translate-y-[1px] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70 disabled:cursor-not-allowed disabled:opacity-70"
                      title={isDbTested ? "展示数据库表关系与数据脉络" : "请先在系统设置中测试数据库连接"}
                    >
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.18),transparent_38%),linear-gradient(90deg,rgba(16,185,129,0.14)_1px,transparent_1px),linear-gradient(0deg,rgba(52,211,153,0.08)_1px,transparent_1px)] bg-[size:auto,18px_18px,18px_18px]" />
                      <div className="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 bg-[radial-gradient(circle_at_center,rgba(52,211,153,0.12),transparent_52%)]" />
                      <div className="absolute inset-y-0 right-0 w-28 bg-[linear-gradient(270deg,rgba(34,197,94,0.14),transparent)]" />
                      <div className="absolute right-6 top-4 hidden h-12 w-16 sm:block transition-transform duration-200 group-hover:translate-x-0.5">
                        <span className="absolute left-1 top-1 h-2.5 w-2.5 rounded-full border border-emerald-100/60 bg-emerald-200/20" />
                        <span className="absolute right-1 top-5 h-2.5 w-2.5 rounded-full border border-emerald-100/60 bg-emerald-200/20" />
                        <span className="absolute left-5 bottom-1 h-2.5 w-2.5 rounded-full border border-emerald-100/60 bg-emerald-200/20" />
                        <span className="absolute left-3 top-3 h-px w-8 rotate-[18deg] bg-emerald-100/50" />
                        <span className="absolute left-4 top-5 h-px w-7 -rotate-[24deg] bg-emerald-100/50" />
                      </div>
                      <div className="absolute inset-x-3 bottom-2 h-px bg-gradient-to-r from-transparent via-emerald-100/60 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                      <div className="relative z-10 flex h-full items-center gap-3 px-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-emerald-200/50 bg-emerald-100/10 shadow-inner shadow-emerald-50/10 transition-transform duration-200 group-hover:scale-105">
                          {isLoadingSchemaGraph ? (
                            <RefreshCw className="h-5 w-5 animate-spin text-emerald-100" />
                          ) : (
                            <GitBranch className="h-5 w-5 text-emerald-100" />
                          )}
                        </div>
                        <div className="min-w-0 transition-transform duration-200 group-hover:translate-x-0.5">
                          <div className="text-[10px] font-medium uppercase tracking-[0.24em] text-emerald-200/70">Topology</div>
                          <div className="mt-1 text-sm font-semibold tracking-[0.02em] text-emerald-50">展示数据脉络</div>
                        </div>
                      </div>
                    </button>
                  </div>

                  <div
                    className={cn(
                      "group relative mt-2.5 flex h-20 cursor-pointer items-center overflow-hidden rounded-lg border text-xs select-none transition-all duration-200",
                      dropActive
                        ? "border-sky-300 bg-[linear-gradient(135deg,rgba(224,242,254,0.98),rgba(240,249,255,0.95))] text-sky-700 shadow-[0_16px_34px_rgba(14,165,233,0.16)] dark:border-sky-500/70 dark:bg-[linear-gradient(135deg,rgba(8,47,73,0.9),rgba(12,74,110,0.84))] dark:text-sky-100"
                        : "border-slate-300/80 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(241,245,249,0.95))] text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] hover:border-slate-400 hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(30,41,59,0.88))] dark:text-slate-300",
                      isUploading ? "border-violet-300/70 text-violet-700 dark:border-violet-500/60 dark:text-violet-100" : "",
                    )}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDropActive(true);
                    }}
                    onDragLeave={() => setDropActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDropActive(false);
                      const files = e.dataTransfer.files;
                      if (files && files.length) uploadToDir("", files);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:18px_18px] opacity-70" />
                    <div className="absolute inset-y-0 left-0 w-28 bg-[linear-gradient(90deg,rgba(255,255,255,0.35),transparent)] dark:bg-[linear-gradient(90deg,rgba(255,255,255,0.06),transparent)]" />
                    <div className="absolute right-4 top-3 hidden sm:flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] opacity-60">
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      <span>{isUploading ? "Transfer" : dropActive ? "Drop" : "Ingress"}</span>
                    </div>
                    {/* 独立隐藏 input 兼容点击上传 */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                      accept="*"
                      aria-label="上传文件"
                      title="上传文件"
                    />
                    <div className="relative z-10 flex w-full items-center justify-between gap-3 px-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-current/20 bg-white/35 dark:bg-white/6 transition-transform duration-200 group-hover:scale-105">
                          {isUploading ? (
                            <RefreshCw className="h-5 w-5 animate-spin" />
                          ) : (
                            <Upload className="h-5 w-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] font-medium uppercase tracking-[0.24em] opacity-70">Ingress Bay</div>
                          <div className="mt-1 truncate text-sm font-semibold">拖拽或点击上传数据文件</div>
                        </div>
                      </div>
                      <div className="hidden shrink-0 sm:flex flex-col items-end gap-1">
                        <span className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] opacity-80">
                          {isUploading ? "上传中" : "Workspace Root"}
                        </span>
                        <span className="text-[10px] opacity-65">支持拖拽批量投递</span>
                      </div>
                    </div>
                  </div>

                  {uploadMsg && (
                    <div className="px-1 pt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {uploadMsg}
                    </div>
                  )}
                </div>

                {workspaceTree ? (
                  <Tree
                    width={treeSize.w || "100%"}
                    height={Math.max(600, treeSize.h - 205)}
                    data={toArbor(workspaceTree).children || []}
                    initialOpenState={expanded}
                    indent={14}
                    rowHeight={28}
                  >
                    {Row}
                  </Tree>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-gray-500">
                    Loading...
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-gray-200 bg-slate-50/70 px-3 py-3 dark:border-gray-800 dark:bg-slate-950/30">
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white/90 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950/70">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">数据源选择（必选）</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 border-sky-200 px-2 text-[10px] text-sky-700 hover:bg-sky-50 dark:border-sky-900 dark:text-sky-300 dark:hover:bg-sky-950/40"
                      onClick={() => openDataSourcePicker(null)}
                    >
                      选择数据源
                    </Button>
                  </div>

                  <div className="flex min-h-[120px] flex-1 flex-col justify-center rounded-xl border border-dashed border-slate-300/90 bg-slate-50/70 p-2.5 dark:border-slate-700 dark:bg-slate-900/30">
                    {hasSelectedDataSource ? (
                      <div className="space-y-2">
                        {selectedDatabaseSources.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {selectedDatabaseSources.map((source) => (
                              <span
                                key={source.id}
                                className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-300"
                                title={`${source.dbType.toUpperCase()} · ${source.label}`}
                              >
                                {source.label}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {hasWorkspaceDataSource ? (
                            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                              已上传文件 {workspaceDataSourceFiles.length} 个
                          </span>
                        ) : null}
                        {selectedDatabaseSources.length > 0 ? (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            已完成数据源确认，本轮分析将按以上数据范围执行。
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-1 text-[11px] leading-5 text-amber-700 dark:text-amber-300">
                        <p>当前尚未选择任何数据源。</p>
                        <p>发送分析要求时将自动弹出数据源选择窗口。</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            )}
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Middle Panel - Chat & Analysis */}
          <ResizablePanel defaultSize={isLeftPanelDocked ? 67 : 50} minSize={25} className="min-h-0 min-w-0">
            <div className="flex flex-col min-h-0 min-w-0 h-full">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 h-12 shrink-0 overflow-hidden">
                <div className="flex min-w-0 items-center gap-3 overflow-hidden">
                  <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                    <h1 className="text-sm font-medium">观雨</h1>
                    {isTyping && (
                      <div className="flex shrink-0 items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                        <span>执行中…</span>
                      </div>
                    )}
                    {isLoggedIn && (
                      <div className="flex shrink-0 items-center gap-2 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-[10px] font-medium">
                        <User className="h-2.5 w-2.5" />
                        <span>{currentUser}</span>
                        <button onClick={handleLogout} className="hover:text-red-500 ml-1">退出</button>
                      </div>
                    )}
                  </div>
                  <div className="hidden xl:flex shrink-0 items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <span>自动折叠</span>
                    <Switch
                      className="data-[state=unchecked]:bg-gray-200 data-[state=unchecked]:border data-[state=unchecked]:border-gray-300"
                      checked={autoCollapseEnabled}
                      onCheckedChange={(v: boolean) => {
                        setAutoCollapseEnabled(!!v);
                        if (typeof window !== "undefined") {
                          localStorage.setItem(
                            "autoCollapseEnabled",
                            (!!v).toString()
                          );
                        }
                        // 关闭自动折叠时，展开所有块
                        if (!v) {
                          setCollapsedSections({});
                          setManualLocks({});
                        }
                      }}
                    />
                  </div>
                  <div className="flex min-w-0 items-center gap-1 ml-2 overflow-x-auto scrollbar-none">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] px-2 gap-1 border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-400"
                      onClick={() => isLoggedIn ? setShowSaveDialog(true) : setShowAuthModal(true)}
                    >
                      <Save className="h-3 w-3" />
                      保存项目
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] px-2 gap-1 border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-900 dark:text-purple-400"
                      onClick={() => isLoggedIn ? setShowProjectManager(true) : setShowAuthModal(true)}
                    >
                      <FolderOpen className="h-3 w-3" />
                      项目中心
                    </Button>
                    {/* 报告类型选择 */}
                    <Popover
                      open={showReportTypePicker}
                      onOpenChange={(open) => {
                        if (open) {
                          openReportTypePicker();
                        } else {
                          cancelReportTypePicker();
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] px-2 gap-1 border-green-200 text-green-600 hover:bg-green-50 dark:border-green-900 dark:text-green-400"
                        >
                          <FileText className="h-3 w-3" />
                          报告类型
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        side="bottom"
                        sideOffset={8}
                        className="w-[240px] p-3 space-y-3"
                      >
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-2 font-medium">选择报告输出格式</div>
                        {["pdf", "docx", "pptx"].map((type) => (
                          <label key={type} className="flex items-center gap-2 py-1.5 px-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={pendingReportTypes.includes(type)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setPendingReportTypes((prev) =>
                                    prev.includes(type) ? prev : [...prev, type]
                                  );
                                } else {
                                  setPendingReportTypes((prev) =>
                                    prev.filter((item) => item !== type)
                                  );
                                }
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-xs text-gray-700 dark:text-gray-300 uppercase font-mono">{type}</span>
                          </label>
                        ))}
                        <div className="text-[9px] text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800">
                          当前: {pendingReportTypes.map((type) => type.toUpperCase()).join(", ") || "未选择"}
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={cancelReportTypePicker}>
                            取消
                          </Button>
                          <Button size="sm" className="h-7 text-[11px]" onClick={confirmReportTypePicker}>
                            确定
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>

                    {/* 分析语言选择 */}
                    <Popover
                      open={showLanguagePicker}
                      onOpenChange={(open) => {
                        if (open) {
                          openLanguagePicker();
                        } else {
                          cancelLanguagePicker();
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] px-2 gap-1 border-sky-200 text-sky-600 hover:bg-sky-50 dark:border-sky-900 dark:text-sky-400"
                        >
                          <Languages className="h-3 w-3" />
                          语言
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        side="bottom"
                        sideOffset={8}
                        className="w-[280px] p-3 space-y-3"
                      >
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-2 font-medium">选择分析与报告语言</div>
                        {ANALYSIS_LANGUAGE_OPTIONS.map((option) => (
                          <label
                            key={option.value}
                            className="flex items-start gap-2 py-1.5 px-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer"
                          >
                            <input
                              type="radio"
                              name="analysis-language"
                              checked={pendingAnalysisLanguage === option.value}
                              onChange={() => setPendingAnalysisLanguage(option.value)}
                              className="mt-0.5 border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="flex-1">
                              <span className="block text-xs text-gray-700 dark:text-gray-300 font-medium">{option.label}</span>
                              <span className="block text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{option.description}</span>
                            </span>
                          </label>
                        ))}
                        <div className="text-[9px] text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800">
                          当前: {getAnalysisLanguageLabel(pendingAnalysisLanguage)}
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={cancelLanguagePicker}>
                            取消
                          </Button>
                          <Button size="sm" className="h-7 text-[11px]" onClick={confirmLanguagePicker}>
                            确定
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="开启全新分析会话"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>开启全新分析？</AlertDialogTitle>
                        <AlertDialogDescription>
                          将清空当前所有聊天历史与工作区数据，开始一个全新的分析流程。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={createNewSession}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          确认开启
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleTheme}
                    className="h-8 w-8 p-0"
                  >
                    {mounted ? (
                      isDarkMode ? (
                        <Sun className="h-4 w-4" />
                      ) : (
                        <Moon className="h-4 w-4" />
                      )
                    ) : (
                      <Moon className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Step Navigator - Top Horizontal */}
              {(() => {
                // 只显示最后一条 AI 消息的步骤
                let lastAiMsgIndex = -1;
                let lastAiMsg = null;

                for (let i = messages.length - 1; i >= 0; i--) {
                  if (messages[i].sender === "ai") {
                    lastAiMsg = messages[i];
                    lastAiMsgIndex = i;
                    break;
                  }
                }

                if (!lastAiMsg || lastAiMsgIndex === -1) return null;

                const allSections = extractSections(
                  lastAiMsg.content,
                  lastAiMsgIndex
                );

                if (allSections.length === 0) return null;

                return (
                  <div className="relative border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-6 py-4 overflow-hidden">
                    {/* 背景装饰 */}
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 via-purple-50/30 to-pink-50/50 dark:from-blue-950/20 dark:via-purple-950/10 dark:to-pink-950/20 pointer-events-none" />

                    <div
                      ref={stepNavigatorRef}
                      className="relative flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin"
                    >
                      {allSections.map((section, idx) => {
                        const isActive = activeSection === section.sectionKey;
                        const activeIdx = allSections.findIndex(
                          (s) => s.sectionKey === activeSection
                        );
                        const isCompleted = activeIdx > idx;
                        const isPending = activeIdx < idx;

                        // 颜色映射
                        const colorMap: Record<
                          string,
                          {
                            bg: string;
                            border: string;
                            glow: string;
                            text: string;
                          }
                        > = {
                          "bg-blue-500": {
                            bg: "bg-blue-500",
                            border: "border-blue-400",
                            glow: "shadow-blue-500/50",
                            text: "text-blue-600",
                          },
                          "bg-cyan-500": {
                            bg: "bg-cyan-500",
                            border: "border-cyan-400",
                            glow: "shadow-cyan-500/50",
                            text: "text-cyan-600",
                          },
                          "bg-gray-500": {
                            bg: "bg-gray-500",
                            border: "border-gray-400",
                            glow: "shadow-gray-500/50",
                            text: "text-gray-600",
                          },
                          "bg-orange-500": {
                            bg: "bg-orange-500",
                            border: "border-orange-400",
                            glow: "shadow-orange-500/50",
                            text: "text-orange-600",
                          },
                          "bg-green-500": {
                            bg: "bg-green-500",
                            border: "border-green-400",
                            glow: "shadow-green-500/50",
                            text: "text-green-600",
                          },
                          "bg-purple-500": {
                            bg: "bg-purple-500",
                            border: "border-purple-400",
                            glow: "shadow-purple-500/50",
                            text: "text-purple-600",
                          },
                        };
                        const colors =
                          colorMap[section.config.color] ||
                          colorMap["bg-gray-500"];

                        return (
                          <div
                            key={section.sectionKey}
                            className="flex items-center shrink-0"
                            ref={(el) => {
                              if (el) {
                                activeStepRefs.current.set(
                                  section.sectionKey,
                                  el
                                );
                              }
                            }}
                          >
                            {/* 步骤节点 */}
                            <button
                              onClick={() =>
                                scrollToSection(section.sectionKey)
                              }
                              className={`group relative flex flex-col items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all duration-300 ${isActive
                                ? "scale-105"
                                : "hover:scale-102 hover:bg-gray-50 dark:hover:bg-gray-900/50"
                                }`}
                            >
                              {/* 圆圈容器 */}
                              <div className="relative">
                                {/* 脉动动画背景 */}
                                {isActive && (
                                  <div
                                    className={`absolute inset-0 ${colors.bg} rounded-full animate-ping opacity-20`}
                                  />
                                )}

                                {/* 主圆圈 */}
                                <div
                                  className={`relative w-9 h-9 rounded-full flex items-center justify-center font-semibold text-base transition-all duration-500 ${isActive
                                    ? `${colors.bg} text-white shadow-lg ${colors.glow
                                    } ring-2 ring-offset-1 ${colors.border.replace(
                                      "border-",
                                      "ring-"
                                    )} ring-opacity-30 dark:ring-offset-gray-950`
                                    : isCompleted
                                      ? "bg-gradient-to-br from-green-400 to-green-600 text-white shadow-md shadow-green-500/30"
                                      : "bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 border-2 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500"
                                    } ${!isActive &&
                                    !isCompleted &&
                                    "group-hover:border-gray-400 dark:group-hover:border-gray-500 group-hover:shadow-md"
                                    }`}
                                >
                                  {/* 内容 */}
                                  {isCompleted ? (
                                    <Check className="w-4 h-4 animate-in zoom-in duration-300" />
                                  ) : (
                                    <span
                                      className={`text-base transition-transform duration-300 ${isActive
                                        ? "scale-110"
                                        : "group-hover:scale-105"
                                        }`}
                                    >
                                      {section.config.icon}
                                    </span>
                                  )}

                                  {/* 进度指示小点 */}
                                  {isActive && (
                                    <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-white dark:bg-gray-950 rounded-full flex items-center justify-center">
                                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* 标签 */}
                              <div
                                className={`text-[11px] font-semibold whitespace-nowrap transition-all duration-300 ${isActive
                                  ? `${colors.text} dark:text-white scale-105`
                                  : isCompleted
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300"
                                  }`}
                              >
                                {section.type}
                              </div>

                              {/* 序号 */}
                              <div
                                className={`absolute top-0 left-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold transition-all duration-300 ${isActive
                                  ? `${colors.bg} text-white shadow-sm`
                                  : isCompleted
                                    ? "bg-green-500 text-white"
                                    : "bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300"
                                  }`}
                              >
                                {idx + 1}
                              </div>
                            </button>

                            {/* 连接线 */}
                            {idx < allSections.length - 1 && (
                              <div className="relative w-16 h-1 mx-1">
                                {/* 背景轨道 */}
                                <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 rounded-full" />

                                {/* 进度条 */}
                                  <div
                                    className={`absolute inset-0 rounded-full transition-all duration-700 origin-left transform ${isCompleted || isActive
                                      ? "bg-gradient-to-r from-green-400 to-green-500 shadow-sm shadow-green-500/30"
                                      : "bg-transparent"
                                      } ${isActive ? "scale-x-50" : "scale-x-100"}`}
                                  />

                                {/* 流动动画 */}
                                {isActive && (
                                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-50 animate-shimmer" />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Chat Messages */}
              <div
                ref={messagesContainerRef}
                onScroll={(e) => {
                  const target = e.currentTarget;
                  const isBottom =
                    Math.abs(
                      target.scrollHeight - target.scrollTop - target.clientHeight
                    ) < 50;
                  stickToBottomRef.current = isBottom;
                }}
                className="flex-1 min-h-0 min-w-0 overflow-y-scroll overflow-x-hidden px-4 py-4 pr-5 space-y-6 scrollbar-auto"
              >
                {messages.map((message, msgIdx) => (
                  <ChatMessageItem
                    key={message.id}
                    message={message}
                    messageIndex={msgIdx}
                    isStreaming={
                      message.sender === "ai" && message.id === streamingMessageId
                    }
                    renderAssistant={renderMessageWithSections}
                    renderAssistantStreaming={renderMessageWithSectionsStreaming}
                  />
                ))}
                {/* 加载气泡已移除，改为仅按钮态提示 */}
                <div ref={messagesEndRef} />
              </div>

              <div className="shrink-0 border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-black">
                <div className="p-4">
                  <div className="relative">
                    <Textarea
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder="在此输入分析指令或提问..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      rows={6}
                      className="min-h-[120px] resize-none border-gray-200 bg-white rounded-lg focus-visible:ring-1 dark:border-gray-700 dark:bg-black"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                    <div className="flex-1 overflow-x-auto scrollbar-none pr-1">
                      <div className="flex min-w-max items-center gap-1">
                        {historyInputs.length > 0 ? (
                          <>
                            <span className="mr-1 shrink-0 text-[10px] text-gray-400 dark:text-gray-600">历史:</span>
                            {historyInputs.map((hist, idx) => (
                              <Button
                                key={idx}
                                variant="ghost"
                                size="sm"
                                onClick={() => setInputValue(hist)}
                                className="h-6 shrink-0 rounded-full bg-gray-100 px-2 text-[10px] text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                              >
                                {idx + 1}
                              </Button>
                            ))}
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            title="清空聊天"
                            className="h-9 px-3"
                            disabled={isTyping}
                          >
                            <Eraser className="mr-2 h-4 w-4" />
                            清空
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>清空聊天？</AlertDialogTitle>
                            <AlertDialogDescription>
                              将删除当前会话内的所有消息，仅保留欢迎提示。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={clearChat}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              确认清空
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      {isTyping ? (
                        <Button
                          size="sm"
                          onClick={stopGeneration}
                          className="h-9 w-[108px] rounded-md border border-red-200 bg-red-50 px-4 text-red-600 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
                        >
                          <Square className="mr-2 h-4 w-4 fill-current" />
                          停止
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handleSendMessage()}
                          size="sm"
                          disabled={!inputValue.trim()}
                          className="h-9 w-[108px] bg-black px-4 text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
                        >
                          <Send className="mr-2 h-4 w-4" />
                          发送
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Panel - Analysis Process */}
          <ResizablePanel defaultSize={25} minSize={20} className="min-h-0 min-w-0">
            <div className="flex h-full min-h-0 flex-col bg-gray-50 dark:bg-gray-900">
              <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {showCodeEditor ? "Code" : "分析过程侧栏"}
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSettingsDialog(true)}
                    className="h-7 px-2 text-[11px]"
                    title="策略与技能"
                  >
                    <Bot className="mr-1 h-3.5 w-3.5" />
                    策略与技能
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowYutuPanel(true);
                      loadYutuHtml();
                    }}
                    className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    title="雨途斩棘录 - 错误修正记录"
                  >
                    <BookOpen className="mr-1 h-3.5 w-3.5" />
                    <span>雨途斩棘录</span>
                  </Button>
                  {showCodeEditor ? (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowCodeEditor(false);
                          setCodeEditorContent("");
                          setSelectedCodeSection("");
                        }}
                        className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        Close
                      </Button>
                      <Button
                        size="sm"
                        onClick={executeCode}
                        disabled={!codeEditorContent || isExecutingCode}
                        className="h-6 bg-black px-3 text-xs text-white dark:bg-white dark:text-black"
                      >
                        {isExecutingCode ? "Running..." : "Run"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              {!showCodeEditor ? (
                <AnalysisRuntimeSidebar
                  run={runtimeAnalysisRun}
                  events={runtimeAnalysisEvents}
                  loading={isLoadingRuntimeAnalysisTrace}
                  isAnalyzing={isAnalyzing}
                  onOpenFullHistory={() => {
                    setSystemSettingsTab("history");
                    setShowSystemSettings(true);
                  }}
                />
              ) : (
                <div
                  className="editor-container flex flex-1 min-h-0 flex-col overflow-hidden p-4"
                  style={{ ["--editor-height" as string]: `${editorHeight}%` }}
                >
                  <div className="flex h-[var(--editor-height)] min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-black">
                    <div className="shrink-0 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                      <span className="font-mono text-xs text-gray-500">python</span>
                    </div>
                    <div className="flex-1 min-h-0">
                      <Editor
                        height="100%"
                        defaultLanguage="python"
                        value={codeEditorContent}
                        onChange={(value) => setCodeEditorContent(value || "")}
                        theme={isDarkMode ? "vs-dark" : "light"}
                        options={{
                          fontSize: 14,
                          fontFamily:
                            "var(--font-mono), 'Courier New', monospace",
                          lineNumbers: "on",
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                          tabSize: 4,
                          insertSpaces: true,
                          wordWrap: "on",
                          folding: true,
                          lineDecorationsWidth: 10,
                          lineNumbersMinChars: 3,
                          glyphMargin: false,
                          selectOnLineNumbers: true,
                          roundedSelection: false,
                          readOnly: false,
                          cursorStyle: "line",
                          smoothScrolling: true,
                          formatOnPaste: true,
                          formatOnType: true,
                          suggestOnTriggerCharacters: true,
                          acceptSuggestionOnEnter: "on",
                          tabCompletion: "on",
                          scrollbar: {
                            vertical: "visible",
                            verticalScrollbarSize: 10,
                          },
                        }}
                        loading={
                          <div className="flex h-full items-center justify-center">
                            <div className="text-muted-foreground flex items-center gap-2">
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
                              <span className="text-sm">加载编辑器...</span>
                            </div>
                          </div>
                        }
                      />
                    </div>
                  </div>

                  <div
                    className="group flex h-2 cursor-row-resize items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                    onMouseDown={handleMouseDown}
                  >
                    <div className="h-1 w-8 rounded bg-gray-300 group-hover:bg-gray-400 dark:bg-gray-600 dark:group-hover:bg-gray-500"></div>
                  </div>

                  <div className="flex h-[calc(100%-var(--editor-height))] min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                    <div className="shrink-0 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">Output</span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto bg-white p-3 font-mono text-sm text-gray-800 dark:bg-black dark:text-gray-200">
                      {codeExecutionResult ? (
                        <div>
                          <div className="mb-1 text-gray-500 dark:text-gray-400">$ python main.py</div>
                          <pre className="whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                            {codeExecutionResult}
                          </pre>
                          <div className="mt-2 flex items-center">
                            <span className="text-gray-500 dark:text-gray-400">$</span>
                            <span className="ml-1 h-4 w-2 animate-pulse bg-gray-400 dark:bg-gray-500"></span>
                          </div>
                        </div>
                      ) : (
                        <div className="italic text-gray-400 dark:text-gray-500">
                          Run code to see output...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      {contextPos && contextTarget && (
        <div
          className="fixed z-50 bg-card border border-gray-200 dark:border-gray-700 rounded shadow-sm text-sm"
          style={{ left: contextPos.x, top: contextPos.y, minWidth: 180 }}
          onMouseLeave={closeContext}
        >
          {/* 生成文件专属：移动到普通文件区 */}
          {!contextTarget.is_dir &&
            contextTarget.path.startsWith("generated/") && (
              <button
                className="block w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={async () => {
                  await moveToDir(contextTarget.path, "");
                  closeContext();
                }}
              >
                移动到普通文件区
              </button>
            )}
          {!contextTarget.is_dir && (
            <button
              className="block w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => {
                openNode(contextTarget);
                closeContext();
              }}
            >
              预览
            </button>
          )}
          {!contextTarget.is_dir && contextTarget.download_url && (
            <a
              className="block px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
              href={contextTarget.download_url}
              download={contextTarget.name}
              onClick={closeContext}
            >
              下载
            </a>
          )}
          <button
            className="block w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
            onClick={() => {
              copyToClipboard(contextTarget.path)
                .then((ok) =>
                  toast({
                    description: ok ? "已复制路径" : "复制失败",
                    variant: ok ? undefined : "destructive",
                  })
                )
                .catch(() =>
                  toast({ description: "复制失败", variant: "destructive" })
                );
              closeContext();
            }}
          >
            复制路径
          </button>
          {!contextTarget.is_dir && (
            <button
              className="block w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
              onClick={() => {
                setDeleteConfirmPath(contextTarget.path);
                setDeleteIsDir(false);
              }}
            >
              删除文件
            </button>
          )}
          {contextTarget.is_dir && contextTarget.name === "generated" && (
            <button
              className="block w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
              onClick={() => {
                setDeleteConfirmPath(contextTarget.path);
                setDeleteIsDir(true);
              }}
            >
              删除文件夹
            </button>
          )}
        </div>
      )}
      {/* 全局删除确认弹窗 */}
      {/* 右键移动操作已集成到主菜单顶部，移除单独浮层 */}

      {/* 全局删除确认弹窗 */}
      <AlertDialog
        open={!!deleteConfirmPath}
        onOpenChange={(o) => !o && setDeleteConfirmPath(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteIsDir ? "确认删除文件夹？" : "确认删除文件？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteIsDir
                ? "此操作不可撤销，将删除该文件夹及其所有内容。"
                : "此操作不可撤销，将从 workspace 中移除此文件。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmPath(null)}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (deleteConfirmPath) {
                  if (deleteIsDir) {
                    await deleteDir(deleteConfirmPath);
                  } else {
                    await deleteFile(deleteConfirmPath);
                  }
                }
                setDeleteConfirmPath(null);
                closeContext();
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* 文件预览弹窗 */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent
          style={{
            width: "90vw",
            height: "90vh",
            maxWidth: "90vw",
            maxHeight: "90vh",
          }}
          className=" p-0 overflow-hidden flex flex-col"
        >
          <DialogHeader className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <DialogTitle className="text-sm font-medium truncate">
              {previewTitle}
            </DialogTitle>
          </DialogHeader>
          <div
            ref={previewScrollRef}
            className="w-full flex-1 min-h-0 overflow-auto"
          >
            {previewLoading ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">
                Loading...
              </div>
            ) : previewType === "image" ? (
              <div className="p-4 h-full flex items-center justify-center">
                <img
                  src={previewContent}
                  alt={previewTitle}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            ) : previewType === "pdf" ? (
              <iframe
                src={previewContent}
                title={previewTitle || "文件预览"}
                className="w-full h-full"
              />
            ) : previewType === "text" ? (
              <div className="h-full min-h-0 p-2">
                <div className="h-full min-h-0 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                  <div className="h-full min-h-0">
                    <Editor
                      height="100%"
                      defaultLanguage={guessLanguageByExtension(
                        previewTitle.split(".").pop() || "text"
                      )}
                      language={guessLanguageByExtension(
                        previewTitle.split(".").pop() || "text"
                      )}
                      value={previewContent}
                      theme={isDarkMode ? "vs-dark" : "light"}
                      options={{
                        readOnly: true,
                        wordWrap: "on",
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontFamily:
                          "var(--font-mono), 'Courier New', monospace",
                        fontSize: 14,
                        lineNumbers: "on",
                        automaticLayout: true,
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4">
                <div className="text-xs text-gray-500 mb-2">
                  无法识别类型，尝试以文本方式预览：
                </div>
                <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                  <SyntaxHighlighter
                    language={guessLanguageByExtension(
                      previewTitle.split(".").pop() || "text"
                    )}
                    style={isDarkMode ? oneDark : oneLight}
                    customStyle={{ margin: 0 }}
                    codeTagProps={{
                      style: {
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.875rem",
                      },
                    }}
                  >
                    {previewContent}
                  </SyntaxHighlighter>
                </div>
                <div className="mt-3 text-xs text-gray-500">
                  如显示异常，
                  <a
                    className="underline"
                    href={previewDownloadUrl || previewContent}
                    target="_blank"
                    rel="noreferrer"
                  >
                    点击下载/打开
                  </a>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 多数据源选择弹窗 */}
      <Dialog
        open={showDataSourceDialog}
        onOpenChange={(open) => {
          if (!open) {
            cancelDataSourcePicker();
          } else {
            setShowDataSourceDialog(true);
          }
        }}
      >
        <DialogContent className="max-w-[620px]">
          <DialogHeader>
            <DialogTitle>选择本轮分析数据源</DialogTitle>
            <DialogDescription>
              检测到你已配置多个数据库连接。请为本轮分析选择一个或多个数据库数据源。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[320px] overflow-auto pr-1">
            {savedDbConnections.map((connection) => {
              const checked = pendingDataSourceSelection.selectedDbSourceIds.includes(connection.id);
              return (
                <label
                  key={connection.id}
                  className="flex items-start gap-3 rounded-md border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/40"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(nextChecked) => {
                      setPendingDataSourceSelection((prev) => {
                        const ids = new Set(prev.selectedDbSourceIds);
                        if (nextChecked) {
                          ids.add(connection.id);
                        } else {
                          ids.delete(connection.id);
                        }
                        return {
                          ...prev,
                          selectedDbSourceIds: Array.from(ids),
                        };
                      });
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100 break-all">
                      {connection.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-all">
                      类型: {connection.dbType.toUpperCase()} | 用户: {connection.config.user || "(未填写)"}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 p-3 text-xs text-gray-600 dark:text-gray-300">
            文件数据源状态: {hasWorkspaceDataSource ? "已检测到已上传文件，可与数据库联合分析或单独分析。" : "当前未检测到已上传文件。"}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={cancelDataSourcePicker}>取消</Button>
            <Button onClick={confirmDataSourcePicker}>开始分析</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showModelConfigAlert} onOpenChange={setShowModelConfigAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>请先配置 AI 模型</AlertDialogTitle>
            <AlertDialogDescription>
              当前模型配置不完整，暂时无法开始分析任务。请先在系统设置中补全模型地址、模型名称，以及需要时的 API Key。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>稍后再说</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowModelConfigAlert(false);
                setSystemSettingsTab("model");
                setShowSystemSettings(true);
              }}
            >
              去配置模型
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* 交互式任务选择对话框 */}
      <TaskTreeDialog
        open={showTaskTreeDialog}
        onOpenChange={setShowTaskTreeDialog}
        taskTreeData={taskTreeData}
        language={analysisLanguage}
        selectedTasks={selectedTasks}
        toggleTask={toggleTask}
        selectAllTasks={selectAllTasks}
        deselectAllTasks={deselectAllTasks}
        onConfirm={handleConfirmTaskSelection}
      />

      <DataDictionaryDialog
        open={showDataDictionaryDialog}
        onOpenChange={setShowDataDictionaryDialog}
        language={analysisLanguage}
        items={dataDictionaryItems || []}
        selectedIds={selectedDictionaryItems}
        toggleItem={toggleDataDictionaryItem}
        updateItem={updateDataDictionaryItem}
        selectAll={selectAllDataDictionaryItems}
        clearAll={clearAllDataDictionaryItems}
        onConfirm={() => {
          void handleConfirmDataDictionary();
        }}
      />

      {/* 保存项目弹窗 */}
      <ProjectSaveDialog
        showSaveDialog={showSaveDialog}
        setShowSaveDialog={setShowSaveDialog}
        projectName={projectName}
        setProjectName={setProjectName}
        userProjects={userProjects.map((p: any) => ({ id: p.id, name: p.name }))}
        onSave={() => saveProject(false)}
        saveConfirmOpen={saveConfirmOpen}
        setSaveConfirmOpen={setSaveConfirmOpen}
        setPendingSaveData={setPendingSaveData}
        onConfirmOverwrite={() => saveProject(true)}
      />

      {/* 项目中心弹窗 */}
      <ProjectManagerDialog
        open={showProjectManager}
        onOpenChange={setShowProjectManager}
        userProjects={userProjects}
        onLoad={loadProject}
        onDelete={deleteProject}
      />

      {/* 退出登录确认弹窗 */}
      <LogoutConfirmDialog
        open={showLogoutConfirm}
        onOpenChange={setShowLogoutConfirm}
        onConfirm={performLogout}
      />

      {/* 雨途斩棘录面板 */}
      <YutuPanel
        open={showYutuPanel}
        onOpenChange={setShowYutuPanel}
        currentUser={currentUser}
        yutuViewAsRegular={yutuViewAsRegular}
        setYutuViewAsRegular={setYutuViewAsRegular}
        onInitYutu={initYutu}
        onOrganizeNotes={organizeYutuNotes}
        isOrganizing={isOrganizing}
        organizingProgress={organizingProgress}
        organizeProgressPercent={organizeProgressPercent}
        onOpenBackupRestore={() => {
          loadBackups();
          setShowBackupRestore(true);
        }}
        yutuRecords={yutuRecords}
        searchKeyword={searchKeyword}
        setSearchKeyword={setSearchKeyword}
        loadYutuRecords={loadYutuRecords}
        yutuHtmlContent={yutuHtmlContent}
        onDeleteRecord={handleDeleteYutuRecord}
        panelRef={yutuPanelRef}
      />

      {/* 备份与恢复对话框 */}
      <BackupRestoreDialog
        open={showBackupRestore}
        onOpenChange={setShowBackupRestore}
        backups={backups}
        selectedBackup={selectedBackup}
        onSelectBackup={setSelectedBackup}
        backupName={backupName}
        onBackupNameChange={setBackupName}
        restoreMode={restoreMode}
        onRestoreModeChange={setRestoreMode}
        isCreatingBackup={isCreatingBackup}
        onCreateBackup={createBackup}
        onDeleteBackup={deleteBackupFile}
        onRestore={restoreBackup}
      />

      {/* 系统设置弹窗 */}
      <SimpleSettingsDialog
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
        modelVersion={modelVersion}
        setModelVersion={setModelVersion}
        analysisMode={analysisMode}
        setAnalysisMode={setAnalysisMode}
        analysisStrategy={analysisStrategy}
        setAnalysisStrategy={setAnalysisStrategy}
        temperature={temperature}
        setTemperature={setTemperature}
        principles={{
          selfCorrectionEnabled,
          shortTestEnabled,
          taskDecompositionEnabled,
          explainabilityEnabled,
          efficientProcessingEnabled,
          deadLoopDetectionEnabled,
        }}
        onPrincipleChange={(key, checked) => {
          const setters: Record<string, (v: boolean) => void> = {
            selfCorrectionEnabled: setSelfCorrectionEnabled,
            shortTestEnabled: setShortTestEnabled,
            taskDecompositionEnabled: setTaskDecompositionEnabled,
            explainabilityEnabled: setExplainabilityEnabled,
            efficientProcessingEnabled: setEfficientProcessingEnabled,
            deadLoopDetectionEnabled: setDeadLoopDetectionEnabled,
          };
          setters[key]?.(checked);
          localStorage.setItem(key, checked ? "true" : "false");
        }}
        knowledgeBaseEnabled={knowledgeBaseEnabled}
        setKnowledgeBaseEnabled={setKnowledgeBaseEnabled}
      />

      {/* 编辑/删除记录由 KnowledgeSettingsDialog 内部管理 */}
      <KnowledgeSettingsDialog
        showKnowledgeSettings={showKnowledgeSettings}
        setShowKnowledgeSettings={setShowKnowledgeSettings}
        knowledgeBaseEnabled={knowledgeBaseEnabled}
        setKnowledgeBaseEnabled={setKnowledgeBaseEnabled}
        currentUser={currentUser}
        showEditDialog={showEditDialog}
        setShowEditDialog={setShowEditDialog}
        editRecord={editRecord}
        setEditRecord={setEditRecord}
        showDeleteConfirm={showDeleteConfirm}
        setShowDeleteConfirm={setShowDeleteConfirm}
        onUpdateRecord={handleUpdateYutuRecord}
        onDeleteRecord={handleDeleteYutuRecord}
      />

      {/* 智能体介绍对话框 */}
      <AgentIntroDialog open={showAgentIntro} onOpenChange={setShowAgentIntro} />

      {/* 风调雨顺 - 过程指导对话框 */}
      <SideGuidanceDialog
        open={sideGuidanceOpen}
        onOpenChange={setSideGuidanceOpen}
        text={sideGuidanceText}
        onTextChange={setSideGuidanceText}
        history={sideGuidanceHistory}
        isSubmitting={isSubmittingGuidance}
        onSubmit={handleSendGuidance}
      />

      <SystemSettingsDialog
        open={showSystemSettings}
        onOpenChange={setShowSystemSettings}
        systemSettingsTab={systemSettingsTab}
        setSystemSettingsTab={setSystemSettingsTab}
        modelProviderConfig={modelProviderConfig}
        setModelProviderConfig={setModelProviderConfig}
        applyModelPreset={applyModelPreset}
        showRawModelHeaders={showRawModelHeaders}
        setShowRawModelHeaders={setShowRawModelHeaders}
        modelHeadersInput={modelHeadersInput}
        setModelHeadersInput={setModelHeadersInput}
        handleFetchModelList={handleFetchModelList}
        isFetchingModelList={isFetchingModelList}
        handleSaveModelConfig={handleSaveModelConfig}
        modelTestStatus={modelTestStatus}
        availableModels={availableModels}
        dbType={dbType}
        handleDbTypeChange={handleDbTypeChange}
        dbConfig={dbConfig}
        setDbConfig={setDbConfig}
        getDefaultPort={getDefaultPortForDbType}
        availableDatabaseNames={availableDatabaseNames}
        isLoadingDatabaseNames={isLoadingDatabaseNames}
        databaseListError={databaseListError}
        dbContextSummary={dbContextSummary}
        dbKnowledgeSummary={dbKnowledgeSummary}
        dbKnowledgeUpdatedAt={dbKnowledgeUpdatedAt}
        isLoadingDbContext={isLoadingDbContext}
        handleLoadDbContext={handleLoadDbContext}
        handleFetchDatabaseNames={handleFetchDatabaseNames}
        handleTestConnection={handleTestConnection}
        isTestingDb={isTestingDb}
        isDbTested={isDbTested}
        dbPrompt={dbPrompt}
        setDbPrompt={setDbPrompt}
        handleGenerateSql={handleGenerateSql}
        isGeneratingSql={isGeneratingSql}
        dbGeneratedSql={dbGeneratedSql}
        setDbGeneratedSql={setDbGeneratedSql}
        dbDatasetName={dbDatasetName}
        setDbDatasetName={setDbDatasetName}
        dbExecuteMode={dbExecuteMode}
        setDbExecuteMode={setDbExecuteMode}
        handleExecuteDbSql={handleExecuteDbSql}
        isExecutingDbSql={isExecutingDbSql}
        handleSaveDatabaseConfig={handleSaveDatabaseConfig}
        savedDbConnections={savedDbConnections}
        selectedDbSourceIds={selectedDbSourceIds}
        handleToggleSavedDbSourceSelection={handleToggleSavedDbSourceSelection}
        handleApplySavedDbConnection={handleApplySavedDbConnection}
        handleDeleteSavedDbConnection={handleDeleteSavedDbConnection}
        deletingDbConnectionId={deletingDbConnectionId}
        analysisHistorySettings={analysisHistorySettings}
        setAnalysisHistorySettings={setAnalysisHistorySettings}
        analysisHistoryRuns={analysisHistoryRuns}
        analysisHistoryStats={analysisHistoryStats}
        selectedAnalysisHistoryRun={selectedAnalysisHistoryRun}
        analysisHistoryEvents={analysisHistoryEvents}
        isLoadingAnalysisHistory={isLoadingAnalysisHistory}
        isLoadingAnalysisHistoryDetail={isLoadingAnalysisHistoryDetail}
        isSavingAnalysisHistorySettings={isSavingAnalysisHistorySettings}
        handleRefreshAnalysisHistory={() => void loadAnalysisHistory()}
        handleSelectAnalysisHistoryRun={handleSelectAnalysisHistoryRun}
        handleSaveAnalysisHistorySettings={handleSaveAnalysisHistorySettings}
        dataDictionaryEntries={dataDictionaryEntries}
        dataDictionaryTotal={dataDictionaryTotal}
        isLoadingDataDictionary={isLoadingDataDictionary}
        isDeletingDataDictionary={isDeletingDataDictionary}
        handleRefreshDataDictionary={() => void loadDataDictionary()}
        handleDeleteDataDictionaryEntries={handleDeleteDataDictionaryEntries}
        isLoadingKnowledgeConfig={isLoadingKnowledgeConfig}
        loadKnowledgeConfig={loadKnowledgeConfig}
        knowledgeBaseEnabled={knowledgeBaseEnabled}
        setKnowledgeBaseEnabled={setKnowledgeBaseEnabled}
        yutuRecords={yutuRecords}
        currentUser={currentUser}
        isRecordingKnowledge={isRecordingKnowledge}
        knowledgePreferredView={knowledgePreferredView}
        setKnowledgePreferredView={setKnowledgePreferredView}
        showKnowledgeHints={showKnowledgeHints}
        setShowKnowledgeHints={setShowKnowledgeHints}
        autoOpenYutuAfterAnalysis={autoOpenYutuAfterAnalysis}
        setAutoOpenYutuAfterAnalysis={setAutoOpenYutuAfterAnalysis}
        externalKnowledgeEnabled={externalKnowledgeEnabled}
        setExternalKnowledgeEnabled={setExternalKnowledgeEnabled}
        onyxConfig={onyxConfig}
        setOnyxConfig={setOnyxConfig}
        difyConfig={difyConfig}
        setDifyConfig={setDifyConfig}
        knowledgeTestResults={knowledgeTestResults}
        handleTestKnowledgeProvider={handleTestKnowledgeProvider}
        knowledgeTestTarget={knowledgeTestTarget}
        isSavingKnowledgeConfig={isSavingKnowledgeConfig}
        handleSaveKnowledgeConfig={handleSaveKnowledgeConfig}
        knowledgeSettingsLoaded={knowledgeSettingsLoaded}
      />

      <DatabaseRelationshipDialog
        open={showDatabaseRelationshipDialog}
        onOpenChange={setShowDatabaseRelationshipDialog}
        graph={dbSchemaGraph}
        loading={isLoadingSchemaGraph}
        onRefresh={handleLoadSchemaGraph}
      />

      {/* 数据库连接对话框 */}
      <DatabaseDialog
        open={showDatabaseDialog}
        onOpenChange={setShowDatabaseDialog}
        dbType={dbType}
        onDbTypeChange={handleDbTypeChange}
        dbConfig={dbConfig}
        setDbConfig={setDbConfig}
        getDefaultPort={getDefaultPortForDbType}
        availableDatabaseNames={availableDatabaseNames}
        isLoadingDatabaseNames={isLoadingDatabaseNames}
        databaseListError={databaseListError}
        dbContextSummary={dbContextSummary}
        isLoadingDbContext={isLoadingDbContext}
        onLoadDbContext={handleLoadDbContext}
        onFetchDatabaseNames={handleFetchDatabaseNames}
        onTestConnection={handleTestConnection}
        isTestingDb={isTestingDb}
        isDbTested={isDbTested}
        dbPrompt={dbPrompt}
        setDbPrompt={setDbPrompt}
        onGenerateSql={handleGenerateSql}
        isGeneratingSql={isGeneratingSql}
        dbGeneratedSql={dbGeneratedSql}
        setDbGeneratedSql={setDbGeneratedSql}
        dbDatasetName={dbDatasetName}
        setDbDatasetName={setDbDatasetName}
        dbExecuteMode={dbExecuteMode}
        setDbExecuteMode={setDbExecuteMode}
        onExecuteSql={handleExecuteDbSql}
        isExecutingDbSql={isExecutingDbSql}
      />
    </>
  );
}
