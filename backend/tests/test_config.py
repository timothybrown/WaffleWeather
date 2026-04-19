"""Tests for app/config.py — Settings loading and defaults."""

import os

import pytest

from app.config import Settings


class TestSettings:
    def test_defaults(self):
        s = Settings(database_url="postgresql+asyncpg://test:test@localhost/test")
        assert s.mqtt_broker == "localhost"
        assert s.mqtt_port == 1883
        assert s.mqtt_topic == "ecowitt2mqtt/#"
        assert s.mqtt_client_id == "waffleweather-backend"
        assert s.mqtt_username is None
        assert s.mqtt_password is None
        assert s.cors_origins == ["http://localhost"]
        assert s.enable_docs is False
        assert s.api_key is None

    def test_station_metadata_optional(self):
        s = Settings(database_url="postgresql+asyncpg://test:test@localhost/test")
        assert s.station_name is None
        assert s.station_latitude is None
        assert s.station_longitude is None
        assert s.station_altitude is None

    def test_database_url_required(self):
        # Temporarily remove the env var set by conftest
        old = os.environ.pop("WW_DATABASE_URL", None)
        try:
            with pytest.raises(Exception):  # ValidationError
                Settings(_env_file=None)
        finally:
            if old is not None:
                os.environ["WW_DATABASE_URL"] = old

    def test_explicit_values(self):
        s = Settings(
            database_url="postgresql+asyncpg://test:test@localhost/test",
            mqtt_broker="mqtt.example.com",
            mqtt_port=8883,
            station_latitude=40.7,
            station_longitude=-74.0,
            enable_docs=True,
            api_key="secret-key",
        )
        assert s.mqtt_broker == "mqtt.example.com"
        assert s.mqtt_port == 8883
        assert s.station_latitude == 40.7
        assert s.enable_docs is True
        assert s.api_key == "secret-key"

    def test_station_timezone_default(self):
        s = Settings(database_url="postgresql+asyncpg://test:test@localhost/test")
        assert s.station_timezone == "UTC"

    def test_station_timezone_from_env(self, monkeypatch):
        monkeypatch.setenv("WW_STATION_TIMEZONE", "America/New_York")
        s = Settings(database_url="postgresql+asyncpg://test:test@localhost/test", _env_file=None)
        assert s.station_timezone == "America/New_York"

    def test_extra_fields_ignored(self):
        """extra='ignore' prevents validation errors from non-WW_ env vars."""
        s = Settings(
            database_url="postgresql+asyncpg://test:test@localhost/test",
            some_unknown_field="should not raise",
        )
        assert s.database_url == "postgresql+asyncpg://test:test@localhost/test"
