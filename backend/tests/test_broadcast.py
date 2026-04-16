"""Tests for app/services/broadcast.py — WebSocket connection manager."""

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from starlette.websockets import WebSocketState

from app.services.broadcast import MAX_CONNECTIONS, ConnectionManager, _json_serializer


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


class _FakeWS:
    """Minimal async fake with send_text + optional disconnect trigger."""

    def __init__(self, name: str = "", on_send=None):
        self.name = name
        self.sent: list[str] = []
        self.on_send = on_send  # async callable invoked after send_text
        self.raise_on_send: Exception | None = None
        # Existing broadcast() checks client_state before sending.
        self.client_state = WebSocketState.CONNECTED

    async def accept(self) -> None:
        # connect() currently calls websocket.accept() internally.
        return None

    async def send_text(self, msg: str) -> None:
        if self.raise_on_send is not None:
            raise self.raise_on_send
        self.sent.append(msg)
        if self.on_send is not None:
            await self.on_send()


class TestConnectionRaceAndLimit:
    async def test_broadcast_tolerates_disconnect_during_iteration(self):
        """A disconnect triggered mid-broadcast must not raise RuntimeError."""
        mgr = ConnectionManager()
        other = _FakeWS("other")
        await mgr.connect(other)

        async def trigger_disconnect():
            # disconnect() is sync on this manager; call without await.
            mgr.disconnect(other)

        trigger = _FakeWS("trigger", on_send=trigger_disconnect)
        await mgr.connect(trigger)

        # Must complete without raising RuntimeError("Set changed size during iteration").
        await mgr.broadcast("hi")
        # json.dumps("hi") == '"hi"', which contains substring "hi".
        assert any("hi" in s for s in trigger.sent)

    async def test_connection_limit_enforced(self):
        mgr = ConnectionManager()
        accepted_count = 0
        for _ in range(MAX_CONNECTIONS):
            ws = _FakeWS()
            if await mgr.connect(ws):
                accepted_count += 1
        assert accepted_count == MAX_CONNECTIONS

        # 51st connection must be rejected.
        extra = _FakeWS("extra")
        assert await mgr.connect(extra) is False

    async def test_connection_allows_after_disconnect(self):
        """Freeing a slot via disconnect should allow a new connect."""
        mgr = ConnectionManager()
        sockets: list[_FakeWS] = []
        for _ in range(MAX_CONNECTIONS):
            ws = _FakeWS()
            await mgr.connect(ws)
            sockets.append(ws)
        mgr.disconnect(sockets[0])
        fresh = _FakeWS("fresh")
        assert await mgr.connect(fresh) is True
