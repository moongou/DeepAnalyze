"""
PDF 生成工具模块 - 稳定、可复用的中文 PDF 支持

此模块提供了：
1. 字体注册函数 register_chinese_fonts()
2. 样式管理函数 get_chinese_style()
3. PDF 生成封装函数
"""

import os
import sys
import re
import traceback
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.pagesizes import A4

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== 字体配置 ====================
# 当前项目根目录（支持直接运行和被导入）
try:
    # 尝试从当前文件位置推断
    _CURRENT_DIR = Path(__file__).parent
    _PROJECT_ROOT = _CURRENT_DIR.parent
    FONTS_DIR = _PROJECT_ROOT / "assets" / "fonts"
except Exception:
    FONTS_DIR = Path("/Users/m3max/IdeaProjects/DeepAnalyze/assets/fonts")

# 确保字体目录存在
if not FONTS_DIR.exists():
    # 尝试备用路径
    FONTS_DIR = Path("/Users/m3max/IdeaProjects/DeepAnalyze/assets/fonts")

# 中文字体定义（按优先级排序）
# 格式: (字体文件名, 字体名称, 字体类型, 描述)
CHINESE_FONTS = [
    # assets/fonts 目录下的纯 TTF 字体（reportlab 兼容性最好）
    ("simhei.ttf", "SimHei", "normal", "黑体 - 主标题/重点内容"),
    ("simkai.ttf", "SimKai", "normal", "楷体 - 引用/强调"),
    ("STFangSong.ttf", "STFangSong", "normal", "仿宋 - 正文/报告"),
    ("STHeiti.ttf", "STHeiti", "normal", "黑体备选"),
    ("LiSongPro.ttf", "LiSongPro", "normal", "隶书 - 可选"),
]

# 字体注册状态缓存
_REGISTERED_FONTS: Dict[str, str] = {}  # font_name -> font_path
_FONT_REGISTRATION_FAILED: List[str] = []  # 注册失败的字体列表


def get_font_path(font_filename: str) -> Optional[str]:
    """获取字体文件的绝对路径"""
    font_path = FONTS_DIR / font_filename
    if font_path.exists():
        return str(font_path.resolve())
    return None


def register_chinese_fonts(force: bool = False) -> Dict[str, str]:
    """
    注册所有可用的中文字体（只注册一次，后续调用返回缓存结果）

    Args:
        force: 是否强制重新注册（默认 False）

    Returns:
        dict: 注册成功的字体字典 {font_name: font_path}
    """
    global _REGISTERED_FONTS, _FONT_REGISTRATION_FAILED

    # 如果已经注册过且非强制模式，直接返回
    if not force and _REGISTERED_FONTS:
        logger.info(f"Fonts already registered: {list(_REGISTERED_FONTS.keys())}")
        return _REGISTERED_FONTS

    if force:
        _REGISTERED_FONTS = {}
        _FONT_REGISTRATION_FAILED = []

    logger.info(f"开始注册中文字体，字体目录: {FONTS_DIR}")

    for font_filename, font_name, font_type, description in CHINESE_FONTS:
        font_path = get_font_path(font_filename)

        if not font_path:
            logger.warning(f"字体文件不存在: {font_filename}")
            continue

        try:
            # 使用绝对路径注册字体
            pdfmetrics.registerFont(TTFont(font_name, font_path))
            _REGISTERED_FONTS[font_name] = font_path
            logger.info(f"成功注册字体: {font_name} -> {font_path}")

            # 为粗体、斜体注册变体（如果需要）
            # reportlab 4.x 会自动处理粗体变体
            if font_type == "normal":
                bold_name = f"{font_name}-Bold"
                if bold_name not in _REGISTERED_FONTS:
                    try:
                        pdfmetrics.registerFont(TTFont(bold_name, font_path))
                        _REGISTERED_FONTS[bold_name] = font_path
                        logger.info(f"注册粗体字体: {bold_name}")
                    except Exception as e:
                        logger.debug(f"粗体字体注册跳过: {bold_name} - {e}")

        except Exception as e:
            error_msg = f"注册字体 {font_name} 失败: {e}"
            logger.error(error_msg)
            _FONT_REGISTRATION_FAILED.append(font_name)

            # 尝试兼容旧版 reportlab API
            try:
                from reportlab.pdfbase.ttfonts import TTFError
                if isinstance(e, TTFError):
                    logger.error(f"TTF 格式错误: {font_path} 可能不是有效的 TTF 文件")
            except Exception:
                pass

    if not _REGISTERED_FONTS:
        logger.error("所有中文字体注册失败！PDF 将使用默认字体（可能无法显示中文）")

    logger.info(f"字体注册完成: 成功 {len(_REGISTERED_FONTS)} 个，失败 {len(_FONT_REGISTRATION_FAILED)} 个")
    return _REGISTERED_FONTS


