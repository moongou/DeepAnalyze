# Changelog

## v1.1.19 - 2026-05-07

### Fixed (v1.1.19)

- Fixed the landing-page report type and analysis language selectors so they open reliably by normalizing shared Radix trigger refs in the frontend dialog and button primitives.
- Fixed exported report bodies leaking fallback execution boilerplate, and now suppress server-side fallback wording from the final正文 output.
- Fixed the left workspace panel browsing experience by keeping vertical scrolling available while removing the frontend exposure of the internal converted directory.

### Changed (v1.1.19)

- Added csv, xlsx, and json data-dictionary import support across the settings dialog, frontend config routing, and backend data-dictionary import API.
- Reworked report writing and PDF export into a more formal Chinese government-document style structure, including "观雨出口 智能分析报告" branding, structured sections, and cleaner page headers and footers.
- Replaced the file tree below the upload area with four category cards for reports, charts, data results, and other materials, each opening a dedicated preview/download file list.

## v1.1.18 - 2026-05-06

### Changed (v1.1.18)

- Reworked the data-dictionary workflow from popup confirmation to asynchronous knowledge-base understanding. Analysis no longer stops to ask users to confirm field semantics mid-run.
- Updated the settings-page data-dictionary module into an AI-understanding knowledge base with data source, table, field, code explanation, and editable AI-understanding definitions.
- Frontend now stores AI-generated data-dictionary understanding directly into the local knowledge base and routes users to Settings > Data Dictionary for review and editing.
- Backend prompt assembly now instructs the model to use knowledge-base data-dictionary understanding as semantic ground truth and explicitly forbids interrupting analysis for DataDictionary confirmation.

## v1.1.17 - 2026-05-06

### Fixed (v1.1.17)

- Fixed critical data source consistency issue where users who did not select any database sources were still implicitly analyzed against a single configured database due to automatic fallback logic. Now both frontend and backend strictly honor user's explicit source selection without fallback.
- Fixed frontend data source file filtering to exclude hidden system metadata files (`.encoding_map.json`, `.venv/`, etc.) and only count genuine data files (CSV, TSV, JSON, JSONL, XLSX, Parquet, etc.) in left-panel source count display.
- Fixed frontend data source display area layout to match input box height (min-h-120px) for consistent visual alignment.

### Changed (v1.1.17)

- Removed unnecessary hint text "发送分析前请先确认数据库或文件数据源，避免分析过程无法落地。" from data source panel as it was redundant with UI constraints.
- Frontend data source selection now correctly prevents single-database implicit explicitness flag, ensuring `source_selection_explicit` is only set by explicit user confirmation.
- Backend database context injection and SQL-first prompt generation now only activate when user has explicitly selected at least one database source, not when merely configured without selection.

## v1.1.16 - 2026-05-06

### Added (v1.1.16)

- Added layered analysis-history presentation in demo/chat so recent runs can be inspected as grouped stage/round event clusters instead of a flat event wall.
- Added compatibility support in `demo/chat/agent_utils.py` for structured report-export calls using `report_content`, `output_filename`, and `output_dir`, while preserving the legacy Markdown export signatures.

### Changed (v1.1.16)

- Changed the runtime analysis sidebar to emphasize grouped process flow and live stage progression for the current session.
- Changed local MLX startup defaults in `start.sh` and `demo/chat/start.sh` to prefer the FP16 model directory when available.

### Fixed (v1.1.16)

- Fixed OpenAI-compatible follow-up rounds that could return repeated empty completions after code or SQL execution by normalizing internal `execute` history into user-facing continuation prompts before the next LLM request.
- Fixed generated artifact tracking so workspace helper symlinks such as `.lib/libRblas.dylib` no longer resolve into false downloadable outputs like `libR.dylib`.
- Fixed report-export TypeErrors during autonomous analysis when the model invoked `generate_report_pdf` with structured payload arguments instead of the legacy positional Markdown signature.

## v1.1.15 - 2026-05-05

### Added (v1.1.15)

- Added `scripts/ecs_enable_https_8420.sh` to automatically enable and maintain HTTPS ingress on `https://rainforgrain.top:8420`, proxying to the current effective DeepAnalyze API port on ECS.
- Added `scripts/deploy_ecs_with_https.sh` as a one-command wrapper that performs deployment and then runs HTTPS 8420 upgrade in sequence.

### Changed (v1.1.15)

- HTTPS upgrader now supports idempotent updates: it reuses marker blocks in nginx config, updates `proxy_pass` target when effective API port changes, and ensures `8420/tcp` firewall allowance.
- When `frps` still occupies 8420, upgrader stops/disables it before reloading nginx to guarantee TLS endpoint takeover.

