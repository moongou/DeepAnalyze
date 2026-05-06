// API配置
export type ModelProviderType =
  | "deepanalyze"
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "qwen"
  | "zhipu"
  | "moonshot"
  | "doubao"
  | "baidu"
  | "siliconflow"
  | "ollama"
  | "openai_compatible"
  | string;

export interface ModelProviderConfig {
  id: string;
  providerType: ModelProviderType;
  label: string;
  description: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  headers?: Record<string, string>;
  isLocal?: boolean;
  supportsOpenAICompatible?: boolean;
}

const DEFAULT_PROVIDER_TYPE =
  (process.env.NEXT_PUBLIC_DEFAULT_PROVIDER_TYPE as ModelProviderType) ||
  "deepanalyze";
const DEFAULT_PROVIDER_LABEL =
  process.env.NEXT_PUBLIC_DEFAULT_PROVIDER_LABEL || "DeepAnalyze 默认";
const DEFAULT_PROVIDER_DESCRIPTION =
  process.env.NEXT_PUBLIC_DEFAULT_PROVIDER_DESCRIPTION ||
  "项目默认本地 vLLM 服务";
const DEFAULT_PROVIDER_BASE_URL =
  process.env.NEXT_PUBLIC_AI_API_URL || "http://localhost:8000/v1";
const DEFAULT_PROVIDER_MODEL =
  process.env.NEXT_PUBLIC_DEFAULT_MODEL_NAME || "DeepAnalyze-8B";

export const MODEL_PROVIDER_PRESETS: ModelProviderConfig[] = [
  {
    id: "deepanalyze-default",
    providerType: DEFAULT_PROVIDER_TYPE,
    label: DEFAULT_PROVIDER_LABEL,
    description: DEFAULT_PROVIDER_DESCRIPTION,
    baseUrl: DEFAULT_PROVIDER_BASE_URL,
    model: DEFAULT_PROVIDER_MODEL,
    apiKey: "",
    isLocal: true,
    supportsOpenAICompatible: true,
  },
  {
    id: "ollama-qwen",
    providerType: "ollama",
    label: "Ollama / Qwen",
    description: "本地 Ollama OpenAI 兼容接口",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5:14b",
    apiKey: "ollama",
    isLocal: true,
    supportsOpenAICompatible: true,
  },
  {
    id: "openai-gpt5",
    providerType: "openai",
    label: "OpenAI",
    description: "OpenAI 官方兼容接口",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5",
    apiKey: "",
    supportsOpenAICompatible: true,
  },
  {
    id: "anthropic-sonnet",
    providerType: "anthropic",
    label: "Anthropic Claude",
    description: "通过兼容网关接入 Claude",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5",
    apiKey: "",
    supportsOpenAICompatible: false,
  },
  {
    id: "google-gemini",
    providerType: "google",
    label: "Google Gemini",
    description: "Gemini / Vertex 风格模型入口",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-pro",
    apiKey: "",
    supportsOpenAICompatible: true,
  },
  {
    id: "deepseek-chat",
    providerType: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek 官方 OpenAI 兼容接口",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    apiKey: "",
    supportsOpenAICompatible: true,
  },
  {
    id: "qwen-max",
    providerType: "qwen",
    label: "阿里百炼 / Qwen",
    description: "DashScope OpenAI 兼容接口",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-max",
    apiKey: "",
    supportsOpenAICompatible: true,
  },
  {
    id: "zhipu-glm",
    providerType: "zhipu",
    label: "智谱 GLM",
    description: "智谱 OpenAI 兼容接口",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-plus",
    apiKey: "",
    supportsOpenAICompatible: true,
  },
  {
    id: "moonshot-kimi",
    providerType: "moonshot",
    label: "月之暗面 Kimi",
    description: "Moonshot OpenAI 兼容接口",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-128k",
    apiKey: "",
    supportsOpenAICompatible: true,
  },
  {
    id: "doubao-ark",
    providerType: "doubao",
    label: "字节豆包 / Ark",
    description: "火山方舟兼容接口",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-1.5-pro-32k-250115",
    apiKey: "",
    supportsOpenAICompatible: true,
  },
  {
    id: "baidu-ernie",
    providerType: "baidu",
    label: "百度千帆",
    description: "千帆兼容接口",
    baseUrl: "https://qianfan.baidubce.com/v2",
    model: "ernie-4.0-turbo-8k",
    apiKey: "",
    supportsOpenAICompatible: true,
  },
  {
    id: "siliconflow",
    providerType: "siliconflow",
    label: "SiliconFlow",
    description: "第三方多模型聚合平台",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "deepseek-ai/DeepSeek-V3",
    apiKey: "",
    supportsOpenAICompatible: true,
  },
  {
    id: "custom-openai-compatible",
    providerType: "openai_compatible",
    label: "自定义兼容接口",
    description: "适配自托管 vLLM / LM Studio / 任意兼容网关",
    baseUrl: "http://localhost:8000/v1",
    model: "your-model-name",
    apiKey: "",
    supportsOpenAICompatible: true,
  },
];