def get_chinese_font_name() -> str:
    """获取可用的中文字体名称（优先返回 SimHei）"""
    if _REGISTERED_FONTS:
        # 优先返回黑体
        if "SimHei" in _REGISTERED_FONTS:
            return "SimHei"
        # 返回第一个注册的字体
        return list(_REGISTERED_FONTS.keys())[0]
    return "Helvetica"  # 回退字体


def get_chinese_style(style_type: str = "normal") -> ParagraphStyle:
    """
    获取包含中文字体的段落样式

    Args:
        style_type: 样式类型
            - "normal": 正文样式
            - "heading1": 一级标题
            - "heading2": 二级标题
            - "heading3": 三级标题
            - "list": 列表样式
            - "caption": 图表标题样式

    Returns:
        ParagraphStyle: 配置好的段落样式对象
    """
    # 确保字体已注册
    if not _REGISTERED_FONTS:
        register_chinese_fonts()

    font_name = get_chinese_font_name()
    styles = getSampleStyleSheet()

    # 样式配置字典
    style_configs = {
        "normal": {
            "name": "ChineseNormal",
            "parent": styles["Normal"],
            "fontName": font_name,
            "fontSize": 11,
            "leading": 16,
            "spaceAfter": 8,
            "alignment": 0,  # 左对齐
        },
        "heading1": {
            "name": "ChineseHeading1",
            "parent": styles["Heading1"],
            "fontName": font_name,
            "fontSize": 22,
            "leading": 26,
            "spaceAfter": 12,
            "spaceBefore": 14,
            "alignment": 1,  # 居中
            "bold": True,
        },
        "heading2": {
            "name": "ChineseHeading2",
            "parent": styles["Heading2"],
            "fontName": font_name,
            "fontSize": 16,
            "leading": 20,
            "spaceAfter": 8,
            "spaceBefore": 10,
            "alignment": 0,  # 左对齐
            "bold": True,
        },
        "heading3": {
            "name": "ChineseHeading3",
            "parent": styles["Heading3"],
            "fontName": font_name,
            "fontSize": 13,
            "leading": 16,
            "spaceAfter": 6,
            "spaceBefore": 8,
            "alignment": 0,  # 左对齐
            "bold": True,
        },
        "list": {
            "name": "ChineseList",
            "parent": styles["Normal"],
            "fontName": font_name,
            "fontSize": 11,
            "leading": 16,
            "spaceAfter": 6,
            "leftIndent": 20,
        },
        "caption": {
            "name": "ChineseCaption",
            "parent": styles["Normal"],
            "fontName": font_name,
            "fontSize": 9,
            "leading": 12,
            "spaceAfter": 8,
            "alignment": 1,  # 居中
            "italic": True,
        },
    }

    config = style_configs.get(style_type, style_configs["normal"])
    style_name = config.pop("name")

    # 检查样式是否已存在，避免重复添加导致错误
    if style_name in styles.byName:
        return styles[style_name]

    # 创建自定义样式（ParagraphStyle 构造函数需要 name 作为第一个参数）
    config["name"] = style_name
    style = ParagraphStyle(**config)

    # 添加到样式表
    styles.add(style)

    return style


def extract_markdown_sections(md_text: str) -> List[Dict[str, Any]]:
    """
    从 Markdown 文本中提取标题和段落块

    Args:
        md_text: Markdown 格式的文本

    Returns:
        list: 提取的块列表，每个块包含 type 和 content
    """
    if not md_text:
        return []

    blocks = []
    lines = md_text.split('\n')
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # 跳过空行
        if not stripped:
            i += 1
            continue

        # 一级标题
        if stripped.startswith('# '):
            blocks.append({
                "type": "heading1",
                "content": stripped[2:].strip(),
                "raw": line
            })
            i += 1
            continue

        # 二级标题
        if stripped.startswith('## '):
            blocks.append({
                "type": "heading2",
                "content": stripped[3:].strip(),
                "raw": line
            })
            i += 1
            continue

        # 三级标题
        if stripped.startswith('### '):
            blocks.append({
                "type": "heading3",
                "content": stripped[4:].strip(),
                "raw": line
            })
            i += 1
            continue

        # 列表项
        if stripped.startswith('- ') or stripped.startswith('* ') or stripped.startswith('1. '):
            list_items = []
            while i < len(lines):
                line = lines[i].strip()
                if line.startswith('- ') or line.startswith('* ') or re.match(r'^\d+\.\s', line):
                    # 移除列表标记
                    content = re.sub(r'^[-*1.]\s+', '', line)
                    list_items.append(content)
                    i += 1
                elif not line:
                    i += 1
                    continue
                else:
                    break
            blocks.append({
                "type": "list",
                "content": list_items,
                "raw": '\n'.join([lines[j] for j in range(i - len(list_items), i)])
            })
            continue

        # 普通段落
        paragraph_lines = []
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()
            if not stripped or stripped.startswith(('# ', '## ', '### ', '- ', '* ', '1. ')):
                break
            paragraph_lines.append(line)
            i += 1

        if paragraph_lines:
            blocks.append({
                "type": "paragraph",
                "content": '\n'.join(paragraph_lines),
                "raw": '\n'.join(paragraph_lines)
            })

    return blocks


