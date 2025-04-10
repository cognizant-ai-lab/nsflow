
# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# ENN-release SDK Software in commercial settings.
#
# END COPYRIGHT
import os
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from nsflow.backend.api.router import router

logging.basicConfig(level=logging.INFO)

# Load environment variables from .env
root_dir = os.getcwd()
env_path = os.path.join(root_dir, ".env")
# Load environment variables only if not already loaded
if "DEV_MODE" not in os.environ:
    if os.path.exists(env_path):
        load_dotenv(env_path)
        logging.info("Loaded environment variables from: %s", env_path)
    else:
        logging.warning("No .env file found at %s. Using default values.", env_path)

# Get configurations from the environment
API_HOST = os.getenv("API_HOST", "127.0.0.1")
DEV_MODE = os.getenv("DEV_MODE", "False").strip().lower() == "true"
LOG_LEVEL = os.getenv("API_LOG_LEVEL", "info")
if DEV_MODE:
    logging.info("DEV_MODE: %s", DEV_MODE)
    os.environ["API_PORT"] = "8005"
    logging.info("Running in **DEV MODE** - Using FastAPI on default dev port.")
else:
    logging.info("Running in **DEV MODE** - Using FastAPI on default dev port.")
API_PORT = int(os.getenv("API_PORT", "4173"))


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

# Test root if needed
# @app.get("/")
# def read_root():
#     return {"message": "Welcome to SAN backend!"}


backend_dir = os.path.dirname(os.path.abspath(__file__))
# Move up to `nsflow/`
project_root = os.path.dirname(backend_dir)
frontend_dist_path = os.path.join(project_root, "prebuilt_frontend", "dist")
logging.info("frontend_dist_path: %s", frontend_dist_path)
# Serve Frontend on `/` when
if not DEV_MODE and os.path.exists(frontend_dist_path):
    logging.info("Serving frontend from: %s", frontend_dist_path)
    app.mount("/", StaticFiles(directory=frontend_dist_path, html=True), name="frontend")
else:
    logging.info("DEV MODE: Skipping frontend serving.")


# Uvicorn startup command
if __name__ == "__main__":
    uvicorn.run(
        "nsflow.backend.main:app",
        host=API_HOST,
        port=API_PORT,
        workers=os.cpu_count(),
        log_level=LOG_LEVEL,
        reload=True,
        loop="asyncio",
    )
