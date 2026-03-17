# 1. 安装并加载必要的包
install.packages(c("showtext", "sysfonts"))
library(showtext)
library(sysfonts)

# 2. 添加字体
# 方法：从系统已安装的字体中添加（推荐）
# 公文核心字体
font_add("STKaiti", "simkai.ttf")            # 系统楷体
font_add("STFangsong", "simfang.ttf")         # 系统仿宋
font_add("SimHei", "simhei.ttf")              # 系统黑体

# 方正小标宋简体 (如果已安装，需要找到准确的字体文件名，通常是 FZBSK.TTF)
# font_add("FZxiaobiaosong", "C:/Windows/Fonts/FZBSK.TTF")

# 其他免费字体
font_add("AliHealth", "path/to/Alibaba-PuHuiTi-Regular.ttf") # 替换路径
font_add("WenKai", "path/to/LXGWWenKai-Regular.ttf")         # 替换路径

# 3. 启用 showtext
showtext_auto()

# 4. 打开PDF图形设备
pdf("chinese_plot_with_official.pdf", width = 10, height = 7)

# 5. 绘制图形，模拟公文格式
par(family = "STFangsong") # 设置全局字体为仿宋

# 创建一个空图
plot(1:10, type = "n", axes = FALSE, xlab = "", ylab = "", main = "")

# 添加标题 (模拟公文标题)
title(main = "公文标题示例（方正小标宋简体）",
      family = "FZxiaobiaosong", cex.main = 1.8, col.main = "red") # 红头文件

# 添加正文 (仿宋)
text(5, 8, "一、 一级标题（黑体）", family = "SimHei", cex = 1.2, font = 2)
text(5, 7, "   （一）二级标题（楷体）", family = "STKaiti", cex = 1.1)
text(5, 6, "      这是公文正文内容，使用的是仿宋字体。根据国家标准，公文正文一般用三号仿宋体字。",
     family = "STFangsong", cex = 1)

# 添加其他字体示例
text(5, 4, "这是一段用霞鹜文楷展示的文本。", family = "WenKai", cex = 1.2, col = "darkgreen")

# 6. 关闭设备
dev.off()

# 7. 可选：关闭 showtext
showtext_auto(FALSE)