# DeepAnalyze API 服务器

## 🚀 快速开始

### 前置条件

**启动 vLLM 模型服务器**:

```bash
vllm serve DeepAnalyze-8B --host 0.0.0.0 --port 8000
```

### 启动服务器

```bash
cd API
python start_server.py
```

- **API 服务器**: `http://localhost:8200` (主 API)
- **文件服务器**: `http://localhost:8100` (文件下载)
- **健康检查**: `http://localhost:8200/health`

API 服务器将在当前目录下创建一个新的 `workspace` 文件夹作为工作目录。对于每个对话，它将在该工作空间下生成一个 `thread` 子目录来执行数据分析并生成文件。

### 快速测试

```bash
cd example
python exampleRequest.py          # 请求示例
python exampleOpenAI.py    # OpenAI 库示例
python exampleAnalytics.py  # 分层分析接口示例
```

## 🧱 分层分析架构（已实现）

API 服务器现已内置分层分析流水线：

- 存储层：本地文件 + 上传文件 + 内存元数据
- 处理层：格式解析 + 数据质量检查 + 分组聚合
- 计算层：浅/中/深分析（统计、相关性、趋势、异常扫描）
- 交互层：`/v1/analytics` REST 接口

本次实现中已明确移除以下可选组件：

- Elasticsearch：已删减
- Redis：已删减

### 分析接口

- `POST /v1/analytics/datasets/register`
- `GET /v1/analytics/datasets`
- `GET /v1/analytics/datasets/{dataset_id}`
- `POST /v1/analytics/jobs/run`
- `GET /v1/analytics/jobs`
- `GET /v1/analytics/jobs/{job_id}`

### 分析接口快速示例

```python
import requests

base = "http://localhost:8200"

dataset = requests.post(
    f"{base}/v1/analytics/datasets/register",
    json={
        "name": "employee_data",
        "source_type": "local_path",
        "path": "./example/employee_data.csv",
        "format": "csv"
    },
    timeout=60,
).json()

job = requests.post(
    f"{base}/v1/analytics/jobs/run",
    json={
        "dataset_id": dataset["id"],
        "depth": "deep",
        "group_by": ["department"],
        "time_column": "hire_date",
        "target_column": "salary"
    },
    timeout=120,
).json()

print(job["status"])
print(job["result"].get("report_markdown", ""))
```

## 🤖 多模型网关（已实现）

当前系统在保留本地 vLLM 的同时，已支持多模型路由：

- 本地 vLLM（内置默认）
- OpenAI 端点
- Microsoft Foundry 端点（OpenAI 兼容）
- GitHub Models 端点（OpenAI 兼容）
- 任意自定义 OpenAI 兼容端点

### 模型管理后台接口

- `GET /v1/admin/model-providers`
- `POST /v1/admin/model-providers`
- `DELETE /v1/admin/model-providers/{provider_id}`
- `GET /v1/admin/model-catalog`
- `POST /v1/admin/model-catalog`
- `DELETE /v1/admin/model-catalog/{model_id}`

### Provider 配置示例（OpenAI）

```python
import requests

requests.post(
    "http://localhost:8200/v1/admin/model-providers",
    json={
        "id": "openai",
        "name": "OpenAI",
        "type": "openai_compatible",
        "base_url": "https://api.openai.com/v1",
        "api_key_env": "OPENAI_API_KEY",
        "enabled": True,
    },
    timeout=30,
)

requests.post(
    "http://localhost:8200/v1/admin/model-catalog",
    json={
        "id": "gpt-4.1",
        "provider_id": "openai",
        "provider_model": "gpt-4.1",
        "enabled": True,
    },
    timeout=30,
)
```

之后在聊天请求中把 `model` 设为 `gpt-4.1` 即可调用。

## 📚 API 使用

### 1. 文件上传

**请求示例:**

```python
import requests

with open('data.csv', 'rb') as f:
    files = {'file': ('data.csv', f, 'text/csv')}
    response = requests.post('http://localhost:8200/v1/files', files=files)

file_id = response.json()['id']
print(f"File uploaded: {file_id}")
```

**OpenAI 库示例:**

```python
import openai

client = openai.OpenAI(
    base_url="http://localhost:8200/v1",
    api_key="dummy"
)

with open('data.csv', 'rb') as f:
    file_obj = client.files.create(file=f)

print(f"File uploaded: {file_obj.id}")
```

### 2. 简单聊天（无文件）

**请求示例:**

```python
response = requests.post('http://localhost:8200/v1/chat/completions', json={
    "model": "DeepAnalyze-8B",
    "messages": [
        {"role": "user", "content": "用一句话介绍Python编程语言"}
    ],
    "temperature": 0.4
})

content = response.json()['choices'][0]['message']['content']
print(content)
```

**OpenAI 库示例:**

```python
response = client.chat.completions.create(
    model="DeepAnalyze-8B",
    messages=[
        {"role": "user", "content": "用一句话介绍Python编程语言"}
    ],
    temperature=0.4
)

print(response.choices[0].message.content)
```

