"""
Main application entry point for DeepAnalyze API Server
Sets up the FastAPI application and starts the server
"""

import time
import threading
import signal
import sys
import atexit
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from config import (
    API_HOST,
    API_PORT,
    API_TITLE,
    API_VERSION,
    HTTP_SERVER_PORT,
    CLEANUP_INTERVAL_MINUTES,
    CORS_ALLOW_ORIGINS,
    CORS_ALLOW_CREDENTIALS,
    CORS_ALLOW_METHODS,
    CORS_ALLOW_HEADERS,
)
from models import HealthResponse
from utils import start_http_server
from storage import storage

# Safety constants
# MAX_CLEANUP_ERRORS = 10
# MAX_ITERATIONS = 1000
# CLEANUP_BACKOFF_SECONDS = 30


def create_app() -> FastAPI:
    """Create and configure the FastAPI application"""
    app = FastAPI(title=API_TITLE, version=API_VERSION)

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ALLOW_ORIGINS,
        allow_credentials=CORS_ALLOW_CREDENTIALS,
        allow_methods=CORS_ALLOW_METHODS,
        allow_headers=CORS_ALLOW_HEADERS,
    )

    # Include all routers
    from file_api import router as file_router
    from models_api import router as models_router
    from chat_api import router as chat_router
    from admin_api import router as admin_router
    from analytics_api import router as analytics_router
    from marketplace_api import router as marketplace_router
    from analysis_workflow_api import router as analysis_workflow_router
    from release_governance_api import router as release_governance_router

    app.include_router(file_router)
    app.include_router(models_router)
    app.include_router(chat_router)
    app.include_router(admin_router)
    app.include_router(analytics_router)
    app.include_router(marketplace_router)
    app.include_router(analysis_workflow_router)
    app.include_router(release_governance_router)

    # Health check endpoint
    @app.get("/health", response_model=HealthResponse)
    async def health_check():
        """Health check endpoint"""
        return HealthResponse(
            status="healthy",
            timestamp=int(time.time())
        )

    return app


def main():
    """Main entry point to start the API server"""
    print("🚀 Starting DeepAnalyze OpenAI-Compatible API Server...")
    print(f"   - API Server: http://{API_HOST}:{API_PORT}")
    print(f"   - File Server: http://localhost:{HTTP_SERVER_PORT}")
    print(f"   - Workspace: workspace")
    print("\n📖 API Endpoints:")
    print("   - Models API: /v1/models")
    print("   - Files API: /v1/files")
    print("   - Chat API: /v1/chat/completions")
    print("   - Admin API: /v1/admin")
    print("   - Model Provider Admin: /v1/admin/model-providers")
    print("   - Model Catalog Admin: /v1/admin/model-catalog")
    print("   - Analytics API: /v1/analytics")
    print("   - Marketplace API: /v1/marketplace")
    print("   - Analysis Workflow API: /v1/analysis-workflows")
    print("   - Governance API: /v1/governance")

    # Start HTTP file server in a separate thread
    http_thread = threading.Thread(target=start_http_server, daemon=True)
    http_thread.start()

    # Create and start the FastAPI application
    app = create_app()

    print("Starting API server...")
    uvicorn.run(app, host=API_HOST, port=API_PORT)


if __name__ == "__main__":
    main()