"""WaffleWeather FastAPI application."""

import asyncio
import hmac
import logging
from contextlib import asynccontextmanager
from importlib.metadata import PackageNotFoundError, version as pkg_version
from pathlib import Path

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

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


try:
    BACKEND_VERSION = pkg_version("waffleweather-backend")
except PackageNotFoundError:
    import tomllib

    _pyproject = Path(__file__).resolve().parent.parent / "pyproject.toml"
    with open(_pyproject, "rb") as _f:
        BACKEND_VERSION = tomllib.load(_f)["project"]["version"]

app = FastAPI(
    title="WaffleWeather API",
    version=BACKEND_VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url="/redoc" if settings.enable_docs else None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
)

# API key authentication middleware (raw ASGI — works for both HTTP and WebSocket).
# Registered unconditionally; only enforces when settings.api_key is configured so that
# tests can patch settings dynamically and local dev remains unauthenticated by default.
class ApiKeyMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if settings.api_key and scope["type"] in ("http", "websocket"):
            path = scope.get("path", "")
            if path.startswith("/api/") or path.startswith("/ws/"):
                headers = dict(scope.get("headers", []))
                key = headers.get(b"x-api-key", b"").decode()
                expected = settings.api_key or ""
                if not hmac.compare_digest(key or "", expected):
                    if scope["type"] == "http":
                        response = JSONResponse(
                            status_code=401,
                            content={"detail": "Invalid or missing API key"},
                        )
                        await response(scope, receive, send)
                        return
                    else:
                        # Reject WebSocket before accept
                        await send({"type": "websocket.close", "code": 4401})
                        return
        await self.app(scope, receive, send)


app.add_middleware(ApiKeyMiddleware)

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
