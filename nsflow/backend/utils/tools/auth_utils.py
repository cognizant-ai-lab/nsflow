
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
from fastapi import Header, HTTPException, status
import jwt


class AuthUtils:
    SHARED_SECRET = "supersecret123"  # Replace in production
    DEFAULT_ROLE = "admin"

    # Used client-side if needed
    DEFAULT_TOKEN = jwt.encode({"role": DEFAULT_ROLE}, SHARED_SECRET, algorithm="HS256")

    @classmethod
    def verify_token(cls, token: str):
        """
        Verifies the JWT token and returns the payload.
        Raises HTTPException if the token is invalid or expired.
        """
        try:
            payload = jwt.decode(token, cls.SHARED_SECRET, algorithms=["HS256"])
            return payload
        except jwt.ExpiredSignatureError as e:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired") from e
        except jwt.InvalidTokenError as e:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from e

    @classmethod
    def get_auth_token(cls, authorization: str = Header(...)):
        """
        Extracts the token from the authorization header.
        Raises HTTPException if the header is missing or invalid.
        """
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid authorization header")
        token = authorization.split(" ")[1]
        return cls.verify_token(token)

    @classmethod
    def allow_all(cls):
        """Use this to bypass auth in development."""
        return None