### 3. 带文件的聊天

**请求示例:**

```python
response = requests.post('http://localhost:8200/v1/chat/completions', json={
    "model": "DeepAnalyze-8B",
    "messages": [
        {
            "role": "user",
            "content": "分析这个数据文件，计算各部门的平均薪资，并生成可视化图表。",
            "file_ids": [file_id]
        }
    ],
    "temperature": 0.4
})

result = response.json()
content = result['choices'][0]['message']['content']
files = result['choices'][0]['message'].get('files', [])

print(f"Response: {content}")
for file_info in files:
    print(f"Generated file: {file_info['name']} - {file_info['url']}")
```

**OpenAI 库示例:**

```python
response = client.chat.completions.create(
    model="DeepAnalyze-8B",
    messages=[
        {
            "role": "user",
            "content": "分析这个数据文件，计算各部门的平均薪资，并生成可视化图表。",
            "file_ids": [file_id]
        }
    ],
    temperature=0.4
)

message = response.choices[0].message
print(f"Response: {message.content}")

# Access generated files (new format)
if hasattr(message, 'files') and message.files:
    for file_info in message.files:
        print(f"Generated file: {file_info['name']} - {file_info['url']}")
```

### 4. 多轮对话的线程ID支持

在消息中使用 `thread_id` 来在多个请求之间维护工作区上下文。这允许文件和生成的内容在对话之间持久化。

**重要提示：** 您必须在每个请求中维护完整的对话历史记录 - 只在最新的消息中添加 `thread_id`。

**请求示例:**

```python
conversation_history = []

# 第一次请求 - 创建新线程并获取thread_id
conversation_history.append({"role": "user", "content": "创建一个计算斐波那契数列的Python脚本"})
response = requests.post('http://localhost:8200/v1/chat/completions', json={
    "model": "DeepAnalyze-8B",
    "messages": conversation_history
})

result = response.json()
thread_id = result['choices'][0]['message']['thread_id']
assistant_response = result['choices'][0]['message']['content']
conversation_history.append({"role": "assistant", "content": assistant_response})

print(f"Thread ID: {thread_id}")

# 第二次请求 - 包含完整历史记录 + 最新消息中的thread_id
conversation_history.append({"role": "user", "content": "现在运行脚本来计算前10个数字", "thread_id": thread_id})
response = requests.post('http://localhost:8200/v1/chat/completions', json={
    "model": "DeepAnalyze-8B",
    "messages": conversation_history
})

assistant_response = response.json()['choices'][0]['message']['content']
conversation_history.append({"role": "assistant", "content": assistant_response})

# 第三次请求 - 继续相同的线程，维护完整历史记录
conversation_history.append({"role": "user", "content": "列出当前工作区中的所有文件", "thread_id": thread_id})
response = requests.post('http://localhost:8200/v1/chat/completions', json={
    "model": "DeepAnalyze-8B",
    "messages": conversation_history
})
```

**OpenAI 库示例:**

```python
messages = []

# 第一次请求
messages.append({"role": "user", "content": "创建一个数据分析脚本"})
response = client.chat.completions.create(
    model="DeepAnalyze-8B",
    messages=messages
)

# 使用hasattr()检查thread_id
thread_id = None
if hasattr(response.choices[0].message, 'thread_id'):
    thread_id = response.choices[0].message.thread_id

messages.append({"role": "assistant", "content": response.choices[0].message.content})

# 继续对话 - 包含完整历史记录 + 最新消息中的thread_id
messages.append({"role": "user", "content": "运行分析脚本", "thread_id": thread_id})
response = client.chat.completions.create(
    model="DeepAnalyze-8B",
    messages=messages
)

if hasattr(response.choices[0].message, 'thread_id'):
    print(f"Thread ID: {response.choices[0].message.thread_id}")

messages.append({"role": "assistant", "content": response.choices[0].message.content})
```

**关键要点:**

- `thread_id` 在响应消息中返回
- 使用 `hasattr(message, 'thread_id')` 来检查OpenAI库中的thread_id
- 只在对话历史记录的**最新**用户消息中包含 `thread_id`
- 您必须在每个请求中发送**完整的对话历史记录**
- 之前请求中创建的文件在线程工作区中仍然可用
- 工作区在具有相同 `thread_id` 的请求之间持久化

### 5. 流式聊天与文件

**请求示例:**

```python
response = requests.post('http://localhost:8200/v1/chat/completions', json={
    "model": "DeepAnalyze-8B",
    "messages": [
        {
            "role": "user",
            "content": "分析这个数据并生成趋势图。",
            "file_ids": [file_id]
        }
    ],
    "stream": True
}, stream=True)

for line in response.iter_lines():
    if line:
        line_str = line.decode('utf-8')
        if line_str.startswith('data: '):
            data_str = line_str[6:]
            if data_str == '[DONE]':
                break
            chunk = json.loads(data_str)
            if 'choices' in chunk and chunk['choices']:
                delta = chunk['choices'][0].get('delta', {})
                if 'content' in delta:
                    print(delta['content'], end='', flush=True)
                if 'thread_id' in delta:
                    print(f"\nThread ID: {delta['thread_id']}")
```

