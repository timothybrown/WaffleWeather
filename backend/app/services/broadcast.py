"""WebSocket connection manager for broadcasting live weather data."""

import json
import logging
from datetime import datetime

from starlette.websockets import WebSocket, WebSocketState

logger = logging.getLogger(__name__)


def _json_serializer(obj):
    """JSON serializer for datetime objects."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


class ConnectionManager:
    """Manages WebSocket connections and broadcasts messages to all clients."""

    def __init__(self):
        self._connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.add(websocket)
        logger.info("WebSocket client connected (%d total)", len(self._connections))

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)
        logger.info("WebSocket client disconnected (%d total)", len(self._connections))

    async def broadcast(self, data: dict) -> None:
        """Send data to all connected WebSocket clients.

        Automatically removes dead connections.
        """
        if not self._connections:
            return

        message = json.dumps(data, default=_json_serializer)
        dead: list[WebSocket] = []

        for ws in self._connections:
            try:
                if ws.client_state == WebSocketState.CONNECTED:
                    await ws.send_text(message)
                else:
                    dead.append(ws)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self._connections.discard(ws)
            if dead:
                logger.debug("Cleaned up %d dead WebSocket connections", len(dead))

    @property
    def active_count(self) -> int:
        return len(self._connections)
