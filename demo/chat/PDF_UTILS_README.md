# PDF 生成工具模块使用说明

## 模块位置
`demo/chat/pdf_utils.py`

## 功能概述

该模块提供了稳定、可复用的中文 PDF 生成支持，解决了 reportlab 库对中文、字体注册、模板定义、样式管理等细节要求较高的问题。

## 主要功能

### 1. 字体注册 `register_chinese_fonts()`

**功能**：注册所有可用的中文字体（只注册一次，后续调用返回缓存结果）

```python
from pdf_utils import register_chinese_fonts

# 注册字体（只注册一次）
fonts = register_chinese_fonts()
# 输出: {'SimHei': '/path/to/simhei.ttf', 'SimKai': '/path/to/simkai.ttf', ...}

# 强制重新注册
fonts = register_chinese_fonts(force=True)
```

**支持的字体**：
- SimHei (黑体) - 主标题/重点内容
- SimKai (楷体) - 引用/强调
- STFangSong (仿宋) - 正文/报告
- STHeiti (黑体备选)
- LiSongPro (隶书)

### 2. 样式管理 `get_chinese_style()`

**功能**：获取包含中文字体的段落样式

```python
from pdf_utils import get_chinese_style

# 获取不同类型的样式
normal_style = get_chinese_style("normal")      # 正文样式
heading1_style = get_chinese_style("heading1")  # 一级标题
heading2_style = get_chinese_style("heading2")  # 二级标题
heading3_style = get_chinese_style("heading3")  # 三级标题
list_style = get_chinese_style("list")          # 列表样式
caption_style = get_chinese_style("caption")    # 图表标题样式
```

### 3. Markdown 转 PDF `generate_pdf()`

**功能**：从 Markdown 文本生成 PDF 文件

```python
from pdf_utils import generate_pdf

md_text = """# 标题1

正文内容。

## 第一部分

这是第一部分内容。

- 项目1
- 项目2
"""

success = generate_pdf(
    md_text,
    "output.pdf",
    title="报告标题",
    author="作者",
    keywords=["关键词1", "关键词2"]
)
```

### 4. Markdown 内容解析 `extract_markdown_sections()`

**功能**：从 Markdown 文本中提取标题和段落块

```python
from pdf_utils import extract_markdown_sections

md_text = """# 标题1
正文
## 标题2
列表：
- 项目1
"""

blocks = extract_markdown_sections(md_text)
# 返回: [
#   {"type": "heading1", "content": "标题1", ...},
#   {"type": "paragraph", "content": "正文", ...},
#   {"type": "heading2", "content": "标题2", ...},
#   {"type": "list", "content": ["项目1"], ...}
# ]
```

### 5. Markdown 清理 `clean_md_text()`

**功能**：清理 Markdown 文本，移除 PDF 不支持的标记

```python
from pdf_utils import clean_md_text

cleaned = clean_md_text(md_text_with_latex)
```

## 使用示例

### 基本用法

```python
from pdf_utils import generate_pdf

# 准备 Markdown 文本
md_text = """# 我的报告

## 分析思路

本文档针对某问题进行分析。

## 主要发现

- 发现1
- 发现2
- 发现3

## 结论

分析完成。
"""

# 生成 PDF
success = generate_pdf(md_text, "report.pdf", title="分析报告")

if success:
    print("PDF 生成成功！")
else:
    print("PDF 生成失败！")
```

### 完整工作流程

```python
from pdf_utils import (
    register_chinese_fonts,
    get_chinese_style,
    extract_markdown_sections,
    clean_md_text,
    generate_pdf
)

# 1. 注册字体（只做一次）
fonts = register_chinese_fonts()
print(f"已注册 {len(fonts)} 个字体")

# 2. 准备内容
md_text = """# 分析报告

## 数据概览
数据来自 XXX...

## 趋势分析
见下图...

## 结论
主要结论...
"""

# 3. 生成 PDF
output_path = "/path/to/output.pdf"
success = generate_pdf(md_text, output_path, title="分析报告")

if success:
    print(f"PDF 已保存到: {output_path}")
```

## 错误处理

模块内置了完善的错误处理：

```python
import logging

# 启用详细日志
logging.basicConfig(level=logging.INFO)

# 函数会返回 False 表示失败，并打印错误信息
success = generate_pdf(md_text, "output.pdf")
if not success:
    # 检查日志了解失败原因
    pass
```

## 与 backend.py 集成

`backend.py` 已集成此模块，替换原有的 `_save_pdf_with_reportlab` 函数：

```python
# backend.py 中的使用
from pdf_utils import (
    register_chinese_fonts,
    get_chinese_style,
    extract_markdown_sections,
    clean_md_text,
    generate_pdf as generate_pdf_module,
)
```

## 测试

```bash
cd demo/chat
python3 pdf_utils.py
```

## 优势

1. **模块化设计**：字体注册、样式管理、PDF 生成分离，便于维护
2. **稳定可靠**：字体注册只执行一次，避免重复注册错误
3. **自动缓存**：字体注册结果自动缓存，提高性能
4. **完善日志**：详细记录字体注册和 PDF 生成过程
5. **易于使用**：简洁的 API，一键生成中文 PDF
6. **错误处理**：完善的异常捕获和错误提示
