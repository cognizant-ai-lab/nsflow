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

from nsflow.backend.db import models
from nsflow.backend.db.database import Base, SessionLocal, engine


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
