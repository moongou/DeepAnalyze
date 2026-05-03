"""
Data models for DeepAnalyze API Server
Contains all Pydantic models for OpenAI compatibility
"""

from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field


class FileObject(BaseModel):
    """OpenAI File Object"""
    id: str
    object: Literal["file"] = "file"
    bytes: int
    created_at: int
    filename: str
    purpose: str


class FileDeleteResponse(BaseModel):
    """OpenAI File Delete Response"""
    id: str
    object: Literal["file"] = "file"
    deleted: bool




class ThreadObject(BaseModel):
    """OpenAI Thread Object"""
    id: str
    object: Literal["thread"] = "thread"
    created_at: int
    last_accessed_at: int
    metadata: Dict[str, Any] = Field(default_factory=dict)
    file_ids: List[str] = Field(default_factory=list)
    tool_resources: Optional[Dict[str, Any]] = Field(default=None)


class MessageObject(BaseModel):
    """OpenAI Message Object"""
    id: str
    object: Literal["thread.message"] = "thread.message"
    created_at: int
    thread_id: str
    role: Literal["user", "assistant"]
    content: List[Dict[str, Any]]
    file_ids: List[str] = Field(default_factory=list)
    assistant_id: Optional[str] = None
    run_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ChatCompletionRequest(BaseModel):
    """Chat completion request model"""
    model: str
    messages: List[Dict[str, Any]]
    file_ids: Optional[List[str]] = Field(default=None)
    temperature: Optional[float] = Field(0.4)
    stream: Optional[bool] = Field(False)


class FileInfo(BaseModel):
    """File information model for OpenAI compatibility"""
    filename: str
    url: str


class ChatCompletionChoice(BaseModel):
    """Chat completion choice model"""
    index: int
    message: Dict[str, Any]
    finish_reason: Optional[str] = None


class ChatCompletionResponse(BaseModel):
    """Chat completion response model"""
    id: str
    object: Literal["chat.completion"] = "chat.completion"
    created: int
    model: str
    choices: List[ChatCompletionChoice]
    generated_files: Optional[List[Dict[str, str]]] = Field(default=None)
    attached_files: Optional[List[str]] = Field(default=None)


class ChatCompletionChunk(BaseModel):
    """Chat completion streaming chunk model"""
    id: str
    object: Literal["chat.completion.chunk"] = "chat.completion.chunk"
    created: int
    model: str
    choices: List[Dict[str, Any]]
    generated_files: Optional[List[Dict[str, str]]] = Field(default=None)


class HealthResponse(BaseModel):
    """Health check response model"""
    status: str
    timestamp: int


class ThreadCleanupRequest(BaseModel):
    """Thread cleanup request model"""
    timeout_hours: int = Field(12, description="Timeout in hours for thread cleanup")


class ThreadCleanupResponse(BaseModel):
    """Thread cleanup response model"""
    status: str
    cleaned_threads: int
    timeout_hours: int
    timestamp: int


class ThreadStatsResponse(BaseModel):
    """Thread statistics response model"""
    total_threads: int
    recent_threads: int  # < 1 hour
    old_threads: int     # 1-12 hours
    expired_threads: int # > 12 hours
    timeout_hours: int
    timestamp: int


class ModelObject(BaseModel):
    """OpenAI Model Object"""
    id: str
    object: Literal["model"] = "model"
    created: Optional[int] = None
    owned_by: Optional[str] = None


class ModelsListResponse(BaseModel):
    """OpenAI Models List Response"""
    object: Literal["list"] = "list"
    data: List[ModelObject]


class AnalyticsDatasetRegisterRequest(BaseModel):
    """Dataset registration request for analytics pipeline"""
    name: str = Field(..., min_length=1, max_length=128)
    source_type: Literal["local_path", "uploaded_file"]
    path: Optional[str] = None
    file_id: Optional[str] = None
    format: Optional[Literal["csv", "excel", "json", "parquet"]] = None
    description: Optional[str] = Field(default="")
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AnalyticsDatasetObject(BaseModel):
    """Dataset metadata object"""
    id: str
    name: str
    source_type: Literal["local_path", "uploaded_file"]
    path: Optional[str] = None
    file_id: Optional[str] = None
    format: Literal["csv", "excel", "json", "parquet"]
    status: Literal["ready", "invalid"] = "ready"
    row_count: Optional[int] = None
    column_count: Optional[int] = None
    description: Optional[str] = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: int
    updated_at: int


