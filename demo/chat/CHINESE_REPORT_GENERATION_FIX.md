# DeepAnalyze 项目修复说明

## 版本 forthrain (2026-03-21)

### 1. DOCX 乱码问题修复

**问题原因**：
- `STFangSong.ttf` 字体文件实际注册的字体名称是 `STFangsong`（小写 g）
- 代码中使用的是 `STFangSong`（大写 G）
- DOCX 格式区分大小写，导致字体匹配失败

**修复文件**：
- `demo/chat/docx_utils.py:85` - 将字体名称改为 `STFangsong`

### 2. 用户体验优化

**问题1：退出后登录对话框没有列举用户名**
- 修复位置：`frontend/components/three-panel-interface.tsx:738`
- 修复内容：在 `performLogout` 中重新加载已注册用户列表

**问题2：退出时没有清空缓存文件**
- 修复位置：`frontend/components/three-panel-interface.tsx:738`
- 修复内容：生成新的 sessionId，确保重新登录时使用新的工作区

**问题3：打开项目后文件未加载到左侧**
- 修复位置：`frontend/components/three-panel-interface.tsx:1275`
- 修复内容：等待文件恢复完成后再加载工作区文件

**问题4：LOGO 显示优化**
- 修复位置：`frontend/components/three-panel-interface.tsx:3965, 3333`
- 修复内容：
  - 右侧 panel 的 CODE 下方显示 LOGO（showCodeEditor=false 时）
  - 登录对话框顶部显示 LOGO

**问题5：项目保存完整性**
- 修复位置：`backend.py`
- 修复内容：
  - 添加 `PROJECTS_BASE_DIR` 目录
  - 修改 `save_project` 将文件复制到项目目录
  - 添加 `/api/projects/file/{project_id}/{file_path}` 端点

### 3. Chat V2 移除

- 将 `demo/chat_v2` 目录重命名为 `demo/chat_v2_backup`
- 原因：简化项目结构，保留 V2 版本以备参考

## 原 DOCX/PDF 修复说明（旧版）

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
