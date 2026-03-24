import os
import pandas as pd
from datetime import timedelta
from pathlib import Path

# Try to import established utils
try:
    from .pdf_utils import register_chinese_fonts, get_chinese_font_name, generate_pdf as gen_pdf_rl
    from .docx_utils import generate_docx as gen_docx_impl
except (ImportError, ValueError):
    # Fallback for direct execution or different import contexts
    try:
        from pdf_utils import register_chinese_fonts, get_chinese_font_name, generate_pdf as gen_pdf_rl
        from docx_utils import generate_docx as gen_docx_impl
    except ImportError:
        register_chinese_fonts = None
        gen_pdf_rl = None
        gen_docx_impl = None

def get_fonts_dir():
    """Find fonts directory dynamically."""
    # Try using config if available
    try:
        from config import get_fonts_dir as gfd
        return gfd()
    except ImportError:
        pass

    current_dir = Path(__file__).parent.resolve()
    project_root = current_dir
    # If we are in demo/chat/
    if (project_root / "assets").exists():
        return project_root / "assets" / "fonts"

    # Try parent
    project_root = current_dir.parent
    if (project_root / "assets").exists():
        return project_root / "assets" / "fonts"

    # Fallback to absolute known path for this specific environment
    fallback = Path("/Users/m3max/IdeaProjects/DeepAnalyze/assets/fonts")
    if fallback.exists():
        return fallback

    return Path("assets/fonts")

def init_fpdf_chinese():
    """
    Returns an FPDF instance with pre-registered Chinese fonts.
    Solves the 'Undefined font: simhei' issue by ensuring all instances
    have the same registration.
    """
    try:
        from fpdf import FPDF
    except ImportError:
        print("Error: fpdf2 library not installed. Please use 'pip install fpdf2'")
        return None

    pdf = FPDF()
    fonts_dir = get_fonts_dir()

    # Fonts to register
    # Format: (name, filename)
    fonts = [
        ('SimHei', 'simhei.ttf'),
        ('SimKai', 'simkai.ttf'),
        ('STFangSong', 'STFangSong.ttf'),
        ('STHeiti', 'STHeiti.ttf')
    ]

    count = 0
    for font_name, filename in fonts:
        font_path = fonts_dir / filename
        if font_path.exists():
            # Register regular
            pdf.add_font(font_name, '', str(font_path))
            # Register bold (using same file as fallback if dedicated bold doesn't exist)
            pdf.add_font(font_name, 'B', str(font_path))
            count += 1

    if count == 0:
        print(f"Warning: No Chinese fonts found in {fonts_dir}")

    return pdf

def generate_report_pdf(md_text, output_path, title="Analysis Report"):
    """
    Generate a PDF report from Markdown text using the best available method.
    Priority: 1. reportlab (via pdf_utils), 2. fpdf2
    """
    if gen_pdf_rl:
        return gen_pdf_rl(md_text, output_path, title=title)

    # Fallback to FPDF2
    pdf = init_fpdf_chinese()
    if not pdf:
        return False

    pdf.add_page()
    pdf.set_font('SimHei', 'B', 16)
    pdf.cell(0, 10, title, ln=True, align='C')
    pdf.ln(5)

    pdf.set_font('STFangSong', '', 12)
    # Simple markdown-ish to PDF converter for fpdf2
    lines = md_text.split('\n')
    for line in lines:
        if line.startswith('# '):
            pdf.set_font('SimHei', 'B', 16)
            pdf.multi_cell(0, 10, line[2:].strip())
        elif line.startswith('## '):
            pdf.set_font('SimHei', 'B', 14)
            pdf.multi_cell(0, 10, line[3:].strip())
        elif line.startswith('### '):
            pdf.set_font('SimHei', 'B', 12)
            pdf.multi_cell(0, 10, line[4:].strip())
        else:
            pdf.set_font('STFangSong', '', 11)
            pdf.multi_cell(0, 8, line)

    pdf.output(output_path)
    return True

def generate_report_docx(md_text, output_path, title="Analysis Report"):
    """Generate a DOCX report from Markdown text."""
    if gen_docx_impl:
        return gen_docx_impl(md_text, output_path, title=title)
    return False

def pandas_date_sub(series_or_timestamp, days):
    """
    Safely subtract days from a pandas series or Timestamp.
    Fixes: TypeError: Addition/subtraction of integers and integer-arrays with Timestamp is no longer supported
    """
    try:
        if isinstance(series_or_timestamp, (pd.Series, pd.Index)):
            return series_or_timestamp - pd.Timedelta(days=days)
        elif isinstance(series_or_timestamp, (pd.Timestamp, pd.DatetimeIndex)):
            return series_or_timestamp - pd.Timedelta(days=days)
        else:
            # Fallback for standard datetime
            return series_or_timestamp - timedelta(days=days)
    except Exception as e:
        print(f"Date math error: {e}")
        return series_or_timestamp

def pandas_date_add(series_or_timestamp, days):
    """Safely add days to a pandas series or Timestamp."""
    try:
        if isinstance(series_or_timestamp, (pd.Series, pd.Index)):
            return series_or_timestamp + pd.Timedelta(days=days)
        elif isinstance(series_or_timestamp, (pd.Timestamp, pd.DatetimeIndex)):
            return series_or_timestamp + pd.Timedelta(days=days)
        else:
            return series_or_timestamp + timedelta(days=days)
    except Exception as e:
        print(f"Date math error: {e}")
        return series_or_timestamp
