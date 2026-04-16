"""Tests for app/mqtt/client.py — message handling and lightning detection."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch


from app.mqtt.client import (
    _detect_lightning_event,
    _handle_message,
    _last_lightning,
    _pressure_history,
)


def _make_message(topic="ecowitt2mqtt/device1", payload=b'{"temp1": 22.5}'):
    msg = MagicMock()
    msg.topic = MagicMock()
    msg.topic.__str__ = lambda self: topic
    msg.payload = payload
    return msg


def _make_settings(**kwargs):
    defaults = {
        "mqtt_broker": "localhost",
        "mqtt_port": 1883,
        "mqtt_topic": "ecowitt2mqtt/#",
        "mqtt_client_id": "test",
        "mqtt_username": None,
        "mqtt_password": None,
        "station_name": None,
        "station_latitude": None,
        "station_longitude": None,
        "station_altitude": None,
        "lightning_filter_enabled": False,
        "lightning_filter_distances": [],
        "lightning_filter_max_strikes": 1,
    }
    defaults.update(kwargs)
    settings = MagicMock()
    for k, v in defaults.items():
        setattr(settings, k, v)
    return settings


def _mock_db_session():
    """Build a mock async_session factory that yields a usable session mock.

    The code does:
        async with async_session() as session:
            async with session.begin():
                ...
    So async_session() -> async ctx mgr yielding session,
    and session.begin() -> async ctx mgr (non-coroutine call).
    """
    session = AsyncMock()

    # session.begin() must return an async context manager directly (not a coroutine)
    begin_ctx = AsyncMock()
    begin_ctx.__aenter__ = AsyncMock()
    begin_ctx.__aexit__ = AsyncMock(return_value=False)
    session.begin = MagicMock(return_value=begin_ctx)

    # async_session() returns an async context manager yielding session
    session_ctx = AsyncMock()
    session_ctx.__aenter__ = AsyncMock(return_value=session)
    session_ctx.__aexit__ = AsyncMock(return_value=False)

    factory = MagicMock(return_value=session_ctx)
    return factory, session


class TestHandleMessage:
    @patch("app.mqtt.client.async_session")
    @patch("app.mqtt.client.parse_ecowitt_payload")
    async def test_valid_message_stored(self, mock_parse, mock_async_session):
        factory, session = _mock_db_session()
        mock_async_session.side_effect = factory

        ts = datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc)
        parsed = {"station_id": "device1", "timestamp": ts, "temp_outdoor": 22.5}
        diagnostics = {"batteries": {}, "gateway": {}}
        mock_parse.return_value = (parsed, diagnostics)

        await _handle_message(_make_message(), _make_settings(), broadcast_fn=None)

        mock_parse.assert_called_once()
        session.execute.assert_awaited_once()  # station upsert
        session.add.assert_called_once()  # observation insert

    @patch("app.mqtt.client.parse_ecowitt_payload")
    async def test_invalid_payload_skipped(self, mock_parse):
        mock_parse.return_value = None
        await _handle_message(_make_message(payload=b"not json"), _make_settings())

    @patch("app.mqtt.client.async_session")
    @patch("app.mqtt.client.parse_ecowitt_payload")
    async def test_broadcast_called(self, mock_parse, mock_async_session):
        factory, session = _mock_db_session()
        mock_async_session.side_effect = factory

        ts = datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc)
        parsed = {"station_id": "device1", "timestamp": ts, "temp_outdoor": 22.5, "humidity_outdoor": 50.0}
        diagnostics = {"batteries": {}, "gateway": {}}
        mock_parse.return_value = (parsed, diagnostics)

        broadcast_fn = AsyncMock()
        await _handle_message(_make_message(), _make_settings(), broadcast_fn=broadcast_fn)

        broadcast_fn.assert_awaited_once()
        call_data = broadcast_fn.call_args[0][0]
        assert "diagnostics" in call_data
        assert call_data["temp_outdoor"] == 22.5

    @patch("app.mqtt.client.async_session")
    @patch("app.mqtt.client.parse_ecowitt_payload")
    async def test_db_error_caught(self, mock_parse, mock_async_session):
        ts = datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc)
        parsed = {"station_id": "device1", "timestamp": ts, "temp_outdoor": 22.5}
        diagnostics = {"batteries": {}, "gateway": {}}
        mock_parse.return_value = (parsed, diagnostics)

        ctx_mgr = AsyncMock()
        ctx_mgr.__aenter__ = AsyncMock(side_effect=Exception("DB error"))
        ctx_mgr.__aexit__ = AsyncMock(return_value=False)
        mock_async_session.return_value = ctx_mgr

        # Should not raise
        await _handle_message(_make_message(), _make_settings(), broadcast_fn=None)

    async def test_topic_parsing_multi_level(self):
        with patch("app.mqtt.client.parse_ecowitt_payload") as mock_parse:
            mock_parse.return_value = None
            msg = _make_message(topic="ecowitt2mqtt/my-device")
            await _handle_message(msg, _make_settings())
            mock_parse.assert_called_once_with("my-device", msg.payload)

    async def test_topic_parsing_single_level(self):
        with patch("app.mqtt.client.parse_ecowitt_payload") as mock_parse:
            mock_parse.return_value = None
            msg = _make_message(topic="ecowitt2mqtt")
            await _handle_message(msg, _make_settings())
            mock_parse.assert_called_once_with("ecowitt2mqtt", msg.payload)

    @patch("app.mqtt.client.async_session")
    @patch("app.mqtt.client.parse_ecowitt_payload")
    async def test_pressure_history_tracked(self, mock_parse, mock_async_session):
        factory, session = _mock_db_session()
        mock_async_session.side_effect = factory

        ts = datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc)
        parsed = {"station_id": "d1", "timestamp": ts, "pressure_rel": 1013.0}
        diagnostics = {"batteries": {}, "gateway": {}}
        mock_parse.return_value = (parsed, diagnostics)

        broadcast_fn = AsyncMock()
        await _handle_message(_make_message(), _make_settings(), broadcast_fn=broadcast_fn)

        assert len(_pressure_history) == 1
        assert _pressure_history[0][1] == 1013.0

    @patch("app.mqtt.client.async_session")
    @patch("app.mqtt.client.parse_ecowitt_payload")
    async def test_zambretti_from_pressure_history(self, mock_parse, mock_async_session):
        factory, session = _mock_db_session()
        mock_async_session.side_effect = factory

        now = datetime(2026, 4, 5, 15, 0, tzinfo=timezone.utc)
        three_h_ago = now - timedelta(hours=3)
        _pressure_history.append((three_h_ago, 1010.0))

        parsed = {"station_id": "d1", "timestamp": now, "pressure_rel": 1020.0}
        diagnostics = {"batteries": {}, "gateway": {}}
        mock_parse.return_value = (parsed, diagnostics)

        broadcast_fn = AsyncMock()
        await _handle_message(_make_message(), _make_settings(), broadcast_fn=broadcast_fn)

        call_data = broadcast_fn.call_args[0][0]
        assert "zambretti_forecast" in call_data


class TestDetectLightningEvent:
    @patch("app.mqtt.client.async_session")
    async def test_first_observation_sets_baseline(self, mock_async_session):
        parsed = {"station_id": "d1", "timestamp": datetime.now(timezone.utc), "lightning_count": 5}
        await _detect_lightning_event("d1", parsed, _make_settings())
        assert "d1" in _last_lightning
        assert _last_lightning["d1"][0] == 5

    @patch("app.mqtt.client.async_session")
    async def test_count_increased_creates_event(self, mock_async_session):
        factory, session = _mock_db_session()
        mock_async_session.side_effect = factory
        _last_lightning["d1"] = (5, None)

        parsed = {
            "station_id": "d1",
            "timestamp": datetime.now(timezone.utc),
            "lightning_count": 8,
            "lightning_distance": 12.0,
        }
        await _detect_lightning_event("d1", parsed, _make_settings())
        session.add.assert_called_once()
        event = session.add.call_args[0][0]
        assert event.new_strikes == 3

    @patch("app.mqtt.client.async_session")
    async def test_count_decreased_daily_reset(self, mock_async_session):
        factory, session = _mock_db_session()
        mock_async_session.side_effect = factory
        _last_lightning["d1"] = (50, None)

        parsed = {"station_id": "d1", "timestamp": datetime.now(timezone.utc), "lightning_count": 3}
        await _detect_lightning_event("d1", parsed, _make_settings())
        session.add.assert_called_once()
        event = session.add.call_args[0][0]
        assert event.new_strikes == 3

    @patch("app.mqtt.client.async_session")
    async def test_same_count_same_time_no_event(self, mock_async_session):
        lt = datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc)
        _last_lightning["d1"] = (5, lt)

        parsed = {"station_id": "d1", "timestamp": datetime.now(timezone.utc), "lightning_count": 5, "lightning_time": lt}
        await _detect_lightning_event("d1", parsed, _make_settings())
        mock_async_session.assert_not_called()

    @patch("app.mqtt.client.async_session")
    async def test_same_count_different_time_creates_event(self, mock_async_session):
        factory, session = _mock_db_session()
        mock_async_session.side_effect = factory
        _last_lightning["d1"] = (5, datetime(2026, 4, 5, 11, 0, tzinfo=timezone.utc))

        parsed = {
            "station_id": "d1",
            "timestamp": datetime.now(timezone.utc),
            "lightning_count": 5,
            "lightning_time": datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
        }
        await _detect_lightning_event("d1", parsed, _make_settings())
        session.add.assert_called_once()
        event = session.add.call_args[0][0]
        assert event.new_strikes == 1

    async def test_no_lightning_count_skips(self):
        parsed = {"station_id": "d1", "timestamp": datetime.now(timezone.utc)}
        await _detect_lightning_event("d1", parsed, _make_settings())

    @patch("app.mqtt.client.async_session")
    async def test_ghost_strike_filtered(self, mock_async_session):
        factory, session = _mock_db_session()
        mock_async_session.side_effect = factory
        _last_lightning["d1"] = (5, None)

        parsed = {
            "station_id": "d1",
            "timestamp": datetime.now(timezone.utc),
            "lightning_count": 6,
            "lightning_distance": 14.0,
        }
        settings = _make_settings(lightning_filter_enabled=True, lightning_filter_distances=[12.0, 14.0])
        await _detect_lightning_event("d1", parsed, settings)
        session.add.assert_called_once()
        event = session.add.call_args[0][0]
        assert event.new_strikes == 1
        assert event.filtered is True

    @patch("app.mqtt.client.async_session")
    async def test_multi_strike_bypasses_filter(self, mock_async_session):
        factory, session = _mock_db_session()
        mock_async_session.side_effect = factory
        _last_lightning["d1"] = (5, None)

        parsed = {
            "station_id": "d1",
            "timestamp": datetime.now(timezone.utc),
            "lightning_count": 8,
            "lightning_distance": 14.0,
        }
        settings = _make_settings(lightning_filter_enabled=True, lightning_filter_distances=[12.0, 14.0])
        await _detect_lightning_event("d1", parsed, settings)
        session.add.assert_called_once()
        event = session.add.call_args[0][0]
        assert event.new_strikes == 3
        assert event.filtered is False

    @patch("app.mqtt.client.async_session")
    async def test_unknown_distance_not_filtered(self, mock_async_session):
        factory, session = _mock_db_session()
        mock_async_session.side_effect = factory
        _last_lightning["d1"] = (5, None)

        parsed = {
            "station_id": "d1",
            "timestamp": datetime.now(timezone.utc),
            "lightning_count": 6,
            "lightning_distance": 8.0,
        }
        settings = _make_settings(lightning_filter_enabled=True, lightning_filter_distances=[12.0, 14.0])
        await _detect_lightning_event("d1", parsed, settings)
        event = session.add.call_args[0][0]
        assert event.filtered is False

    @patch("app.mqtt.client.async_session")
    async def test_filter_disabled(self, mock_async_session):
        factory, session = _mock_db_session()
        mock_async_session.side_effect = factory
        _last_lightning["d1"] = (5, None)

        parsed = {
            "station_id": "d1",
            "timestamp": datetime.now(timezone.utc),
            "lightning_count": 6,
            "lightning_distance": 14.0,
        }
        await _detect_lightning_event("d1", parsed, _make_settings())
        event = session.add.call_args[0][0]
        assert event.filtered is False

    @patch("app.mqtt.client.async_session")
    async def test_null_distance_not_filtered(self, mock_async_session):
        factory, session = _mock_db_session()
        mock_async_session.side_effect = factory
        _last_lightning["d1"] = (5, None)

        parsed = {
            "station_id": "d1",
            "timestamp": datetime.now(timezone.utc),
            "lightning_count": 6,
        }
        settings = _make_settings(lightning_filter_enabled=True, lightning_filter_distances=[12.0, 14.0])
        await _detect_lightning_event("d1", parsed, settings)
        event = session.add.call_args[0][0]
        assert event.filtered is False
