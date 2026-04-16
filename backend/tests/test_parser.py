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