## v1.1.14 - 2026-05-05

### Added (v1.1.14)

- Added ECS deployment automation scripts for one-command release from local workspace to remote host: `scripts/deploy_ecs.sh`, `scripts/ecs_service.sh`, and `scripts/deploy.ecs.env.example`.
- Added remote release flow with systemd service management (`deepanalyze-api`), shared virtual environment reuse, dependency installation, and post-deploy health check.
- Added deployment hardening for Linux servers by filtering platform-incompatible dependencies (`mlx*`, `rpy2*`) and ensuring auth runtime dependencies (`PyJWT`, `bcrypt`) are installed.

### Changed (v1.1.14)

- Deployment now supports automatic port conflict fallback when requested ports are occupied on ECS, and reports effective runtime API/file ports.
- Default remote deployment profile keeps the requested project port at `8420` while safely remapping internal bind ports when host conflicts exist.

## v1.1.13 - 2026-05-05

### Fixed (v1.1.13)

- Fixed "报告类型" and "语言" 选择器按钮在溢出受限的 Header 中被裁剪无法展开的问题，将原生绝对定位下拉菜单替换为基于 Radix UI Portal 的 Popover 组件。
- Fixed 三栏布局在分析发送后因高度未约束导致面板扩张崩坏的问题，为 ResizablePanelGroup 添加 `h-full min-h-0` 约束并移除 Header 的 `overflow-hidden`。
- Fixed 数据探查报告重复生成问题：前端检测工作区已有 `Data_Exploration_SKILL_*.md` 文件时提示复用；后端扫描 `generated/` 目录，已存在时以 `skipped: true` 提前返回。
- Fixed DatabaseRelationshipDialog 刷新按钮居中对齐。

### Changed (v1.1.13)

- `demo/chat/start.sh` 启动时自动清理前端 `.next` 缓存以防止构建产物损坏导致的服务启动失败，可通过环境变量 `DEEPANALYZE_FRONTEND_CLEAN_CACHE=0` 关闭。

## v1.1.12 - 2026-05-05

### Added (v1.1.12)

- Added a read-only database schema inspection endpoint at `/v1/database/schema`, returning table, column, primary-key, and foreign-key metadata for SQL-first planning without requiring users to hand-author schema context.
- Added `/v1/admin/cleanup-status` so operators can inspect periodic/manual thread cleanup health, last run time, error state, run count, and cleanup configuration.
- Added a shared API SQL safety module for single-statement read-only validation so database SQL generation and execution share the same policy boundary.

### Changed (v1.1.12)

- Refactored API database connection handling through shared engine construction while preserving driver-aware timeouts and special-character-safe SQLAlchemy URLs.

## v1.1.11 - 2026-05-05

### Fixed (v1.1.11)

- Fixed the API database SQL generation endpoint by using the model gateway synchronous client API instead of a missing client method.

### Changed (v1.1.11)

- Hardened the API database execution endpoint with single-statement read-only SQL validation, bounded result fetching, driver-aware connection timeouts, and SQLAlchemy URL construction for credentials containing special characters.
- Changed model gateway registry persistence to write through a temporary file and atomically replace the registry JSON, reducing partial-write risk during provider/model updates.
- Added periodic expired-thread cleanup on API server startup so temporary threads and workspaces are reclaimed without relying only on manual admin cleanup.

## v1.1.10 - 2026-05-05

### Added (v1.1.10)

- Added a SQL-first execution path for demo/chat analysis so connected database tasks can start with read-only SQL extraction before Python/R deep analysis.
- Added a safe SQL runner that accepts `<Code>```sql ...```</Code>` blocks, restricts execution to single-statement read-only queries, materializes returned rows to `workspace/generated/`, and records SQL execution events in analysis history.
- Added an R runner path for `<Code>```r ...```</Code>` blocks via `Rscript`, enabling statistical analysis steps alongside Python and SQL when the local R runtime is available.
- Added runtime analysis sidebar labels and stall thresholds for SQL取数 and R分析 stages.

### Changed (v1.1.10)

- Changed the agent runtime prompt to explicitly advertise Python/SQL/R executable blocks and require SQL-first extraction plans for non-trivial connected-database analysis tasks.

## v1.1.9 - 2026-05-05

### Added (v1.1.9)

- Added detailed per-session analysis history recording for demo/chat, including prompt assembly, round starts, LLM request/stream progress, code execution, report fallback, and final completion status, with persistent run/event storage for postmortem diagnosis.
- Added a new analysis history entry in system settings so users can configure logging granularity, browse recent analysis runs, and inspect step-by-step event details for robustness, performance, quality, and reasoning review.
- Added a runtime analysis-process sidebar in the main chat workspace so the current run's step events are visible during execution instead of only after opening system settings, with per-stage timing ranking plus stage-specific stall rules for LLM, code execution, database context loading, report assembly, and prompt preparation.

