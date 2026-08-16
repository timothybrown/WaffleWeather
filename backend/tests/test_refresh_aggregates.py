"""Tests for continuous aggregate refresh ordering and window arithmetic."""

from datetime import datetime, timezone

import pytest

from app.maintenance.refresh_aggregates import (
    FAMILIES,
    aggregates_for,
    refresh_windows,
)

START = datetime(2026, 1, 1, tzinfo=timezone.utc)
END = datetime(2026, 6, 1, tzinfo=timezone.utc)


class TestFamilies:
    def test_each_family_is_bottom_up(self) -> None:
        # daily reads from hourly, monthly from daily. Refresh order is correctness.
        for family, names in FAMILIES.items():
            assert names == [f"{family}_hourly", f"{family}_daily", f"{family}_monthly"]

    def test_two_families(self) -> None:
        assert set(FAMILIES) == {"observations", "sensor_observations"}

    def test_aggregates_for_single_family(self) -> None:
        assert aggregates_for("observations") == FAMILIES["observations"]

    def test_aggregates_for_all_concatenates_both(self) -> None:
        assert aggregates_for("all") == (
            FAMILIES["observations"] + FAMILIES["sensor_observations"]
        )

    def test_aggregates_for_rejects_unknown_family(self) -> None:
        with pytest.raises(ValueError):
            aggregates_for("nonsense")


class TestWindows:
    def test_one_window_per_aggregate(self) -> None:
        assert len(refresh_windows("all", START, END)) == 6

    def test_preserves_aggregate_order(self) -> None:
        names = [name for name, _, _ in refresh_windows("all", START, END)]
        assert names == aggregates_for("all")

    def test_family_scoping_excludes_the_other_family(self) -> None:
        names = [name for name, _, _ in refresh_windows("observations", START, END)]
        assert names == FAMILIES["observations"]
        assert not any(name.startswith("sensor_") for name in names)

    def test_non_monthly_windows_use_requested_bounds(self) -> None:
        for name, window_start, window_end in refresh_windows("all", START, END):
            if name.endswith("_monthly"):
                continue
            assert window_start == START
            assert window_end == END

    def test_monthly_windows_extend_end_by_two_months(self) -> None:
        monthly = [
            window
            for window in refresh_windows("all", START, END)
            if window[0].endswith("_monthly")
        ]
        assert len(monthly) == 2
        for _, window_start, window_end in monthly:
            assert window_start == START
            assert window_end == datetime(2026, 8, 1, tzinfo=timezone.utc)

    def test_monthly_extension_rolls_over_year_boundary(self) -> None:
        windows = refresh_windows("all", START, datetime(2026, 12, 1, tzinfo=timezone.utc))
        monthly = [window for window in windows if window[0].endswith("_monthly")]
        for _, _, window_end in monthly:
            assert window_end == datetime(2027, 2, 1, tzinfo=timezone.utc)

    def test_monthly_extension_clamps_short_months(self) -> None:
        # Dec 31 + 2 months has no Feb 31, so the arithmetic must clamp.
        windows = refresh_windows("all", START, datetime(2026, 12, 31, tzinfo=timezone.utc))
        monthly = [window for window in windows if window[0].endswith("_monthly")]
        for _, _, window_end in monthly:
            assert window_end == datetime(2027, 2, 28, tzinfo=timezone.utc)

    def test_rejects_inverted_range(self) -> None:
        with pytest.raises(ValueError):
            refresh_windows("all", END, START)

    def test_rejects_equal_range(self) -> None:
        with pytest.raises(ValueError):
            refresh_windows("all", START, START)
