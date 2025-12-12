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

import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker


Base = declarative_base()

# CRUSE Threads database configuration
# Supports both SQLite (default) and PostgreSQL
THREADS_DB_TYPE = os.getenv("THREADS_DB_TYPE", "sqlite").lower()
THREADS_DB_URL = None

if THREADS_DB_TYPE == "postgresql":
    # PostgreSQL configuration
    THREADS_DB_HOST = os.getenv("THREADS_DB_HOST", "localhost")
    THREADS_DB_PORT = os.getenv("THREADS_DB_PORT", "5432")
    THREADS_DB_NAME = os.getenv("THREADS_DB_NAME", "threads_db")
    THREADS_DB_USER = os.getenv("THREADS_DB_USER", "postgres")
    THREADS_DB_PASSWORD = os.getenv("THREADS_DB_PASSWORD", "postgres")
    THREADS_DB_URL = f"postgresql://{THREADS_DB_USER}:{THREADS_DB_PASSWORD}@{THREADS_DB_HOST}:{THREADS_DB_PORT}/{THREADS_DB_NAME}"
else:
    # SQLite configuration (default)
    THREADS_DB_PATH = os.getenv("THREADS_DB_PATH", "./cruse_threads.db")
    THREADS_DB_URL = f"sqlite:///{THREADS_DB_PATH}"

# Create threads engine and session
if THREADS_DB_URL:
    threads_engine_args = {"connect_args": {"check_same_thread": False}} if THREADS_DB_TYPE == "sqlite" else {}
    threads_engine = create_engine(THREADS_DB_URL, **threads_engine_args)

    # Enable foreign key constraints for SQLite (required for CASCADE DELETE)
    if THREADS_DB_TYPE == "sqlite":
        @event.listens_for(threads_engine, "connect")
        def set_sqlite_pragma(dbapi_conn, connection_record):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    ThreadsSessionLocal = sessionmaker(bind=threads_engine, autocommit=False, autoflush=False)
else:
    threads_engine = None
    ThreadsSessionLocal = None


def get_threads_db():
    """
    Dependency function for FastAPI endpoints to get a threads database session.
    Usage: db: Session = Depends(get_threads_db)
    """
    if ThreadsSessionLocal is None:
        raise RuntimeError("Threads database is not configured")
    db = ThreadsSessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_threads_db():
    """
    Initialize threads database tables.
    Should be called on application startup.
    """
    if threads_engine is None:
        raise RuntimeError("Threads database engine is not configured")
    Base.metadata.create_all(bind=threads_engine)
