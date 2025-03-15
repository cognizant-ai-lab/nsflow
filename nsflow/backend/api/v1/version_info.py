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
