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

export const MODEL_PROVIDER_PRESETS: ModelProviderConfig[] = [
  {
    id: "deepanalyze-default",
    providerType: "deepanalyze",
    label: "DeepAnalyze 默认",
    description: "项目默认本地 vLLM 服务",
    baseUrl: process.env.NEXT_PUBLIC_AI_API_URL || "http://localhost:8000/v1",
    model: "DeepAnalyze-8B",
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

  // API端点
  ENDPOINTS: {
    // 聊天
    CHAT_COMPLETIONS: "/chat/completions",
    CHAT_GUIDANCE: "/api/chat/guidance",

    // 文件管理
    WORKSPACE_FILES: "/workspace/files",
    WORKSPACE_TREE: "/workspace/tree",
    WORKSPACE_UPLOAD: "/workspace/upload",
    WORKSPACE_CLEAR: "/workspace/clear",
    WORKSPACE_DELETE_FILE: "/workspace/file",
    WORKSPACE_UPLOAD_TO: "/workspace/upload-to",
    WORKSPACE_DELETE_DIR: "/workspace/dir",

    // 认证
    AUTH_REGISTER: "/api/auth/register",
    AUTH_LOGIN: "/api/auth/login",

    // 项目管理
    PROJECTS_SAVE: "/api/projects/save",
    PROJECTS_LIST: "/api/projects/list",
    PROJECTS_LOAD: "/api/projects/load",
    PROJECTS_DELETE: "/api/projects/delete",
    PROJECTS_CHECK_NAME: "/api/projects/check-name",
    PROJECTS_RESTORE_FILES: "/api/projects/restore-files",
    PROJECTS_RESTORE_TO_WORKSPACE: "/api/projects/restore-to-workspace",

    // 用户管理
    USERS_LIST: "/api/users/list",

    // 代码执行
    EXECUTE_CODE: "/execute",

    // 导出报告
    EXPORT_REPORT: "/export/report",

    // 雨途斩疑录
    YUTU_HTML: "/api/yutu/html",
    YUTU_ADD: "/api/yutu/add",
    YUTU_UPDATE: "/api/yutu/update",
    YUTU_DELETE: "/api/yutu/delete",
    YUTU_SEARCH: "/api/yutu/search",
    YUTU_INIT: "/api/yutu/init",
    YUTU_BACKUP_CREATE: "/api/yutu/backup/create",
    YUTU_BACKUP_LIST: "/api/yutu/backup/list",
    YUTU_BACKUP_RESTORE: "/api/yutu/backup/restore",
    YUTU_BACKUP_DELETE: "/api/yutu/backup/delete",

    // 知识库
    KB_SETTINGS_GET: "/api/kb/settings",
    KB_SETTINGS_SAVE: "/api/kb/settings",
    KB_TEST: "/api/kb/test",

    // 数据库连接
    DB_TEST: "/api/db/test",
    DB_GENERATE_SQL: "/api/db/generate-sql",
    DB_EXECUTE: "/api/db/execute",
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
  // 后端服务
  WORKSPACE_FILES: buildApiUrl(API_CONFIG.ENDPOINTS.WORKSPACE_FILES),
  WORKSPACE_TREE: buildApiUrl(API_CONFIG.ENDPOINTS.WORKSPACE_TREE),
  WORKSPACE_UPLOAD: buildApiUrl(API_CONFIG.ENDPOINTS.WORKSPACE_UPLOAD),
  WORKSPACE_CLEAR: buildApiUrl(API_CONFIG.ENDPOINTS.WORKSPACE_CLEAR),
  WORKSPACE_DELETE_FILE: buildApiUrl(
    API_CONFIG.ENDPOINTS.WORKSPACE_DELETE_FILE
  ),
  WORKSPACE_UPLOAD_TO: buildApiUrl(API_CONFIG.ENDPOINTS.WORKSPACE_UPLOAD_TO),
  WORKSPACE_DELETE_DIR: buildApiUrl(API_CONFIG.ENDPOINTS.WORKSPACE_DELETE_DIR),
  EXECUTE_CODE: buildApiUrl(API_CONFIG.ENDPOINTS.EXECUTE_CODE),
  EXPORT_REPORT: buildApiUrl(API_CONFIG.ENDPOINTS.EXPORT_REPORT),

  // 雨途斩疑录
  YUTU_HTML: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_HTML),
  YUTU_ADD: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_ADD),
  YUTU_UPDATE: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_UPDATE),
  YUTU_DELETE: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_DELETE),
  YUTU_SEARCH: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_SEARCH),
  YUTU_INIT: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_INIT),
  YUTU_BACKUP_CREATE: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_BACKUP_CREATE),
  YUTU_BACKUP_LIST: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_BACKUP_LIST),
  YUTU_BACKUP_RESTORE: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_BACKUP_RESTORE),
  YUTU_BACKUP_DELETE: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_BACKUP_DELETE),

  // 知识库
  KB_SETTINGS_GET: buildApiUrl(API_CONFIG.ENDPOINTS.KB_SETTINGS_GET),
  KB_SETTINGS_SAVE: buildApiUrl(API_CONFIG.ENDPOINTS.KB_SETTINGS_SAVE),
  KB_TEST: buildApiUrl(API_CONFIG.ENDPOINTS.KB_TEST),

  // 数据库连接
  DB_TEST: buildApiUrl(API_CONFIG.ENDPOINTS.DB_TEST),
  DB_GENERATE_SQL: buildApiUrl(API_CONFIG.ENDPOINTS.DB_GENERATE_SQL),
  DB_EXECUTE: buildApiUrl(API_CONFIG.ENDPOINTS.DB_EXECUTE),

  // 认证
  AUTH_REGISTER: buildApiUrl(API_CONFIG.ENDPOINTS.AUTH_REGISTER),
  AUTH_LOGIN: buildApiUrl(API_CONFIG.ENDPOINTS.AUTH_LOGIN),

  // 项目管理
  PROJECTS_SAVE: buildApiUrl(API_CONFIG.ENDPOINTS.PROJECTS_SAVE),
  PROJECTS_LIST: buildApiUrl(API_CONFIG.ENDPOINTS.PROJECTS_LIST),
  PROJECTS_LOAD: buildApiUrl(API_CONFIG.ENDPOINTS.PROJECTS_LOAD),
  PROJECTS_DELETE: buildApiUrl(API_CONFIG.ENDPOINTS.PROJECTS_DELETE),
  PROJECTS_CHECK_NAME: buildApiUrl(API_CONFIG.ENDPOINTS.PROJECTS_CHECK_NAME),
  PROJECTS_RESTORE_FILES: buildApiUrl(API_CONFIG.ENDPOINTS.PROJECTS_RESTORE_FILES),
  PROJECTS_RESTORE_TO_WORKSPACE: buildApiUrl(API_CONFIG.ENDPOINTS.PROJECTS_RESTORE_TO_WORKSPACE),

  // 用户管理
  USERS_LIST: buildApiUrl(API_CONFIG.ENDPOINTS.USERS_LIST),

  // AI服务
  CHAT_COMPLETIONS: buildApiUrl(API_CONFIG.ENDPOINTS.CHAT_COMPLETIONS),
  CHAT_GUIDANCE: buildApiUrl(API_CONFIG.ENDPOINTS.CHAT_GUIDANCE),
};