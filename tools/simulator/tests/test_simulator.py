from __future__ import annotations

from datetime import date
from typing import Any

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