**OpenAI 库示例:**

```python
stream = client.chat.completions.create(
    model="DeepAnalyze-8B",
    messages=[
        {
            "role": "user",
            "content": "分析这个数据并生成趋势图。",
            "file_ids": [file_id]
        }
    ],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end='', flush=True)
    if hasattr(chunk, 'generated_files') and chunk.generated_files:
        collected_files.extend(chunk.generated_files)
    if hasattr(chunk.choices[0].delta, 'thread_id'):
        print(f"\nThread ID: {chunk.choices[0].delta.thread_id}")
```

## 📋 API 参考

### 文件 API

#### POST /v1/files

上传文件进行分析。

**请求:**

```http
POST /v1/files
Content-Type: multipart/form-data

file: [binary file data]
```

**响应:**

```json
{
  "id": "file-abc123...",
  "object": "file",
  "bytes": 1024,
  "created_at": 1704067200,
  "filename": "data.csv"
}
```

#### GET /v1/files

列出所有上传的文件。

**请求:**

```http
GET /v1/files
```

**响应:**

```json
{
  "object": "list",
  "data": [
    {
      "id": "file-abc123...",
      "object": "file",
      "bytes": 1024,
      "created_at": 1704067200,
      "filename": "data.csv"
    }
  ]
}
```

#### GET /v1/files/{file_id}/content

下载文件内容。

**请求:**

```http
GET /v1/files/{file_id}/content
```

**响应:** 二进制文件内容

#### DELETE /v1/files/{file_id}

删除文件。

**请求:**

```http
DELETE /v1/files/{file_id}
```

**响应:**

```json
{
  "id": "file-abc123...",
  "object": "file",
  "deleted": true
}
```

### 聊天完成 API

#### POST /v1/chat/completions

扩展聊天完成，支持文件功能。

**请求:**

```json
{
  "model": "DeepAnalyze-8B",
  "messages": [
    {
      "role": "user",
      "content": "分析这个数据文件",
      "file_ids": ["file-abc123"],     // OpenAI 兼容：消息中的 file_ids
      "thread_id": "thread-xyz789..."  // 可选：最新消息中的 thread_id 用于工作区持久化
    }
  ],
  "file_ids": ["file-def456"],         // 可选：file_ids 参数
  "temperature": 0.4,
  "stream": false
}
```

**响应（非流式）:**

```json
{
  "id": "chatcmpl-xyz789...",
  "object": "chat.completion",
  "created": 1704067200,
  "model": "DeepAnalyze-8B",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "分析结果...",
        "thread_id": "thread-abc123...", // 工作区持久化的线程ID
        "files": [                      //消息中的文件
          {
            "name": "chart.png",
            "url": "http://localhost:8100/thread-123/generated/chart.png"
          }
        ]
      },
      "finish_reason": "stop"
    }
  ],
  "generated_files": [                // generated_files 字段
    {
      "name": "chart.png",
      "url": "http://localhost:8100/thread-123/generated/chart.png"
    }
  ],
  "attached_files": ["file-abc123"]   // 输入文件
}
```

**响应（流式）:**

```text
data: {"id": "chatcmpl-xyz789...", "object": "chat.completion.chunk", "choices": [{"delta": {"content": "分析"}}]}
data: {"id": "chatcmpl-xyz789...", "object": "chat.completion.chunk", "choices": [{"delta": {"files": [{"name":"chart.png","url":"..."}], "thread_id": "thread-abc123..."}, "finish_reason": "stop"}]}
data: [DONE]
```

### 健康检查 API

#### GET /health

检查 API 服务器状态。

**请求:**

```http
GET /health
```

**响应:**

```json
{
  "status": "healthy",
  "timestamp": 1704067200
}
```

## 🏗️ 架构

### 多端口设计

- **端口 8000**: vLLM 模型服务器（外部）
- **端口 8200**: 主 API 服务器（FastAPI）
- **端口 8100**: 文件 HTTP 服务器用于下载

## 🔧 配置

### 环境变量

```python
# API 配置
API_BASE = "http://localhost:8000/v1"  # vLLM 端点
MODEL_PATH = "DeepAnalyze-8B"          # 模型名称
WORKSPACE_BASE_DIR = "workspace"       # 文件存储
HTTP_SERVER_PORT = 8100               # 文件服务器端口

# 模型设置
DEFAULT_TEMPERATURE = 0.4            # 默认采样温度
MAX_NEW_TOKENS = 32768               # 最大响应令牌数
STOP_TOKEN_IDS = [32000, 32007]      # 特殊令牌 ID
```

## 🛠️ 示例

`example/` 目录包含全面的示例：

- `exampleRequest.py` - 简单请求示例
- `exampleOpenAI.py` - OpenAI 库示例
