"""Version API endpoint."""

from fastapi import APIRouter

router = APIRouter(tags=["version"])


@router.get("/version")
async def get_version() -> dict[str, str]:
    from app.main import BACKEND_VERSION

    return {"backend": BACKEND_VERSION}