class AnalyticsDatasetsListResponse(BaseModel):
    """Datasets list response"""
    object: Literal["list"] = "list"
    data: List[AnalyticsDatasetObject]


class AnalyticsJobRunRequest(BaseModel):
    """Analysis job request"""
    dataset_id: str
    depth: Literal["shallow", "standard", "deep"] = "standard"
    group_by: List[str] = Field(default_factory=list)
    time_column: Optional[str] = None
    target_column: Optional[str] = None
    top_n_categories: int = Field(default=10, ge=3, le=30)


class AnalyticsJobObject(BaseModel):
    """Analysis job metadata and output"""
    id: str
    dataset_id: str
    depth: Literal["shallow", "standard", "deep"]
    status: Literal["queued", "running", "completed", "failed"]
    created_at: int
    finished_at: Optional[int] = None
    error: Optional[str] = None
    result: Dict[str, Any] = Field(default_factory=dict)


class AnalyticsJobsListResponse(BaseModel):
    """Analysis jobs list response"""
    object: Literal["list"] = "list"
    data: List[AnalyticsJobObject]


class ModelProviderUpsertRequest(BaseModel):
    """Provider upsert request for model gateway"""
    id: str
    name: Optional[str] = None
    type: Literal["openai_compatible"] = "openai_compatible"
    base_url: str
    api_key: Optional[str] = ""
    api_key_env: Optional[str] = ""
    enabled: bool = True
    is_default: bool = False
    extra_headers: Dict[str, str] = Field(default_factory=dict)


class ModelProviderObject(BaseModel):
    """Model provider object"""
    id: str
    name: str
    type: Literal["openai_compatible"]
    base_url: str
    api_key: str = ""
    api_key_env: str = ""
    enabled: bool
    is_default: bool
    extra_headers: Dict[str, str] = Field(default_factory=dict)


class ModelProvidersListResponse(BaseModel):
    """Model providers list response"""
    object: Literal["list"] = "list"
    data: List[ModelProviderObject]


class ModelCatalogUpsertRequest(BaseModel):
    """Model catalog upsert request"""
    id: str
    provider_id: str
    provider_model: Optional[str] = None
    description: Optional[str] = ""
    enabled: bool = True


class ModelCatalogObject(BaseModel):
    """Model catalog object"""
    id: str
    provider_id: str
    provider_model: str
    description: Optional[str] = ""
    enabled: bool = True


class ModelCatalogListResponse(BaseModel):
    """Model catalog list response"""
    object: Literal["list"] = "list"
    data: List[ModelCatalogObject]


class SkillManifestObject(BaseModel):
    """Marketplace skill manifest object."""
    id: str
    name: str
    version: str
    publisher: str = "community"
    description: str = ""
    runtime: Literal["python", "http", "workflow"] = "python"
    entrypoint: str = ""
    permissions: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    directory: str = "general"
    compatibility: str = "通用"
    install_commands: Dict[str, str] = Field(default_factory=dict)
    requires: List[str] = Field(default_factory=list)
    benchmark: bool = False
    security_scan: str = ""
    homepage: str = ""
    source: str = "local"
    config_schema: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    created_at: int
    updated_at: int


class SkillRegisterRequest(BaseModel):
    """Register a skill manifest from payload or URL."""
    manifest: Optional[Dict[str, Any]] = None
    manifest_url: Optional[str] = None


class SkillsListResponse(BaseModel):
    """Marketplace skills list response."""
    object: Literal["list"] = "list"
    data: List[SkillManifestObject]


class SkillDirectoryObject(BaseModel):
    """Marketplace skill directory group object."""
    directory: str
    count: int
    featured_count: int = 0
    description: str = ""


class SkillDirectoriesListResponse(BaseModel):
    """Marketplace skill directory list response."""
    object: Literal["list"] = "list"
    data: List[SkillDirectoryObject]


class SkillInstallRequest(BaseModel):
    """Install request for one skill."""
    skill_id: str
    version: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    permission_scopes: Dict[str, Any] = Field(default_factory=dict)
    trace_id: str = ""
    approve_high_risk_permissions: bool = False


class SkillQuickLoadRequest(BaseModel):
    """One-click load request for one skill."""
    config: Dict[str, Any] = Field(default_factory=dict)
    permission_scopes: Dict[str, Any] = Field(default_factory=dict)
    trace_id: str = ""
    approve_high_risk_permissions: bool = False


