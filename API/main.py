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
    CLEANUP_TIMEOUT_HOURS,
    CLEANUP_INTERVAL_MINUTES,
    CORS_ALLOW_ORIGINS,
    CORS_ALLOW_CREDENTIALS,
    CORS_ALLOW_METHODS,
    CORS_ALLOW_HEADERS,
)
from models import HealthResponse
from utils import start_http_server
from storage import storage
from middleware import create_security_middleware
from logging_config import log, request_id_var
from maintenance_state import mark_cleanup_disabled, mark_cleanup_failure, mark_cleanup_started, mark_cleanup_success

# Safety constants
# MAX_CLEANUP_ERRORS = 10
# MAX_ITERATIONS = 1000
# CLEANUP_BACKOFF_SECONDS = 30


def start_periodic_thread_cleanup() -> None:
    """Start a daemon cleanup loop for expired API threads/workspaces."""
    if CLEANUP_INTERVAL_MINUTES <= 0:
        mark_cleanup_disabled(CLEANUP_INTERVAL_MINUTES, CLEANUP_TIMEOUT_HOURS)
        log.info("Periodic thread cleanup disabled")
        return

    interval_seconds = max(int(CLEANUP_INTERVAL_MINUTES), 1) * 60
    mark_cleanup_started(CLEANUP_INTERVAL_MINUTES, CLEANUP_TIMEOUT_HOURS)

    def cleanup_loop():
        while True:
            time.sleep(interval_seconds)
            try:
                cleaned_count = storage.cleanup_expired_threads(timeout_hours=CLEANUP_TIMEOUT_HOURS)
                mark_cleanup_success(cleaned_count)
                if cleaned_count:
                    log.info(f"Periodic cleanup removed {cleaned_count} expired threads")
            except Exception as exc:
                mark_cleanup_failure(exc)
                log.warning(f"Periodic thread cleanup failed: {exc}")

    cleanup_thread = threading.Thread(target=cleanup_loop, name="thread-cleanup", daemon=True)
    cleanup_thread.start()


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

    # Add rate limiting + request tracing as pure ASGI middleware
    create_security_middleware(app)

    # Include all routers
    from file_api import router as file_router
    from models_api import router as models_router
    from chat_api import router as chat_router
    from admin_api import router as admin_router
    from analytics_api import router as analytics_router
    from marketplace_api import router as marketplace_router
    from analysis_workflow_api import router as analysis_workflow_router
    from release_governance_api import router as release_governance_router
    from auth_api import router as auth_router
    from projects_api import router as projects_router
    from knowledge_api import router as knowledge_router
    from database_api import router as database_router
    from export_api import router as export_router

    app.include_router(file_router)
    app.include_router(models_router)
    app.include_router(chat_router)
    app.include_router(admin_router)
    app.include_router(analytics_router)
    app.include_router(marketplace_router)
    app.include_router(analysis_workflow_router)
    app.include_router(release_governance_router)
    app.include_router(auth_router)
    app.include_router(projects_router)
    app.include_router(knowledge_router)
    app.include_router(database_router)
    app.include_router(export_router)

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
    print("   - Auth API: /v1/auth")
    print("   - Models API: /v1/models")
    print("   - Files API: /v1/files")
    print("   - Chat API: /v1/chat/completions")
    print("   - Admin API: /v1/admin")
    print("   - Analytics API: /v1/analytics")
    print("   - Marketplace API: /v1/marketplace")
    print("   - Analysis Workflow API: /v1/analysis-workflows")
    print("   - Governance API: /v1/governance")
    print("   - Projects API: /v1/projects")
    print("   - Knowledge API: /v1/knowledge")
    print("   - Database API: /v1/database")
    print("   - Export API: /v1/export")

    # Start HTTP file server in a separate thread
    http_thread = threading.Thread(target=start_http_server, daemon=True)
    http_thread.start()

    start_periodic_thread_cleanup()

    # Create and start the FastAPI application
    app = create_app()

    print("Starting API server...")
    uvicorn.run(app, host=API_HOST, port=API_PORT)


if __name__ == "__main__":
    main()