# AGENT 多模型接入操作指引

## 1. 目标与结果

本次改造后，你的 AGENT 已具备以下能力：

- 保留本地 vLLM（默认）
- 支持动态接入多家大模型（OpenAI/Foundry/GitHub/任意 OpenAI 兼容端点）
- 支持后台动态管理 Provider 与模型目录
- 分析行为继续对齐“数据分析师方法论”系统提示词

同时已明确删减并不依赖以下组件：

- Elasticsearch
- Redis

## 2. 新增能力位置

- 模型网关核心：`API/model_gateway.py`
- 模型管理后台接口：`/v1/admin/model-providers`、`/v1/admin/model-catalog`
- 聊天路由改造：`API/chat_api.py`（由模型网关路由）
- 模型列表改造：`API/models_api.py`（动态读取模型目录）

模型注册信息会持久化到：

- `workspace/_model_registry.json`

## 3. 启动服务

```bash
cd /Users/m3max/IdeaProjects/DeepAnalyze
/Users/m3max/IdeaProjects/DeepAnalyze/.venv/bin/python API/start_server.py
```

说明：从仓库根目录启动可确保 `workspace/` 指向项目根目录，而不是 `API/workspace/`。

确认服务可用：

```bash
curl http://localhost:8200/health
curl http://localhost:8200/v1/models
```

后台管理入口：

- Swagger UI: `http://localhost:8200/docs`
- Redoc: `http://localhost:8200/redoc`

## 4. Provider 管理

### 4.1 查看当前 Provider

```bash
curl "http://localhost:8200/v1/admin/model-providers"
```

默认会看到 `local-vllm`。

### 4.2 新增 OpenAI Provider

```bash
curl -X POST "http://localhost:8200/v1/admin/model-providers" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "openai",
    "name": "OpenAI",
    "type": "openai_compatible",
    "base_url": "https://api.openai.com/v1",
    "api_key_env": "OPENAI_API_KEY",
    "enabled": true
  }'
```

先在系统环境变量中设置：

```bash
export OPENAI_API_KEY="your_openai_key"
```

### 4.3 新增 Microsoft Foundry Provider（OpenAI 兼容）

```bash
curl -X POST "http://localhost:8200/v1/admin/model-providers" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "foundry",
    "name": "Microsoft Foundry",
    "type": "openai_compatible",
    "base_url": "https://<your-foundry-endpoint>/openai/v1",
    "api_key_env": "FOUNDRY_API_KEY",
    "enabled": true
  }'
```

```bash
export FOUNDRY_API_KEY="your_foundry_key"
```

### 4.4 新增 GitHub Models Provider（OpenAI 兼容）

```bash
curl -X POST "http://localhost:8200/v1/admin/model-providers" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "github-models",
    "name": "GitHub Models",
    "type": "openai_compatible",
    "base_url": "https://models.github.ai/inference",
    "api_key_env": "GITHUB_TOKEN",
    "enabled": true
  }'
```

```bash
export GITHUB_TOKEN="your_github_pat"
```

### 4.5 删除 Provider

```bash
curl -X DELETE "http://localhost:8200/v1/admin/model-providers/openai"
```

删除 Provider 时，会同步删除其关联模型目录项。

## 5. 模型目录管理

### 5.1 查看模型目录

```bash
curl "http://localhost:8200/v1/admin/model-catalog"
```

### 5.2 新增模型映射

```bash
curl -X POST "http://localhost:8200/v1/admin/model-catalog" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "gpt-4.1",
    "provider_id": "openai",
    "provider_model": "gpt-4.1",
    "description": "OpenAI GPT-4.1",
    "enabled": true
  }'
```

再新增 Foundry 模型示例：

```bash
curl -X POST "http://localhost:8200/v1/admin/model-catalog" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "foundry-gpt4o",
    "provider_id": "foundry",
    "provider_model": "gpt-4o",
    "enabled": true
  }'
```

