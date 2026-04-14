// API配置
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
    YUTU_ORGANIZE: "/api/yutu/organize",
    YUTU_ORGANIZE_CONFIRM: "/api/yutu/organize/confirm",
    YUTU_ORGANIZE_CANCEL: "/api/yutu/organize/cancel",
    YUTU_BACKUP_CREATE: "/api/yutu/backup/create",
    YUTU_BACKUP_LIST: "/api/yutu/backup/list",
    YUTU_BACKUP_RESTORE: "/api/yutu/backup/restore",
    YUTU_BACKUP_DELETE: "/api/yutu/backup/delete",

    // 数据库连接
    DB_TEST: "/api/db/test",
    DB_GENERATE_SQL: "/api/db/generate-sql",
    DB_EXECUTE: "/api/db/execute",

    // 系统设置
    SETTINGS_HARDWARE: "/api/settings/hardware",
    SETTINGS_DEFAULTS: "/api/settings/defaults",
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
  YUTU_ORGANIZE: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_ORGANIZE),
  YUTU_ORGANIZE_CONFIRM: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_ORGANIZE_CONFIRM),
  YUTU_ORGANIZE_CANCEL: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_ORGANIZE_CANCEL),
  YUTU_BACKUP_CREATE: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_BACKUP_CREATE),
  YUTU_BACKUP_LIST: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_BACKUP_LIST),
  YUTU_BACKUP_RESTORE: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_BACKUP_RESTORE),
  YUTU_BACKUP_DELETE: buildApiUrl(API_CONFIG.ENDPOINTS.YUTU_BACKUP_DELETE),

  // 数据库连接
  DB_TEST: buildApiUrl(API_CONFIG.ENDPOINTS.DB_TEST),
  DB_GENERATE_SQL: buildApiUrl(API_CONFIG.ENDPOINTS.DB_GENERATE_SQL),
  DB_EXECUTE: buildApiUrl(API_CONFIG.ENDPOINTS.DB_EXECUTE),

  // 系统设置
  SETTINGS_HARDWARE: buildApiUrl(API_CONFIG.ENDPOINTS.SETTINGS_HARDWARE),
  SETTINGS_DEFAULTS: buildApiUrl(API_CONFIG.ENDPOINTS.SETTINGS_DEFAULTS),

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