# ============================================
# DeepAnalyze Docker Environment
# Full-stack: Backend API + Frontend + Model Server
# Supports GPU (CUDA) and CPU modes
# ============================================

# Base image with NVIDIA CUDA support
FROM nvidia/cuda:12.1.0-devel-ubuntu22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MPLBACKEND=Agg \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# Set working directory
WORKDIR /app

# Install system dependencies (including R, Node.js, fonts, Office support)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    git \
    curl \
    wget \
    vim \
    ca-certificates \
    # R language
    r-base \
    r-base-dev \
    # Node.js (for frontend)
    nodejs \
    npm \
    # Fonts for Chinese PDF/report generation
    fonts-noto-cjk \
    fonts-wqy-zenhei \
    fonts-wqy-microhei \
    fontconfig \
    # Office document processing dependencies
    libxml2-dev \
    libxslt1-dev \
    zlib1g-dev \
    libjpeg-dev \
    libpng-dev \
    libfreetype6-dev \
    # PDF/image processing
    poppler-utils \
    ghostscript \
    # pandoc for document conversion
    pandoc \
    # Graphviz for graph visualization
    graphviz \
    libgraphviz-dev \
    # FreeTDS for SQL Server
    freetds-dev \
    # PostgreSQL client
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x (LTS) for frontend
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip3 install --upgrade pip wheel setuptools

# Copy requirements first (for Docker layer caching)
COPY requirements.txt /app/requirements.txt
COPY requirements_python.txt /app/requirements_python.txt

# Install Python dependencies
RUN pip3 install -r requirements.txt

# Install vLLM for GPU inference
RUN pip3 install vllm

# Install R packages
COPY requirements_r.txt /app/requirements_r.txt
RUN Rscript -e "install.packages(c('tidyverse','ggplot2','showtext','readxl','writexl','dplyr','tidyr','stringr','lubridate','knitr','rmarkdown','openxlsx','data.table','scales','broom','jsonlite','sysfonts','Cairo'), repos='https://cloud.r-project.org/')"

# Copy application code
COPY . /app/

# Copy Chinese fonts to system font directory
RUN if [ -d /app/assets/fonts ]; then \
    cp /app/assets/fonts/*.ttf /usr/local/share/fonts/ 2>/dev/null || true; \
    cp /app/assets/fonts/*.ttc /usr/local/share/fonts/ 2>/dev/null || true; \
    fc-cache -fv; \
    fi

# Install frontend dependencies
RUN if [ -d /app/demo/chat/frontend ]; then \
    cd /app/demo/chat/frontend && npm install; \
    fi

# Create necessary directories
RUN mkdir -p /app/logs /app/demo/chat/workspace /app/demo/chat/projects

# Expose ports: Model API, Backend API, File Server, Frontend
EXPOSE 8000 8200 8100 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8200/api/settings/hardware || exit 1

# Default command: start all services
CMD ["/bin/bash", "/app/start_all.sh"]
