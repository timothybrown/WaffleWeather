"""MQTT client that subscribes to ecowitt2mqtt topics and ingests observations."""

import asyncio
import logging
from collections import deque
from datetime import datetime, timedelta, timezone

import aiomqtt
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import Settings
from app.database import async_session
from app.models.lightning import LightningEvent
from app.models.observation import WeatherObservation
from app.models.station import Station
from app.mqtt.parser import parse_ecowitt_payload
from app.services.derived import enrich_observation, zambretti_forecast

logger = logging.getLogger(__name__)

# In-memory pressure history for Zambretti forecast (WebSocket path).
# Stores (timestamp, pressure_hpa) tuples; pruned to 4h window on each insert.
_pressure_history: deque[tuple[datetime, float]] = deque(maxlen=1000)

# In-memory lightning state for event detection.
# Maps station_id -> (last_count, last_lightning_time)
_last_lightning: dict[str, tuple[int, datetime | None]] = {}


async def mqtt_listener(settings: Settings, broadcast_fn=None) -> None:
    """Connect to MQTT broker and process messages forever.

    Reconnects with exponential backoff on broker disconnects.

    Args:
        settings: Application settings with MQTT config.
        broadcast_fn: Optional async callable to broadcast new observations
                      to WebSocket clients. Signature: (dict) -> None.
    """
    backoff = 1
    max_backoff = 60

    while True:
        try:
            async with aiomqtt.Client(
                hostname=settings.mqtt_broker,
                port=settings.mqtt_port,
                identifier=settings.mqtt_client_id,
            ) as client:
                logger.info(
                    "Connected to MQTT broker %s:%s", settings.mqtt_broker, settings.mqtt_port
                )
                backoff = 1  # Reset on successful connect

                await client.subscribe(settings.mqtt_topic)
                logger.info("Subscribed to %s", settings.mqtt_topic)

                async for message in client.messages:
                    await _handle_message(message, settings, broadcast_fn)

        except aiomqtt.MqttError as e:
            logger.warning("MQTT connection lost: %s — reconnecting in %ds", e, backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, max_backoff)
        except asyncio.CancelledError:
            logger.info("MQTT listener shutting down")
            raise
        except Exception:
            logger.exception("Unexpected error in MQTT listener — reconnecting in %ds", backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, max_backoff)


async def _handle_message(
    message: aiomqtt.Message, settings: Settings, broadcast_fn=None
) -> None:
    """Parse an MQTT message, store to DB, and optionally broadcast."""
    topic = str(message.topic)

    # ecowitt2mqtt publishes to ecowitt2mqtt or ecowitt2mqtt/<device_id>
    parts = topic.split("/")
    if len(parts) >= 2:
        device_id = parts[-1]
    else:
        # Single-level topic — use base topic name as device ID
        device_id = parts[0]
    parse_result = parse_ecowitt_payload(device_id, message.payload)
    if parse_result is None:
        return

    parsed, diagnostics = parse_result

    try:
        async with async_session() as session:
            async with session.begin():
                # Build station values from config (only non-None fields)
                station_values: dict = {"id": device_id, "last_seen": parsed["timestamp"]}
                update_set: dict = {"last_seen": parsed["timestamp"]}
                for attr, col in [
                    ("station_name", "name"),
                    ("station_latitude", "latitude"),
                    ("station_longitude", "longitude"),
                    ("station_altitude", "altitude"),
                ]:
                    val = getattr(settings, attr)
                    if val is not None:
                        station_values[col] = val
                        update_set[col] = val

                stmt = (
                    pg_insert(Station)
                    .values(**station_values)
                    .on_conflict_do_update(
                        index_elements=["id"],
                        set_=update_set,
                    )
                )
                await session.execute(stmt)

                # Insert observation (diagnostics are NOT stored)
                obs = WeatherObservation(**parsed)
                session.add(obs)

        logger.debug("Stored observation for %s at %s", device_id, parsed["timestamp"])
    except Exception:
        logger.exception("Failed to store observation for device %s", device_id)
        return

    # Detect lightning events by comparing count/time with previous observation
    await _detect_lightning_event(device_id, parsed)

    if broadcast_fn:
        try:
            broadcast_data = enrich_observation(parsed)

            # Zambretti: track pressure and compute forecast from 3h history
            pressure = broadcast_data.get("pressure_rel")
            ts = broadcast_data.get("timestamp")
            if pressure is not None and ts is not None:
                if isinstance(ts, str):
                    ts_dt = datetime.fromisoformat(ts)
                else:
                    ts_dt = ts
                _pressure_history.append((ts_dt, pressure))
                # Prune entries older than 4 hours
                cutoff = ts_dt - timedelta(hours=4)
                while _pressure_history and _pressure_history[0][0] < cutoff:
                    _pressure_history.popleft()
                # Find closest reading to 3h ago
                target = ts_dt - timedelta(hours=3)
                best = None
                best_delta = timedelta(minutes=20)  # max tolerance
                for h_ts, h_p in _pressure_history:
                    d = abs(h_ts - target)
                    if d < best_delta:
                        best_delta = d
                        best = h_p
                forecast = zambretti_forecast(
                    pressure,
                    best,
                    wind_dir=broadcast_data.get("wind_dir"),
                    month=ts_dt.month,
                )
                if forecast is not None:
                    broadcast_data["zambretti_forecast"] = forecast

            broadcast_data["diagnostics"] = diagnostics
            await broadcast_fn(broadcast_data)
        except Exception:
            logger.exception("Failed to broadcast observation")


async def _detect_lightning_event(device_id: str, parsed: dict) -> None:
    """Compare lightning count/time with previous observation and store events."""
    count = parsed.get("lightning_count")
    lt_time = parsed.get("lightning_time")
    if count is None:
        return

    prev = _last_lightning.get(device_id)
    _last_lightning[device_id] = (count, lt_time)

    if prev is None:
        # First observation for this station — just record baseline
        return

    prev_count, prev_lt_time = prev

    # Detect new strikes: count increased, or lightning_time changed
    if count > prev_count:
        delta = count - prev_count
    elif count < prev_count:
        # Daily reset: count dropped. Treat the new count as new strikes since reset.
        delta = count if count > 0 else 0
    else:
        # Count unchanged — check if lightning_time changed (rare edge case)
        if lt_time is not None and lt_time != prev_lt_time:
            delta = 1  # At least one strike if time changed but count somehow same
        else:
            return  # No new activity

    if delta <= 0:
        return

    try:
        async with async_session() as session:
            async with session.begin():
                event = LightningEvent(
                    timestamp=parsed["timestamp"],
                    station_id=device_id,
                    new_strikes=delta,
                    distance_km=parsed.get("lightning_distance"),
                    cumulative_count=count,
                )
                session.add(event)
        logger.info(
            "Lightning event: %d new strikes at %.1f km for %s",
            delta,
            parsed.get("lightning_distance") or 0,
            device_id,
        )
    except Exception:
        logger.exception("Failed to store lightning event for %s", device_id)
