import os
import uvicorn
import logging
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from nsflow.backend.api.router import router

logging.basicConfig(level=logging.INFO)

# Load environment variables from .env
root_dir = os.getcwd()
env_path = os.path.join(root_dir, ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
    logging.info(f"Loaded environment variables from {env_path}")
else:
    logging.warning(f"No .env file found at {env_path}. Using default values.")

# Get configurations from the environment
API_HOST = os.getenv("API_HOST", "127.0.0.1")
API_PORT = int(os.getenv("API_PORT", 4173))  # Default production port
DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"  # Use "8005" if `--dev` is set
LOG_LEVEL = os.getenv("API_LOG_LEVEL", "info")

if DEV_MODE:
    API_PORT = 8005  # Switch to port 8005 in dev mode
    logging.info("Running in **DEV MODE** - Using FastAPI on port 8005")

@asynccontextmanager
async def lifespan(app: FastAPI):
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

# Serve Frontend on `/`
backend_dir = os.path.dirname(os.path.abspath(__file__))
# Move up to `nsflow/`
project_root = os.path.dirname(backend_dir)  
frontend_dist_path = os.path.join(project_root, "prebuilt_frontend", "dist")
if not DEV_MODE and os.path.exists(frontend_dist_path):
    logging.info(f"Serving frontend from {frontend_dist_path}")
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
