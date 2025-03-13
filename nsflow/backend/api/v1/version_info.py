from fastapi import APIRouter
import pkg_resources

router = APIRouter(prefix="/api/v1")


def get_version():
    """Get the version from installed package"""
    try:
        # Fetch version from installed package
        return pkg_resources.get_distribution("nsflow").version
    except pkg_resources.DistributionNotFound:
        return "dev.0.5.0"


@router.get("/version")
async def fetch_version():
    """Get the version from installed package"""
    return {"version": get_version()}
