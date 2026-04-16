"""Tests for app/services/derived.py — all pure math, no mocks needed."""


from app.services.derived import (
    _approximate_mrt,
    dew_point,
    enrich_observation,
    feels_like,
    heat_index,
    utci,
    wind_chill,
    zambretti_forecast,
)


# ── dew_point ────────────────────────────────────────────────────────────────


class TestDewPoint:
    def test_standard(self):
        result = dew_point(20.0, 50.0)
        assert 9.0 <= result <= 10.0

    def test_saturated(self):
        result = dew_point(20.0, 100.0)
        assert result == 20.0

    def test_very_dry(self):
        result = dew_point(20.0, 5.0)
        assert result < -15.0

    def test_freezing(self):
        result = dew_point(-10.0, 80.0)
        assert result < -10.0

    def test_hot_humid(self):
        result = dew_point(35.0, 90.0)
        assert result > 30.0

    def test_zero_rh(self):
        # Edge case: RH=0 would cause log(0), function returns temp
        result = dew_point(20.0, 0.0)
        assert result == 20.0


# ── heat_index ───────────────────────────────────────────────────────────────


class TestHeatIndex:
    def test_below_threshold_returns_none(self):
        assert heat_index(20.0, 50.0) is None

    def test_at_threshold_boundary(self):
        # 26°C = ~78.8°F — should be None (below 80°F average)
        assert heat_index(26.0, 50.0) is None

    def test_standard_hot(self):
        # 35°C, 60% RH — known NWS heat index should be significantly above 35
        result = heat_index(35.0, 60.0)
        assert result is not None
        assert result > 37.0

    def test_low_rh_adjustment(self):
        # Triggers RH < 13% and 80 <= T_F <= 112 path
        result = heat_index(40.0, 10.0)
        assert result is not None

    def test_high_rh_adjustment(self):
        # Triggers RH > 85% and 80 <= T_F <= 87 path
        result = heat_index(28.0, 90.0)
        assert result is not None
        assert result > 28.0

    def test_extreme_heat(self):
        result = heat_index(45.0, 50.0)
        assert result is not None
        assert result > 50.0


# ── wind_chill ───────────────────────────────────────────────────────────────


class TestWindChill:
    def test_standard_cold_windy(self):
        result = wind_chill(-5.0, 20.0)
        assert result is not None
        assert result < -5.0

    def test_above_temp_limit_returns_none(self):
        assert wind_chill(15.0, 20.0) is None

    def test_below_wind_limit_returns_none(self):
        assert wind_chill(0.0, 3.0) is None

    def test_at_temp_boundary(self):
        # Exactly 10°C — condition is temp > 10, so 10 should NOT return None
        result = wind_chill(10.0, 20.0)
        assert result is not None

    def test_at_wind_boundary(self):
        # Exactly 4.8 km/h — condition is wind <= 4.8, so should return None
        assert wind_chill(0.0, 4.8) is None

    def test_extreme_cold(self):
        result = wind_chill(-30.0, 40.0)
        assert result is not None
        assert result < -40.0


# ── feels_like ───────────────────────────────────────────────────────────────


class TestFeelsLike:
    def test_hot_delegates_to_heat_index(self):
        result = feels_like(35.0, 60.0, 5.0)
        hi = heat_index(35.0, 60.0)
        assert result == hi

    def test_cold_delegates_to_wind_chill(self):
        result = feels_like(-5.0, 80.0, 20.0)
        wc = wind_chill(-5.0, 20.0)
        assert result == wc

    def test_middle_returns_actual(self):
        result = feels_like(20.0, 50.0, 10.0)
        assert result == 20.0

    def test_cold_with_no_wind(self):
        result = feels_like(5.0, 80.0, None)
        assert result == 5.0

    def test_cold_with_low_wind(self):
        result = feels_like(5.0, 80.0, 2.0)
        assert result == 5.0


# ── zambretti_forecast ───────────────────────────────────────────────────────


