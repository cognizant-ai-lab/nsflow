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

# NSS local database configuration
# Supports both SQLite (default) and PostgreSQL
NSS_DB_TYPE = os.getenv("NSS_DB_TYPE", "sqlite").lower()
NSS_DB_URL = None

if NSS_DB_TYPE == "postgresql":
    # PostgreSQL configuration
    NSS_DB_HOST = os.getenv("NSS_DB_HOST", "localhost")
    NSS_DB_PORT = os.getenv("NSS_DB_PORT", "5432")
    NSS_DB_NAME = os.getenv("NSS_DB_NAME", "nss_db")
    NSS_DB_USER = os.getenv("NSS_DB_USER", "postgres")
    NSS_DB_PASSWORD = os.getenv("NSS_DB_PASSWORD", "postgres")
    NSS_DB_URL = f"postgresql://{NSS_DB_USER}:{NSS_DB_PASSWORD}@{NSS_DB_HOST}:{NSS_DB_PORT}/{NSS_DB_NAME}"
else:
    # SQLite configuration (default)
    NSS_DB_PATH = os.getenv("NSS_DB_PATH", "./nss_local.db")
    NSS_DB_URL = f"sqlite:///{NSS_DB_PATH}"

# Create engine and session
if NSS_DB_URL:
    nss_engine_args = {"connect_args": {"check_same_thread": False}} if NSS_DB_TYPE == "sqlite" else {}
    nss_engine = create_engine(NSS_DB_URL, **nss_engine_args)

    # Enable foreign key constraints for SQLite (required for CASCADE DELETE)
    if NSS_DB_TYPE == "sqlite":
        @event.listens_for(nss_engine, "connect")
        def set_sqlite_pragma(dbapi_conn, connection_record):
            _ = connection_record  # Unused
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    NssSessionLocal = sessionmaker(bind=nss_engine, autocommit=False, autoflush=False)
else:
    nss_engine = None
    NssSessionLocal = None


def get_nss_db():
    """
    Dependency function for FastAPI endpoints to get a database session.
    Usage: db: Session = Depends(get_nss_db)
    """
    if NssSessionLocal is None:
        raise RuntimeError("NSS database is not configured")
    db = NssSessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_nss_db():
    """
    Initialize NSS database tables.
    Should be called on application startup.
    """
    if nss_engine is None:
        raise RuntimeError("NSS database engine is not configured")
    Base.metadata.create_all(bind=nss_engine)
