"""Tests for app/mqtt/parser.py — pure parsing logic, no mocks needed."""

import json
from datetime import datetime

from app.mqtt.parser import FIELD_MAP, parse_ecowitt_payload


class TestParseEcowittPayload:
    def test_complete_payload(self, sample_ecowitt_payload):
        result = parse_ecowitt_payload("test-device", sample_ecowitt_payload)
        assert result is not None
        obs, diag = result

        assert obs["station_id"] == "test-device"
        assert obs["temp_outdoor"] == 22.5
        assert obs["humidity_outdoor"] == 65.0
        assert obs["temp_indoor"] == 21.0
        assert obs["humidity_indoor"] == 45.0
        assert obs["pressure_abs"] == 1010.0
        assert obs["pressure_rel"] == 1013.25
        assert obs["wind_speed"] == 12.0
        assert obs["wind_gust"] == 18.5
        assert obs["wind_dir"] == 225.0
        assert obs["rain_rate"] == 0.0
        assert obs["rain_daily"] == 2.5
        assert obs["solar_radiation"] == 450.0
        assert obs["uv_index"] == 5.2
        assert obs["lightning_count"] == 3
        assert obs["lightning_distance"] == 14.0

    def test_minimal_payload(self):
        payload = json.dumps({"temp1": 22.5, "humidity1": 65.0}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        assert result is not None
        obs, _ = result
        assert obs["temp_outdoor"] == 22.5
        assert obs["humidity_outdoor"] == 65.0
        assert "wind_speed" not in obs

    def test_bytes_payload(self):
        payload = b'{"temp1": 22.5}'
        result = parse_ecowitt_payload("dev1", payload)
        assert result is not None
        obs, _ = result
        assert obs["temp_outdoor"] == 22.5

    def test_string_payload(self):
        payload = '{"temp1": 22.5}'
        result = parse_ecowitt_payload("dev1", payload)
        assert result is not None

    def test_invalid_json(self):
        assert parse_ecowitt_payload("dev1", b"not json") is None

    def test_non_dict_json(self):
        assert parse_ecowitt_payload("dev1", b"[1, 2, 3]") is None

    def test_empty_object(self):
        result = parse_ecowitt_payload("dev1", b"{}")
        assert result is not None
        obs, _ = result
        assert obs["station_id"] == "dev1"
        assert "timestamp" in obs

    def test_first_match_wins(self):
        # temp and temp1 both map to temp_outdoor — first in FIELD_MAP wins
        payload = json.dumps({"temp": 10.0, "temp1": 20.0}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        assert result is not None
        obs, _ = result
        assert obs["temp_outdoor"] == 10.0

    def test_lightning_count_parsed_as_int(self):
        payload = json.dumps({"lightning_num": "5"}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert obs["lightning_count"] == 5
        assert isinstance(obs["lightning_count"], int)

    def test_lightning_time_iso_string(self):
        payload = json.dumps({"lightning_time": "2026-04-05T11:45:00+00:00"}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert isinstance(obs["lightning_time"], datetime)

    def test_lightning_time_unix_timestamp(self):
        ts = 1775300700.0  # some timestamp
        payload = json.dumps({"lightning_time": ts}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert isinstance(obs["lightning_time"], datetime)

    def test_null_values_skipped(self):
        payload = json.dumps({"temp1": None, "humidity1": 65.0}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert "temp_outdoor" not in obs
        assert obs["humidity_outdoor"] == 65.0

    def test_empty_string_values_skipped(self):
        payload = json.dumps({"temp1": "", "humidity1": 65.0}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert "temp_outdoor" not in obs

    def test_invalid_numeric_skipped(self):
        payload = json.dumps({"temp1": "not_a_number"}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert "temp_outdoor" not in obs

    def test_battery_diagnostics_boolean(self, sample_ecowitt_payload):
        _, diag = parse_ecowitt_payload("dev1", sample_ecowitt_payload)
        assert "wh25batt" in diag["batteries"]
        batt = diag["batteries"]["wh25batt"]
        assert batt["label"] == "Indoor T/H/Baro Sensor"
        assert batt["type"] == "boolean"

    def test_battery_diagnostics_voltage(self, sample_ecowitt_payload):
        _, diag = parse_ecowitt_payload("dev1", sample_ecowitt_payload)
        assert "wh80batt" in diag["batteries"]
        batt = diag["batteries"]["wh80batt"]
        assert batt["type"] == "voltage"
        assert batt["value"] == 3.2

    def test_battery_diagnostics_percentage(self, sample_ecowitt_payload):
        _, diag = parse_ecowitt_payload("dev1", sample_ecowitt_payload)
        assert "wh57batt" in diag["batteries"]
        batt = diag["batteries"]["wh57batt"]
        assert batt["type"] == "percentage"
        assert batt["value"] == 85

    def test_gateway_fields(self, sample_ecowitt_payload):
        _, diag = parse_ecowitt_payload("dev1", sample_ecowitt_payload)
        assert diag["gateway"]["runtime"] == 12345.0
        assert diag["gateway"]["heap"] == 45000.0
        assert diag["gateway"]["interval"] == 16.0

    def test_rain_variants_piezo(self):
        payload = json.dumps({"drain_piezo": 5.0, "rrain_piezo": 1.2}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert obs["rain_daily"] == 5.0
        assert obs["rain_rate"] == 1.2

    def test_imperial_key_variants_convert_to_metric_storage_units(self):
        payload = json.dumps({
            "tempf": 68.0,
            "baromrelin": 29.92,
            "baromabsin": 29.80,
            "windspeedmph": 10.0,
            "windgustmph": 15.0,
            "rainratein": 0.5,
            "dailyrainin": 1.0,
        }).encode()
        result = parse_ecowitt_payload("dev1", payload)
        assert result is not None
        obs, _ = result

        assert obs["temp_outdoor"] == 20.0
        assert obs["pressure_rel"] == 1013.21
        assert obs["pressure_abs"] == 1009.14
        assert obs["wind_speed"] == 16.09
        assert obs["wind_gust"] == 24.14
        assert obs["rain_rate"] == 12.7
        assert obs["rain_daily"] == 25.4

    def test_unknown_fields_ignored(self):
        payload = json.dumps({"temp1": 22.0, "unknown_field": "foo"}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert "unknown_field" not in obs

    def test_field_map_has_expected_coverage(self):
        """Verify FIELD_MAP covers all expected sensor categories."""
        columns = set(FIELD_MAP.values())
        assert "temp_outdoor" in columns
        assert "humidity_outdoor" in columns
        assert "pressure_rel" in columns
        assert "wind_speed" in columns
        assert "rain_daily" in columns
        assert "solar_radiation" in columns
        assert "lightning_count" in columns
        assert "soil_moisture_1" in columns


class TestParserSafety:
    """Parser safety: malformed values in diagnostics and bounds checking."""

    def test_tolerates_non_numeric_voltage_battery(self):
        """Non-numeric voltage battery raw should yield None, not crash the observation."""
        payload = json.dumps({"temp1": 20.5, "wh68batt": "NaN"}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        assert result is not None, "Parser should not return None for the whole observation"
        obs, diag = result
        # Other fields survived
        assert obs.get("temp_outdoor") == 20.5
        # Battery entry either omitted or has a non-literal value
        if "wh68batt" in diag["batteries"]:
            assert diag["batteries"]["wh68batt"]["value"] != "NaN"
            assert diag["batteries"]["wh68batt"]["value"] is None

    def test_tolerates_non_numeric_percentage_battery(self):
        """Non-numeric percentage battery raw should yield None, not crash."""
        payload = json.dumps({"temp1": 20.5, "wh57batt": "N/A"}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        assert result is not None
        obs, diag = result
        assert obs.get("temp_outdoor") == 20.5

    def test_tolerates_non_numeric_gateway_field(self):
        """Non-numeric gateway field should yield None, not crash."""
        payload = json.dumps({"temp1": 20.5, "runtime": "broken"}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        assert result is not None
        obs, diag = result
        assert obs.get("temp_outdoor") == 20.5
        # Runtime either absent or None; NEVER the literal "broken"
        assert diag["gateway"].get("runtime") != "broken"

    def test_rejects_out_of_range_pressure_abs(self):
        """Pressure outside physical bounds should be set to None, not stored."""
        payload = json.dumps({"baromabs": 1500.0}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert obs.get("pressure_abs") is None or "pressure_abs" not in obs

    def test_rejects_out_of_range_pressure_rel(self):
        payload = json.dumps({"baromrel": 300.0}).encode()  # too low
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert obs.get("pressure_rel") is None or "pressure_rel" not in obs

    def test_rejects_out_of_range_temperature(self):
        payload = json.dumps({"temp1": 200.0}).encode()  # way too hot
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert obs.get("temp_outdoor") is None or "temp_outdoor" not in obs

    def test_rejects_out_of_range_temperature_indoor(self):
        payload = json.dumps({"tempin": -100.0}).encode()  # too cold for indoors
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert obs.get("temp_indoor") is None or "temp_indoor" not in obs

    def test_rejects_out_of_range_humidity(self):
        payload = json.dumps({"humidity1": 150.0}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert obs.get("humidity_outdoor") is None or "humidity_outdoor" not in obs

    def test_rejects_negative_rain(self):
        payload = json.dumps({"dailyrain": -5.0}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert obs.get("rain_daily") is None or "rain_daily" not in obs

    def test_rejects_negative_wind_speed(self):
        payload = json.dumps({"windspeed": -3.0}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert obs.get("wind_speed") is None or "wind_speed" not in obs

    def test_rejects_out_of_range_uv(self):
        payload = json.dumps({"uv": 500.0}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert obs.get("uv_index") is None or "uv_index" not in obs

    def test_rejects_out_of_range_solar(self):
        payload = json.dumps({"solarradiation": 50000.0}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert obs.get("solar_radiation") is None or "solar_radiation" not in obs

    def test_accepts_in_range_values(self):
        """Normal values should pass through unchanged."""
        payload = json.dumps({
            "baromabs": 1013.25,
            "temp1": 20.0,
            "dailyrain": 0.5,
            "humidity1": 65.0,
            "windspeed": 15.0,
            "uv": 5.0,
            "solarradiation": 450.0,
        }).encode()
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert obs["pressure_abs"] == 1013.25
        assert obs["temp_outdoor"] == 20.0
        assert obs["rain_daily"] == 0.5
        assert obs["humidity_outdoor"] == 65.0
        assert obs["wind_speed"] == 15.0
        assert obs["uv_index"] == 5.0
        assert obs["solar_radiation"] == 450.0

    def test_bounds_at_exact_edges(self):
        """Values at bound edges should be accepted."""
        payload = json.dumps({"humidity1": 0.0, "humidityin": 100.0}).encode()
        result = parse_ecowitt_payload("dev1", payload)
        obs, _ = result
        assert obs["humidity_outdoor"] == 0.0
        assert obs["humidity_indoor"] == 100.0
