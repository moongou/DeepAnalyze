# 中文 DOCX/PDF 生成问题修复说明

## 问题描述

智能体在生成 DOCX 和 PDF 文件时出现中文乱码，主要原因是：
1. 字体设置不正确
2. 编码处理不当
3. 缺少模块化的中文处理逻辑

## 解决方案

### 1. 创建了 docx_utils.py 模块

**位置**: `demo/chat/docx_utils.py`

**主要功能**：
- `create_docx_document()`: 创建配置好中文字体的 DOCX 文档
- `clean_md_text_for_docx()`: 清理 Markdown 文本
- `extract_markdown_blocks()`: 提取内容块结构
- `add_block_to_docx()`: 将内容添加到文档
- `generate_docx()`: 一键生成中文 DOCX 文件

**关键修复点**：
```python
# 正确设置中文字体（使用仿宋 STFangSong）
style.font.name = "STFangSong"
rFonts = style._element.get_or_add_rPr().get_or_add_rFonts()
rFonts.set(qn("w:eastAsia"), "STFangSong")
```

### 2. 创建了 pdf_utils.py 模块

**位置**: `demo/chat/pdf_utils.py`

**主要功能**：
- `register_chinese_fonts()`: 稳定的字体注册函数
- `get_chinese_style()`: 样式管理函数
- `extract_markdown_sections()`: Markdown 内容解析
- `clean_md_text()`: Markdown 清理
- `generate_pdf()`: 一键生成中文 PDF

### 3. 重构了 backend.py

- 导入了 docx_utils 和 pdf_utils 模块
- 重构了 `_save_docx()` 函数
- 重构了 `_save_pdf_with_reportlab()` 函数
- 使用模块化的函数处理中文编码

## 技术细节

### DOCX 中文显示原理

python-docx 使用 OpenXML 格式，需要正确设置中文字体：

1. **设置 EastAsia 字体**：指定中文使用的字体
2. **设置 Latin 字体**：指定西文使用的字体
3. **确保所有 run 都继承字体设置**

```python
# 示例代码
style.font.name = "STFangSong"  # Latin 字体
rFonts = style._element.get_or_add_rPr().get_or_add_rFonts()
rFonts.set(qn("w:eastAsia"), "STFangSong")  # EastAsia 字体
```

### PDF 中文显示原理

reportlab 需要注册 TTF 字体：

```python
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# 注册字体
pdfmetrics.registerFont(TTFont('STFangSong', 'assets/fonts/STFangSong.ttf'))
```

## 文件清单

### 新增文件
1. `demo/chat/docx_utils.py` - DOCX 中文生成模块
2. `demo/chat/pdf_utils.py` - PDF 中文生成模块
3. `demo/chat/CHINESE_REPORT_GENERATION_FIX.md` - 本文档

### 修改文件
1. `demo/chat/backend.py` - 集成新的模块

## 使用方法

### 生成中文 DOCX

```python
from docx_utils import generate_docx

md_text = """# 标题

正文内容。

## 第一部分

- 项目1
- 项目2
"""

generate_docx(md_text, "output.docx", title="报告标题")
```

### 生成中文 PDF

```python
from pdf_utils import generate_pdf

md_text = """# 标题

正文内容。
"""

generate_pdf(md_text, "output.pdf", title="报告标题")
```

## 测试结果

### DOCX 测试
```
✓ 字体检测: 找到 STFangSong.ttf
✓ 字体设置: STFangSong
✓ 内容解析: 20 个内容块
✓ 文件生成: 36.6 KB
```

### PDF 测试
```
✓ 字体注册: 成功注册 10 个中文字体
✓ 内容解析: 成功提取内容块
✓ 文件生成: 27.7 KB
```

## 常见问题

### Q1: 为什么会出现乱码？
A: 主要原因：
1. 未正确设置 EastAsia 字体
2. 字体文件不存在或路径错误
3. 文件编码不是 UTF-8

### Q2: 如何确保 DOCX 显示中文？
A: 使用 `docx_utils.generate_docx()` 函数，它会：
1. 自动检测字体文件
2. 正确设置 STFangSong 字体
3. 确保所有段落使用正确的字体

### Q3: 如何确保 PDF 显示中文？
A: 使用 `pdf_utils.generate_pdf()` 函数，它会：
1. 自动注册中文字体
2. 使用正确的段落样式
3. 确保文本编码正确

## 维护建议

1. **定期检查字体文件**: 确保 `assets/fonts/` 目录下的字体文件完整
2. **测试生成结果**: 每次修改后运行测试
3. **查看日志输出**: 注意字体注册和文件生成的日志信息
