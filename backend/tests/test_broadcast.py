"""Tests for app/services/broadcast.py — WebSocket connection manager."""

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from starlette.websockets import WebSocketState

from app.services.broadcast import ConnectionManager, _json_serializer


class TestJsonSerializer:
    def test_datetime_serialized(self):
        dt = datetime(2026, 4, 5, 12, 0, 0, tzinfo=timezone.utc)
        assert _json_serializer(dt) == "2026-04-05T12:00:00+00:00"

    def test_non_datetime_raises(self):
        with pytest.raises(TypeError, match="not JSON serializable"):
            _json_serializer({"key": "value"})


class TestConnectionManager:
    @pytest.fixture
    def manager(self):
        return ConnectionManager()

    def _make_ws(self, state=WebSocketState.CONNECTED):
        ws = AsyncMock()
        ws.client_state = state
        ws.accept = AsyncMock()
        ws.send_text = AsyncMock()
        return ws

    async def test_connect(self, manager):
        ws = self._make_ws()
        await manager.connect(ws)
        assert manager.active_count == 1
        ws.accept.assert_awaited_once()

    async def test_disconnect(self, manager):
        ws = self._make_ws()
        await manager.connect(ws)
        manager.disconnect(ws)
        assert manager.active_count == 0

    async def test_disconnect_unknown_ws(self, manager):
        ws = self._make_ws()
        manager.disconnect(ws)  # should not raise
        assert manager.active_count == 0

    async def test_broadcast_to_multiple(self, manager):
        ws1 = self._make_ws()
        ws2 = self._make_ws()
        await manager.connect(ws1)
        await manager.connect(ws2)

        await manager.broadcast({"temp": 22.5})
        expected = json.dumps({"temp": 22.5})
        ws1.send_text.assert_awaited_once_with(expected)
        ws2.send_text.assert_awaited_once_with(expected)

    async def test_broadcast_empty_connections(self, manager):
        # Should be a no-op, not raise
        await manager.broadcast({"temp": 22.5})

    async def test_broadcast_removes_dead_connections(self, manager):
        ws_alive = self._make_ws()
        ws_dead = self._make_ws()
        ws_dead.send_text.side_effect = RuntimeError("connection closed")

        await manager.connect(ws_alive)
        await manager.connect(ws_dead)
        assert manager.active_count == 2

        await manager.broadcast({"temp": 22.5})
        assert manager.active_count == 1

    async def test_broadcast_removes_disconnected_state(self, manager):
        ws = self._make_ws(state=WebSocketState.DISCONNECTED)
        await manager.connect(ws)

        await manager.broadcast({"data": 1})
        assert manager.active_count == 0
        ws.send_text.assert_not_awaited()

    async def test_broadcast_serializes_datetimes(self, manager):
        ws = self._make_ws()
        await manager.connect(ws)

        dt = datetime(2026, 4, 5, 12, 0, 0, tzinfo=timezone.utc)
        await manager.broadcast({"timestamp": dt})

        sent = ws.send_text.call_args[0][0]
        parsed = json.loads(sent)
        assert parsed["timestamp"] == "2026-04-05T12:00:00+00:00"
