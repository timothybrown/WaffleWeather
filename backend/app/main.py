"""WaffleWeather FastAPI application."""

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.websocket import router as ws_router
from app.config import Settings
from app.mqtt.client import mqtt_listener
from app.services.broadcast import ConnectionManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)

settings = Settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start WebSocket manager
    manager = ConnectionManager()
    app.state.ws_manager = manager

    # Start MQTT listener as background task
    mqtt_task = asyncio.create_task(
        mqtt_listener(settings, broadcast_fn=manager.broadcast)
    )
    logger.info("WaffleWeather backend started")

    yield

    # Shutdown
    mqtt_task.cancel()
    try:
        await mqtt_task
    except asyncio.CancelledError:
        pass
    logger.info("WaffleWeather backend stopped")


app = FastAPI(
    title="WaffleWeather API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url="/redoc" if settings.enable_docs else None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(api_router)
app.include_router(ws_router)

# Load hand-written OpenAPI spec as the authoritative schema
_openapi_path = Path(__file__).resolve().parent.parent.parent / "openapi" / "waffleweather.yaml"
if _openapi_path.exists():
    with open(_openapi_path) as f:
        app.openapi_schema = yaml.safe_load(f)
