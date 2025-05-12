
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
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

NSFLOW_OBSERVABILITY = int(os.getenv("NSFLOW_OBSERVABILITY", 0))
DB_URL = "sqlite:///./nsflow_observability.db" if NSFLOW_OBSERVABILITY else None

Base = declarative_base()

if DB_URL:
    engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(bind=engine)
else:
    engine = None
    SessionLocal = None