### 5.3 删除模型目录项

```bash
curl -X DELETE "http://localhost:8200/v1/admin/model-catalog/gpt-4.1"
```

## 6. 聊天调用方式

### 6.1 按目录模型 ID 调用（推荐）

```bash
curl -X POST "http://localhost:8200/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "messages": [
      {"role": "user", "content": "请对这个数据集做质量检查和相关性分析"}
    ],
    "temperature": 0.2
  }'
```

### 6.2 直连方式调用（provider_id:model_name）

```bash
curl -X POST "http://localhost:8200/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai:gpt-4.1",
    "messages": [
      {"role": "user", "content": "分析销售数据趋势并给出建议"}
    ]
  }'
```

## 7. 与数据分析师目标对齐说明

系统会自动注入“数据分析师方法论”系统提示，确保多模型在以下方向保持一致：

- 业务理解 -> 数据理解 -> 数据准备 -> 建模分析 -> 评估验证 -> 部署应用
- 假设驱动、多维验证、可解释性优先、可操作建议
- 分析输出保持结构化与可复现

即使切换模型，分析思想和目标仍保持统一。

## 8. UI/后台管理改造建议

你可以在现有 UI 上增加以下页面，不改主分析链路：

1. Provider 管理页

- 新增/编辑/删除 Provider
- 检测 base_url 与 key 是否可用

1. 模型目录页

- 为 AGENT 暴露可选模型 ID
- 设置默认模型、启停模型

1. 运行监控页

- 记录每次请求的 provider_id、resolved_model、耗时、失败原因

当前后端接口已满足这些页面直接对接。

## 9. 常见问题

1. 提示 `Model routing error`

- 检查 Provider 是否启用
- 检查模型目录中 `provider_id` 是否存在
- 检查 API Key 环境变量是否设置

1. `/v1/models` 看不到新增模型

- 确认该模型目录项 `enabled=true`

1. 本地模型还能用吗

- 能，`local-vllm` 默认保留，`DeepAnalyze-8B` 仍可直接使用

1. 如何回滚

- 删除新增 Provider/Model 目录项即可
- 或直接恢复 `workspace/_model_registry.json`

## 10. Skill Marketplace（安装与治理）

### 10.1 查询市场技能

```bash
curl "http://localhost:8200/v1/marketplace/skills"
```

### 10.1.1 查询目录（页面可据此渲染目录 Tab）

```bash
curl "http://localhost:8200/v1/marketplace/directories"
```

### 10.1.2 按目录筛选技能

```bash
curl "http://localhost:8200/v1/marketplace/skills?directory=featured"
```

```bash
curl "http://localhost:8200/v1/marketplace/skills?directory=data-analysis"
```

### 10.1.3 一键加载技能（页面点击“加载”按钮可直接调用）

