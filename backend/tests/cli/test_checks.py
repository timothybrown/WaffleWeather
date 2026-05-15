"""Tests for the diagnostic check helpers."""

import json
import shutil
import socket
from unittest.mock import MagicMock

from app.cli._checks import (
    Check,
    ENV_REQUIRED,
    ENV_RECOMMENDED,
    audit_env_keys,
    backend_http_version,
    disk_free_percent,
    field_freshness,
    free_disk_check,
)
from app.cli._format import Severity


def _settings_with(database_url: str = "postgresql+asyncpg://x:y@h:5432/d") -> MagicMock:
    s = MagicMock()
    s.database_url = database_url
    s.api_key = None
    s.station_name = "Test"
    s.station_latitude = 1.0
    s.station_longitude = 2.0
    s.mqtt_broker = "localhost"
    return s


def test_check_dataclass_basics():
    c = Check(name="X", severity=Severity.OK, detail="fine")
    assert c.name == "X"
    assert c.severity == Severity.OK
    assert c.detail == "fine"


def test_env_required_contains_database_url():
    assert "WW_DATABASE_URL" in ENV_REQUIRED


def test_env_recommended_contains_station_keys():
    assert "WW_STATION_NAME" in ENV_RECOMMENDED
    assert "WW_STATION_LATITUDE" in ENV_RECOMMENDED
    assert "WW_STATION_LONGITUDE" in ENV_RECOMMENDED


def test_audit_env_keys_all_present():
    s = _settings_with()
    results = audit_env_keys(s, ecowitt_enabled=False)
    severities = {c.name: c.severity for c in results}
    assert severities["WW_DATABASE_URL"] == Severity.OK
    assert severities["WW_STATION_NAME"] == Severity.OK


def test_audit_env_keys_missing_required():
    s = _settings_with(database_url="")
    results = audit_env_keys(s, ecowitt_enabled=False)
    db = next(c for c in results if c.name == "WW_DATABASE_URL")
    assert db.severity == Severity.FAIL


def test_audit_env_keys_missing_recommended_is_warn():
    s = _settings_with()
    s.station_name = None
    results = audit_env_keys(s, ecowitt_enabled=False)
    name = next(c for c in results if c.name == "WW_STATION_NAME")
    assert name.severity == Severity.WARN


def test_audit_env_keys_mqtt_broker_info_when_ecowitt_disabled():
    s = _settings_with()
    s.mqtt_broker = "localhost"  # the default
    results = audit_env_keys(s, ecowitt_enabled=False)
    broker = next(c for c in results if c.name == "WW_MQTT_BROKER")
    assert broker.severity == Severity.OK


def test_audit_env_keys_mqtt_broker_warn_when_ecowitt_enabled_and_default():
    s = _settings_with()
    s.mqtt_broker = "localhost"  # default sentinel = "unset" in practice
    results = audit_env_keys(s, ecowitt_enabled=True, mqtt_broker_explicit=False)
    broker = next(c for c in results if c.name == "WW_MQTT_BROKER")
    assert broker.severity == Severity.WARN


def test_disk_free_percent_uses_shutil(monkeypatch):
    fake = shutil._ntuple_diskusage(total=1000, used=500, free=500)
    monkeypatch.setattr("shutil.disk_usage", lambda _: fake)
    assert disk_free_percent("/") == 50.0


def test_free_disk_check_ok_when_above_threshold(monkeypatch):
    monkeypatch.setattr("app.cli._checks.disk_free_percent", lambda _: 50.0)
    check = free_disk_check(threshold_percent=10.0)
    assert check.severity == Severity.OK


def test_free_disk_check_fail_when_below_threshold(monkeypatch):
    monkeypatch.setattr("app.cli._checks.disk_free_percent", lambda _: 5.0)
    check = free_disk_check(threshold_percent=10.0)
    assert check.severity == Severity.FAIL


def test_field_freshness_not_installed_when_always_null():
    # max_age=None means the column was always NULL
    check = field_freshness(name="PM2.5", max_age_seconds=None)
    assert check.severity == Severity.OK
    assert "not installed" in check.detail.lower()


def test_field_freshness_ok_within_window():
    check = field_freshness(
        name="Outdoor T/H",
        max_age_seconds=120,
        warn_after=300,
        fail_after=1800,
    )
    assert check.severity == Severity.OK


def test_field_freshness_warn_in_warn_window():
    check = field_freshness(
        name="Outdoor T/H",
        max_age_seconds=600,
        warn_after=300,
        fail_after=1800,
    )
    assert check.severity == Severity.WARN


def test_field_freshness_fail_past_fail_window():
    check = field_freshness(
        name="Outdoor T/H",
        max_age_seconds=3600,
        warn_after=300,
        fail_after=1800,
    )
    assert check.severity == Severity.FAIL


def test_backend_http_version_success(monkeypatch):
    fake_response = MagicMock()
    fake_response.read.return_value = json.dumps({"version": "2026.5.14.2"}).encode()
    fake_response.status = 200
    fake_response.__enter__ = lambda self: self
    fake_response.__exit__ = lambda *args: None
    monkeypatch.setattr("urllib.request.urlopen", lambda *a, **k: fake_response)
    result = backend_http_version(api_key=None)
    assert result == "2026.5.14.2"


def test_backend_http_version_returns_none_on_error(monkeypatch):
    def boom(*a, **k):
        raise socket.timeout("nope")

    monkeypatch.setattr("urllib.request.urlopen", boom)
    assert backend_http_version(api_key=None) is None
