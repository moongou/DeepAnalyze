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
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image, Table, TableStyle
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== 字体配置 ====================
# 使用中央配置模块
try:
    from config import get_fonts_dir
    FONTS_DIR = get_fonts_dir()
except ImportError:
    # 回退到相对路径解析
    _CURRENT_DIR = Path(__file__).parent.resolve()
    _PROJECT_ROOT = _CURRENT_DIR.parent
    FONTS_DIR = _PROJECT_ROOT / "assets" / "fonts"

# 确保字体目录存在
if not FONTS_DIR.exists():
    logger.warning(f"字体目录不存在: {FONTS_DIR}")
    # 尝试备用路径
    _ALTERNATIVE_FONTS = [
        Path(__file__).parent.parent / "assets" / "fonts",
        Path.home() / "DeepAnalyze" / "assets" / "fonts",
    ]
    for alt_path in _ALTERNATIVE_FONTS:
        if alt_path.exists():
            FONTS_DIR = alt_path
            logger.info(f"使用备用字体目录: {FONTS_DIR}")
            break

# 中文字体定义（按优先级排序）
# 格式: (字体文件名, 字体名称, 字体类型, 描述)
CHINESE_FONTS = [
    ("simhei.ttf", "SimHei", "normal", "黑体 - 主标题/重点内容"),
    ("simkai.ttf", "SimKai", "normal", "楷体 - 引用/强调"),
    ("STFangSong.ttf", "STFangSong", "normal", "仿宋 - 正文/报告"),
    ("STHeiti.ttf", "STHeiti", "normal", "黑体备选"),
    ("LiSongPro.ttf", "LiSongPro", "normal", "宋体风格补充"),
]

AGENT_BRAND_NAME = "观雨"
AGENT_BRAND_FULL = "观雨出口"