def clean_md_text(md_text: str) -> str:
    """
    清理 Markdown 文本，移除 PDF 不支持的标记

    Args:
        md_text: 原始 Markdown 文本

    Returns:
        str: 清理后的文本
    """
    if not md_text:
        return ""

    # 移除 \newpage 标记
    text = re.sub(r'\\newpage', '', md_text)
    # 移除其他可能的 LaTeX 标记
    text = re.sub(r'\\[a-zA-Z]+\{[^}]*\}', '', text)
    # 移除 HTML 注释
    text = re.sub(r'<!--[^>]*-->', '', text)

    return text.strip()


def generate_pdf(
    md_text: str,
    output_path: str,
    title: Optional[str] = None,
    author: Optional[str] = None,
    keywords: Optional[List[str]] = None
) -> bool:
    """
    从 Markdown 文本生成 PDF 文件

    Args:
        md_text: Markdown 格式的文本内容
        output_path: 输出 PDF 文件路径
        title: PDF 文档标题（可选）
        author: PDF 文档作者（可选）
        keywords: PDF 关键词列表（可选）

    Returns:
        bool: 生成成功返回 True，否则返回 False
    """
    try:
        # 确保输出目录存在
        output_dir = os.path.dirname(output_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)

        # 初始化 PDF 文档
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=50,
            leftMargin=50,
            topMargin=50,
            bottomMargin=50,
        )

        # 准备故事（PDF 内容）
        story = []

        # 添加文档元信息
        if title:
            doc.title = title
        if author:
            doc.author = author
        if keywords:
            doc.keywords = keywords

        # 清理 Markdown 文本
        clean_text = clean_md_text(md_text)

        # 提取并处理各个块
        blocks = extract_markdown_sections(clean_text)

        for block in blocks:
            block_type = block["type"]
            content = block["content"]

            if block_type == "heading1":
                style = get_chinese_style("heading1")
                story.append(Paragraph(content, style))
                story.append(Spacer(1, 12))

            elif block_type == "heading2":
                style = get_chinese_style("heading2")
                story.append(Paragraph(content, style))
                story.append(Spacer(1, 8))

            elif block_type == "heading3":
                style = get_chinese_style("heading3")
                story.append(Paragraph(content, style))
                story.append(Spacer(1, 6))

            elif block_type == "paragraph":
                style = get_chinese_style("normal")
                story.append(Paragraph(content, style))
                story.append(Spacer(1, 8))

            elif block_type == "list":
                style = get_chinese_style("list")
                for item in content:
                    # 添加列表项标记
                    para_text = f"• {item}"
                    story.append(Paragraph(para_text, style))
                    story.append(Spacer(1, 4))
                story.append(Spacer(1, 8))

        # 构建 PDF
        doc.build(story)

        logger.info(f"PDF 生成成功: {output_path}")
        return True

    except Exception as e:
        error_msg = f"PDF 生成失败: {e}"
        logger.error(error_msg)
        traceback.print_exc()
        return False


def test_pdf_generation() -> str:
    """
    测试 PDF 生成功能

    Returns:
        str: 测试结果路径或错误信息
    """
    import tempfile

    test_md = """# 测试报告

这是一个中文 PDF 生成测试报告。

## 第一部分：字体测试

以下内容应该使用中文字体显示：

- 黑体（SimHei）用于标题
- 仿宋（STFangSong）用于正文
- 楷体（SimKai）用于强调

### 子测试：样式验证

验证不同级别的标题是否正确显示：

1. 一级标题应该较大且居中
2. 二级标题应该适中且加粗
3. 三级标题应该较小且加粗

## 第二部分：段落测试

这是一段正常的正文内容，应该使用仿宋字体显示。

这是第二段正文，用于测试段落间距和行距是否正确。

## 第三部分：列表测试

以下是项目列表：

- 项目 1
- 项目 2
- 项目 3

以及编号列表：

1. 第一项
2. 第二项
3. 第三项

# 测试完成

如果以上内容都能正确显示中文，则说明字体注册和 PDF 生成功能正常。
"""

    # 创建临时测试文件
    temp_dir = tempfile.gettempdir()
    test_output = os.path.join(temp_dir, "test_chinese_pdf.pdf")

    success = generate_pdf(test_md, test_output, title="中文 PDF 测试报告")

    if success:
        return test_output
    else:
        return "测试失败，请查看日志了解详情"


if __name__ == "__main__":
    # 运行测试
    print("=" * 60)
    print("开始测试中文 PDF 生成...")
    print("=" * 60)

    result = test_pdf_generation()

    if os.path.exists(result):
        print(f"\n✓ 测试成功！PDF 已生成: {result}")
        print(f"  文件大小: {os.path.getsize(result) / 1024:.1f} KB")
    else:
        print(f"\n✗ 测试失败: {result}")

    print("=" * 60)
