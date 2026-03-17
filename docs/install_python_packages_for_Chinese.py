from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

# --- 注册所有字体 ---
# 1. 公文核心字体 (请将路径替换为你电脑上的实际路径)
# 方正小标宋简体通常需要下载安装，找到其安装路径，例如：
pdfmetrics.registerFont(TTFont('FZxiaobiaosong', 'C:/Windows/Fonts/FZBSK.TTF')) # 示例路径，请修改
# 系统自带的黑体、仿宋、楷体
pdfmetrics.registerFont(TTFont('SimHei', 'C:/Windows/Fonts/simhei.ttf'))
pdfmetrics.registerFont(TTFont('SimFang', 'C:/Windows/Fonts/simfang.ttf'))
pdfmetrics.registerFont(TTFont('SimKai', 'C:/Windows/Fonts/simkai.ttf'))

# 2. 其他常用免费字体 (同样，请替换为你的路径)
pdfmetrics.registerFont(TTFont('AliHealth', 'path/to/Alibaba-PuHuiTi-Regular.ttf'))
pdfmetrics.registerFont(TTFont('WenKai', 'path/to/LXGWWenKai-Regular.ttf'))
# ... 你可以在这里继续注册其他字体

# --- 创建PDF示例 ---
c = canvas.Canvas("chinese_example_with_official.pdf", pagesize=letter)

# 使用公文标题字体：小标宋
c.setFont('FZxiaobiaosong', 18)
c.drawString(100, 750, '这是公文标题：使用方正小标宋简体')

# 使用公文正文字体：仿宋
c.setFont('SimFang', 12)
c.drawString(100, 720, '这是公文正文内容，使用的是仿宋字体。根据国家标准，公文正文一般用三号仿宋体字。')

# 使用公文一级标题字体：黑体
c.setFont('SimHei', 14)
c.drawString(100, 690, '一、 这是公文一级标题（黑体）')

# 使用公文二级标题字体：楷体
c.setFont('SimKai', 12)
c.drawString(120, 660, '（一）这是公文二级标题（楷体）')

# 使用其他免费字体
c.setFont('WenKai', 12)
c.drawString(100, 620, '这是一段用霞鹜文楷展示的文本，适用于阅读类内容。')

c.save()