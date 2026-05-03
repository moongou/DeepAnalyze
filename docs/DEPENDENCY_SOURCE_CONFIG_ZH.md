# 本地支持库多源配置（DIF / OYX）

本项目已支持依赖自动补装时按多源回退安装，可用于提升弱网或私有仓库环境下的成功率。

## 1. 快速方式：环境变量

```bash
# 优先顺序：先 DIF，再 OYX，再公共镜像
export DEEPANALYZE_DEPENDENCY_SOURCES="dif,oyx,tsinghua,aliyun,pypi"

# DIF 源（可配置多个 extra index）
export DIF_PYPI_INDEX_URL="https://your-dif.example.com/simple"
export DIF_EXTRA_INDEX_URLS="https://your-dif-backup.example.com/simple,https://pypi.org/simple"
export DIF_TRUSTED_HOSTS="your-dif.example.com,your-dif-backup.example.com"

# OYX 源
export OYX_PYPI_INDEX_URL="https://your-oyx.example.com/simple"
export OYX_EXTRA_INDEX_URLS="https://your-oyx-backup.example.com/simple"
export OYX_TRUSTED_HOSTS="your-oyx.example.com,your-oyx-backup.example.com"
```

## 2. 文件方式：.dependency_sources.json

在仓库根目录创建 `.dependency_sources.json`（或 `workspace/_dependency_sources.json`）：

```json
{
  "active_sources": ["dif", "oyx", "tsinghua", "pypi"],
  "profiles": {
    "dif": {
      "index_url": "https://your-dif.example.com/simple",
      "extra_index_urls": [
        "https://your-dif-backup.example.com/simple",
        "https://pypi.org/simple"
      ],
      "trusted_hosts": [
        "your-dif.example.com",
        "your-dif-backup.example.com"
      ]
    },
    "oyx": {
      "index_url": "https://your-oyx.example.com/simple",
      "extra_index_urls": [
        "https://your-oyx-backup.example.com/simple"
      ],
      "trusted_hosts": [
        "your-oyx.example.com",
        "your-oyx-backup.example.com"
      ]
    }
  }
}
```

## 3. 可选字段

- `index_url`: 主索引地址
- `extra_index_urls`: 备用索引列表
- `trusted_hosts`: 对应受信任域名
- `find_links`: 本地 wheel 目录或离线包地址
- `no_index`: 仅使用 `find_links`（离线模式）

## 4. 说明

- 当自动安装依赖失败时，系统会按源顺序逐个尝试并记录每次尝试结果。
- 未配置 DIF/OYX 时会自动跳过并回退到公共镜像。
- 若你需要完全内网离线模式，可设置 `no_index=true` 并配合 `find_links`。