class TestZambretti:
    def test_no_history_returns_none(self):
        assert zambretti_forecast(1013.0, None) is None

    def test_rising_pressure(self):
        # Current 1020, was 1015 (delta +5, well above 0.3 threshold)
        result = zambretti_forecast(1020.0, 1015.0)
        assert result is not None
        assert isinstance(result, str)

    def test_falling_pressure(self):
        result = zambretti_forecast(1005.0, 1015.0)
        assert result is not None

    def test_steady_pressure(self):
        # Delta of 0.1 — within ±0.3 threshold
        result = zambretti_forecast(1013.0, 1012.9)
        assert result is not None

    def test_high_pressure_rising_gives_fine(self):
        result = zambretti_forecast(1040.0, 1035.0)
        assert result is not None
        assert "fine" in result.lower() or "settled" in result.lower()

    def test_low_pressure_falling_gives_stormy(self):
        result = zambretti_forecast(960.0, 970.0)
        assert result is not None
        assert "storm" in result.lower() or "rain" in result.lower()

    def test_wind_north_fair_bias(self):
        # North wind should give a fairer forecast
        result_no_wind = zambretti_forecast(1013.0, 1012.5, wind_dir=None, month=6)
        result_north = zambretti_forecast(1013.0, 1012.5, wind_dir=0.0, month=6)
        # Both should return valid forecasts
        assert result_no_wind is not None
        assert result_north is not None

    def test_wind_south_unsettled_bias(self):
        result_south = zambretti_forecast(1013.0, 1012.5, wind_dir=180.0, month=6)
        assert result_south is not None

    def test_seasonal_summer(self):
        result = zambretti_forecast(1013.0, 1010.0, month=7)
        assert result is not None

    def test_seasonal_winter(self):
        result = zambretti_forecast(1013.0, 1010.0, month=1)
        assert result is not None

    def test_southern_hemisphere(self):
        result = zambretti_forecast(1013.0, 1010.0, month=7, north=False)
        assert result is not None

    def test_extreme_low_pressure_clamped(self):
        result = zambretti_forecast(900.0, 910.0)
        assert result is not None

    def test_extreme_high_pressure_clamped(self):
        result = zambretti_forecast(1100.0, 1095.0)
        assert result is not None

    def test_all_trend_paths_return_valid_strings(self):
        # Rising
        r = zambretti_forecast(1020.0, 1015.0)
        assert isinstance(r, str) and len(r) > 0
        # Falling
        f = zambretti_forecast(1005.0, 1015.0)
        assert isinstance(f, str) and len(f) > 0
        # Steady
        s = zambretti_forecast(1013.0, 1013.1)
        assert isinstance(s, str) and len(s) > 0

    def test_16_point_wind_intermediate_direction(self):
        # ENE (67.5°) should use wind index 3
        result = zambretti_forecast(1013.0, 1012.5, wind_dir=67.5, month=6)
        assert result is not None


# ── _approximate_mrt ─────────────────────────────────────────────────────────


class TestApproximateMRT:
    def test_zero_solar(self):
        assert _approximate_mrt(20.0, 0.0) == 20.0

    def test_standard_solar(self):
        assert _approximate_mrt(20.0, 500.0) == 27.5

    def test_high_solar(self):
        assert _approximate_mrt(20.0, 1000.0) == 35.0


# ── utci ─────────────────────────────────────────────────────────────────────


class TestUTCI:
    def test_comfortable(self):
        result = utci(22.0, 50.0, 10.0, 300.0)
        assert result is not None
        # Should be in the "no thermal stress" range (~9-26°C)
        assert 5.0 < result < 40.0

    def test_cold_stress(self):
        result = utci(-10.0, 80.0, 20.0, 0.0)
        assert result is not None
        assert result < 0.0

    def test_heat_stress(self):
        result = utci(40.0, 60.0, 5.0, 800.0)
        assert result is not None
        assert result > 30.0

    def test_wind_clamped_low(self):
        # Wind below 0.5 m/s (1.8 km/h) should be clamped to 0.5
        result = utci(22.0, 50.0, 1.0, 300.0)
        assert result is not None

    def test_wind_clamped_high(self):
        # Wind above 17 m/s (61.2 km/h) should be clamped to 17
        result = utci(22.0, 50.0, 80.0, 300.0)
        assert result is not None

    def test_out_of_range_temp(self):
        assert utci(-60.0, 50.0, 10.0, 0.0) is None

    def test_out_of_range_mrt_delta(self):
        # Extremely high solar creating D_Tmrt > 70
        assert utci(0.0, 50.0, 10.0, 5000.0) is None


# ── enrich_observation ───────────────────────────────────────────────────────


class TestEnrichObservation:
    def test_empty_dict(self):
        result = enrich_observation({})
        assert result == {}

    def test_full_data(self):
        obs = {
            "temp_outdoor": 22.0,
            "humidity_outdoor": 50.0,
            "wind_speed": 10.0,
            "solar_radiation": 300.0,
        }
        result = enrich_observation(obs)
        assert "dewpoint" in result
        assert "heat_index" in result  # may be None since 22C < threshold
        assert "feels_like" in result
        assert "utci" in result

    def test_partial_data_temp_rh_only(self):
        obs = {"temp_outdoor": 22.0, "humidity_outdoor": 50.0}
        result = enrich_observation(obs)
        assert "dewpoint" in result
        assert "feels_like" in result
        assert "utci" not in result  # needs wind + solar

    def test_pre_populated_not_overwritten(self):
        obs = {
            "temp_outdoor": 22.0,
            "humidity_outdoor": 50.0,
            "dewpoint": 99.9,
        }
        result = enrich_observation(obs)
        assert result["dewpoint"] == 99.9

    def test_missing_temp_skips_all(self):
        obs = {"humidity_outdoor": 50.0, "wind_speed": 10.0}
        result = enrich_observation(obs)
        assert "dewpoint" not in result
        assert "feels_like" not in result
