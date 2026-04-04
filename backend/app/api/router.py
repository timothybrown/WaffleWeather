"""Top-level API router combining all sub-routers."""

from fastapi import APIRouter

from app.api import aggregates, lightning, observations, stations

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(stations.router)
api_router.include_router(observations.router)
api_router.include_router(aggregates.router)
api_router.include_router(lightning.router)