class SkillInstallPolicyCheckRequest(BaseModel):
    """Policy preflight check request before install."""
    skill_id: str
    config: Dict[str, Any] = Field(default_factory=dict)
    permission_scopes: Dict[str, Any] = Field(default_factory=dict)
    trace_id: str = ""
    approve_high_risk_permissions: bool = False


class SkillRunPolicyCheckRequest(BaseModel):
    """Policy preflight check request before run."""
    skill_id: str
    context: Dict[str, Any] = Field(default_factory=dict)
    trace_id: str = ""


class SkillPolicyDecisionObject(BaseModel):
    """Policy decision object for install/run governance."""
    id: str
    action: Literal["install", "run"]
    skill_id: str
    effect: Literal["allow", "approval_required", "deny"]
    risk_level: Literal["low", "medium", "high"] = "low"
    reasons: List[str] = Field(default_factory=list)
    required_permissions: List[str] = Field(default_factory=list)
    missing_requirements: List[str] = Field(default_factory=list)
    policy_version: str = "2026-04-platform-v1"
    trace_id: str = ""
    context: Dict[str, Any] = Field(default_factory=dict)
    created_at: int


class SkillPolicyDecisionsListResponse(BaseModel):
    """Policy decisions list response."""
    object: Literal["list"] = "list"
    data: List[SkillPolicyDecisionObject]


class SkillPermissionRuleObject(BaseModel):
    """Fine-grained permission rule object (action/resource/scope/ttl)."""
    permission: str
    action: str
    resource: str
    scope: Dict[str, Any] = Field(default_factory=dict)
    constraints: Dict[str, Any] = Field(default_factory=dict)
    ttl_sec: int = 0
    issued_at: int
    expires_at: Optional[int] = None


class SkillInstallObject(BaseModel):
    """Installed skill object."""
    skill_id: str
    version: str
    status: Literal["installed", "disabled", "pending_approval"] = "installed"
    config: Dict[str, Any] = Field(default_factory=dict)
    permissions_granted: List[str] = Field(default_factory=list)
    permission_scopes: Dict[str, Any] = Field(default_factory=dict)
    permission_rules: List[SkillPermissionRuleObject] = Field(default_factory=list)
    policy_decision_id: Optional[str] = None
    policy_effect: Optional[Literal["allow", "approval_required", "deny"]] = None
    trace_id: str = ""
    installed_at: int
    updated_at: int


class InstalledSkillsListResponse(BaseModel):
    """Installed skills list response."""
    object: Literal["list"] = "list"
    data: List[SkillInstallObject]


class SkillRunRequest(BaseModel):
    """Run one installed skill with execution context."""
    skill_id: str
    context: Dict[str, Any] = Field(default_factory=dict)
    trace_id: str = ""


class SkillRunObject(BaseModel):
    """Skill runtime execution object."""
    id: str
    skill_id: str
    runtime: Literal["python", "http", "workflow"] = "python"
    status: Literal["running", "completed", "failed"] = "running"
    context: Dict[str, Any] = Field(default_factory=dict)
    output: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)
    workflow_id: Optional[str] = None
    step_id: Optional[str] = None
    policy_decision_id: Optional[str] = None
    trace_id: str = ""
    started_at: Optional[int] = None
    finished_at: Optional[int] = None
    created_at: int
    updated_at: int


class SkillRunsListResponse(BaseModel):
    """Skill run list response."""
    object: Literal["list"] = "list"
    data: List[SkillRunObject]


class AnalysisWorkflowStepObject(BaseModel):
    """One workflow step in plan-confirm-execute flow."""
    id: str
    title: str
    description: str
    skill_id: Optional[str] = None
    risk_level: Literal["low", "medium", "high"] = "low"
    required_permissions: List[str] = Field(default_factory=list)
    status: Literal[
        "pending",
        "approved",
        "rejected",
        "awaiting_secondary_confirmation",
        "executed",
        "failed",
        "skipped",
    ] = "pending"


class AnalysisWorkflowObject(BaseModel):
    """Full workflow object for user-confirmed analytics flow."""
    id: str
    objective: str
    dataset_id: Optional[str] = None
    preferred_depth: Literal["shallow", "standard", "deep"] = "standard"
    status: Literal[
        "draft",
        "awaiting_confirmation",
        "confirmed",
        "running",
        "paused_for_confirmation",
        "completed",
        "failed",
        "cancelled",
    ]
    steps: List[AnalysisWorkflowStepObject] = Field(default_factory=list)
    selected_skills: List[str] = Field(default_factory=list)
    constraints: Dict[str, Any] = Field(default_factory=dict)
    estimated_duration_sec: int = 0
    estimated_cost_usd: float = 0.0
    execution_log: List[Dict[str, Any]] = Field(default_factory=list)
    result: Dict[str, Any] = Field(default_factory=dict)
    trace_id: str = ""
    created_at: int
    updated_at: int