### Changed (v1.1.9)

- Changed the database relationship visualization entry name from “表关系可视化” to “数据脉络”.
- Changed the 数据脉络 entry from the system settings database tab to the main workspace action row, pairing it horizontally with “沉淀数据探查”.
- Changed the 数据脉络 window to a page-like workspace matching the system settings pane width, with draggable table cards and multiple layout modes (relationship-first, schema-grouped, grid) for easier relationship observation.
- Changed the main workspace data entry area into a unified ingress panel with differentiated “沉淀数据探查” and “展示数据脉络” actions, stronger hover/press feedback, and a redesigned upload drop zone.

## v1.1.8 - 2026-05-04

### Added (v1.1.8)

- Added a ChartDB-inspired database schema relationship visualization flow, including backend table/field/foreign-key graph extraction and a frontend topology dialog for browsing tables, columns, primary keys, row counts, and join paths.
- Added a data exploration report action above the workspace upload area that profiles selected database sources and uploaded workspace files, then generates an independent `Data_Exploration_SKILL_*.md` document for follow-up analysis.

### Changed (v1.1.8)

- Changed the workspace upload area layout to reserve a dedicated technology-styled data exploration action zone above the root upload drop target.

## v1.1.7 - 2026-05-04

### Added (v1.1.7)

- Added saved database connection management in the system settings database tab, including grouped display by database type, apply-to-current-form actions, per-source analysis toggles, and delete confirmation.
- Added per-user persistence for expanded/collapsed database connection groups so each user keeps their preferred settings layout across refreshes.

### Changed (v1.1.7)

- Changed saved database connection IDs and labels to include the database username for non-SQLite sources, allowing multiple accounts on the same database instance to coexist without overwriting one another.
- Changed the root startup banner to use the “观雨” visual identity and centered “AI-powered Customs Risk Analysis Expert” subtitle across startup modes.

### Fixed (v1.1.7)

- Fixed first-login data source confirmation by passing the confirmed database source IDs directly into the outgoing chat request instead of relying on immediately updated React state.
- Fixed saved database connection deletion state so selected analysis sources and persisted UI selection are cleaned up after removal.

## v1.1.6 - 2026-05-04

### Added (v1.1.6)

- Added compact layered system-prompt assembly with explicit budget controls for prompt modules and user data sections.
- Added user-level database knowledge base persistence (`database_knowledge_base.json`) for imported table/column snapshots.
- Added query-aware database knowledge retrieval context (top relevant tables/columns) instead of injecting full snapshots into each round.
- Added DB context-load response metadata `knowledge_summary` and `loaded_at` for frontend status display.
- Added database settings UI display for knowledge summary and latest knowledge-base update time.

### Changed (v1.1.6)

- Changed chat prompt construction to use compact core rules + selective modules (`strategy`, `mode`, `language`, `report`, `DB source`) with size trimming.
- Changed session database context usage from full inline payloads to summary + retrieval snippets to reduce token pressure.
- Changed frontend `useDatabase` state flow to persist and expose knowledge summary/update timestamp after context import.
- Changed repository hygiene by ignoring local `.hintrc` workspace hints to avoid non-runtime config noise in git status.

### Fixed (v1.1.6)

- Fixed context-length instability risk by capping system prompt and `# Data` payload size before model requests.
- Fixed DB knowledge timeline visibility gap in settings by surfacing last update time from backend.
- Fixed a backend identifier quoting syntax issue to keep Python compile checks passing after prompt refactor.

## v1.1.5 - 2026-05-03

### Added (v1.1.5)

- Added a new language selector button next to the report-type control in the main frontend header, with options for `中文（简体）` and `English`.
- Added end-to-end `analysis_language` request propagation from frontend to backend for both chat analysis (`/chat/completions`) and report export (`/export/report`).
- Added backend language normalization and high-priority language-control prompt injection to enforce user-selected language across analysis reasoning, interactive task guidance, and report narrative output.

### Changed (v1.1.5)

- Changed interactive TaskTree selection dialog copy to support localized UI text based on selected analysis language.
- Changed interactive-mode task confirmation message payload to match selected language before continuing analysis.
- Changed export report defaults to be language-aware (`Report`/`报告`) and to include `analysis_language` in export response metadata.

### Fixed (v1.1.5)

- Fixed language inconsistency risk where report type and interaction flow could not explicitly constrain analysis/report language when users expected English output.

## v1.1.4 - 2026-05-03

### Added (v1.1.4)

