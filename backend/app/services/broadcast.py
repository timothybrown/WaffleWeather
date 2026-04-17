"""WebSocket connection manager for broadcasting live weather data."""

import json
import logging
from datetime import datetime

from starlette.websockets import WebSocket, WebSocketState

logger = logging.getLogger(__name__)

# Hard cap on concurrent WebSocket subscribers. Prevents a hostile or buggy
# client from exhausting Pi memory by opening thousands of sockets.
MAX_CONNECTIONS = 50


def _json_serializer(obj: object) -> str:
    """JSON serializer for datetime objects."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


class ConnectionManager:
    """Manages WebSocket connections and broadcasts messages to all clients."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> bool:
        """Accept and register a WebSocket.

        Returns False (without accepting) when the manager is at capacity so
        the caller can reject with an appropriate WebSocket close code.
        """
        if len(self._connections) >= MAX_CONNECTIONS:
            logger.warning(
                "WebSocket connection rejected: at capacity (%d/%d)",
                len(self._connections),
                MAX_CONNECTIONS,
            )
            return False
        await websocket.accept()
        self._connections.add(websocket)
        logger.info("WebSocket client connected (%d total)", len(self._connections))
        return True

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)
        logger.info("WebSocket client disconnected (%d total)", len(self._connections))

    async def broadcast(self, data: dict[str, object]) -> None:
        """Send data to all connected WebSocket clients.

        Automatically removes dead connections.
        """
        if not self._connections:
            return

        message = json.dumps(data, default=_json_serializer)
        dead: list[WebSocket] = []

        # Snapshot BEFORE iterating — send_text awaits, and a concurrent
        # disconnect may mutate _connections, which would otherwise raise
        # RuntimeError("Set changed size during iteration").
        for ws in list(self._connections):
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
