"""WebSocket endpoint for live weather data."""

from fastapi import APIRouter
from starlette.websockets import WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
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
