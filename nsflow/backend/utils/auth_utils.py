
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