class AnalysisWorkflowPlanRequest(BaseModel):
    """Create a workflow plan before execution."""
    objective: str
    dataset_id: Optional[str] = None
    preferred_depth: Literal["shallow", "standard", "deep"] = "standard"
    constraints: Dict[str, Any] = Field(default_factory=dict)
    selected_skills: List[str] = Field(default_factory=list)
    trace_id: str = ""


class AnalysisWorkflowConfirmRequest(BaseModel):
    """Confirm or partially approve a generated workflow."""
    approve_all: bool = True
    approved_step_ids: List[str] = Field(default_factory=list)
    rejected_step_ids: List[str] = Field(default_factory=list)
    notes: str = ""
    trace_id: str = ""


class AnalysisWorkflowStepConfirmRequest(BaseModel):
    """Approve one paused high-risk step for execution."""
    step_id: str
    notes: str = ""
    trace_id: str = ""


class AnalysisWorkflowExecuteRequest(BaseModel):
    """Execute a confirmed workflow."""
    continue_on_step_error: bool = False
    resume_from_step_id: Optional[str] = None
    trace_id: str = ""


class AnalysisWorkflowsListResponse(BaseModel):
    """Workflow list response."""
    object: Literal["list"] = "list"
    data: List[AnalysisWorkflowObject]


class GovernanceMetricCheckObject(BaseModel):
    """One metric check result for governance evaluation."""
    metric: str
    comparator: str
    expected: float
    actual: Optional[float] = None
    passed: bool = False
    note: str = ""


class OfflineEvaluationThresholdsObject(BaseModel):
    """Thresholds for offline evaluation baseline."""
    accuracy_min: float = 0.75
    p95_latency_ms_max: float = 5000.0
    cost_per_request_usd_max: float = 0.05
    stability_min: float = 0.90


class OfflineEvaluationObservedMetricsObject(BaseModel):
    """Observed metrics provided by caller or derived from runtime records."""
    accuracy: Optional[float] = None
    p95_latency_ms: Optional[float] = None
    cost_per_request_usd: Optional[float] = None
    stability: Optional[float] = None
    sample_count: int = 0


class OfflineEvaluationRunRequest(BaseModel):
    """Run one offline baseline evaluation."""
    candidate_id: str
    candidate_type: Literal["skill", "model", "workflow", "system"] = "skill"
    baseline_reference: str = ""
    window_hours: int = Field(default=24, ge=1, le=24 * 30)
    sample_size: int = Field(default=200, ge=1, le=5000)
    thresholds: OfflineEvaluationThresholdsObject = Field(default_factory=OfflineEvaluationThresholdsObject)
    observed_metrics: Optional[OfflineEvaluationObservedMetricsObject] = None
    notes: str = ""
    trace_id: str = ""


class OfflineEvaluationObject(BaseModel):
    """Offline baseline evaluation object."""
    id: str
    candidate_id: str
    candidate_type: Literal["skill", "model", "workflow", "system"]
    status: Literal["passed", "failed", "insufficient_data"]
    thresholds: OfflineEvaluationThresholdsObject
    observed_metrics: OfflineEvaluationObservedMetricsObject
    checks: List[GovernanceMetricCheckObject] = Field(default_factory=list)
    summary: str = ""
    baseline_reference: str = ""
    notes: str = ""
    trace_id: str = ""
    created_at: int


class OfflineEvaluationsListResponse(BaseModel):
    """Offline evaluations list response."""
    object: Literal["list"] = "list"
    data: List[OfflineEvaluationObject]


class OnlineMetricsObject(BaseModel):
    """Online runtime metrics object for governance checks."""
    candidate_id: str
    candidate_type: Literal["skill", "model", "workflow", "system"]
    window_hours: int
    sample_count: int
    request_count: int
    success_rate: float
    failure_rate: float
    p95_latency_ms: float
    deny_rate: float
    retry_rate: float
    avg_cost_per_request_usd: float
    generated_at: int
    data_source: str = "skill_runs+policy_decisions"


