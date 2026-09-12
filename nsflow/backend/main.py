# Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# END COPYRIGHT
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from nsflow.backend.api.router import router
from nsflow.backend.db.database import init_nss_db
from nsflow.backend.utils.tools.ns_configs_registry import NsConfigsRegistry

# Get configurations from the environment
NSFLOW_HOST = os.getenv("NSFLOW_HOST", "127.0.0.1")
NSFLOW_DEV_MODE = os.getenv("NSFLOW_DEV_MODE", "False").strip().lower() == "true"
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

# Convert string log level to logging constant
NUMERIC_LOG_LEVEL = getattr(logging, LOG_LEVEL, logging.INFO)

# Configure root logger once at application startup
# All module loggers will inherit this configuration
logging.basicConfig(
    level=NUMERIC_LOG_LEVEL, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
)

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
    NsConfigsRegistry.set_current(default_connection, default_host, default_port)
    logging.info("[Startup] Default NsConfig set to %s://%s:%s", default_connection, default_host, default_port)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Handles the startup and shutdown of the FastAPI application."""
    logging.info("FastAPI is starting up...")
    logging.info("Initializing NeuroSan config from environment variables...")
    initialize_ns_config_from_env()
    logging.info("Initializing local database 'nss_local.db'...")
    init_nss_db()
    logging.info("Local database 'nss_local.db' initialized")
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


def _dist_file(path_name: str) -> Optional[str]:
    """
    Resolve a request path to a file at the root of the frontend build.

    :param path_name: The requested path, relative to the site root.
    :return: An absolute path to the file, or None when the request is not for one.
             index.html is excluded so the SPA fallback keeps serving it.
    """
    if not path_name or path_name == "index.html":
        return None

    # Resolve both sides before comparing: a path like "../../etc/passwd" must not
    # escape the build directory just because it exists.
    dist_root = os.path.realpath(frontend_dist_path)
    candidate = os.path.realpath(os.path.join(dist_root, path_name))
    if not candidate.startswith(dist_root + os.sep):
        return None

    return candidate if os.path.isfile(candidate) else None


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

    # A real file sitting at the top of the build is served as itself. Only /assets is
    # mounted, so anything Vite copies from public/ to the dist root — the favicon,
    # robots.txt — used to fall through to here and be answered with index.html. A
    # browser asked for an SVG and got HTML, which is why no tab icon ever appeared.
    static_file = _dist_file(path_name)
    if static_file is not None:
        return FileResponse(static_file)

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
        log_level=LOG_LEVEL.lower(),
        reload=True,
        loop="asyncio",
    )