def _resolve_font_for_role(role: str) -> str:
    if not _REGISTERED_FONTS:
        register_chinese_fonts()

    role_candidates = {
        "title": ["SimHei", "STHeiti", "LiSongPro"],
        "heading": ["SimHei", "STHeiti"],
        "body": ["STFangSong", "LiSongPro", "SimHei"],
        "quote": ["SimKai", "STFangSong", "SimHei"],
    }
    for candidate in role_candidates.get(role, []):
        if candidate in _REGISTERED_FONTS:
            return candidate
    return get_chinese_font_name()

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

    heading_font = _resolve_font_for_role("heading")
    body_font = _resolve_font_for_role("body")
    quote_font = _resolve_font_for_role("quote")
    title_font = _resolve_font_for_role("title")
    styles = getSampleStyleSheet()

    # 样式配置字典
    style_configs = {
        "normal": {
            "name": "ChineseNormal",
            "parent": styles["Normal"],
            "fontName": body_font,
            "fontSize": 12,
            "leading": 20,
            "spaceAfter": 8,
            "firstLineIndent": 24,
            "alignment": 4,
        },
        "heading1": {
            "name": "ChineseHeading1",
            "parent": styles["Heading1"],
            "fontName": title_font,
            "fontSize": 20,
            "leading": 28,
            "spaceAfter": 16,
            "spaceBefore": 10,
            "alignment": 1,
            "bold": True,
            "textColor": colors.HexColor("#111827"),
        },
        "heading2": {
            "name": "ChineseHeading2",
            "parent": styles["Heading2"],
            "fontName": heading_font,
            "fontSize": 15,
            "leading": 22,
            "spaceAfter": 10,
            "spaceBefore": 10,
            "alignment": 0,
            "bold": True,
        },
        "heading3": {
            "name": "ChineseHeading3",
            "parent": styles["Heading3"],
            "fontName": heading_font,
            "fontSize": 13,
            "leading": 18,
            "spaceAfter": 6,
            "spaceBefore": 8,
            "alignment": 0,
            "bold": True,
        },
        "list": {
            "name": "ChineseList",
            "parent": styles["Normal"],
            "fontName": body_font,
            "fontSize": 12,
            "leading": 20,
            "spaceAfter": 6,
            "leftIndent": 20,
        },
        "caption": {
            "name": "ChineseCaption",
            "parent": styles["Normal"],
            "fontName": quote_font,
            "fontSize": 10,
            "leading": 12,
            "spaceAfter": 8,
            "alignment": 1,
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
    从 Markdown 文本中提取标题、段落块和表格

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

        # 图像检测 (Markdown 语法: ![alt](path))
        img_match = re.match(r'^!\[(.*?)\]\((.*?)\)$', stripped)
        if img_match:
            alt_text = img_match.group(1)
            img_path = img_match.group(2)
            blocks.append({
                "type": "image",
                "content": img_path,
                "alt": alt_text,
                "raw": line
            })
            i += 1
            continue

        # 表格检测 (Markdown 表格: | col1 | col2 | ...)
        if '|' in stripped and stripped.startswith('|'):
            table_lines = []
            while i < len(lines):
                tline = lines[i].strip()
                if tline.startswith('|') and '|' in tline[1:]:
                    table_lines.append(tline)
                    i += 1
                elif not tline:
                    i += 1
                    break
                else:
                    break

            if len(table_lines) >= 2:
                # Parse table
                header_cells = [c.strip() for c in table_lines[0].split('|') if c.strip()]
                data_rows = []
                for tl in table_lines[1:]:
                    # Skip separator line (|---|---|)
                    if re.match(r'^[\|\s\-:]+$', tl):
                        continue
                    row_cells = [c.strip() for c in tl.split('|') if c.strip()]
                    if row_cells:
                        data_rows.append(row_cells)

                if header_cells and data_rows:
                    blocks.append({
                        "type": "table",
                        "content": {
                            "headers": header_cells,
                            "rows": data_rows
                        },
                        "raw": '\n'.join(table_lines)
                    })
                else:
                    # Fallback: treat as paragraph
                    blocks.append({
                        "type": "paragraph",
                        "content": '\n'.join(table_lines),
                        "raw": '\n'.join(table_lines)
                    })
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
            # Also break on table start
            if stripped.startswith('|') and '|' in stripped[1:]:
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

        register_chinese_fonts()
        heading_font = _resolve_font_for_role("heading")
        body_font = _resolve_font_for_role("body")
        title_font = _resolve_font_for_role("title")

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
        report_title = (title or "").strip()
        if not report_title:
            for block in blocks:
                if block.get("type") == "heading1":
                    report_title = str(block.get("content") or "").strip()
                    if report_title:
                        break
        if not report_title:
            report_title = "分析报告"

        if blocks and blocks[0].get("type") == "heading1":
            first_heading = str(blocks[0].get("content") or "").strip()
            if first_heading == report_title:
                blocks = blocks[1:]

        cover_title_style = ParagraphStyle(
            name="ChineseCoverTitle",
            parent=get_chinese_style("heading1"),
            fontName=title_font,
            fontSize=28,
            leading=34,
            alignment=1,
            textColor=colors.white,
            spaceAfter=12,
        )
        cover_subtitle_style = ParagraphStyle(
            name="ChineseCoverSubtitle",
            parent=get_chinese_style("normal"),
            fontName=heading_font,
            fontSize=12,
            leading=18,
            alignment=1,
            textColor=colors.HexColor("#DCE6F2"),
            spaceAfter=6,
        )
        cover_meta_style = ParagraphStyle(
            name="ChineseCoverMeta",
            parent=get_chinese_style("normal"),
            fontName=body_font,
            fontSize=10,
            leading=14,
            alignment=1,
            textColor=colors.HexColor("#EEF3F8"),
        )

        story.append(Spacer(1, A4[1] * 0.16))
        cover_card = Table(
            [[
                Paragraph(report_title, cover_title_style),
            ], [
                Paragraph(f"{AGENT_BRAND_FULL} 智能分析报告", cover_subtitle_style),
            ], [
                Paragraph(f"生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}", cover_meta_style),
            ]],
            colWidths=[doc.width],
        )
        cover_card.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#0F3D66')),
            ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#0F3D66')),
            ('LEFTPADDING', (0, 0), (-1, -1), 28),
            ('RIGHTPADDING', (0, 0), (-1, -1), 28),
            ('TOPPADDING', (0, 0), (-1, -1), 24),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 24),
        ]))
        story.append(cover_card)
        story.append(Spacer(1, 18))
        intro_style = get_chinese_style("normal")
        story.append(Paragraph(f"本报告由{AGENT_BRAND_NAME}智能体自动整理生成，正文参照政府部门公文写作习惯，组织为“目标任务、问题定义、数据探查、核心结论、证据链与分析、处置建议”等部分。", intro_style))
        story.append(PageBreak())

        def _draw_page(canvas, pdf_doc):
            canvas.saveState()
            canvas.setStrokeColor(colors.HexColor('#D7DFE9'))
            canvas.setLineWidth(0.5)
            canvas.line(pdf_doc.leftMargin, A4[1] - 24, A4[0] - pdf_doc.rightMargin, A4[1] - 24)
            canvas.line(pdf_doc.leftMargin, 24, A4[0] - pdf_doc.rightMargin, 24)
            canvas.setFont(body_font, 9)
            canvas.setFillColor(colors.HexColor('#4A5C73'))
            canvas.drawRightString(A4[0] - pdf_doc.rightMargin, 14, f"第 {canvas.getPageNumber()} 页")
            canvas.restoreState()

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

            elif block_type == "image":
                try:
                    # 尝试寻找图像文件
                    img_path = content
                    if not os.path.isabs(img_path):
                        # 如果是相对路径，尝试在输出目录寻找
                        base_dir = os.path.dirname(output_path)
                        full_img_path = os.path.join(base_dir, img_path)
                        if not os.path.exists(full_img_path):
                            # 如果还没找到，尝试当前目录
                            full_img_path = os.path.abspath(img_path)
                    else:
                        full_img_path = img_path

                    if os.path.exists(full_img_path):
                        img = Image(full_img_path)
                        # 自动缩放图像，兼顾页面宽度与视觉高度，避免“撑满整页”
                        available_width = doc.width * 0.92
                        max_height = A4[1] * 0.43
                        width_ratio = available_width / img.drawWidth if img.drawWidth else 1.0
                        height_ratio = max_height / img.drawHeight if img.drawHeight else 1.0
                        ratio = min(width_ratio, height_ratio, 1.0)
                        img.drawWidth = max(1, img.drawWidth * ratio)
                        img.drawHeight = max(1, img.drawHeight * ratio)
                        img.hAlign = 'CENTER'

                        # 使用卡片容器包裹图像，提升阅读层次感
                        image_card = Table([[img]], colWidths=[doc.width], hAlign='CENTER')
                        image_card.setStyle(TableStyle([
                            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#FAFBFD')),
                            ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#D7DFE9')),
                            ('LEFTPADDING', (0, 0), (-1, -1), 10),
                            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                            ('TOPPADDING', (0, 0), (-1, -1), 8),
                            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                        ]))

                        story.append(Spacer(1, 4))
                        story.append(image_card)
                        # 添加图片说明
                        caption_text = (block.get("alt") or Path(full_img_path).stem).strip()
                        if caption_text:
                            caption_style = get_chinese_style("caption")
                            story.append(Paragraph(caption_text, caption_style))
                        story.append(Spacer(1, 12))
                    else:
                        logger.warning(f"图像文件不存在，跳过: {full_img_path}")
                        style = get_chinese_style("normal")
                        story.append(Paragraph(f"[图像缺失: {img_path}]", style))
                except Exception as img_err:
                    logger.error(f"处理图像失败: {img_err}")

            elif block_type == "paragraph":
                style = get_chinese_style("normal")
                story.append(Paragraph(content, style))
                story.append(Spacer(1, 8))

            elif block_type == "table":
                # 使用 reportlab Table 渲染 Markdown 表格
                try:
                    table_data = content
                    headers = table_data.get("headers", [])
                    rows = table_data.get("rows", [])

                    font_name = get_chinese_font_name()

                    # Build table data (header + rows)
                    all_rows = [headers] + rows

                    # Normalize row lengths
                    max_cols = max(len(r) for r in all_rows) if all_rows else 0
                    normalized = []
                    for row in all_rows:
                        padded = list(row) + [''] * (max_cols - len(row))
                        normalized.append(padded[:max_cols])

                    if normalized and max_cols > 0:
                        # Calculate column widths (proportional to page width)
                        available_width = A4[0] - 100  # page width minus margins
                        col_width = available_width / max_cols

                        table = Table(normalized, colWidths=[col_width] * max_cols)
                        table.setStyle(TableStyle([
                            ('FONTNAME', (0, 0), (-1, -1), font_name),
                            ('FONTSIZE', (0, 0), (-1, -1), 9),
                            ('FONTNAME', (0, 0), (-1, 0), font_name),
                            ('FONTSIZE', (0, 0), (-1, 0), 10),
                            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#003366')),
                            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F0F4F8')]),
                            ('TOPPADDING', (0, 0), (-1, -1), 4),
                            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                            ('LEFTPADDING', (0, 0), (-1, -1), 6),
                            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                        ]))
                        story.append(table)
                        story.append(Spacer(1, 12))
                except Exception as table_err:
                    logger.error(f"表格渲染失败: {table_err}")
                    # Fallback: render as text
                    style = get_chinese_style("normal")
                    raw_text = block.get("raw", str(content))
                    story.append(Paragraph(raw_text.replace('\n', '<br/>'), style))
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
        doc.build(story, onFirstPage=_draw_page, onLaterPages=_draw_page)

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


# ==================== 模块加载时自动注册字体（一次性） ====================
# 在模块首次被导入时立即注册所有中文字体，后续调用 register_chinese_fonts()
# 将直接返回缓存结果，避免在每次生成报告时重复执行注册操作。
_startup_fonts = register_chinese_fonts(force=False)
if _startup_fonts:
    logger.info(f"[启动优化] 字体已在模块加载时预注册: {list(_startup_fonts.keys())}")
else:
    logger.warning("[启动优化] 模块加载时未能注册任何中文字体")


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
