from __future__ import annotations

from datetime import date
from typing import Any

from click.testing import CliRunner

import simulator


class FakeResponse:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        pass

    def json(self) -> dict[str, Any]:
        return self.payload


def test_fetch_current_requests_wind_in_backend_units(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []

    def fake_get(url: str, *, params: dict[str, Any], timeout: int) -> FakeResponse:
        calls.append(params)
        return FakeResponse({
            "current": {
                "wind_speed_10m": 36.0,
                "wind_gusts_10m": 54.0,
            },
        })

    monkeypatch.setattr(simulator.httpx, "get", fake_get)

    result = simulator.fetch_current(40.7, -74.0)

    assert calls[0]["wind_speed_unit"] == "kmh"
    assert result["windspeed"] == 36.0
    assert result["windgust"] == 54.0


def test_fetch_archive_requests_wind_in_backend_units(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []

    def fake_get(url: str, *, params: dict[str, Any], timeout: int) -> FakeResponse:
        calls.append(params)
        return FakeResponse({
            "hourly": {
                "time": ["2026-04-28T12:00"],
                "wind_speed_10m": [36.0],
                "wind_gusts_10m": [54.0],
                "rain": [0.2],
            },
        })

    monkeypatch.setattr(simulator.httpx, "get", fake_get)

    rows = simulator.fetch_archive(40.7, -74.0, date(2026, 4, 28), date(2026, 4, 28))

    assert calls[0]["wind_speed_unit"] == "kmh"
    assert rows[0]["wind_speed"] == 36.0
    assert rows[0]["wind_gust"] == 54.0


class TestDeriveIndoor:
    def test_returns_temp_and_humidity(self, monkeypatch) -> None:
        monkeypatch.setattr(simulator.random, "gauss", lambda _mu, _sigma: 0.0)

        temp, humidity = simulator.derive_indoor(18.0)

        assert isinstance(temp, float)
        assert isinstance(humidity, float)

    def test_indoor_temp_is_plausible_room_temperature(self, monkeypatch) -> None:
        monkeypatch.setattr(simulator.random, "gauss", lambda _mu, _sigma: 0.0)

        for outdoor in (-10.0, 0.0, 18.0, 35.0, 45.0):
            temp, _ = simulator.derive_indoor(outdoor)
            assert 15.0 <= temp <= 28.0, outdoor

    def test_indoor_humidity_stays_in_range(self, monkeypatch) -> None:
        monkeypatch.setattr(simulator.random, "gauss", lambda _mu, _sigma: 0.0)

        for outdoor in (-10.0, 0.0, 18.0, 35.0, 45.0):
            _, humidity = simulator.derive_indoor(outdoor)
            assert 0.0 <= humidity <= 100.0, outdoor

    def test_indoor_damps_outdoor_swing(self, monkeypatch) -> None:
        monkeypatch.setattr(simulator.random, "gauss", lambda _mu, _sigma: 0.0)

        cold, _ = simulator.derive_indoor(-5.0)
        hot, _ = simulator.derive_indoor(35.0)

        assert abs(hot - cold) < 10.0

    def test_indoor_still_tracks_direction(self, monkeypatch) -> None:
        monkeypatch.setattr(simulator.random, "gauss", lambda _mu, _sigma: 0.0)

        cold, _ = simulator.derive_indoor(-5.0)
        hot, _ = simulator.derive_indoor(35.0)

        assert hot > cold


class TestBackfillIndoor:
    def test_db_columns_include_indoor(self) -> None:
        assert "temp_indoor" in simulator.DB_COLUMNS
        assert "humidity_indoor" in simulator.DB_COLUMNS

    def test_fetch_archive_emits_indoor_columns(self, monkeypatch) -> None:
        derive_calls: list[float] = []

        def fake_get(_url: str, *, params: dict[str, Any], timeout: int) -> FakeResponse:
            assert params["timezone"] == "UTC"
            assert timeout == 60
            return FakeResponse({
                "hourly": {
                    "time": ["2026-04-28T12:00"],
                    "temperature_2m": [10.0],
                },
            })

        def fake_derive_indoor(outdoor: float) -> tuple[float, float]:
            derive_calls.append(outdoor)
            return 22.2, 44.4

        monkeypatch.setattr(simulator.httpx, "get", fake_get)
        monkeypatch.setattr(simulator, "derive_indoor", fake_derive_indoor)

        rows = simulator.fetch_archive(40.7, -74.0, date(2026, 4, 28), date(2026, 4, 28))

        assert derive_calls == [10.0]
        assert rows[0]["temp_indoor"] == 22.2
        assert rows[0]["humidity_indoor"] == 44.4


def test_simulate_publishes_indoor_mqtt_keys(monkeypatch) -> None:
    captured_payloads: list[dict[str, float | int]] = []

    def fake_publish_mqtt(
        _cfg: simulator.Config,
        payload: dict[str, float | int],
        _start_time: float,
    ) -> None:
        captured_payloads.append(payload.copy())
        raise KeyboardInterrupt

    monkeypatch.setattr(
        simulator,
        "fetch_current",
        lambda _lat, _lon: {"temp": 10.0, "humidity": 55.0},
    )
    monkeypatch.setattr(simulator.random, "gauss", lambda _mu, _sigma: 0.0)
    monkeypatch.setattr(simulator, "publish_mqtt", fake_publish_mqtt)

    result = CliRunner().invoke(
        simulator.simulate,
        ["--lat", "40.7", "--lon", "-74.0", "--broker", "localhost"],
    )

    assert result.exit_code == 0
    assert captured_payloads[0]["tempin"] == 20.4
    assert captured_payloads[0]["humidityin"] == 46.3