```bash
curl -X POST "http://localhost:8200/v1/marketplace/skills/intsig-textin-xparse-parser/load" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 10.1.4 文档处理/数据分析标杆：TextIn xParse

- Skill ID：`intsig-textin-xparse-parser`
- 目录：`featured`
- 能力：PDF、Word、Excel、PPT、长截图等 20+ 格式解析，擅长跨页表格、多栏版面。
- 社区安装指令（Agent 对话）：`帮我从技能市场安装 intsig-textin/xparse-parser`
- 手动安装指令：`npx skills add intsig-textin/xparse-skills --yes`

### 10.1.5 预置技能目录（可在页面直接列出并一键加载）

| 目录 | 技能ID | 名称 | 兼容性 |
| --- | --- | --- | --- |
| featured | intsig-textin-xparse-parser | TextIn xParse | 通用 |
| data-analysis | xlsx-excel-expert | xlsx (Excel 表格专家) | 通用 |
| data-analysis | data-analysis-partner | Data Analysis Partner | 通用 |
| data-analysis | mysql-postgresql-skills | MySQL / PostgreSQL Skills | 通用 |
| data-analysis | sql-toolkit | SQL Toolkit | 通用 |
| data-analysis | python-data-automation | python (通用) | 通用 |
| data-analysis | google-sheets-integration | Google Sheets Integration | 需 Google 账号/api |
| document-processing | pdf-core-extractor | pdf | 通用 |
| document-processing | compdf-suite | PDF 全能处理 (ComPDF) | 通用 |
| document-processing | easydoc-parser | 易文档解析 (EasyDoc) | 通用 |
| document-generation | markdown-mermaid-writing | markdown-mermaid-writing | 通用 |
| document-generation | general-writing-markdown | General Writing | 通用 |
| document-generation | ppt-pro-generator | PPT 专业生成 | 通用 |
| document-generation | latex-posters | LaTeX Posters | 通用 (需 LaTeX 环境) |
| format-conversion | markitdown-converter | MarkItDown 文档转换器 | 需安装 MarkItDown 引擎 |
| format-conversion | markitdown-cli-converter | 文档转换器 (markitdown 引擎) | 需安装 markitdown CLI |
| format-conversion | pandoc-convert | Pandoc Convert | 需本地安装 Pandoc |

### 10.1.6 安全评估建议

优先选择星标与评分较高技能，并核验技能详情中的安全扫描结论（例如 Security Scan 为绿色 Benign）后再用于生产环境。

### 10.2 注册自定义 Skill（本地 JSON）

```bash
curl -X POST "http://localhost:8200/v1/marketplace/skills/register" \
  -H "Content-Type: application/json" \
  -d '{
    "manifest": {
      "id": "my-correlation-skill",
      "name": "My Correlation Skill",
      "version": "1.0.0",
      "publisher": "team-internal",
      "description": "自定义相关性增强分析",
      "runtime": "workflow",
      "entrypoint": "builtin:my_correlation",
      "permissions": ["data.read", "model.call"],
      "tags": ["correlation", "custom"],
      "enabled": true
    }
  }'
```

### 10.2.1 注册可执行 Python Skill（子进程运行）

`python` runtime 现在会真实执行 `workspace` 下的脚本，入口格式为 `python:<relative_script_path>`。

```bash
curl -X POST "http://localhost:8200/v1/marketplace/skills/register" \
  -H "Content-Type: application/json" \
  -d '{
    "manifest": {
      "id": "dept-salary-skill",
      "name": "Department Salary Skill",
      "version": "1.0.0",
      "publisher": "team-internal",
      "description": "读取数据集并输出部门平均薪资",
      "runtime": "python",
      "entrypoint": "python:skills/department_salary_skill.py",
      "permissions": ["data.read", "shell.exec"],
      "tags": ["custom", "python"],
      "enabled": true
    }
  }'
```

注意：

- Python runtime 需要 `shell.exec` 权限。
- `shell.exec` 属于高风险权限，默认安装后状态会是 `pending_approval`，需要审批后才能执行。

### 10.3 从 URL 注册 Skill Manifest

```bash
curl -X POST "http://localhost:8200/v1/marketplace/skills/register" \
  -H "Content-Type: application/json" \
  -d '{
    "manifest_url": "https://example.com/skills/my_skill_manifest.json"
  }'
```

### 10.4 安装 Skill

```bash
curl -X POST "http://localhost:8200/v1/marketplace/install" \
  -H "Content-Type: application/json" \
  -d '{
    "skill_id": "my-correlation-skill",
    "config": {
      "threshold": 0.7
    },
    "permission_scopes": {
      "data.read": {
        "action": "read",
        "resource": "dataset",
        "scope": {
          "allowed_dataset_ids": ["ds-xxxxxxxxxxxxxxxxxxxxxxxx"]
        },
        "ttl_sec": 86400
      }
    }
  }'
