"use client";

import type React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import Editor from "@monaco-editor/react";
import { useState, useRef, useEffect, useCallback, memo } from "react";
import { configureMonaco } from "@/lib/monaco-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_URLS, API_CONFIG, MODEL_PROVIDER_PRESETS, cloneModelProviderConfig, stringifyModelHeaders, parseModelHeadersInput, type ModelProviderConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
  Settings,
  Cpu,
  Zap,
  Monitor,
  ListTree,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Tree, NodeApi } from "react-arborist";
import { useToast } from "@/hooks/use-toast";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

interface TaskTreeNode {
  id: string;
  name: string;
  description: string;
  children?: TaskTreeNode[];
}

interface WorkspaceFile {
  name: string;
  size: number;
  extension: string;
  icon: string;
  download_url: string;
  preview_url?: string;
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
  | "TaskTree";

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
    return <div className="markdown-content">{renderSectionContent(content)}</div>;
  },
  (prev, next) =>
    prev.type === next.type &&
    prev.content === next.content &&
    prev.isComplete === next.isComplete &&
    prev.renderSectionContent === next.renderSectionContent
);

// TaskTree 任务节点组件
const TaskTreeItem = memo(function TaskTreeItem({
  node,
  selectedTasks,
  toggleTask,
  depth,
}: {
  node: TaskTreeNode;
  selectedTasks: Set<string>;
  toggleTask: (id: string, node: TaskTreeNode) => void;
  depth: number;
}) {
  const isChecked = selectedTasks.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const allChildrenChecked = hasChildren && node.children!.every(c => selectedTasks.has(c.id));

  return (
    <div style={{ paddingLeft: depth * 20 }}>
      <div className="flex items-center gap-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-900 rounded px-2">
        <Checkbox
          checked={hasChildren ? allChildrenChecked : isChecked}
          onCheckedChange={() => toggleTask(node.id, node)}
          className="data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
            <span className="text-amber-600 dark:text-amber-400 mr-1 font-mono">[{node.id}]</span>
            {node.name}
          </div>
          {node.description && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{node.description}</div>
          )}
        </div>
      </div>
      {hasChildren && (
        <div>
          {node.children!.map(child => (
            <TaskTreeItem
              key={child.id}
              node={child}
              selectedTasks={selectedTasks}
              toggleTask={toggleTask}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
});

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
  // 抑制轮询刷新的计数器（>0 时轮询不更新状态）
  const suppressWorkspaceRefreshCount = useRef(0);
  // 项目加载期间文件恢复专用抑制（防止轮询干扰文件恢复）
  const suppressDuringFileRestore = useRef(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceNode | null>(
    null
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [treeSize, setTreeSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  // 监听容器大小变化，更新 Tree 尺寸
  useEffect(() => {
    if (!treeContainerRef.current) return;

    const container = treeContainerRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setTreeSize({ w: width, h: height });
        console.log("[WorkspaceTree] Resized:", width, height);
      }
    });

    observer.observe(container);
    // 初始设置一次
    setTreeSize({
      w: container.clientWidth,
      h: container.clientHeight,
    });

    return () => {
      observer.disconnect();
    };
  }, [mounted]);

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
  const [showDatabaseDialog, setShowDatabaseDialog] = useState(false);
  const [showSystemSettings, setShowSystemSettings] = useState(false);
  const [systemSettingsTab, setSystemSettingsTab] = useState<"model" | "database" | "knowledge">("model");
  const [modelProviderConfig, setModelProviderConfig] = useState<ModelProviderConfig>(
    cloneModelProviderConfig()
  );
  const [modelHeadersInput, setModelHeadersInput] = useState("");
  const [showRawModelHeaders, setShowRawModelHeaders] = useState(false);
  const [dbType, setDbType] = useState("mysql");
  const [dbConfig, setDbConfig] = useState({
    host: "localhost",
    port: "3306",
    user: "root",
    password: "",
    database: "",
  });
  const [dbPrompt, setDbPrompt] = useState("");
  const [dbGeneratedSql, setDbGeneratedSql] = useState("");
  const [dbDatasetName, setDbDatasetName] = useState("query_result");
  const [dbExecuteMode, setDbExecuteMode] = useState<"overwrite" | "append">(
    "overwrite"
  );
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [isGeneratingSql, setIsGeneratingSql] = useState(false);
  const [isExecutingDbSql, setIsExecutingDbSql] = useState(false);
  const [isDbTested, setIsDbTested] = useState(false);

  // 用户认证与项目管理状态
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [registeredUsers, setRegisteredUsers] = useState<string[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [userProjects, setUserProjects] = useState<any[]>([]);
  // TaskTree 交互式任务选择对话框状态
  const [showTaskTreeDialog, setShowTaskTreeDialog] = useState(false);
  const [taskTreeData, setTaskTreeData] = useState<TaskTreeNode[] | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  // 保存确认弹窗状态（同名项目覆盖确认）
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<any>(null);
  // 退出登录确认弹窗状态
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  // 报告类型选择状态
  const [reportTypes, setReportTypes] = useState<string[]>(["pdf"]);
  const [showReportTypePicker, setShowReportTypePicker] = useState(false);
  // 点击外部关闭报告类型选择器
  useEffect(() => {
    if (!showReportTypePicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-report-type-picker]')) {
        setShowReportTypePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showReportTypePicker]);
  // 雨途斩棘录面板状态
  const [showYutuPanel, setShowYutuPanel] = useState(false);
  const [yutuHtmlContent, setYutuHtmlContent] = useState<string>("");
  const [yutuRecords, setYutuRecords] = useState<any[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [editRecord, setEditRecord] = useState<any>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [yutuViewAsRegular, setYutuViewAsRegular] = useState(false); // 超级用户查看模式：false=管理界面, true=只读HTML
  const [showOrganizePreview, setShowOrganizePreview] = useState(false); // 整理预览弹窗
  const [organizedRecords, setOrganizedRecords] = useState<any[]>([]); // 整理后的记录
  const [isOrganizing, setIsOrganizing] = useState(false); // 是否正在整理
  const [organizingProgress, setOrganizingProgress] = useState<string>(""); // 整理进度描述
  const [organizeProgressPercent, setOrganizeProgressPercent] = useState<number>(0); // 整理进度百分比

  // 雨途斩棘录功能状态
  const [hasAnalysisCompleted, setHasAnalysisCompleted] = useState(false); // 分析任务是否完成
  const [knowledgeBaseEnabled, setKnowledgeBaseEnabled] = useState(true); // 知识库是否启用
  const [externalKnowledgeEnabled, setExternalKnowledgeEnabled] = useState(true);
  const [isRecordingKnowledge, setIsRecordingKnowledge] = useState(false); // 是否正在记录知识
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
    const preset = cloneModelProviderConfig(
      MODEL_PROVIDER_PRESETS.find((item) => item.id === presetId) || MODEL_PROVIDER_PRESETS[0]
    );
    setModelProviderConfig(preset);
    setModelHeadersInput(stringifyModelHeaders(preset.headers));
  };

  // 智能体介绍面板状态
  const [showAgentIntro, setShowAgentIntro] = useState(false);

  // 过程指导（Side Guidance / Side Task）状态
  const [sideGuidanceOpen, setSideGuidanceOpen] = useState(false);
  const [sideGuidanceText, setSideGuidanceText] = useState("");
  const [isSubmittingGuidance, setIsSubmittingGuidance] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false); // 是否正在分析中

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
  const savingProjectRef = useRef(false);
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [contextTarget, setContextTarget] = useState<WorkspaceNode | null>(
    null
  );
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
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

  const loadYutuHtml = async () => {
    try {
      const res = await fetch(API_URLS.YUTU_HTML);
      if (res.ok) {
        const data = await res.json();
        setYutuHtmlContent(data.html || "");
      }
    } catch (e) {
      console.error("加载雨途斩棘录失败:", e);
      setYutuHtmlContent("<html><body><h1>加载失败</h1></body></html>");
    }
  };

  const loadYutuRecords = async (keywords: string[] = [], errorType: string = "") => {
    try {
      const res = await fetch(API_URLS.YUTU_SEARCH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: keywords,
          error_type: errorType,
          page: 1,
          page_size: 50
        })
      });
      if (res.ok) {
        const data = await res.json();
        setYutuRecords(data.data?.items || []);
      }
    } catch (e) {
      console.error("加载记录失败:", e);
    }
  };

  const handleSaveYutuRecord = async (record: any) => {
    if (currentUser !== "rainforgrain") {
      toast({ description: "只有超级用户可以添加记录", variant: "destructive" });
      return false;
    }
    try {
      const res = await fetch(`${API_URLS.YUTU_ADD}?username=${encodeURIComponent(currentUser || "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error_type: record.error_type,
          error_message: record.error_message,
          error_context: record.error_context,
          solution: record.solution,
          solution_code: record.solution_code,
          confidence: record.confidence
        })
      });
      if (res.ok) {
        toast({ description: "记录保存成功" });
        loadYutuHtml();
        loadYutuRecords();
        return true;
      } else {
        const data = await res.json();
        toast({ description: data.detail || "保存失败", variant: "destructive" });
      }
    } catch (e) {
      toast({ description: "保存失败: " + (e as Error).message, variant: "destructive" });
    }
    return false;
  };

  const handleUpdateYutuRecord = async (record: any) => {
    if (currentUser !== "rainforgrain") {
      toast({ description: "只有超级用户可以更新记录", variant: "destructive" });
      return false;
    }
    try {
      const res = await fetch(`${API_URLS.YUTU_UPDATE}?username=${encodeURIComponent(currentUser || "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error_hash: record.error_hash,
          solution: record.solution,
          solution_code: record.solution_code,
          confidence: record.confidence
        })
      });
      if (res.ok) {
        toast({ description: "记录更新成功" });
        loadYutuHtml();
        loadYutuRecords();
        return true;
      } else {
        const data = await res.json();
        toast({ description: data.detail || "更新失败", variant: "destructive" });
      }
    } catch (e) {
      toast({ description: "更新失败: " + (e as Error).message, variant: "destructive" });
    }
    return false;
  };

  const handleDeleteYutuRecord = async (errorHash: string) => {
    if (currentUser !== "rainforgrain") {
      toast({ description: "只有超级用户可以删除记录", variant: "destructive" });
      return false;
    }
    try {
      const res = await fetch(`${API_URLS.YUTU_DELETE}?username=${encodeURIComponent(currentUser || "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error_hash: errorHash })
      });
      if (res.ok) {
        toast({ description: "记录已删除" });
        loadYutuHtml();
        loadYutuRecords();
        return true;
      } else {
        const data = await res.json();
        toast({ description: data.detail || "删除失败", variant: "destructive" });
      }
    } catch (e) {
      toast({ description: "删除失败: " + (e as Error).message, variant: "destructive" });
    }
    return false;
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

  // 整理雨途斩棘录笔记 - AI重新组织所有记录（预览模式）
  const organizeYutuNotes = async () => {
    if (currentUser !== "rainforgrain") {
      toast({
        description: "只有超级用户可以整理笔记",
        variant: "destructive",
      });
      return;
    }
    if (yutuRecords.length === 0) {
      toast({ description: "暂无记录可整理", variant: "destructive" });
      return;
    }

    setIsOrganizing(true);
    setOrganizingProgress("开始整理...");
    setOrganizeProgressPercent(2);

    // 进度条模拟：在请求过程中慢慢增加，直到 95%
    const progressInterval = setInterval(() => {
      setOrganizeProgressPercent((prev) => {
        if (prev >= 95) return prev;
        // 随机步进，模拟真实感
        const increment = Math.random() * 3 + 1;
        const next = prev + increment;
        return next > 95 ? 95 : Math.floor(next);
      });
    }, 600);

    try {
      // 使用完整的API URL
      const organizeUrl = `${
        API_URLS.YUTU_ORGANIZE
      }?username=${encodeURIComponent(currentUser || "")}`;
      console.log("整理笔记URL:", organizeUrl);

      setOrganizingProgress("正在分析记录...");
      const res = await fetch(organizeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: yutuRecords }),
      });

      setOrganizingProgress("正在组织结果...");

      const contentType = res.headers.get("content-type");
      if (!res.ok) {
        clearInterval(progressInterval);
        const errorText = await res.text();
        setIsOrganizing(false);
        setOrganizeProgressPercent(0);
        toast({
          description: `整理失败: ${res.status} - ${errorText.substring(0, 100)}`,
          variant: "destructive",
        });
        return;
      }

      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        clearInterval(progressInterval);
        setOrganizeProgressPercent(100);

        if (data.records && data.records.length > 0) {
          // 显示预览
          setOrganizedRecords(data.records);
          setShowOrganizePreview(true);
          setOrganizingProgress("整理完毕");
          setTimeout(() => {
            setIsOrganizing(false);
            // 这里不重置进度，让用户在弹窗出现前看到100%
          }, 500);
          toast({ description: `整理完成，请预览并确认` });
        } else {
          setIsOrganizing(false);
          setOrganizeProgressPercent(0);
          toast({
            description: data.detail || "整理失败：无可用记录",
            variant: "destructive",
          });
        }
      } else {
        // 非JSON响应（可能是HTML错误页面）
        clearInterval(progressInterval);
        const errorText = await res.text();
        setIsOrganizing(false);
        setOrganizeProgressPercent(0);
        toast({
          description: `整理失败: 服务器返回非JSON响应`,
          variant: "destructive",
        });
        console.error("Non-JSON response:", errorText);
      }
    } catch (e) {
      clearInterval(progressInterval);
      setIsOrganizing(false);
      setOrganizeProgressPercent(0);
      toast({
        description: "整理失败: " + (e as Error).message,
        variant: "destructive",
      });
    }
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
      m.sender === "ai" && m.content && m.content.includes("<Answer>")
    );
    setHasAnalysisCompleted(hasAnswer);
  }, [messages]);

  // --- 用户认证与项目管理函数 ---
  const handleAuth = async () => {
    if (!authUsername) {
      toast({ description: "请输入用户名", variant: "destructive" });
      return;
    }

    try {
      const url = isLoginMode ? API_URLS.AUTH_LOGIN : API_URLS.AUTH_REGISTER;
      const formData = new FormData();
      formData.append("username", authUsername);
      formData.append("password", authPassword);

      const res = await fetch(url, {
        method: "POST",
        body: formData,
      });

      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`服务器响应错误 (${res.status})`);
      }

      if (!res.ok) {
        // 如果 data.detail 是列表（FastAPI 422 验证错误）
        const detail = data.detail;
        const errorMessage = typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map(d => `${d.loc.join('.')}: ${d.msg}`).join('; ')
            : "认证失败";
        throw new Error(errorMessage);
      }

      if (isLoginMode) {
        setCurrentUser(data.username);
        setIsLoggedIn(true);
        setShowAuthModal(false);
        toast({ description: `欢迎回来, ${data.username}` });
        // 登录后重置并拉取文件
        await loadWorkspaceFiles();
        await loadWorkspaceTree();
      } else {
        toast({ description: "注册成功，请登录" });
        setIsLoginMode(true);
      }
    } catch (e: any) {
      toast({ description: e.message, variant: "destructive" });
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const performLogout = async () => {
    // 先清空工作区文件（使用旧sessionId）
    const oldSessionId = sessionId;
    const oldUsername = currentUser || "default";
    suppressWorkspaceRefreshCount.current += 1;
    try {
      await fetch(`${API_URLS.WORKSPACE_CLEAR}?session_id=${oldSessionId}&username=${oldUsername}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.warn("Failed to clear workspace on logout", e);
    } finally {
      suppressWorkspaceRefreshCount.current -= 1;
    }

    setCurrentUser(null);
    setIsLoggedIn(false);
    setAuthUsername("");
    setAuthPassword("");
    setMessages([
      {
        id: "welcome-1",
        content: "您好！很高兴和您一起运用大数据开展海关风险分析。我将按您的分析目标和要求，协助您深入分析进出口业务数据，运用规律分析、统计分析、对比分析、关联分析等方法，开展多角度逻辑推理，协助您挖掘走私违规、逃证逃税及违反安全准入等潜在风险，维护贸易秩序。请上传数据，让我们开始深度洞察。",
        sender: "ai",
        timestamp: new Date(),
        localOnly: true,
      },
    ]);
    setAttachments([]);
    setWorkspaceFiles([]);
    setWorkspaceTree(null);
    setInputValue("");
    setSideGuidanceHistory([]);
    setRegisteredUsers([]); // 先清空，然后重新加载
    setUserProjects([]);
    setProjectName("");
    setShowSaveDialog(false);
    setShowProjectManager(false);

    // 重新加载已注册用户列表
    try {
      const res = await fetch(API_URLS.USERS_LIST);
      if (res.ok) {
        const data = await res.json();
        setRegisteredUsers(data.users || []);
      }
    } catch (e) {
      console.warn("Failed to reload registered users after logout", e);
    }

    // 生成全新的 sessionId，完全替换旧的
    const newSid = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem("sessionId", newSid);
    setSessionId(newSid);

    setShowAuthModal(true); // 重新显示登录界面
    toast({ description: "已退出登录，工作区已清空" });
  };

  // ========== 数据库连接功能函数 ==========
  const handleTestConnection = async () => {
    setIsTestingDb(true);
    try {
      const response = await fetch(API_URLS.DB_TEST, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ db_type: dbType, config: dbConfig }),
      });
      const data = await response.json();
      if (data.success) {
        toast({ description: "数据库连接测试成功！" });
        setIsDbTested(true);
      } else {
        toast({
          description: `连接失败: ${data.message}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Test connection error:", error);
      toast({ description: "连接请求失败，请检查网络", variant: "destructive" });
    } finally {
      setIsTestingDb(false);
    }
  };

  const handleGenerateSql = async () => {
    if (!dbPrompt.trim()) return;
    setIsGeneratingSql(true);
    try {
      const response = await fetch(API_URLS.DB_GENERATE_SQL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          db_type: dbType,
          prompt: dbPrompt,
          schema_info: "", // 可以在此注入已获取的表结构
        }),
      });
      const data = await response.json();
      if (data.success) {
        setDbGeneratedSql(data.sql);
      } else {
        toast({
          description: `生成失败: ${data.message}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Generate SQL error:", error);
      toast({ description: "请求失败，请稍后重试", variant: "destructive" });
    } finally {
      setIsGeneratingSql(false);
    }
  };

  const handleExecuteDbSql = async () => {
    if (!dbGeneratedSql.trim()) return;

    // 检查文件是否存在并提醒覆盖
    const fileName = `${dbDatasetName}.csv`;
    const fileExists = workspaceFiles.some(f => f.name === fileName);
    if (fileExists && dbExecuteMode === "overwrite") {
      if (!window.confirm(`文件 "${fileName}" 已存在，确定要覆盖它吗？`)) {
        return;
      }
    }

    setIsExecutingDbSql(true);
    try {
      const response = await fetch(API_URLS.DB_EXECUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          db_type: dbType,
          config: dbConfig,
          sql: dbGeneratedSql,
          dataset_name: dbDatasetName,
          mode: dbExecuteMode,
          format: "csv",
          session_id: sessionId,
          username: currentUser || "default",
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast({
          description: `执行成功！结果已保存为 ${data.filename} (${data.row_count} 行)`,
        });
        setShowDatabaseDialog(false);
        // 刷新文件列表
        await loadWorkspaceTree();
        await loadWorkspaceFiles();
      } else {
        toast({
          description: `执行失败: ${data.message}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Execute DB SQL error:", error);
      toast({ description: "执行请求失败", variant: "destructive" });
    } finally {
      setIsExecutingDbSql(false);
    }
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
      const response = await fetch(API_URLS.KB_SETTINGS_SAVE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildKnowledgeSettingsPayload()),
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

  const saveProject = async (confirmed = false) => {
    if (!isLoggedIn) {
      setShowAuthModal(true);
      return;
    }
    if (savingProjectRef.current) return; // 防止重复触发
    if (!projectName.trim()) {
      toast({ description: "请输入项目名称", variant: "destructive" });
      return;
    }
    const saveName = projectName.trim();
    savingProjectRef.current = true;

    // 如果未确认且不是新建项目，先检查是否存在同名项目
    if (!confirmed) {
      try {
        const checkRes = await fetch(
          `${API_URLS.PROJECTS_CHECK_NAME}?username=${encodeURIComponent(currentUser!)}&name=${encodeURIComponent(saveName)}`
        );
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.exists) {
            // 存在同名项目，弹出确认覆盖对话框
            savingProjectRef.current = false;
            setPendingSaveData({ confirmed: true });
            setSaveConfirmOpen(true);
            return;
          }
        }
      } catch (e) {
        console.warn("Check project name failed, proceeding with save", e);
      }
    }

    try {
      const formData = new FormData();
      formData.append("username", currentUser!);
      formData.append("session_id", sessionId);
      formData.append("name", saveName);
      formData.append("messages", JSON.stringify(messages));
      formData.append("side_tasks", JSON.stringify(sideGuidanceHistory));
      const res = await fetch(API_URLS.PROJECTS_SAVE, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("保存失败");
      const resData = await res.json();
      const storageSize = resData?.storage_size || "";
      toast({ description: `项目已保存${storageSize ? ` (${storageSize})` : ""}` });
      setShowSaveDialog(false);
      setPendingSaveData(null);
      // 延迟清空项目名称，避免 Dialog 关闭动画期间触发空名验证
      setTimeout(() => {
        setProjectName("");
        savingProjectRef.current = false;
      }, 300);
    } catch (e) {
      savingProjectRef.current = false;
      toast({ description: "保存失败", variant: "destructive" });
    }
  };

  const listProjects = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_URLS.PROJECTS_LIST}?username=${currentUser}`);
      if (res.ok) {
        const data = await res.json();
        setUserProjects(data.projects);
      }
    } catch (e) {
      console.error("List projects error", e);
    }
  };

  const loadProject = async (projectId: number) => {
    try {
      const res = await fetch(`${API_URLS.PROJECTS_LOAD}?project_id=${projectId}`);
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();

      // 1. 立即获取项目的文件下载链接（在清空工作区之前）
      const restoreRes = await fetch(`${API_URLS.PROJECTS_RESTORE_FILES}?project_id=${projectId}`);
      let filesToRestore: Array<{name: string; download_url: string}> = [];
      if (restoreRes.ok) {
        const restoreData = await restoreRes.json();
        filesToRestore = restoreData.files || [];
      }

      // 2. 清空当前工作区（仅清空当前 session，不影响已保存项目文件）
      suppressWorkspaceRefreshCount.current += 1;
      try {
        await fetch(`${API_URLS.WORKSPACE_CLEAR}?session_id=${sessionId}&username=${currentUser || "default"}`, {
          method: "DELETE",
        });
      } catch (e) {
        console.warn("Failed to clear workspace before load", e);
      } finally {
        suppressWorkspaceRefreshCount.current -= 1;
      }

      // 3. 设置会话 ID 和消息记录
      const newSessionId = data.session_id;
      setSessionId(newSessionId);
      localStorage.setItem("sessionId", newSessionId);

      const restoredMessages = data.messages.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp)
      }));
      setMessages(restoredMessages);
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(restoredMessages));

      // 恢复过程指导历史
      if (data.side_tasks && Array.isArray(data.side_tasks)) {
        setSideGuidanceHistory(data.side_tasks);
      } else {
        setSideGuidanceHistory([]);
      }

      // 4. 关闭弹窗
      setShowProjectManager(false);

      // 5. 设置项目名称
      const proj = userProjects.find(p => p.id === projectId);
      if (proj) setProjectName(proj.name);

      toast({ description: "正在恢复项目文件..." });

      // 6. 恢复工作区文件：从已保存的项目中重新上传
      // 启用文件恢复专用抑制，防止轮询在上传期间干扰
      suppressDuringFileRestore.current = true;

      const restoreFiles = async () => {
        try {
          const restoreUrl = `${API_URLS.PROJECTS_RESTORE_TO_WORKSPACE}?project_id=${projectId}&session_id=${newSessionId}&username=${currentUser || "default"}`;
          const res = await fetch(restoreUrl, { method: "POST" });
          if (!res.ok) throw new Error("Restoration failed");

          suppressDuringFileRestore.current = false;
          setTimeout(() => {
            loadWorkspaceFiles();
            loadWorkspaceTree();
            toast({ description: "项目已加载，文件已全部恢复" });
          }, 500);
        } catch (e) {
          suppressDuringFileRestore.current = false;
          console.error("File restore failed", e);
          toast({ description: "项目加载失败", variant: "destructive" });
        }
      };

      setTimeout(() => {
        restoreFiles();
      }, 300);

    } catch (e) {
      toast({ description: "加载失败", variant: "destructive" });
    }
  };

  const deleteProject = async (projectId: number) => {
    try {
      const res = await fetch(`${API_URLS.PROJECTS_DELETE}?project_id=${projectId}&username=${currentUser}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast({ description: "项目已删除" });
        listProjects();
      }
    } catch (e) {
      toast({ description: "删除失败", variant: "destructive" });
    }
  };

  // 数据库连接配置变化时重置测试状态
  useEffect(() => {
    setIsDbTested(false);
  }, [dbConfig, dbType]);

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
  const CHAT_STORAGE_KEY = "chat_messages_v1";
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

    const savedModelProvider = localStorage.getItem("modelProviderConfig");
    if (savedModelProvider) {
      try {
        const parsed = JSON.parse(savedModelProvider);
        const nextConfig = cloneModelProviderConfig({
          ...MODEL_PROVIDER_PRESETS[0],
          ...parsed,
          headers: { ...(parsed.headers || {}) },
        });
        setModelProviderConfig(nextConfig);
        setModelHeadersInput(stringifyModelHeaders(nextConfig.headers));
      } catch {
        const fallback = cloneModelProviderConfig();
        setModelProviderConfig(fallback);
        setModelHeadersInput(stringifyModelHeaders(fallback.headers));
      }
    } else {
      const fallback = cloneModelProviderConfig();
      setModelProviderConfig(fallback);
      setModelHeadersInput(stringifyModelHeaders(fallback.headers));
    }

    loadKnowledgeConfig();

    if (!isLoggedIn) {
      setShowAuthModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 仅在挂载时执行一次

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
    const loadRegisteredUsers = async () => {
      try {
        const res = await fetch(API_URLS.USERS_LIST);
        if (res.ok) {
          const data = await res.json();
          setRegisteredUsers(data.users || []);
        }
      } catch (e) {
        console.warn("Failed to load registered users", e);
      }
    };

    if (showAuthModal) {
      loadRegisteredUsers();
    }
  }, [showAuthModal]);

  const loadWorkspaceFiles = useCallback(async () => {
    if (!sessionId) return;
    if (suppressWorkspaceRefreshCount.current > 0) return;
    if (suppressDuringFileRestore.current) return;
    try {
      const response = await fetch(
        `${API_URLS.WORKSPACE_FILES}?session_id=${sessionId}&username=${currentUser || "default"}`
      );
      if (response.ok) {
        const data = await response.json();
        setWorkspaceFiles(data.files);
      }
    } catch (error) {
      console.error("Failed to load workspace files:", error);
    }
  }, [sessionId, currentUser]);

  const loadWorkspaceTree = useCallback(async () => {
    if (!sessionId) return;
    if (suppressWorkspaceRefreshCount.current > 0) return;
    if (suppressDuringFileRestore.current) return;
    try {
      const res = await fetch(
        `${API_URLS.WORKSPACE_TREE}?session_id=${sessionId}&username=${currentUser || "default"}`
      );
      if (res.ok) {
        const data = await res.json();
        // 标记 generated 文件夹及其内容
        const markGenerated = (
          node: WorkspaceNode,
          parentIsGenerated = false
        ) => {
          const isGenerated =
            parentIsGenerated ||
            node.name === "generated" ||
            node.path.startsWith("generated/") ||
            node.path.startsWith("generated");
          node.is_generated = isGenerated;
          if (node.children) {
            node.children.forEach((child) => markGenerated(child, isGenerated));
          }
        };
        if (data) {
          markGenerated(data);
          console.log("[WorkspaceTree] Loaded tree data:", data);
        }
        setWorkspaceTree(data);
        // 增量合并展开状态：保留原有的，并默认展开第一层（包括 generated 文件夹）
        setExpanded((prev) => {
          const next = { ...prev, "": true };
          if (data?.children) {
            data.children.forEach((c: WorkspaceNode) => {
              if (c.is_dir && prev[c.path] === undefined) {
                // 仅当之前未定义时才设置默认展开
                next[c.path] = true;
              }
            });
          }
          return next;
        });
      }
    } catch (e) {
      console.error("load tree error", e);
    }
  }, [sessionId, currentUser]);

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

  const toggleExpand = (p: string) =>
    setExpanded((prev) => ({ ...prev, [p]: !prev[p] }));

  const deleteFile = async (p: string) => {
    suppressWorkspaceRefreshCount.current += 1;
    try {
      const url = `${API_URLS.WORKSPACE_DELETE_FILE}?path=${encodeURIComponent(
        p
      )}&session_id=${encodeURIComponent(sessionId)}&username=${currentUser || "default"}`;
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) {
        await loadWorkspaceTree();
        await loadWorkspaceFiles();
      }
    } catch (e) {
      console.error("delete file error", e);
    } finally {
      suppressWorkspaceRefreshCount.current -= 1;
    }
  };

  const deleteDir = async (p: string) => {
    suppressWorkspaceRefreshCount.current += 1;
    try {
      const url = `${API_URLS.WORKSPACE_DELETE_DIR}?path=${encodeURIComponent(
        p
      )}&recursive=true&session_id=${encodeURIComponent(sessionId)}&username=${currentUser || "default"}`;
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) {
        await loadWorkspaceTree();
        await loadWorkspaceFiles();
      }
    } catch (e) {
      console.error("delete dir error", e);
    } finally {
      suppressWorkspaceRefreshCount.current -= 1;
    }
  };

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
              <div style={{ width: 16, height: 16 }}>
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
    };

    const allMatches: Array<{
      type: keyof typeof sectionConfigs;
      position: number;
    }> = [];

    Object.keys(sectionConfigs).forEach((type) => {
      const regex = new RegExp(`<${type}>([\\s\\S]*?)</${type}>`, "g");
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
      const openRe = /<(Analyze|Understand|Code|Execute|Answer|File|TaskTree)>/g;
      let cursor = 0;
      let sectionIndex = 0;
      let m: RegExpExecArray | null;

      while ((m = openRe.exec(content)) !== null) {
        const type = m[1] as StructuredSectionType;
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
        const closeTag = `</${type}>`;
        const closeIdx = content.indexOf(closeTag, openEnd);
        const isComplete = closeIdx !== -1;
        const bodyEnd = isComplete ? closeIdx : content.length;
        const body = content.slice(openEnd, bodyEnd).trim();

        const baseKey = `${type}-${sectionIndex}`;
        const msgKey =
          messageIndex !== undefined ? `msg${messageIndex}-${type}-${sectionIndex}` : baseKey;
        const sectionKey = msgKey;
        const isCollapsed =
          (collapsedSections as any)[msgKey] ??
          (collapsedSections as any)[baseKey] ??
          false;

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
            className={`mb-4 border rounded-lg overflow-hidden ${sectionConfigs[type].color}`}
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
                <span className="text-sm">{sectionConfigs[type].icon}</span>
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
        cursor = isComplete ? closeIdx + closeTag.length : content.length;
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
      const regex = new RegExp(`<${type}>([\\s\\S]*?)</${type}>`, "g");
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
                    try {
                      const parsed = JSON.parse(match.content.trim());
                      if (parsed.tasks) {
                        setTaskTreeData(parsed.tasks);
                        setSelectedTasks(new Set());
                        setShowTaskTreeDialog(true);
                      }
                    } catch (e) {
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
            </div>
          </div>
          {!isCollapsed && (
            <div
              className={`p-3 ${match.type === "Answer" ? "answer-body" : ""}`}
            >
              {match.type === "TaskTree" ? (() => {
                try {
                  const parsed = JSON.parse(match.content.trim());
                  const tasks = parsed.tasks || [];
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
                } catch {
                  return <div className="text-sm text-gray-500">任务树数据格式异常</div>;
                }
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

  const handleSendMessage = async (overrideMessage?: string) => {
    const messageText = overrideMessage ?? inputValue;
    if (!messageText.trim() && attachments.length === 0) return;
    setIsAnalyzing(true);
    const baseMessageIndex = messages.length;
    const aiMessageIndex = baseMessageIndex + 1;

    // 检测用户消息中是否指定了报告类型
    const userInput = messageText.toLowerCase();
    const detectedTypes: string[] = [];
    if (userInput.includes("pdf")) detectedTypes.push("pdf");
    if (userInput.includes("docx") || userInput.includes("word")) detectedTypes.push("docx");
    if (userInput.includes("pptx") || userInput.includes("ppt")) detectedTypes.push("pptx");
    if (detectedTypes.length > 0) {
      setReportTypes(detectedTypes);
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      content: messageText,
      sender: "user",
      timestamp: new Date(),
      attachments: attachments.length > 0 ? [...attachments] : undefined,
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
              content: inputValue,
            },
          ],
          stream: true, // [修改] 明确开启流式模式
          session_id: sessionId,
          strategy: analysisStrategy,
          analysis_mode: analysisMode,
          report_types: reportTypes,
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
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            sender: "ai",
            content,
            timestamp: new Date(),
          },
        ]);
        autoCollapseForContent(content, aiMessageIndex);
        if (content.includes("<File>")) {
          await loadWorkspaceTree();
          await loadWorkspaceFiles();
        }
        setIsTyping(false);
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
      const aiMsgId = `${Date.now()}-${Math.random()}`;
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

        if (visibleText.includes("<File>")) {
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
      if (accumulatedMessage.includes("<TaskTree>")) {
        const taskTreeMatch = accumulatedMessage.match(/<TaskTree>([\s\S]*?)<\/TaskTree>/);
        if (taskTreeMatch) {
          try {
            const parsed = JSON.parse(taskTreeMatch[1].trim());
            if (parsed.tasks && Array.isArray(parsed.tasks)) {
              setTaskTreeData(parsed.tasks);
              setSelectedTasks(new Set());
              setTimeout(() => setShowTaskTreeDialog(true), 300);
            }
          } catch (e) {
            console.warn("[TaskTree] JSON 解析失败:", e);
          }
        }
      }

      // 结束后刷新一次文件列表确保无遗漏
      await loadWorkspaceFiles();
      await loadWorkspaceTree();
      setIsTyping(false); // 结束加载状态
      setIsAnalyzing(false);
      setStreamingMessageId(null);

    } catch (error) {
      console.error("Error sending message:", error);
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
    const msg = `用户选择了以下分析任务：${items.join("，")}`;
    setShowTaskTreeDialog(false);
    setSelectedTasks(new Set());
    setTaskTreeData(null);
    handleSendMessage(msg);
  }, [taskTreeData, selectedTasks]);

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
        <Dialog open={showAuthModal} onOpenChange={(open) => {
          if (!isLoggedIn && !open) {
            // 如果用户未登录但尝试关闭弹窗，保持弹窗打开
            setShowAuthModal(true);
          } else {
            setShowAuthModal(open);
          }
        }}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <div className="flex flex-col items-center mb-4">
                <DialogTitle className="text-xl font-bold">雨途欢迎您一起前行</DialogTitle>
              </div>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* 已注册用户快捷选择 */}
              {registeredUsers.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {isLoginMode ? "已注册用户（点击快速登录）" : "已注册用户"}
                  </label>
                  <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto">
                    {registeredUsers.map((u) => (
                      <button
                        key={u}
                        onClick={() => setAuthUsername(u)}
                        className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                          authUsername === u
                            ? "bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-900 dark:border-blue-600 dark:text-blue-200"
                            : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-blue-900/30"
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">用户名</label>
                <Input
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAuth(); }}
                  placeholder="请输入用户名"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">密码</label>
                <Input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAuth(); }}
                  placeholder={isLoginMode ? "请输入密码（可为空）" : "最少 8 位密码"}
                />
              </div>
              <Button className="w-full" onClick={handleAuth}>
                {isLoginMode ? "登录" : "注册"}
              </Button>
              <div className="text-center text-xs text-gray-500">
                {isLoginMode ? "没有账号？" : "已有账号？"}
                <button
                  className="text-blue-600 hover:underline ml-1"
                  onClick={() => setIsLoginMode(!isLoginMode)}
                >
                  {isLoginMode ? "立即注册" : "去登录"}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div
        className="h-screen bg-white dark:bg-black text-black dark:text-white"
        suppressHydrationWarning
      >
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left Panel - Workspace Tree */}
          <ResizablePanel defaultSize={25} minSize={10}>
            <div className="flex flex-col min-h-0 min-w-0 h-full">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 h-12">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Files
                  </h2>
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
                <div
                  className={`mb-2 rounded border border-dashed flex items-center justify-center h-20 text-xs select-none ${dropActive
                    ? "bg-blue-50 border-blue-300 text-blue-600"
                    : "bg-gray-50 dark:bg-gray-900/40 border-gray-300 dark:border-gray-700 text-gray-500"
                    }`}
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
                  {/* 独立隐藏 input 兼容点击上传 */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    accept="*"
                  />
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    <span>拖拽或点击此处上传（workspace 根目录）</span>
                  </div>
                </div>
                {uploadMsg && (
                  <div className="px-2 pb-2 text-[11px] text-gray-500">
                    {uploadMsg}
                  </div>
                )}

                {workspaceTree ? (
                  <Tree
                    width={treeSize.w || "100%"}
                    height={Math.max(600, treeSize.h - 110)}
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
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Middle Panel - Chat & Analysis */}
          <ResizablePanel defaultSize={50} minSize={25}>
            <div className="flex flex-col min-h-0 min-w-0 h-full">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 h-12 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <h1 className="text-sm font-medium">观雨</h1>
                    {isTyping && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                        <span>执行中…</span>
                      </div>
                    )}
                    {isLoggedIn && (
                      <div className="flex items-center gap-2 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-[10px] font-medium">
                        <User className="h-2.5 w-2.5" />
                        <span>{currentUser}</span>
                        <button onClick={handleLogout} className="hover:text-red-500 ml-1">退出</button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
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
                  <div className="flex items-center gap-1 ml-2">
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
                    <div className="relative" data-report-type-picker>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] px-2 gap-1 border-green-200 text-green-600 hover:bg-green-50 dark:border-green-900 dark:text-green-400"
                        onClick={() => setShowReportTypePicker(!showReportTypePicker)}
                      >
                        <FileText className="h-3 w-3" />
                        报告类型
                      </Button>
                      {showReportTypePicker && (
                        <div className="absolute top-8 left-0 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 min-w-[160px]">
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-2 font-medium">选择报告输出格式</div>
                          {["pdf", "docx", "pptx"].map((type) => (
                            <label key={type} className="flex items-center gap-2 py-1.5 px-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={reportTypes.includes(type)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setReportTypes(prev => [...prev, type]);
                                  } else {
                                    const next = reportTypes.filter(t => t !== type);
                                    // 至少保留一项
                                    if (next.length > 0) {
                                      setReportTypes(next);
                                    }
                                  }
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-xs text-gray-700 dark:text-gray-300 uppercase font-mono">{type}</span>
                            </label>
                          ))}
                          <div className="text-[9px] text-gray-400 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                            当前: {reportTypes.map(t => t.toUpperCase()).join(", ")}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
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
                                  className={`absolute inset-0 rounded-full transition-all duration-700 ${isCompleted || isActive
                                    ? "bg-gradient-to-r from-green-400 to-green-500 shadow-sm shadow-green-500/30"
                                    : "bg-transparent"
                                    }`}
                                  style={{
                                    transform: isActive
                                      ? "scaleX(0.5)"
                                      : "scaleX(1)",
                                    transformOrigin: "left",
                                  }}
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
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Panel - Code Editor & Input */}
          <ResizablePanel defaultSize={25} minSize={20}>
            <ResizablePanelGroup direction="vertical">
              {/* Upper: Code/Preview */}
              <ResizablePanel defaultSize={40} minSize={30}>
                <div className="flex flex-col bg-gray-50 dark:bg-gray-900 min-h-0 h-full">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 shrink-0">
                    <div className="flex items-center gap-3">
                      <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        Code
                      </h2>
                      {/* 热度滑块 - 保留在顶栏 */}
                      <div className="flex items-center gap-1">
                        <Slider
                          value={[temperature ?? (analysisStrategy === "聚焦诉求" ? 0.2 : analysisStrategy === "适度扩展" ? 0.4 : 0.6)]}
                          min={0.0}
                          max={1.0}
                          step={0.05}
                          onValueChange={(vals) => setTemperature(vals[0])}
                          className="w-14 h-4"
                        />
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 w-7">
                          {temperature !== null ? temperature.toFixed(2) : "auto"}
                        </span>
                        {temperature !== null ? (
                          <button
                            onClick={() => setTemperature(null)}
                            className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            title="恢复自动"
                          >
                            ↺
                          </button>
                        ) : (
                          <span className="text-[10px] text-gray-300 dark:text-gray-600">↺</span>
                        )}
                      </div>
                      {/* 分析设置齿轮 - 保留在顶栏 */}
                      <button
                        onClick={() => setShowSettingsDialog(true)}
                        className="flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        title="分析设置"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* 雨途斩棘录按钮 */}
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
                        <BookOpen className="h-3.5 w-3.5 mr-1" />
                        <span>雨途斩棘录</span>
                      </Button>
                      {showCodeEditor && (
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
                            className="h-6 px-3 text-xs bg-black text-white dark:bg-white dark:text-black"
                          >
                            {isExecutingCode ? "Running..." : "Run"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {!showCodeEditor ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 relative">
                      <div className="text-center select-none relative z-10">
                        <p className="text-sm">Click a code block to edit</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 flex flex-col p-4 editor-container overflow-hidden">
                      {/* Code Editor */}
                      <div
                        className="min-h-0 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-black flex flex-col"
                        style={{ height: `${editorHeight}%` }}
                      >
                        <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
                          <span className="text-xs text-gray-500 font-mono">
                            python
                          </span>
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
                              <div className="flex items-center justify-center h-full">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                  <span className="text-sm">加载编辑器...</span>
                                </div>
                              </div>
                            }
                          />
                        </div>
                      </div>

                      {/* Resizer */}
                      <div
                        className="h-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-row-resize flex items-center justify-center group"
                        onMouseDown={handleMouseDown}
                      >
                        <div className="w-8 h-1 bg-gray-300 dark:bg-gray-600 rounded group-hover:bg-gray-400 dark:group-hover:bg-gray-500"></div>
                      </div>

                      {/* Terminal Output */}
                      <div
                        className="min-h-0 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900 flex flex-col"
                        style={{ height: `${100 - editorHeight}%` }}
                      >
                        <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                            Output
                          </span>
                        </div>
                        <div className="flex-1 min-h-0 p-3 overflow-auto font-mono text-sm bg-white dark:bg-black text-gray-800 dark:text-gray-200">
                          {codeExecutionResult ? (
                            <div>
                              <div className="text-gray-500 dark:text-gray-400 mb-1">
                                $ python main.py
                              </div>
                              <pre className="whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                                {codeExecutionResult}
                              </pre>
                              <div className="flex items-center mt-2">
                                <span className="text-gray-500 dark:text-gray-400">
                                  $
                                </span>
                                <span className="w-2 h-4 bg-gray-400 dark:bg-gray-500 ml-1 animate-pulse"></span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-gray-400 dark:text-gray-500 italic">
                              Run code to see output...
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Lower: Chat Input */}
              <ResizablePanel defaultSize={60} minSize={20}>
                <div className="flex flex-col h-full bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800">
                  <div className="py-2 px-4 flex flex-col gap-1 border-b border-gray-100 dark:border-gray-900 bg-gray-50/50 dark:bg-gray-900/30">
                    <div className="flex justify-center items-center gap-3">
                      {/* 分析模式 - 左侧 */}
                      <div className="flex items-center gap-1">
                        <Select value={analysisMode} onValueChange={(val) => {
                          setAnalysisMode(val);
                          if (typeof window !== "undefined") {
                            localStorage.setItem("analysisMode", val);
                          }
                        }}>
                          <SelectTrigger className="h-7 w-[90px] text-[10px] bg-white dark:bg-black border-gray-200 dark:border-gray-800 focus:ring-0">
                            <SelectValue placeholder="模式" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="full_agent" className="text-xs">全程代理</SelectItem>
                            <SelectItem value="interactive" className="text-xs">交互式</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <span className="text-blue-600 dark:text-blue-400 font-bold text-base">请风控专家指示分析目标</span>
                      {/* 分析策略 - 右侧 */}
                      <div className="flex items-center gap-1">
                        <Select value={analysisStrategy} onValueChange={(val) => {
                          setAnalysisStrategy(val);
                        }}>
                          <SelectTrigger className="h-7 w-[90px] text-[10px] bg-white dark:bg-black border-gray-200 dark:border-gray-800 focus:ring-0">
                            <SelectValue placeholder="策略" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="聚焦诉求" className="text-xs">聚焦诉求</SelectItem>
                            <SelectItem value="适度扩展" className="text-xs">适度扩展</SelectItem>
                            <SelectItem value="广泛延展" className="text-xs">广泛延展</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col min-h-0 pt-2">
                    <div className="flex gap-3 items-start flex-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        className="hidden"
                        accept="*"
                      />
                      <div className="flex-1 relative flex flex-col h-full min-h-0">
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
                          rows={8}
                          className="flex-1 resize-none border-gray-200 dark:border-gray-700 bg-white dark:bg-black rounded-lg focus-visible:ring-1"
                        />
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-3">
                      <div className="flex-1 overflow-x-auto scrollbar-none mr-2">
                        <div className="flex gap-1 items-center min-w-max">
                          {historyInputs.length > 0 && (
                            <>
                              <span className="text-[10px] text-gray-400 dark:text-gray-600 mr-1 shrink-0">历史:</span>
                              {historyInputs.map((hist, idx) => (
                                <Button
                                  key={idx}
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setInputValue(hist)}
                                  className="h-6 px-2 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full shrink-0"
                                >
                                  {idx + 1}
                                </Button>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 shrink-0">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              title="清空聊天"
                              className="h-9 px-3"
                              disabled={isTyping}
                            >
                              <Eraser className="h-4 w-4 mr-2" />
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
                            className="h-9 px-4 rounded-md bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50"
                          >
                            <Square className="h-4 w-4 mr-2 fill-current" />
                            停止
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleSendMessage()}
                            size="sm"
                            disabled={!inputValue.trim()}
                            className="h-9 px-4 bg-black text-white dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200"
                          >
                            <Send className="h-4 w-4 mr-2" />
                            发送
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
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
              <iframe src={previewContent} className="w-full h-full" />
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


      {/* 交互式任务选择对话框 */}
      <Dialog open={showTaskTreeDialog} onOpenChange={setShowTaskTreeDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListTree className="h-5 w-5 text-amber-600" />
              选择分析任务
            </DialogTitle>
            <DialogDescription>
              请选择您希望智能体执行的分析任务，确认后智能体将仅分析选定的任务
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-800">
            <Button variant="outline" size="sm" onClick={selectAllTasks} className="text-xs h-7">
              全选
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAllTasks} className="text-xs h-7">
              取消全选
            </Button>
            <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
              已选 {selectedTasks.size} 项
            </span>
          </div>

          <div className="py-2 overflow-y-auto max-h-[50vh]">
            {taskTreeData?.map(node => (
              <TaskTreeItem
                key={node.id}
                node={node}
                selectedTasks={selectedTasks}
                toggleTask={toggleTask}
                depth={0}
              />
            ))}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowTaskTreeDialog(false)}>
              取消
            </Button>
            <Button
              onClick={handleConfirmTaskSelection}
              disabled={selectedTasks.size === 0}
              className="bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
            >
              确认选择
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 保存项目弹窗 */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>保存分析项目</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">项目名称</label>
              <div className="relative">
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="请输入或选择已有项目名称"
                  className="pr-10"
                />
                {userProjects.length > 0 && (
                  <div className="mt-2 max-h-[150px] overflow-y-auto border rounded-md p-1 bg-gray-50 dark:bg-gray-900">
                    <div className="text-[10px] text-gray-500 px-2 py-1 uppercase font-bold">已有项目 (点击覆盖)</div>
                    {userProjects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setProjectName(p.name)}
                        className="w-full text-left px-2 py-1.5 text-xs hover:bg-blue-100 dark:hover:bg-blue-900 rounded transition-colors truncate"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="text-[10px] text-gray-500 italic bg-amber-50 dark:bg-amber-950/20 p-2 rounded">
              提示：保存操作将同时记录当前的聊天历史、上传的数据文件以及生成的分析结果。
            </div>
            <Button className="w-full" onClick={() => saveProject(false)}>
              确认保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 保存项目同名覆盖确认弹窗 */}
      <AlertDialog open={saveConfirmOpen} onOpenChange={setSaveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>项目名称已存在</AlertDialogTitle>
            <AlertDialogDescription>
              项目中已存在名称为「{projectName}」的分析项目。覆盖将永久替换原项目内容，是否确认覆盖？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setSaveConfirmOpen(false);
              setPendingSaveData(null);
            }}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => {
                setSaveConfirmOpen(false);
                saveProject(true); // confirmed = true，直接覆盖保存
              }}
            >
              确认覆盖
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 项目中心弹窗 */}
      <Dialog open={showProjectManager} onOpenChange={setShowProjectManager}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>项目中心</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {userProjects.length === 0 ? (
              <div className="text-center py-10 text-gray-500 italic text-sm">
                暂无保存的项目
              </div>
            ) : (
              <div className="space-y-3">
                {userProjects.map((proj) => (
                  <div
                    key={proj.id}
                    className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{proj.name}</div>
                      <div className="text-[10px] text-gray-500 mt-1">
                        保存时间：{new Date(proj.created_at).toLocaleString()}
                        {proj.storage_size && (
                          <span className="ml-2 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[9px] font-mono">
                            {proj.storage_size}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-xs"
                        onClick={() => loadProject(proj.id)}
                      >
                        打开
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确认删除项目？</AlertDialogTitle>
                            <AlertDialogDescription>
                              这将永久删除项目记录及其相关的工作空间文件。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 hover:bg-red-700"
                              onClick={() => deleteProject(proj.id)}
                            >
                              确认删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 退出登录确认弹窗 */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认退出登录？</AlertDialogTitle>
            <AlertDialogDescription>
              退出登录将清空当前所有区域信息、聊天记录和工作区文件，并返回登录界面。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                performLogout();
                setShowLogoutConfirm(false);
              }}
            >
              确认退出
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 雨途斩棘录面板 */}
      <Dialog open={showYutuPanel} onOpenChange={setShowYutuPanel}>
        <DialogContent className="sm:max-w-[90vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              雨途斩棘录
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-2">
                - 智能体错误修正记录知识库 -
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* 管理工具栏 - 仅超级用户可见 */}
            {currentUser === "rainforgrain" && (
              <div className="flex items-center justify-between gap-2 mb-2 px-1">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={yutuViewAsRegular ? "outline" : "default"}
                    onClick={() => setYutuViewAsRegular(!yutuViewAsRegular)}
                    className={yutuViewAsRegular ? "" : "bg-blue-600"}
                  >
                    {yutuViewAsRegular ? "管理模式" : "查看HTML"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={initYutu}
                    className="text-orange-600 border-orange-200 hover:bg-orange-50"
                  >
                    初始化知识库
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-600 border-green-200 hover:bg-green-50 relative overflow-hidden"
                    onClick={() => {
                      if (window.confirm("确定要整理所有笔记吗？这将使用AI重新组织所有记录。")) {
                        // 调用AI整理功能
                        organizeYutuNotes();
                      }
                    }}
                    disabled={isOrganizing}
                  >
                    {isOrganizing ? (
                      <>
                        {/* 进度条背景 */}
                        <div
                          className="absolute left-0 top-0 bottom-0 bg-green-100 opacity-50 transition-all duration-300 ease-out"
                          style={{ width: `${organizeProgressPercent}%` }}
                        />
                        <span className="relative z-10 flex items-center">
                          <span className="animate-spin mr-1">⏳</span>
                          {organizingProgress} ({organizeProgressPercent}%)
                        </span>
                      </>
                    ) : (
                      "整理笔记"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-purple-600 border-purple-200 hover:bg-purple-50"
                    onClick={() => {
                      loadBackups();
                      setShowBackupRestore(true);
                    }}
                  >
                    备份与恢复
                  </Button>
                </div>
                <span className="text-xs text-gray-500">共 {yutuRecords.length} 条记录</span>
              </div>
            )}

            {/* 搜索栏 - 仅超级用户可见 */}
            {currentUser === "rainforgrain" && (
              <div className="flex items-center gap-2 mb-3 p-2 border rounded-md bg-gray-50 dark:bg-gray-900">
                <Input
                  placeholder="搜索错误消息..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={() => loadYutuRecords(searchKeyword ? [searchKeyword] : [], "")}
                >
                  搜索
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSearchKeyword("");
                    loadYutuRecords([], "");
                  }}
                >
                  重置
                </Button>
              </div>
            )}

            {/* 内容显示区域 - 超级用户看列表(可切换)，其他人看HTML */}
            {currentUser === "rainforgrain" && !yutuViewAsRegular ? (
              /* 超级用户：表格列表视图，支持编辑删除 */
              <div className="flex-1 min-h-0 overflow-auto rounded-md border bg-white dark:bg-gray-950">
                {yutuRecords.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">错误类型</th>
                        <th className="px-3 py-2 text-left">错误消息</th>
                        <th className="px-3 py-2 text-left">解决方案</th>
                        <th className="px-3 py-2 text-center">置信度</th>
                        <th className="px-3 py-2 text-center">使用次数</th>
                        <th className="px-3 py-2 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {yutuRecords.map((record: any) => (
                        <tr key={record.error_hash} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              record.error_type === 'ImportError' ? 'bg-blue-100 text-blue-700' :
                              record.error_type === 'ValueError' ? 'bg-red-100 text-red-700' :
                              record.error_type === 'TypeError' ? 'bg-orange-100 text-orange-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {record.error_type || "Unknown"}
                            </span>
                          </td>
                          <td className="px-3 py-2 max-w-[200px] truncate" title={record.error_message || ""}>
                            {record.error_message ? record.error_message.substring(0, 50) + (record.error_message.length > 50 ? "..." : "") : ""}
                          </td>
                          <td className="px-3 py-2 max-w-[250px] truncate" title={record.solution || ""}>
                            {record.solution ? record.solution.substring(0, 80) + (record.solution.length > 80 ? "..." : "") : ""}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              (record.confidence || 0) >= 0.8 ? 'bg-green-100 text-green-700' :
                              (record.confidence || 0) >= 0.5 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {Math.round((record.confidence || 0) * 100)}%
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center text-gray-500">
                            {record.usage_count || 0}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                                onClick={() => handleDeleteYutuRecord(record.error_hash)}
                                title="删除"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500 p-8">
                    <BookOpen className="h-12 w-12 mb-4 opacity-30" />
                    <p>暂无错误记录</p>
                    <p className="text-xs mt-2">当智能体遇到错误并成功解决后，记录将自动添加到这里</p>
                  </div>
                )}
              </div>
            ) : (
              /* 普通用户：HTML视图 */
              <div
                ref={yutuPanelRef}
                className="flex-1 min-h-0 overflow-auto rounded-md border bg-white dark:bg-gray-950"
              >
                {yutuHtmlContent ? (
                  <div
                    className="p-4 prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: yutuHtmlContent }}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    加载中...
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowYutuPanel(false)}
            >
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 备份与恢复对话框 */}
      <Dialog open={showBackupRestore} onOpenChange={setShowBackupRestore}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>雨途斩棘录 - 备份与恢复</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2 pb-2 border-b">
              <label className="text-sm font-medium">创建新备份</label>
              <div className="flex gap-2">
                <Input
                  placeholder="备份名称 (可选)"
                  value={backupName}
                  onChange={(e) => setBackupName(e.target.value)}
                  className="flex-1"
                />
                <Button size="sm" onClick={createBackup} disabled={isCreatingBackup}>
                  {isCreatingBackup ? "备份中..." : "立即备份"}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">现有备份</label>
              <div className="max-h-[200px] overflow-y-auto border rounded-md divide-y dark:divide-gray-800">
                {backups.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-500">暂无备份文件</div>
                ) : (
                  backups.map(f => (
                    <div
                      key={f}
                      className={`flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer ${selectedBackup === f ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                      onClick={() => setSelectedBackup(f)}
                    >
                      <div className="flex-1 text-xs truncate mr-2" title={f}>
                        {f}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteBackupFile(f);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">恢复模式</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="restoreMode"
                    checked={restoreMode === 'append'}
                    onChange={() => setRestoreMode('append')}
                  />
                  追加模式
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="restoreMode"
                    checked={restoreMode === 'overwrite'}
                    onChange={() => setRestoreMode('overwrite')}
                  />
                  覆盖模式
                </label>
              </div>
              <p className="text-[10px] text-gray-500">
                追加：仅导入不重复的记录。覆盖：清空当前库并完全替换。
              </p>
            </div>
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 mt-2"
              onClick={restoreBackup}
              disabled={!selectedBackup}
            >
              执行恢复
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 知识库设置弹窗 - 仅超级用户可见 */}
      <Dialog open={showKnowledgeSettings} onOpenChange={setShowKnowledgeSettings}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              知识库设置
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="text-sm font-medium">启用知识库</div>
                <div className="text-xs text-gray-500">启用后智能体启动时会阅读知识库</div>
              </div>
              <Switch
                checked={knowledgeBaseEnabled}
                onCheckedChange={(checked) => {
                  setKnowledgeBaseEnabled(checked);
                  // 保存设置到 localStorage
                  localStorage.setItem("knowledgeBaseEnabled", checked ? "true" : "false");
                  toast({ description: checked ? "知识库已启用" : "知识库已停用" });
                }}
              />
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
                使用说明
              </div>
              <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                <li>• 启用后，智能体在每次分析开始时会查询雨途斩棘录</li>
                <li>• "雨途斩棘录"按钮在分析完成后变为可用</li>
                <li>• 点击可自动提取分析过程中的问题和解决方案</li>
                <li>• 重复的记录会自动过滤，不会重复添加</li>
              </ul>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowKnowledgeSettings(false)}>
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 系统设置弹窗 */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              系统设置
            </DialogTitle>
            <DialogDescription>
              配置智能体的运行参数和分析行为
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-4">

            {/* 模型版本 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Cpu className="h-4 w-4 text-blue-500" />
                模型运行环境
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setModelVersion("mlx"); localStorage.setItem("modelVersion", "mlx"); }}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-xs",
                    modelVersion === "mlx"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  )}
                >
                  <Monitor className="h-5 w-5" />
                  <span className="font-medium">MLX (Apple Silicon)</span>
                  <span className="text-[10px] text-gray-500">适用于 M1/M2/M3/M4 芯片</span>
                </button>
                <button
                  onClick={() => { setModelVersion("gpu"); localStorage.setItem("modelVersion", "gpu"); }}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-xs",
                    modelVersion === "gpu"
                      ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  )}
                >
                  <Zap className="h-5 w-5" />
                  <span className="font-medium">GPU (CUDA/OpenCL)</span>
                  <span className="text-[10px] text-gray-500">适用于 NVIDIA/AMD 显卡</span>
                </button>
              </div>
            </div>

            {/* 分析模式 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Bot className="h-4 w-4 text-purple-500" />
                分析模式
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setAnalysisMode("full_agent"); localStorage.setItem("analysisMode", "full_agent"); }}
                  className={cn(
                    "flex flex-col items-start gap-1 p-3 rounded-lg border-2 transition-all text-xs",
                    analysisMode === "full_agent"
                      ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  )}
                >
                  <span className="font-medium">全程代理分析</span>
                  <span className="text-[10px] text-gray-500 text-left">智能体自主完成全部分析流程，无需人工干预</span>
                </button>
                <button
                  onClick={() => { setAnalysisMode("interactive"); localStorage.setItem("analysisMode", "interactive"); }}
                  className={cn(
                    "flex flex-col items-start gap-1 p-3 rounded-lg border-2 transition-all text-xs",
                    analysisMode === "interactive"
                      ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  )}
                >
                  <span className="font-medium">交互式分析</span>
                  <span className="text-[10px] text-gray-500 text-left">用户参与任务拆分与分析角度选择</span>
                </button>
              </div>
            </div>

            {/* 分析策略与热度 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-amber-500" />
                分析策略与热度
              </div>
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-16">策略:</span>
                    <Select value={analysisStrategy} onValueChange={setAnalysisStrategy}>
                      <SelectTrigger className="h-7 flex-1 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="聚焦诉求" className="text-xs">聚焦诉求 — 直击要点</SelectItem>
                        <SelectItem value="适度扩展" className="text-xs">适度扩展 — 兼顾关联</SelectItem>
                        <SelectItem value="广泛延展" className="text-xs">广泛延展 — 深度探索</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-16">热度:</span>
                    <Slider
                      value={[temperature ?? (analysisStrategy === "聚焦诉求" ? 0.2 : analysisStrategy === "适度扩展" ? 0.4 : 0.6)]}
                      min={0.0}
                      max={1.0}
                      step={0.05}
                      onValueChange={(vals) => setTemperature(vals[0])}
                      className="flex-1 h-4"
                    />
                    <span className="text-xs text-gray-500 w-10 text-right">
                      {temperature !== null ? temperature.toFixed(2) : "auto"}
                    </span>
                    {temperature !== null && (
                      <button
                        onClick={() => setTemperature(null)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                        title="恢复自动"
                      >
                        ↺
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 七大原则 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BookOpen className="h-4 w-4 text-teal-500" />
                智能体行为原则
              </div>
              <div className="space-y-1.5">
                {(() => {
                  const principleStates: Record<string, { state: boolean; setter: (v: boolean) => void }> = {
                    selfCorrectionEnabled: { state: selfCorrectionEnabled, setter: setSelfCorrectionEnabled },
                    shortTestEnabled: { state: shortTestEnabled, setter: setShortTestEnabled },
                    taskDecompositionEnabled: { state: taskDecompositionEnabled, setter: setTaskDecompositionEnabled },
                    explainabilityEnabled: { state: explainabilityEnabled, setter: setExplainabilityEnabled },
                    efficientProcessingEnabled: { state: efficientProcessingEnabled, setter: setEfficientProcessingEnabled },
                    deadLoopDetectionEnabled: { state: deadLoopDetectionEnabled, setter: setDeadLoopDetectionEnabled },
                  };
                  return ANALYSIS_PRINCIPLES.map((item) => {
                    const ps = principleStates[item.key];
                    return (
                      <div key={item.key} className="flex items-center justify-between py-1.5 px-3 border rounded-lg">
                        <div>
                          <div className="text-xs font-medium">{item.label}</div>
                          <div className="text-[10px] text-gray-500">{item.desc}</div>
                        </div>
                        <Switch
                          checked={ps.state}
                          onCheckedChange={(checked) => {
                            ps.setter(checked);
                            localStorage.setItem(item.key, checked ? "true" : "false");
                          }}
                        />
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* 知识库设置 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Database className="h-4 w-4 text-indigo-500" />
                知识库与学习
              </div>
              <div className="flex items-center justify-between py-1.5 px-3 border rounded-lg">
                <div>
                  <div className="text-xs font-medium">启用知识库（雨途斩棘录）</div>
                  <div className="text-[10px] text-gray-500">启用后智能体会阅读历史错误经验</div>
                </div>
                <Switch
                  checked={knowledgeBaseEnabled}
                  onCheckedChange={(checked) => {
                    setKnowledgeBaseEnabled(checked);
                    localStorage.setItem("knowledgeBaseEnabled", checked ? "true" : "false");
                    toast({ description: checked ? "知识库已启用" : "知识库已停用" });
                  }}
                />
              </div>
            </div>

            {/* 输出格式说明 */}
            <div className="p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">输出规范</div>
              <ul className="text-[10px] text-gray-500 space-y-0.5">
                <li>• 所有分析输出使用简体中文</li>
                <li>• 报告支持 PDF、DOCX、PPTX 三种格式导出</li>
                <li>• 图表统一使用 seaborn 专业风格</li>
                <li>• 数据类型自动检测与校验</li>
                <li>• 机器学习模型附带特征重要性分析</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowSettingsDialog(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑记录对话框 - 超级用户专用 */}
      {currentUser === "rainforgrain" && (
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>编辑错误记录</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
              <div className="space-y-2">
                <label className="text-sm font-medium">错误类型</label>
                <Input
                  value={editRecord?.error_type || ""}
                  onChange={(e) => setEditRecord({ ...editRecord, error_type: e.target.value })}
                  placeholder="例如: ImportError"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">错误哈希</label>
                <Input
                  value={editRecord?.error_hash || ""}
                  disabled
                  className="bg-gray-100 dark:bg-gray-800"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">错误消息</label>
                <textarea
                  value={editRecord?.error_message || ""}
                  onChange={(e) => setEditRecord({ ...editRecord, error_message: e.target.value })}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px]"
                  placeholder="错误消息..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">解决方案</label>
                <textarea
                  value={editRecord?.solution || ""}
                  onChange={(e) => setEditRecord({ ...editRecord, solution: e.target.value })}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[100px]"
                  placeholder="解决方案描述..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">解决方案代码</label>
                <textarea
                  value={editRecord?.solution_code || ""}
                  onChange={(e) => setEditRecord({ ...editRecord, solution_code: e.target.value })}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[120px] font-mono text-xs"
                  placeholder="解决方案代码..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">置信度 (0-1)</label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={editRecord?.confidence || 0}
                  onChange={(e) => setEditRecord({ ...editRecord, confidence: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowEditDialog(false)}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  handleUpdateYutuRecord(editRecord);
                  setShowEditDialog(false);
                }}
              >
                保存修改
              </AlertDialogAction>
            </AlertDialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 删除确认对话框 */}
      {currentUser === "rainforgrain" && (
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除记录？</AlertDialogTitle>
              <AlertDialogDescription>
                这将软删除该错误记录，使其在界面中不再显示。此操作可逆（通过数据库恢复）。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => {
                  if (editRecord?.error_hash) {
                    handleDeleteYutuRecord(editRecord.error_hash);
                  }
                  setShowDeleteConfirm(false);
                }}
              >
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* 智能体介绍对话框 */}
      <Dialog open={showAgentIntro} onOpenChange={setShowAgentIntro}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-600" />
              智能体介绍
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4 text-sm leading-relaxed">
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-blue-600 dark:text-blue-400 mb-1">角色定位</h3>
                <p className="text-gray-600 dark:text-gray-300">
                  我是DeepAnalyze，一位精通Python和R语言的数据科学家，同时也是专注于中国海关风险管理和风险防控的数据分析专家。我的核心使命是忠于国家安全，服务海关履行职责，通过大数据分析协助维护贸易秩序。
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-blue-600 dark:text-blue-400 mb-1">特点特长</h3>
                <p className="text-gray-600 dark:text-gray-300">
                  基于数据统计、比较、相关性和逻辑推理，深入分析进出口业务主体行为。运用规律分析、统计分析、对比分析、关联分析等方法挖掘走私违规、逃证逃税、违反安全准入等潜在风险。支持三种分析策略：聚焦诉求（直击要点）、适度扩展（适量关联）、广泛延展（深度发散），灵活调整分析深度。
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-blue-600 dark:text-blue-400 mb-1">处理问题原则</h3>
                <p className="text-gray-600 dark:text-gray-300">
                  严格遵循分析报告规范结构：分析思路→主体分析内容→分析小结。根据数据特性和时间跨度自动调整分析维度，确保结论准确可靠。以风险识别为核心，提供明确的风险点和推理依据，协助风控专家做出精准决策。
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 风调雨顺 - 过程指导对话框 */}
      <Dialog open={sideGuidanceOpen} onOpenChange={setSideGuidanceOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              风调雨顺 - 过程指导
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            在智能体分析过程中，您可以随时提交新的需求、方法或条件。
            这些信息将与当前任务结合，指导智能体的下一步动作。
          </div>

          {sideGuidanceHistory.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 pb-1 border-t border-gray-100 dark:border-gray-800">
              <span className="text-xs text-gray-400 mr-1">历史指导:</span>
              {sideGuidanceHistory.map((h, i) => (
                <Button
                  key={i}
                  variant="ghost"
                  size="sm"
                  onClick={() => setSideGuidanceText(h)}
                  className={cn(
                    "h-6 px-2 text-xs border border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400",
                    sideGuidanceText === h && "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                  )}
                  title={h.substring(0, 50) + (h.length > 50 ? "..." : "")}
                >
                  &lt;{i + 1}&gt;
                </Button>
              ))}
            </div>
          )}

          <div className="py-4">
            <Textarea
              value={sideGuidanceText}
              onChange={(e) => setSideGuidanceText(e.target.value)}
              placeholder="请输入您的过程指导要求或 Side Task..."
              className="min-h-[150px] resize-none focus-visible:ring-blue-500"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setSideGuidanceOpen(false);
                setSideGuidanceText("");
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleSendGuidance}
              disabled={isSubmittingGuidance || !sideGuidanceText.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmittingGuidance ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  提交中...
                </>
              ) : (
                "确认提交"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSystemSettings} onOpenChange={setShowSystemSettings}>
        <DialogContent className="dialog-page-like max-w-none w-auto h-auto p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600" />
              系统设置
            </DialogTitle>
            <DialogDescription>
              统一管理模型配置、数据库连接和知识库设置。
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden px-6 py-4">
            <Tabs value={systemSettingsTab} onValueChange={(value) => setSystemSettingsTab(value as "model" | "database" | "knowledge")} className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-3 max-w-[520px]">
                <TabsTrigger value="model">模型设置</TabsTrigger>
                <TabsTrigger value="database">数据库设置</TabsTrigger>
                <TabsTrigger value="knowledge">知识库设置</TabsTrigger>
              </TabsList>

              <TabsContent value="model" className="mt-4 flex-1 overflow-y-auto space-y-6">
                <section className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="model-preset">预设模型</Label>
                      <Select
                        value={modelProviderConfig.id}
                        onValueChange={applyModelPreset}
                      >
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
                      <Input
                        id="model-name"
                        value={modelProviderConfig.model}
                        onChange={(e) =>
                          setModelProviderConfig((prev) => ({ ...prev, model: e.target.value }))
                        }
                      />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label htmlFor="model-description">描述</Label>
                      <Input
                        id="model-description"
                        value={modelProviderConfig.description}
                        onChange={(e) =>
                          setModelProviderConfig((prev) => ({ ...prev, description: e.target.value }))
                        }
                      />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label htmlFor="model-base-url">Base URL</Label>
                      <Input
                        id="model-base-url"
                        value={modelProviderConfig.baseUrl}
                        onChange={(e) =>
                          setModelProviderConfig((prev) => ({ ...prev, baseUrl: e.target.value }))
                        }
                      />
                    </div>
                    <div className="col-span-2 space-y-1.5">
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
                  </div>

                  <div className="rounded-lg border p-4 space-y-3 bg-gray-50 dark:bg-gray-900/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">自定义请求头</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          用于兼容自定义 OpenAI 接口、网关或厂商额外认证头。
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setShowRawModelHeaders((prev) => !prev)}>
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
                        className="min-h-[120px] font-mono text-xs"
                        placeholder={"Authorization: Bearer xxx\nX-Trace-Id: demo"}
                      />
                    ) : null}
                  </div>

                  <div className="rounded-lg border p-4 space-y-2 bg-blue-50 dark:bg-blue-950/20 text-sm">
                    <div className="font-medium text-blue-700 dark:text-blue-300">当前分析参数</div>
                    <div className="text-xs text-blue-700 dark:text-blue-300">分析策略与温度仍保留在聊天输入区，不从那里移除，避免影响现有分析流程。</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">当前分析策略：{analysisStrategy}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">当前温度：{temperature ?? "自动"}</div>
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="database" className="mt-4 flex-1 overflow-y-auto">
                <div className="h-full min-h-0 overflow-hidden rounded-lg border">
                  <ResizablePanelGroup direction="horizontal" className="h-full min-h-[560px]">
                    <ResizablePanel defaultSize={20} minSize={15} className="bg-gray-50 dark:bg-gray-900/20 border-r">
                      <div className="p-4 space-y-4">
                        <Label className="text-sm font-semibold">选择数据库类型</Label>
                        <RadioGroup value={dbType} onValueChange={setDbType} className="space-y-2">
                          {[
                            { id: "mysql", label: "MySQL", icon: "🐬" },
                            { id: "mssql", label: "SQL Server", icon: "🪟" },
                            { id: "postgresql", label: "PostgreSQL", icon: "🐘" },
                            { id: "oracle", label: "Oracle", icon: "🏢" },
                            { id: "sqlite", label: "SQLite", icon: "📂" },
                          ].map((item) => (
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
                                <Input id="system-db-port" placeholder={dbType === "mysql" ? "3306" : dbType === "mssql" ? "1433" : "5432"} value={dbConfig.port} onChange={(e) => setDbConfig({ ...dbConfig, port: e.target.value })} />
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
                                <Input id="system-db-name" value={dbConfig.database} onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })} />
                              </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={isTestingDb}>
                                {isTestingDb ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : null}
                                测试连接
                              </Button>
                            </div>
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
                                  <Select value={dbExecuteMode} onValueChange={(v: any) => setDbExecuteMode(v)}>
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
          <DialogFooter className="px-6 py-4 border-t justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              {knowledgeSettingsLoaded ? "配置已加载" : "尚未加载配置"}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => handleTestKnowledgeProvider("all")} disabled={knowledgeTestTarget !== null || isSavingKnowledgeConfig || isLoadingKnowledgeConfig}>
                {knowledgeTestTarget === "all" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                测试全部
              </Button>
              <Button onClick={handleSaveKnowledgeConfig} disabled={isSavingKnowledgeConfig || isLoadingKnowledgeConfig}>
                {isSavingKnowledgeConfig ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                保存配置
              </Button>
              <Button variant="outline" onClick={() => setShowSystemSettings(false)}>关闭</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 数据库连接对话框 */}
      <Dialog open={showDatabaseDialog} onOpenChange={setShowDatabaseDialog}>
        <DialogContent className="max-w-[95vw] w-[1400px] h-[85vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600" />
              连接数据库并查询数据
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-hidden">
            <ResizablePanelGroup direction="horizontal" className="h-full">
              {/* 左侧：数据库类型选择 */}
              <ResizablePanel defaultSize={20} minSize={15} className="bg-gray-50 dark:bg-gray-900/20 border-r">
                <div className="p-4 space-y-4">
                  <Label className="text-sm font-semibold">选择数据库类型</Label>
                  <RadioGroup value={dbType} onValueChange={setDbType} className="space-y-2">
                    {[
                      { id: "mysql", label: "MySQL", icon: "🐬" },
                      { id: "mssql", label: "SQL Server", icon: "🪟" },
                      { id: "postgresql", label: "PostgreSQL", icon: "🐘" },
                      { id: "oracle", label: "Oracle", icon: "🏢" },
                      { id: "sqlite", label: "SQLite", icon: "📂" },
                    ].map((item) => (
                      <div key={item.id} className="flex items-center space-x-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <RadioGroupItem value={item.id} id={item.id} />
                        <Label htmlFor={item.id} className="flex-1 cursor-pointer flex items-center gap-2">
                          <span>{item.icon}</span>
                          <span>{item.label}</span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* 右侧：配置、NL输入、SQL编辑器 */}
              <ResizablePanel defaultSize={80} minSize={50}>
                <div className="h-full flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* 1. 配置连接 */}
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">1</span>
                        配置连接信息
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="db-host">主机名 / 地址</Label>
                          <Input
                            id="db-host"
                            placeholder="localhost"
                            value={dbConfig.host}
                            onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="db-port">端口</Label>
                          <Input
                            id="db-port"
                            placeholder={dbType === "mysql" ? "3306" : dbType === "mssql" ? "1433" : "5432"}
                            value={dbConfig.port}
                            onChange={(e) => setDbConfig({ ...dbConfig, port: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="db-user">用户名</Label>
                          <Input
                            id="db-user"
                            value={dbConfig.user}
                            onChange={(e) => setDbConfig({ ...dbConfig, user: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="db-pass">密码</Label>
                          <Input
                            id="db-pass"
                            type="password"
                            value={dbConfig.password}
                            onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })}
                          />
                        </div>
                        <div className="col-span-2 space-y-1.5">
                          <Label htmlFor="db-name">{dbType === "sqlite" ? "SQLite 文件绝对路径" : "数据库名称"}</Label>
                          <Input
                            id="db-name"
                            value={dbConfig.database}
                            onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={isTestingDb}>
                          {isTestingDb ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : null}
                          测试连接
                        </Button>
                      </div>
                    </section>

                    {/* 2. 自然语言生成 SQL */}
                    <section className={`space-y-3 transition-opacity ${!isDbTested ? 'opacity-50 pointer-events-none' : ''}`}>
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">2</span>
                        智能生成查询语句
                        {!isDbTested && <span className="text-xs font-normal text-amber-600 ml-2">(请先完成步骤 1 测试连接)</span>}
                      </h3>
                      <div className="space-y-2">
                        <Textarea
                          placeholder="描述您的查询需求，例如：'统计过去三个月每个月的进出口额总计，并按月份排序'"
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

                    {/* 3. SQL 编辑与执行 */}
                    <section className={`space-y-3 transition-opacity ${!isDbTested ? 'opacity-50 pointer-events-none' : ''}`}>
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">3</span>
                        预览并执行 SQL
                      </h3>
                      <div className="space-y-2">
                        <Textarea
                          className="min-h-[120px] font-mono text-sm"
                          value={dbGeneratedSql}
                          onChange={(e) => setDbGeneratedSql(e.target.value)}
                          spellCheck={false}
                        />
                        <div className="grid grid-cols-2 gap-4 items-end bg-gray-50 dark:bg-gray-900/40 p-4 rounded-lg border">
                          <div className="space-y-1.5">
                            <Label htmlFor="dataset-name">保存为数据集名称</Label>
                            <Input
                              id="dataset-name"
                              value={dbDatasetName}
                              onChange={(e) => setDbDatasetName(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>执行模式</Label>
                            <Select value={dbExecuteMode} onValueChange={(v: any) => setDbExecuteMode(v)}>
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
                    <Button variant="ghost" onClick={() => setShowDatabaseDialog(false)}>
                      关闭
                    </Button>
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
        </DialogContent>
      </Dialog>
    </>
  );
}
