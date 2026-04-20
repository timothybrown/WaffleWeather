"""Endpoint definitions for E2E tests and fixture generation."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Endpoint:
    path: str
    params: dict[str, str | int | bool] = field(default_factory=dict)
    content_type: str = "application/json"
    golden: bool = False


SCHEMA_ENDPOINTS: list[Endpoint] = [
    Endpoint(path="/api/v1/version"),
    Endpoint(path="/api/v1/stations"),
    Endpoint(path="/api/v1/stations/simulator"),
    Endpoint(
        path="/api/v1/observations/latest",
        params={"station_id": "simulator"},
    ),
    Endpoint(
        path="/api/v1/observations",
        params={"station_id": "simulator", "limit": 10},
    ),
    Endpoint(
        path="/api/v1/observations/hourly",
        params={
            "station_id": "simulator",
            "start": "2021-02-14T00:00:00Z",
            "end": "2021-02-17T00:00:00Z",
        },
    ),
    Endpoint(
        path="/api/v1/observations/daily",
        params={
            "station_id": "simulator",
            "start": "2021-02-01T00:00:00Z",
            "end": "2021-02-28T00:00:00Z",
        },
    ),
    Endpoint(
        path="/api/v1/observations/monthly",
        params={
            "station_id": "simulator",
            "start": "2021-01-01T00:00:00Z",
            "end": "2023-12-31T00:00:00Z",
        },
    ),
    Endpoint(
        path="/api/v1/observations/calendar",
        params={
            "metric": "temp_outdoor_max",
            "year": 2022,
            "station_id": "simulator",
        },
    ),
    Endpoint(
        path="/api/v1/observations/wind-rose",
        params={
            "station_id": "simulator",
            "start": "2021-06-01T00:00:00Z",
            "end": "2021-06-30T00:00:00Z",
        },
    ),
    Endpoint(
        path="/api/v1/observations/lightning/events",
        params={"station_id": "simulator", "limit": 10},
    ),
    Endpoint(
        path="/api/v1/observations/lightning/summary",
        params={
            "station_id": "simulator",
            "start": "2021-01-01T00:00:00Z",
            "end": "2023-12-31T00:00:00Z",
        },
    ),
    Endpoint(
        path="/api/v1/reports/monthly",
        params={"year": 2021, "month": 2, "station_id": "simulator"},
    ),
    Endpoint(
        path="/api/v1/reports/yearly",
        params={"year": 2022, "station_id": "simulator"},
    ),
    Endpoint(
        path="/api/v1/reports/monthly/txt",
        params={"year": 2021, "month": 2, "station_id": "simulator"},
        content_type="text/plain",
    ),
    Endpoint(
        path="/api/v1/reports/yearly/txt",
        params={"year": 2022, "station_id": "simulator"},
        content_type="text/plain",
    ),
    Endpoint(
        path="/api/v1/records",
        params={"station_id": "simulator"},
    ),
    Endpoint(
        path="/api/v1/records/broken",
        params={"station_id": "simulator"},
    ),
]

GOLDEN_ENDPOINTS: list[Endpoint] = [
    # Feb 2021 cold snap — daily aggregates
    Endpoint(
        path="/api/v1/observations/daily",
        params={
            "station_id": "simulator",
            "start": "2021-02-10T00:00:00Z",
            "end": "2021-02-20T00:00:00Z",
        },
        golden=True,
    ),
    # Summer 2023 heat — daily aggregates
    Endpoint(
        path="/api/v1/observations/daily",
        params={
            "station_id": "simulator",
            "start": "2023-07-15T00:00:00Z",
            "end": "2023-07-31T00:00:00Z",
        },
        golden=True,
    ),
    # Full-year monthly aggregates
    Endpoint(
        path="/api/v1/observations/monthly",
        params={
            "station_id": "simulator",
            "start": "2022-01-01T00:00:00Z",
            "end": "2022-12-31T00:00:00Z",
        },
        golden=True,
    ),
    # Monthly report — Feb 2021 (coldest month)
    Endpoint(
        path="/api/v1/reports/monthly",
        params={"year": 2021, "month": 2, "station_id": "simulator"},
        golden=True,
    ),
    # Yearly report — 2022 (full year)
    Endpoint(
        path="/api/v1/reports/yearly",
        params={"year": 2022, "station_id": "simulator"},
        golden=True,
    ),
    # All-time records
    Endpoint(
        path="/api/v1/records",
        params={"station_id": "simulator"},
        golden=True,
    ),
    # Calendar heatmap — temperature 2021
    Endpoint(
        path="/api/v1/observations/calendar",
        params={
            "metric": "temp_outdoor_max",
            "year": 2021,
            "station_id": "simulator",
        },
        golden=True,
    ),
    # Wind rose — June 2022
    Endpoint(
        path="/api/v1/observations/wind-rose",
        params={
            "station_id": "simulator",
            "start": "2022-06-01T00:00:00Z",
            "end": "2022-06-30T00:00:00Z",
        },
        golden=True,
    ),
]


def fixture_filename(endpoint: Endpoint) -> str:
    """Generate a deterministic fixture filename from an endpoint definition."""
    slug = endpoint.path.strip("/").replace("/", "_")
    if endpoint.params:
        param_parts = []
        for k, v in sorted(endpoint.params.items()):
            clean = str(v).replace(":", "").replace("T", "").replace("Z", "")
            param_parts.append(f"{k}={clean}")
        slug += "__" + "_".join(param_parts)
    return f"{slug}.json"
