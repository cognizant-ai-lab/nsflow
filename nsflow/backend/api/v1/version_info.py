
# Copyright (C) 2019-2021 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# ENN-release SDK Software in commercial settings.
#
# END COPYRIGHT
import logging
from fastapi import APIRouter
import pkg_resources

router = APIRouter(prefix="/api/v1")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_version(package_name: str):
    """Get the version from installed package"""
    try:
        # Fetch version from installed package
        return pkg_resources.get_distribution(package_name).version
    except pkg_resources.DistributionNotFound as e:
        logger.error("Package '%s' not found: %s", package_name, e)
        if package_name == "nsflow":
            return "dev.version"
        return "not found"


@router.get("/version/{package_name}")
async def fetch_version(package_name: str):
    """Get the version from installed package"""
    return {"version": get_version(package_name)}
