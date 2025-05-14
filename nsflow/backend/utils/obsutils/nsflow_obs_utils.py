
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
from nsflow.backend.db.database import SessionLocal, Base, engine
from nsflow.backend.db import models

class ObservabilityUtils:
    def __init__(self):
        self.enabled = int(os.getenv("NSFLOW_OBSERVABILITY", 0)) == 1
        if self.enabled:
            Base.metadata.create_all(bind=engine)

    def create_session(self, session_obj):
        with SessionLocal() as db:
            db.add(session_obj)
            db.commit()
            db.refresh(session_obj)
            return session_obj

    def get_sessions(self, skip=0, limit=100):
        with SessionLocal() as db:
            return db.query(models.Session).offset(skip).limit(limit).all()