```

如果该 Skill 包含高风险权限（如 `shell.exec`、`secret.read`、`data.write`），安装结果会变成 `pending_approval`。

`permission_scopes` 现在支持完整形态：`action + resource + scope + ttl_sec`。

- `action`：读/写/执行等动作
- `resource`：资源类型（dataset/model/shell/secret）
- `scope`：资源范围（如 allowed_dataset_ids/allowed_models/allowed_commands）
- `ttl_sec`：授权有效期（秒），到期后运行前策略会拒绝

兼容说明：旧格式（直接写 `allowed_dataset_ids`）仍可用，服务端会自动归一化到新结构。

### 10.5 批准高风险权限安装

```bash
curl -X POST "http://localhost:8200/v1/marketplace/install/my-correlation-skill/approve"
```

### 10.6 查询已安装 Skill

```bash
curl "http://localhost:8200/v1/marketplace/installed"
```

### 10.7 禁用/启用已安装 Skill

```bash
curl -X POST "http://localhost:8200/v1/marketplace/installed/my-correlation-skill/status?status=disabled"
```

```bash
curl -X POST "http://localhost:8200/v1/marketplace/installed/my-correlation-skill/status?status=installed"
```

### 10.8 查看权限目录

```bash
curl "http://localhost:8200/v1/marketplace/permissions"
```

### 10.9 卸载 Skill

```bash
curl -X DELETE "http://localhost:8200/v1/marketplace/installed/my-correlation-skill"
```

### 10.10 直接运行已安装 Skill（调试/预演）

```bash
curl -X POST "http://localhost:8200/v1/marketplace/run" \
  -H "Content-Type: application/json" \
  -d '{
    "skill_id": "my-correlation-skill",
    "trace_id": "trc-demo-001",
    "context": {
      "dataset_id": "ds-xxxxxxxxxxxxxxxxxxxxxxxx",
      "objective": "快速验证技能输出结构"
    }
  }'
```

返回里会包含 `id`（skill run id）、`status`、`output`、`meta`。

审计数据（skill_runs 与 policy_decisions）会持久化到：

- `workspace/_governance_audit.db`

### 10.11 查询 Skill 运行记录

```bash
curl "http://localhost:8200/v1/marketplace/runs"
```

```bash
curl "http://localhost:8200/v1/marketplace/runs?skill_id=my-correlation-skill"
```

```bash
curl "http://localhost:8200/v1/marketplace/runs?trace_id=trc-demo-001"
```

```bash
curl "http://localhost:8200/v1/marketplace/runs/<run_id>"
```

### 10.12 策略预检查与审计（install/run 前置）

安装预检查：

```bash
curl -X POST "http://localhost:8200/v1/marketplace/policies/check-install" \
  -H "Content-Type: application/json" \
  -d '{
    "skill_id": "my-correlation-skill",
    "trace_id": "trc-demo-001",
    "config": {
      "available_capabilities": ["pandoc", "markitdown"]
    },
    "approve_high_risk_permissions": false
  }'
```

运行预检查：

```bash
curl -X POST "http://localhost:8200/v1/marketplace/policies/check-run" \
  -H "Content-Type: application/json" \
  -d '{
    "skill_id": "my-correlation-skill",
    "trace_id": "trc-demo-001",
    "context": {
      "dataset_id": "ds-xxxxxxxxxxxxxxxxxxxxxxxx"
    }
  }'