class ReleaseGateThresholdsObject(BaseModel):
    """Online thresholds for release gate decision."""
    success_rate_min: float = 0.95
    p95_latency_ms_max: float = 5000.0
    deny_rate_max: float = 0.20
    retry_rate_max: float = 0.10


class ReleaseGateEvaluateRequest(BaseModel):
    """Evaluate release gate using offline + online criteria."""
    candidate_id: str
    candidate_type: Literal["skill", "model", "workflow", "system"] = "skill"
    offline_eval_id: Optional[str] = None
    required_offline_status: Literal["passed"] = "passed"
    window_hours: int = Field(default=24, ge=1, le=24 * 30)
    online_thresholds: ReleaseGateThresholdsObject = Field(default_factory=ReleaseGateThresholdsObject)
    release_strategy: Literal["canary", "full", "block"] = "canary"
    notes: str = ""
    trace_id: str = ""


class ReleaseGateDecisionObject(BaseModel):
    """Release gate decision object."""
    id: str
    candidate_id: str
    candidate_type: Literal["skill", "model", "workflow", "system"]
    offline_eval_id: Optional[str] = None
    offline_status: str = ""
    online_metrics: OnlineMetricsObject
    thresholds: ReleaseGateThresholdsObject
    checks: List[GovernanceMetricCheckObject] = Field(default_factory=list)
    decision: Literal["approved", "canary", "blocked"]
    recommended_action: Literal["full_release", "canary_release", "hold", "rollback"]
    rollback_recommended: bool = False
    reason: str = ""
    notes: str = ""
    trace_id: str = ""
    created_at: int


class ReleaseGateDecisionsListResponse(BaseModel):
    """Release gate decision list response."""
    object: Literal["list"] = "list"
    data: List[ReleaseGateDecisionObject]


# --- Auth Models ---

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class ApiKeyCreateRequest(BaseModel):
    label: str = Field(default="default", max_length=64)


class ApiKeyObject(BaseModel):
    id: str
    key_prefix: str
    label: str
    created_at: int


class ApiKeysListResponse(BaseModel):
    object: Literal["list"] = "list"
    data: List[ApiKeyObject]


# --- Project Models ---

class ProjectSaveRequest(BaseModel):
    session_id: str
    name: str = Field(..., max_length=128)
    messages_json: str = "[]"
    files_data_json: str = "{}"
    side_tasks_json: str = "{}"


class ProjectObject(BaseModel):
    id: str
    username: str
    session_id: str
    name: str
    created_at: int


class ProjectsListResponse(BaseModel):
    object: Literal["list"] = "list"
    data: List[ProjectObject]


# --- Knowledge Base Models ---

class KnowledgeEntryAddRequest(BaseModel):
    error_type: str
    error_message: str
    solution: str = ""
    code_context: str = ""
    tags: str = ""


class KnowledgeEntryUpdateRequest(BaseModel):
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    solution: Optional[str] = None
    code_context: Optional[str] = None
    tags: Optional[str] = None


class KnowledgeEntryObject(BaseModel):
    id: int
    error_type: str
    error_message: str
    solution: str
    code_context: str
    tags: str
    created_at: int
    updated_at: int
    verified_count: int


class KnowledgeSearchRequest(BaseModel):
    keyword: str


class KnowledgeEntriesListResponse(BaseModel):
    object: Literal["list"] = "list"
    data: List[KnowledgeEntryObject]


# --- Database Connectivity Models ---

class DatabaseTestRequest(BaseModel):
    db_type: str
    host: str
    port: int
    user: str
    password: str = ""
    database: str


class DatabaseSqlGenerateRequest(BaseModel):
    db_type: str
    schema_info: str
    question: str


class DatabaseExecuteRequest(BaseModel):
    db_type: str
    host: str
    port: int
    user: str
    password: str = ""
    database: str
    sql: str


# --- Export Models ---

class ExportReportRequest(BaseModel):
    messages: List[Dict[str, Any]]
    workspace_dir: str
    format: Literal["md", "pdf", "docx", "pptx"] = "md"


class ExportReportResponse(BaseModel):
    file_url: str
    filename: str
    format: str


# --- Settings Models ---

class SettingsObject(BaseModel):
    hardware: str = "mlx"
    defaults: Dict[str, Any] = Field(default_factory=dict)


class KnowledgeBaseSettingsRequest(BaseModel):
    onyx_base_url: str = ""
    onyx_api_key: str = ""
    dify_base_url: str = ""
    dify_api_key: str = ""