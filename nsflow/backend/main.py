
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
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from nsflow.backend.api.router import router

logging.basicConfig(level=logging.INFO)

# Get configurations from the environment
NSFLOW_HOST = os.getenv("NSFLOW_HOST", "127.0.0.1")
NSFLOW_DEV_MODE = os.getenv("NSFLOW_DEV_MODE", "False").strip().lower() == "true"
NSFLOW_LOG_LEVEL = os.getenv("NSFLOW_LOG_LEVEL", "info")

if NSFLOW_DEV_MODE:
    logging.info("DEV_MODE: %s", NSFLOW_DEV_MODE)
    os.environ["NSFLOW_PORT"] = "8005"
    logging.info("Running in **DEV MODE** - Using FastAPI on default dev port.")
else:
    logging.info("Running in **DEV MODE** - Using FastAPI on default dev port.")
# finally, get nsflow_port
NSFLOW_PORT = int(os.getenv("NSFLOW_PORT", "4173"))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Handles the startup and shutdown of the FastAPI application."""
    logging.info("FastAPI is starting up...")
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
    app.mount("/", StaticFiles(directory=frontend_dist_path, html=True), name="frontend")
else:
    logging.info("DEV MODE: Skipping frontend serving.")


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
