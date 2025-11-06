
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
