"""WebSocket endpoint for live weather data."""

from fastapi import APIRouter
from starlette.websockets import WebSocket, WebSocketDisconnect

from app.config import Settings

router = APIRouter()

settings = Settings()


@router.websocket("/ws/live")
async def websocket_live(websocket: WebSocket) -> None:
    # Origin validation: reject cross-origin browser connections when cors_origins is set.
    # A missing Origin header (e.g. native/non-browser clients) is not rejected — the guard
    # is against browser-based cross-origin attacks, not against clients that can trivially
    # omit the header anyway.
    origin = websocket.headers.get("origin")
    allowed = settings.cors_origins or []
    if origin is not None and allowed and origin not in allowed:
        await websocket.close(code=4403)
        return

    manager = websocket.app.state.ws_manager
    accepted = await manager.connect(websocket)
    if not accepted:
        # Capacity exceeded — reject with 1013 "Try Again Later" (RFC 6455).
        await websocket.close(code=1013)
        return
    try:
        # Keep connection alive — client can send pings or messages
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