- Added configurable built-in superuser credentials via `DEEPANALYZE_SUPERUSER_USERNAME`, `DEEPANALYZE_SUPERUSER_PASSWORD`, and `DEEPANALYZE_SUPERUSER_PASSWORD_HASH`.
- Added model-provider selection persistence with `selected_id` across backend config APIs and frontend local storage.

### Changed (v1.1.4)

- Changed superuser authorization checks to use unified helper logic instead of hardcoded username comparisons across Yutu governance endpoints.
- Changed frontend model-provider management to maintain a provider library, preserve selected provider ordering, and support robust fallback normalization.
- Changed root startup script UX with backend profile banner, safer warning confirmations, richer GPU runtime detection output, and `--backend=<value>` argument compatibility.

### Fixed (v1.1.4)

- Fixed superuser login flow to require password verification instead of unconditional bypass for the built-in account.
- Fixed SQL generation request payload construction in DB UI to reuse normalized payload fields and prevent invalid requests.

## v1.1.3 - 2026-05-03

### Added (v1.1.3)

- Added local model server autostart for demo chat when default endpoint points to localhost, including readiness checks and startup timeout controls.
- Added model lifecycle cleanup for demo chat stop flow, including model PID tracking and model-port release.

### Changed (v1.1.3)

- Changed MLX startup profile to use absolute local model directory as request model name to avoid remote repository fallback on OpenAI-compatible calls.
- Changed backend model-provider normalization to auto-resolve local MLX model aliases (e.g. `DeepAnalyze-8B-MLX-4bit`) to repository-local absolute paths.
- Changed demo chat stop script to run from its own directory for reliable PID/log path resolution regardless of caller working directory.

### Fixed (v1.1.3)

- Fixed startup-time analysis failure path that previously returned 502/404 due to missing model process or mismatched MLX model identifiers.

## v1.1.2 - 2026-05-03

### Added (v1.1.2)

- Added methodology enforcement layer for demo chat agent to integrate CRISP-DM, iterative validation loops, quality controls, and business-value-oriented delivery.
- Added API-side methodology enforcement prompt to guarantee full-flow guardrails even when custom system messages are supplied.

### Changed (v1.1.2)

- Changed system-prompt assembly so methodology constraints are appended as an enhancement layer instead of replacing existing agent rules.
- Changed message preparation in API utilities to auto-inject methodology guardrails when absent.

### Documentation (v1.1.2)

- Updated changelog with methodology-first execution hardening for analyst behavior consistency.

## v1.1.1 - 2026-05-03

### Added (v1.1.1)

- Added unified startup backend selection for MLX (Apple Silicon) and GPU profiles at project entrypoint.
- Added startup-time profile propagation for default provider/model settings across backend and frontend.
- Added lightweight retry with short backoff for transient OpenAI-compatible chat completion failures.

### Changed (v1.1.1)

- Changed demo chat default model provider initialization to support environment-driven compute profiles.
- Changed structured tag parsing and rendering pipeline to be case-insensitive for robust multi-model compatibility.
- Changed workspace cleanup/delete endpoint mapping to dedicated routes to avoid method mismatch regressions.

### Documentation (v1.1.1)

- Updated version history to include compute-profile startup and analysis-loop stability improvements.

## v1.1.0 - 2026-04-29

### Added (v1.1.0)

- Added layered analytics API and service stack, including dataset registration, quality checks, and multi-depth analysis jobs.
- Added model gateway with provider and model-catalog management APIs for multi-model routing.
- Added skill marketplace APIs and runtime integration with policy-first governance.
- Added analysis workflow lifecycle APIs with plan-confirm-execute, secondary confirmation, and resume support.
- Added release governance APIs and service for offline evaluation, online metrics, and release gate decisions.
- Added governance audit persistence in SQLite for skill runs and policy decisions.
- Added startup path hardening in API bootstrap logic.
- Added dependency source configuration document for DIF/OYX multi-source fallback.

### Changed (v1.1.0)

- Updated API version from 1.0.0 to 1.1.0.
- Improved dependency recovery to support ordered multi-source pip fallback (DIF/OYX/镜像源/自定义 JSON 配置)。
- Improved runtime stability by lazy-loading yutu helpers to avoid startup side effects.
- Improved local HTTP file-server resilience with reusable threaded server and graceful bind-error handling.
- Improved runtime configurability for ports, timeouts, and CORS via environment variables.
- Improved database connection robustness in chat backend and DB UI integration flow.

### Documentation (v1.1.0)

- Updated API English and Chinese README sections for analytics, model gateway, and admin endpoints.
- Added platform & ecosystem implementation checklist baseline.
- Added AGENT multi-model integration operation guide.