export const cloneModelProviderConfig = (
  config: ModelProviderConfig = MODEL_PROVIDER_PRESETS[0]
): ModelProviderConfig => ({
  ...config,
  headers: { ...(config.headers || {}) },
});

export const stringifyModelHeaders = (headers: Record<string, string> = {}) =>
  Object.entries(headers)
    .filter(([key, value]) => key.trim() && String(value).trim())
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

export const parseModelHeadersInput = (value: string): Record<string, string> => {
  const headers: Record<string, string> = {};
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) return;
      const key = line.slice(0, separatorIndex).trim();
      const headerValue = line.slice(separatorIndex + 1).trim();
      if (!key || !headerValue) return;
      headers[key] = headerValue;
    });
  return headers;
};

export const getModelProviderPreset = (id: string) => {
  const preset = MODEL_PROVIDER_PRESETS.find((item) => item.id === id);
  return cloneModelProviderConfig(preset || MODEL_PROVIDER_PRESETS[0]);
};

export const API_CONFIG = {
  // 后端API基础地址
  BACKEND_BASE_URL:
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8200",

  // 静态文件服务基础地址（前端可配置下载/预览所使用的文件基址）
  // 例如：http://<server-ip>:8100 或 https://cdn.example.com
  FILE_SERVER_BASE:
    process.env.NEXT_PUBLIC_FILE_SERVER_BASE || "http://localhost:8100",

  // 模拟AI API地址
  AI_API_BASE_URL:
    process.env.NEXT_PUBLIC_AI_API_URL || "http://localhost:8000",

  // WebSocket地址
  WEBSOCKET_URL: process.env.NEXT_PUBLIC_WEBSOCKET_URL || "ws://localhost:8001",

  // API端点 (Phase 1: unified /v1/ prefix)
  ENDPOINTS: {
    // 聊天
    CHAT_COMPLETIONS: "/v1/chat/completions",

    // 文件管理
    WORKSPACE_FILES: "/v1/files",
    WORKSPACE_TREE: "/v1/files/tree",
    WORKSPACE_UPLOAD: "/v1/files",
    WORKSPACE_CLEAR: "/v1/files/clear",
    WORKSPACE_DELETE_FILE: "/v1/files/file",
    WORKSPACE_DELETE_DIR: "/v1/files/dir",

    // 认证
    AUTH_REGISTER: "/v1/auth/register",
    AUTH_LOGIN: "/v1/auth/login",

    // 项目管理
    PROJECTS_SAVE: "/v1/projects/save",
    PROJECTS_LIST: "/v1/projects/list",
    PROJECTS_LOAD: "/v1/projects/load",
    PROJECTS_DELETE: "/v1/projects",
    PROJECTS_CHECK_NAME: "/v1/projects/check-name",

    // 知识库 (Yutu)
    KNOWLEDGE_ENTRIES: "/v1/knowledge/entries",
    KNOWLEDGE_SEARCH: "/v1/knowledge/entries/search",

    // 数据库连接
    DB_TEST: "/v1/database/test",
    DB_LIST: "/v1/database/list",
    DB_CONTEXT_LOAD: "/v1/database/context/load",
    DB_SCHEMA_GRAPH: "/v1/database/schema/graph",
    DB_GENERATE_SQL: "/v1/database/generate-sql",
    DB_EXECUTE: "/v1/database/execute",
    DATA_PROFILE_REPORT: "/v1/data/profile-report",

    // 导出报告
    EXPORT_REPORT: "/v1/export/report",

    // 系统设置
    MODEL_LIST: "/v1/models",
    SETTINGS_HARDWARE: "/health",
    SETTINGS_DEFAULTS: "/health",

    // 用户列表
    USERS_LIST: "/v1/auth/users",

    // 上传到指定目录
    WORKSPACE_UPLOAD_TO: "/v1/files/upload-to",

    // 代码执行
    EXECUTE_CODE: "/v1/code/execute",

    // 过程指导
    CHAT_GUIDANCE: "/v1/chat/guidance",

    // 用户本地配置持久化
    CONFIG_MODELS_GET: "/v1/config/models",
    CONFIG_MODELS_SAVE: "/v1/config/models",
    CONFIG_MODELS_DELETE: "/v1/config/models",
    CONFIG_DATABASES_GET: "/v1/config/databases",
    CONFIG_DATABASES_SAVE: "/v1/config/databases",
    CONFIG_DATABASES_DELETE: "/v1/config/databases",
    CONFIG_KNOWLEDGE_GET: "/v1/config/knowledge",
    CONFIG_KNOWLEDGE_SAVE: "/v1/config/knowledge",
    CONFIG_DATA_DICTIONARY_GET: "/v1/config/data-dictionary",
    CONFIG_DATA_DICTIONARY_SAVE: "/v1/config/data-dictionary",
    CONFIG_DATA_DICTIONARY_DELETE: "/v1/config/data-dictionary",
    CONFIG_ANALYSIS_HISTORY_GET: "/v1/config/analysis-history",
    CONFIG_ANALYSIS_HISTORY_SAVE: "/v1/config/analysis-history",
    ANALYSIS_HISTORY_LIST: "/v1/analysis/history",

    // 知识库设置
    KB_SETTINGS_GET: "/v1/knowledge/settings",
    KB_SETTINGS_SAVE: "/v1/knowledge/settings",
    KB_TEST: "/v1/knowledge/test",

    // 项目文件恢复
    PROJECTS_RESTORE_FILES: "/v1/projects/restore-files",
    PROJECTS_RESTORE_TO_WORKSPACE: "/v1/projects/restore-to-workspace",

    // 知识库管理（Yutu 遗留接口）
    YUTU_HTML: "/v1/knowledge/yutu/html",
    YUTU_SEARCH: "/v1/knowledge/yutu/search",
    YUTU_ADD: "/v1/knowledge/yutu/add",
    YUTU_UPDATE: "/v1/knowledge/yutu/update",
    YUTU_DELETE: "/v1/knowledge/yutu/delete",
    YUTU_INIT: "/v1/knowledge/yutu/init",
    YUTU_ORGANIZE: "/v1/knowledge/yutu/organize",
    YUTU_ORGANIZE_CONFIRM: "/v1/knowledge/yutu/organize-confirm",
    YUTU_BACKUP_CREATE: "/v1/knowledge/yutu/backup-create",
    YUTU_BACKUP_DELETE: "/v1/knowledge/yutu/backup-delete",
    YUTU_BACKUP_LIST: "/v1/knowledge/yutu/backup-list",
    YUTU_BACKUP_RESTORE: "/v1/knowledge/yutu/backup-restore",
  },
};

