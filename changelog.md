# Changelog

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
