
# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# nsflow SDK Software in commercial settings.
#
# END COPYRIGHT
import os
import logging
from contextlib import asynccontextmanager
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from nsflow.backend.api.router import router
from nsflow.backend.utils.tools.ns_configs_registry import NsConfigsRegistry

logging.basicConfig(level=logging.INFO)

# Get configurations from the environment
NSFLOW_HOST = os.getenv("NSFLOW_HOST", "127.0.0.1")
NSFLOW_DEV_MODE = os.getenv("NSFLOW_DEV_MODE", "False").strip().lower() == "true"
NSFLOW_LOG_LEVEL = os.getenv("NSFLOW_LOG_LEVEL", "info")

if NSFLOW_DEV_MODE:
    logging.info("DEV_MODE: %s", NSFLOW_DEV_MODE)
    # Use the values set in run.py or 8005 by default
    os.environ["NSFLOW_PORT"] = os.getenv("NSFLOW_PORT", "8005")
    logging.info("Running in **DEV MODE** - Using FastAPI on default dev port.")
# finally, get nsflow_port
NSFLOW_PORT = int(os.getenv("NSFLOW_PORT", "4173"))


def initialize_ns_config_from_env():
    """Initialize default NeuroSan config into registry using env variables."""
    default_port = int(os.getenv("NEURO_SAN_SERVER_HTTP_PORT", "8080"))
    if os.getenv("NSFLOW_CLIENT_ONLY", "False").lower() == "true":
        logging.info("CLIENT-ONLY mode detected. Starting client with default neuro-san configs.")
    default_connection = os.getenv("NEURO_SAN_SERVER_CONNECTION", "http")
    default_host = os.getenv("NEURO_SAN_SERVER_HOST", "localhost")
    if default_connection == "grpc":
        default_port = int(os.getenv("NEURO_SAN_GRPC_SERVER_PORT", "30011"))
    NsConfigsRegistry.set_current(default_connection, default_host, default_port)
    logging.info("[Startup] Default NsConfig set to %s://%s:%s", default_connection, default_host, default_port)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Handles the startup and shutdown of the FastAPI application."""
    logging.info("FastAPI is starting up...")
    logging.info("Initializing NeuroSan config from environment variables...")
    initialize_ns_config_from_env()
    try:
        yield
    finally:
        logging.info("FastAPI is shutting down...")

# Initialize FastAPI app with lifespan event
app = FastAPI(lifespan=lifespan)

# Enable CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router)

backend_dir = os.path.dirname(os.path.abspath(__file__))
# Move up to `nsflow/`
project_root = os.path.dirname(backend_dir)
frontend_dist_path = os.path.join(project_root, "prebuilt_frontend", "dist")
logging.info("frontend_dist_path: %s", frontend_dist_path)
# Serve Frontend on `/` when
if not NSFLOW_DEV_MODE and os.path.exists(frontend_dist_path):
    logging.info("Serving frontend from: %s", frontend_dist_path)
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist_path, "assets"), html=True), name="frontend")
else:
    logging.info("DEV MODE: Skipping frontend serving.")


@app.get("/{path_name:path}", response_class=HTMLResponse)
async def spa_fallback(path_name: str):
    """
    Serve the frontend Single-Page Application (SPA) index.html file for all non-API routes.
    This endpoint acts as a fallback handler for client-side routing in modern web apps
    (e.g., React, Vue, Svelte, etc.). If the requested path is not an API route, it returns
    the compiled `index.html` file from the frontend distribution directory, allowing the
    SPA router to handle navigation internally.
    :param: path_name (str): The requested path after the root (e.g., '/dashboard', '/settings').
    :return: HTMLResponse: The contents of the frontend `index.html` file when found.
    """
    if path_name.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")

    index_file_path = os.path.join(frontend_dist_path, "index.html")
    if os.path.exists(index_file_path):
        with open(index_file_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    else:
        logging.error("index.html not found at: %s", index_file_path)
        raise HTTPException(status_code=500, detail="index.html not found")


# Uvicorn startup command
if __name__ == "__main__":
    uvicorn.run(
        "nsflow.backend.main:app",
        host=NSFLOW_HOST,
        port=NSFLOW_PORT,
        workers=os.cpu_count(),
        log_level=NSFLOW_LOG_LEVEL,
        reload=True,
        loop="asyncio",
    )