```

查询策略决策审计：

```bash
curl "http://localhost:8200/v1/marketplace/policies/decisions"
```

```bash
curl "http://localhost:8200/v1/marketplace/policies/decisions?skill_id=my-correlation-skill&action=run"
```

```bash
curl "http://localhost:8200/v1/marketplace/policies/decisions?trace_id=trc-demo-001"
```

```bash
curl "http://localhost:8200/v1/marketplace/policies/decisions/<decision_id>"
```

说明：

- install/run 现在均会先产出 `policy decision`，再进入安装或执行。
- 安装与运行结果中会回填 `policy_decision_id`，用于端到端追踪和治理审计。
- `trace_id` 可在 install/check-install/check-run/run/plan/confirm/execute 中透传，用于全链路治理查询。

## 11. 分析流程确认机制（Plan -> Confirm -> Execute）

该机制让用户在执行前先确认步骤、风险和权限。

### 11.1 创建分析计划

```bash
curl -X POST "http://localhost:8200/v1/analysis-workflows/plan" \
  -H "Content-Type: application/json" \
  -d '{
    "objective": "分析员工薪资与部门结构关系，并给出可执行建议",
    "trace_id": "trc-demo-001",
    "dataset_id": "ds-xxxxxxxxxxxxxxxxxxxxxxxx",
    "preferred_depth": "deep",
    "constraints": {
      "group_by": ["department"],
      "time_column": "hire_date",
      "target_column": "salary",
      "top_n_categories": 8
    },
    "selected_skills": ["my-correlation-skill"]
  }'
```

返回中会包含 `workflow_id`（字段 `id`）和步骤列表。

### 11.2 审批计划（全量审批）

```bash
curl -X POST "http://localhost:8200/v1/analysis-workflows/<workflow_id>/confirm" \
  -H "Content-Type: application/json" \
  -d '{
    "approve_all": true,
    "notes": "同意执行全部步骤",
    "trace_id": "trc-demo-001"
  }'
```

### 11.3 审批计划（部分审批）

```bash
curl -X POST "http://localhost:8200/v1/analysis-workflows/<workflow_id>/confirm" \
  -H "Content-Type: application/json" \
  -d '{
    "approve_all": false,
    "approved_step_ids": ["scope-confirmation", "data-quality-check", "core-analysis"],
    "rejected_step_ids": ["report-output"],
    "notes": "先不发布报告，仅完成分析"
  }'
```

### 11.4 执行已确认流程

```bash
curl -X POST "http://localhost:8200/v1/analysis-workflows/<workflow_id>/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "continue_on_step_error": false,
    "trace_id": "trc-demo-001"
  }'
```

如果执行过程中遇到高风险步骤（例如 `data.write`、`shell.exec`），流程会进入 `paused_for_confirmation`。

可先对该步骤做二次确认：

```bash
curl -X POST "http://localhost:8200/v1/analysis-workflows/<workflow_id>/confirm-step" \
  -H "Content-Type: application/json" \
  -d '{
    "step_id": "report-output",
    "notes": "同意高风险步骤执行",
    "trace_id": "trc-demo-001"
  }'
```

然后从检查点恢复执行：

```bash
curl -X POST "http://localhost:8200/v1/analysis-workflows/<workflow_id>/resume" \
  -H "Content-Type: application/json" \
  -d '{
    "continue_on_step_error": false,
    "trace_id": "trc-demo-001"
  }'
```

也可指定从某一步恢复：

```bash
curl -X POST "http://localhost:8200/v1/analysis-workflows/<workflow_id>/resume" \
  -H "Content-Type: application/json" \
  -d '{
    "continue_on_step_error": false,
    "resume_from_step_id": "custom-skill-1-my-correlation-skill",
    "trace_id": "trc-demo-001"
  }'
```

### 11.5 查询流程与执行日志

```bash
curl "http://localhost:8200/v1/analysis-workflows/<workflow_id>"
```

```bash
curl "http://localhost:8200/v1/analysis-workflows"
```

## 12. 当前实现边界（v1）

1. Marketplace 已支持注册、安装、审批、启停和卸载。

1. 工作流中的 `custom-skill-*` 已接入真实执行器，支持：

- `python` runtime：以子进程执行 `workspace` 内脚本（带超时和路径沙箱约束）
- `http` runtime：向 skill endpoint 发起 POST JSON 请求
- `workflow` runtime：执行内置 `builtin:*` 能力

并且每次执行都会持久化 skill run 记录，支持单独调试与审计追踪。

1. 分析核心步骤已接入现有分析引擎，能够返回结构化结果与报告摘要。
