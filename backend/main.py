import os
import uvicorn
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from backend.api.router import router

logging.basicConfig(level=logging.INFO)

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
    allow_origins=["http://localhost:5173", "ws://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router)

@app.get("/")
def read_root():
    return {"message": "Welcome to SAN backend!"}

# Uvicorn startup command
if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="127.0.0.1",
        port=8000,
        workers=os.cpu_count(),
        log_level="info",
        reload=True,
        loop="asyncio",
    )
