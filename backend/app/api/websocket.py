"""WebSocket endpoint for live weather data."""

from fastapi import APIRouter
from starlette.websockets import WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    manager = websocket.app.state.ws_manager
    await manager.connect(websocket)
    try:
        # Keep connection alive — client can send pings or messages
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
