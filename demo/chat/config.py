"""
项目配置模块 - 统一管理所有路径和配置

此模块提供动态路径解析，避免硬编码路径，支持：
1. 从任意位置运行时正确解析项目根目录
2. 开发和生产环境自动适配
3. Session 隔离的工作区管理
"""

import os
from pathlib import Path
from typing import Optional


class ProjectConfig:
    """项目配置类 - 单例模式"""

    _instance: Optional['ProjectConfig'] = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True

        # 解析项目根目录
        self._project_root = self._resolve_project_root()

        # 设置各种路径
        self._setup_paths()

    def _resolve_project_root(self) -> Path:
        """
        解析项目根目录

        查找顺序：
        1. 尝试从当前工作目录向上查找
        2. 尝试从当前文件位置向上查找
        3. 回退到当前目录
        """
        candidates = []

        # 1. 从当前工作目录查找
        cwd = Path.cwd()
        candidates.append(cwd)

        # 2. 从当前文件位置查找
        current_file = Path(__file__).resolve()
        candidates.append(current_file)
        candidates.append(current_file.parent)

        # 3. 向上遍历查找标记文件或目录
        markers = ['assets', 'demo', 'DeepAnalyze-8B', '.git']

        for base in candidates:
            # 向上遍历最多5级
            for i in range(5):
                path = base
                for _ in range(i):
                    path = path.parent

                # 检查是否包含标记
                if any((path / marker).exists() for marker in markers):
                    # 找到项目根目录
                    return path.resolve()

        # 4. 回退：使用 demo/chat 目录的父目录
        if (Path.cwd() / 'demo' / 'chat').exists():
            return Path.cwd().resolve()

        # 5. 最后回退：使用当前目录
        return Path.cwd().resolve()

    def _setup_paths(self):
        """设置各种路径"""
        # 项目根目录
        self.PROJECT_ROOT = self._project_root

        # 资源目录
        self.ASSETS_DIR = self.PROJECT_ROOT / 'assets'
        self.FONTS_DIR = self.ASSETS_DIR / 'fonts'

        # Demo 目录
        self.DEMO_DIR = self.PROJECT_ROOT / 'demo'
        self.CHAT_DIR = self.DEMO_DIR / 'chat'

        # 工作区目录
        self.WORKSPACE_BASE_DIR = self.CHAT_DIR / 'workspace'

        # 日志目录
        self.LOGS_DIR = self.PROJECT_ROOT / 'logs'

        # 临时目录
        self.TEMP_DIR = self.CHAT_DIR / 'temp'

    @property
    def backend_dir(self) -> Path:
        """后端目录（demo/chat）"""
        return self.CHAT_DIR

    @property
    def frontend_dir(self) -> Path:
        """前端目录"""
        return self.CHAT_DIR / 'frontend'

    @property
    def projects_dir(self) -> Path:
        """项目文件目录"""
        return self.CHAT_DIR / 'projects'

    def get_session_workspace(self, session_id: str = 'default') -> Path:
        """
        获取指定 session 的工作区目录

        Args:
            session_id: session 标识符

        Returns:
            Path: 工作区目录路径
        """
        workspace = self.WORKSPACE_BASE_DIR / session_id
        workspace.mkdir(parents=True, exist_ok=True)
        return workspace.resolve()

    def get_font_path(self, font_filename: str) -> Optional[Path]:
        """
        获取字体文件的完整路径

        Args:
            font_filename: 字体文件名（如 simhei.ttf）

        Returns:
            Path: 字体文件路径，不存在则返回 None
        """
        font_path = self.FONTS_DIR / font_filename
        return font_path if font_path.exists() else None

    def ensure_directories(self):
        """确保所有必需的目录存在"""
        dirs_to_create = [
            self.FONTS_DIR,
            self.WORKSPACE_BASE_DIR,
            self.LOGS_DIR,
            self.TEMP_DIR,
            self.projects_dir,
        ]

        for directory in dirs_to_create:
            directory.mkdir(parents=True, exist_ok=True)

    def __repr__(self) -> str:
        return f"ProjectConfig(project_root={self.PROJECT_ROOT}, fonts_dir={self.FONTS_DIR})"


# 全局配置实例（单例）
config = ProjectConfig()


# 便捷函数
def get_config() -> ProjectConfig:
    """获取全局配置实例"""
    return config


def get_project_root() -> Path:
    """获取项目根目录"""
    return config.PROJECT_ROOT


def get_fonts_dir() -> Path:
    """获取字体目录"""
    return config.FONTS_DIR


def get_font_path(font_filename: str) -> Optional[Path]:
    """获取字体文件路径"""
    return config.get_font_path(font_filename)


def get_session_workspace(session_id: str = 'default') -> Path:
    """获取 session 工作区目录"""
    return config.get_session_workspace(session_id)


if __name__ == "__main__":
    # 测试配置
    print("=" * 60)
    print("项目配置测试")
    print("=" * 60)
    print(f"项目根目录: {config.PROJECT_ROOT}")
    print(f"字体目录: {config.FONTS_DIR}")
    print(f"工作区目录: {config.WORKSPACE_BASE_DIR}")
    print(f"工作区目录存在: {config.WORKSPACE_BASE_DIR.exists()}")
    print(f"字体目录存在: {config.FONTS_DIR.exists()}")

    # 测试字体路径
    test_font = "simhei.ttf"
    font_path = config.get_font_path(test_font)
    print(f"字体文件 {test_font}: {font_path}")

    # 测试 session 工作区
    test_session = config.get_session_workspace("test_session_123")
    print(f"测试工作区: {test_session}")
    print("=" * 60)