// 构建完整的API URL
export const buildApiUrl = (
  endpoint: string,
  baseUrl: string = API_CONFIG.BACKEND_BASE_URL
) => {
  return `${baseUrl}${endpoint}`;
};

// 预定义的API URLs
export const API_URLS = {
  // 聊天
  CHAT_COMPLETIONS: buildApiUrl(API_CONFIG.ENDPOINTS.CHAT_COMPLETIONS),

  // 文件管理
  WORKSPACE_FILES: buildApiUrl(API_CONFIG.ENDPOINTS.WORKSPACE_FILES),
  WORKSPACE_UPLOAD: buildApiUrl(API_CONFIG.ENDPOINTS.WORKSPACE_UPLOAD),
  WORKSPACE_DELETE_FILE: buildApiUrl(API_CONFIG.ENDPOINTS.WORKSPACE_DELETE_FILE),

  // 认证
  AUTH_REGISTER: buildApiUrl(API_CONFIG.ENDPOINTS.AUTH_REGISTER),
  AUTH_LOGIN: buildApiUrl(API_CONFIG.ENDPOINTS.AUTH_LOGIN),

  // 项目管理
  PROJECTS_SAVE: buildApiUrl(API_CONFIG.ENDPOINTS.PROJECTS_SAVE),
  PROJECTS_LIST: buildApiUrl(API_CONFIG.ENDPOINTS.PROJECTS_LIST),
  PROJECTS_LOAD: buildApiUrl(API_CONFIG.ENDPOINTS.PROJECTS_LOAD),
  PROJECTS_DELETE: buildApiUrl(API_CONFIG.ENDPOINTS.PROJECTS_DELETE),
  PROJECTS_CHECK_NAME: buildApiUrl(API_CONFIG.ENDPOINTS.PROJECTS_CHECK_NAME),

  // 知识库
  KNOWLEDGE_ENTRIES: buildApiUrl(API_CONFIG.ENDPOINTS.KNOWLEDGE_ENTRIES),
  KNOWLEDGE_SEARCH: buildApiUrl(API_CONFIG.ENDPOINTS.KNOWLEDGE_SEARCH),

  // 数据库
  DB_TEST: buildApiUrl(API_CONFIG.ENDPOINTS.DB_TEST),
  DB_LIST: buildApiUrl(API_CONFIG.ENDPOINTS.DB_LIST),
  DB_CONTEXT_LOAD: buildApiUrl(API_CONFIG.ENDPOINTS.DB_CONTEXT_LOAD),
  DB_SCHEMA_GRAPH: buildApiUrl(API_CONFIG.ENDPOINTS.DB_SCHEMA_GRAPH),
  DB_GENERATE_SQL: buildApiUrl(API_CONFIG.ENDPOINTS.DB_GENERATE_SQL),
  DB_EXECUTE: buildApiUrl(API_CONFIG.ENDPOINTS.DB_EXECUTE),
  DATA_PROFILE_REPORT: buildApiUrl(API_CONFIG.ENDPOINTS.DATA_PROFILE_REPORT),

  // 导出
  EXPORT_REPORT: buildApiUrl(API_CONFIG.ENDPOINTS.EXPORT_REPORT),

  // 系统
  MODEL_LIST: buildApiUrl(API_CONFIG.ENDPOINTS.MODEL_LIST),

  // 用户列表
  USERS_LIST: buildApiUrl(API_CONFIG.ENDPOINTS.USERS_LIST),

  // 项目文件恢复
  PROJECTS_RESTORE_FILES: buildApiUrl(API_CONFIG.ENDPOINTS.PROJECTS_RESTORE_FILES),
  PROJECTS_RESTORE_TO_WORKSPACE: buildApiUrl(API_CONFIG.ENDPOINTS.PROJECTS_RESTORE_TO_WORKSPACE),

  // 工作区
  WORKSPACE_TREE: buildApiUrl(API_CONFIG.ENDPOINTS.WORKSPACE_TREE),
  WORKSPACE_CLEAR: buildApiUrl(API_CONFIG.ENDPOINTS.WORKSPACE_CLEAR),
  WORKSPACE_DELETE_DIR: buildApiUrl(API_CONFIG.ENDPOINTS.WORKSPACE_DELETE_DIR),

  // 知识库管理（Yutu 遗留接口）
  YUTU_HTML: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_HTML),
  YUTU_SEARCH: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_SEARCH),
  YUTU_ADD: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_ADD),
  YUTU_UPDATE: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_UPDATE),
  YUTU_DELETE: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_DELETE),
  YUTU_INIT: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_INIT),
  YUTU_ORGANIZE: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_ORGANIZE),
  YUTU_ORGANIZE_CONFIRM: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_ORGANIZE_CONFIRM),
  YUTU_BACKUP_CREATE: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_BACKUP_CREATE),
  YUTU_BACKUP_DELETE: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_BACKUP_DELETE),
  YUTU_BACKUP_LIST: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_BACKUP_LIST),
  YUTU_BACKUP_RESTORE: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_BACKUP_RESTORE),

  // 上传到指定目录
  WORKSPACE_UPLOAD_TO: buildApiUrl(API_CONFIG.ENDPOINTS.WORKSPACE_UPLOAD_TO),

  // 代码执行
  EXECUTE_CODE: buildApiUrl(API_CONFIG.ENDPOINTS.EXECUTE_CODE),

  // 过程指导
  CHAT_GUIDANCE: buildApiUrl(API_CONFIG.ENDPOINTS.CHAT_GUIDANCE),

  // 用户本地配置持久化
  CONFIG_MODELS_GET: buildApiUrl(API_CONFIG.ENDPOINTS.CONFIG_MODELS_GET),
  CONFIG_MODELS_SAVE: buildApiUrl(API_CONFIG.ENDPOINTS.CONFIG_MODELS_SAVE),
  CONFIG_MODELS_DELETE: buildApiUrl(API_CONFIG.ENDPOINTS.CONFIG_MODELS_DELETE),
  CONFIG_DATABASES_GET: buildApiUrl(API_CONFIG.ENDPOINTS.CONFIG_DATABASES_GET),
  CONFIG_DATABASES_SAVE: buildApiUrl(API_CONFIG.ENDPOINTS.CONFIG_DATABASES_SAVE),
  CONFIG_DATABASES_DELETE: buildApiUrl(API_CONFIG.ENDPOINTS.CONFIG_DATABASES_DELETE),
  CONFIG_KNOWLEDGE_GET: buildApiUrl(API_CONFIG.ENDPOINTS.CONFIG_KNOWLEDGE_GET),
  CONFIG_KNOWLEDGE_SAVE: buildApiUrl(API_CONFIG.ENDPOINTS.CONFIG_KNOWLEDGE_SAVE),
  CONFIG_DATA_DICTIONARY_GET: buildApiUrl(API_CONFIG.ENDPOINTS.CONFIG_DATA_DICTIONARY_GET),
  CONFIG_DATA_DICTIONARY_SAVE: buildApiUrl(API_CONFIG.ENDPOINTS.CONFIG_DATA_DICTIONARY_SAVE),
  CONFIG_DATA_DICTIONARY_DELETE: buildApiUrl(API_CONFIG.ENDPOINTS.CONFIG_DATA_DICTIONARY_DELETE),
  CONFIG_ANALYSIS_HISTORY_GET: buildApiUrl(API_CONFIG.ENDPOINTS.CONFIG_ANALYSIS_HISTORY_GET),
  CONFIG_ANALYSIS_HISTORY_SAVE: buildApiUrl(API_CONFIG.ENDPOINTS.CONFIG_ANALYSIS_HISTORY_SAVE),
  ANALYSIS_HISTORY_LIST: buildApiUrl(API_CONFIG.ENDPOINTS.ANALYSIS_HISTORY_LIST),

  // 知识库设置
  KB_SETTINGS_GET: buildApiUrl(API_CONFIG.ENDPOINTS.KB_SETTINGS_GET),
  KB_SETTINGS_SAVE: buildApiUrl(API_CONFIG.ENDPOINTS.KB_SETTINGS_SAVE),
  KB_TEST: buildApiUrl(API_CONFIG.ENDPOINTS.KB_TEST),
};
