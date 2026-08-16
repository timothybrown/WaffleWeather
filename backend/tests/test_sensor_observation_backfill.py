"""Tests for gateway sensor-observation backfill helpers."""

from datetime import datetime, timezone

import pytest

from app.maintenance import backfill_sensor_observations as backfill
from app.maintenance.backfill_sensor_observations import backfill_windows


def utc(year: int, month: int, day: int, hour: int = 0) -> datetime:
    return datetime(year, month, day, hour, tzinfo=timezone.utc)


class TestBackfillWindows:
    def test_single_month_range(self) -> None:
        assert backfill_windows(utc(2026, 1, 10), utc(2026, 1, 20)) == [
            (utc(2026, 1, 10), utc(2026, 1, 20))
        ]

    def test_splits_on_month_boundaries(self) -> None:
        assert backfill_windows(utc(2026, 1, 15, 6), utc(2026, 3, 2)) == [
            (utc(2026, 1, 15, 6), utc(2026, 2, 1)),
            (utc(2026, 2, 1), utc(2026, 3, 1)),
            (utc(2026, 3, 1), utc(2026, 3, 2)),
        ]

    def test_rolls_over_year_boundary(self) -> None:
        assert backfill_windows(utc(2026, 12, 31, 12), utc(2027, 1, 2)) == [
            (utc(2026, 12, 31, 12), utc(2027, 1, 1)),
            (utc(2027, 1, 1), utc(2027, 1, 2)),
        ]

    def test_normalizes_offsets_to_utc(self) -> None:
        start = datetime.fromisoformat("2026-01-31T23:00:00-05:00")
        end = datetime.fromisoformat("2026-02-02T00:00:00+01:00")

        assert backfill_windows(start, end) == [
            (utc(2026, 2, 1, 4), utc(2026, 2, 1, 23))
        ]

    def test_treats_naive_datetimes_as_utc(self) -> None:
        assert backfill_windows(datetime(2026, 1, 1), datetime(2026, 1, 2)) == [
            (utc(2026, 1, 1), utc(2026, 1, 2))
        ]

    def test_rejects_inverted_range(self) -> None:
        with pytest.raises(ValueError):
            backfill_windows(utc(2026, 2, 1), utc(2026, 1, 1))

    def test_rejects_equal_range(self) -> None:
        with pytest.raises(ValueError):
            backfill_windows(utc(2026, 1, 1), utc(2026, 1, 1))


class TestDerivedBounds:
    def test_expands_observed_bounds_to_whole_months(self) -> None:
        assert backfill._range_from_bounds(utc(2026, 1, 31, 23), utc(2026, 3, 1)) == (
            utc(2026, 1, 1),
            utc(2026, 4, 1),
        )

    def test_expands_december_bounds_across_year_boundary(self) -> None:
        assert backfill._range_from_bounds(utc(2026, 12, 31, 23), utc(2026, 12, 31, 23)) == (
            utc(2026, 12, 1),
            utc(2027, 1, 1),
        )


class TestCli:
    def test_cli_passes_explicit_db_url_and_bounds(self, monkeypatch: pytest.MonkeyPatch) -> None:
        calls: list[tuple[str, datetime | None, datetime | None]] = []

        def fake_run_backfill(
            db_url: str, start: datetime | None = None, end: datetime | None = None
        ) -> None:
            calls.append((db_url, start, end))

        monkeypatch.setattr(backfill, "run_backfill", fake_run_backfill)

        assert backfill.main(
            [
                "--db-url",
                "postgresql+asyncpg://example",
                "--start",
                "2026-01-01",
                "--end",
                "2026-02-01T12:30:00Z",
            ]
        ) == 0

        assert calls == [
            (
                "postgresql+asyncpg://example",
                utc(2026, 1, 1),
                datetime(2026, 2, 1, 12, 30, tzinfo=timezone.utc),
            )
        ]

    def test_cli_leaves_omitted_bounds_for_database_derivation(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        calls: list[tuple[str, datetime | None, datetime | None]] = []

        def fake_run_backfill(
            db_url: str, start: datetime | None = None, end: datetime | None = None
        ) -> None:
            calls.append((db_url, start, end))

        monkeypatch.setattr(backfill, "run_backfill", fake_run_backfill)

        assert backfill.main(["--db-url", "postgresql+asyncpg://example"]) == 0

        assert calls == [("postgresql+asyncpg://example", None, None)]

    def test_cli_normalizes_offset_aware_bounds(self, monkeypatch: pytest.MonkeyPatch) -> None:
        calls: list[tuple[str, datetime | None, datetime | None]] = []

        def fake_run_backfill(
            db_url: str, start: datetime | None = None, end: datetime | None = None
        ) -> None:
            calls.append((db_url, start, end))

        monkeypatch.setattr(backfill, "run_backfill", fake_run_backfill)

        assert backfill.main(
            [
                "--db-url",
                "postgresql+asyncpg://example",
                "--start",
                "2026-01-01T00:00:00-05:00",
                "--end",
                "2026-01-02T06:00:00+01:00",
            ]
        ) == 0

        assert calls == [("postgresql+asyncpg://example", utc(2026, 1, 1, 5), utc(2026, 1, 2, 5))]
