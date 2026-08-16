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

    def test_non_monthly_windows_use_requested_end(self) -> None:
        for name, _, window_end in refresh_windows("all", START, END):
            if name.endswith("_monthly"):
                continue
            assert window_end == END


    def test_monthly_windows_extend_end_by_two_months(self) -> None:
        monthly = [
            window
            for window in refresh_windows("all", START, END)
            if window[0].endswith("_monthly")
        ]
        assert len(monthly) == 2
        for _, _, window_end in monthly:
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


class TestStartFlooring:
    """refresh_continuous_aggregate only materializes buckets *fully contained*
    in the window, so the start bound must sit before the first bucket's edge."""

    def test_start_is_floored_below_the_month_boundary(self) -> None:
        # Production regression: the first observation was 2026-04-01 20:15,
        # which left the April 1 daily bucket and the whole April monthly
        # bucket partially outside the window. TimescaleDB skipped both.
        first_observation = datetime(2026, 4, 1, 20, 15, 44, tzinfo=timezone.utc)
        windows = refresh_windows(
            "all", first_observation, datetime(2026, 8, 16, tzinfo=timezone.utc)
        )
        for _, window_start, _ in windows:
            assert window_start < datetime(2026, 4, 1, tzinfo=timezone.utc)

    def test_every_family_shares_the_floored_start(self) -> None:
        windows = refresh_windows("all", START, END)
        starts = {window_start for _, window_start, _ in windows}
        assert len(starts) == 1

    def test_start_flooring_allows_for_timezone_aware_buckets(self) -> None:
        # Daily and monthly buckets are cut in the station's timezone, so a
        # month can begin up to ~14h either side of UTC midnight. The floored
        # start must precede the earliest such boundary.
        _, window_start, _ = refresh_windows(
            "observations",
            datetime(2026, 4, 1, 0, 0, 1, tzinfo=timezone.utc),
            END,
        )[0]
        earliest_possible_bucket_start = datetime(
            2026, 3, 31, 10, 0, tzinfo=timezone.utc
        )  # UTC+14
        assert window_start <= earliest_possible_bucket_start

    def test_start_flooring_crosses_year_boundary(self) -> None:
        _, window_start, _ = refresh_windows(
            "observations",
            datetime(2026, 1, 15, tzinfo=timezone.utc),
            datetime(2026, 6, 1, tzinfo=timezone.utc),
        )[0]
        assert window_start == datetime(2025, 12, 31, tzinfo=timezone.utc)
