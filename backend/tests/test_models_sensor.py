"""Schema-shape tests for auxiliary sensor models."""

from sqlalchemy import DateTime, Float, String

from app.models.sensor import Sensor, SensorObservation


class TestSensorObservation:
    def test_table_name(self):
        assert SensorObservation.__tablename__ == "sensor_observations"

    def test_composite_primary_key(self):
        pk = {c.name for c in SensorObservation.__table__.primary_key}
        assert pk == {"timestamp", "station_id", "sensor_key"}

    def test_key_columns_have_expected_types(self):
        timestamp = SensorObservation.__table__.c.timestamp
        assert isinstance(timestamp.type, DateTime)
        assert timestamp.type.timezone is True

        assert isinstance(SensorObservation.__table__.c.station_id.type, String)
        assert isinstance(SensorObservation.__table__.c.sensor_key.type, String)

    def test_metrics_are_nullable(self):
        # Bounds rejection drops temp and humidity independently, so a row may
        # legitimately carry only one metric.
        assert SensorObservation.__table__.c.temp.nullable is True
        assert SensorObservation.__table__.c.humidity.nullable is True
        assert isinstance(SensorObservation.__table__.c.temp.type, Float)
        assert isinstance(SensorObservation.__table__.c.humidity.type, Float)


class TestSensor:
    def test_table_name(self):
        assert Sensor.__tablename__ == "sensors"

    def test_composite_primary_key(self):
        pk = {c.name for c in Sensor.__table__.primary_key}
        assert pk == {"station_id", "sensor_key"}

    def test_has_label_and_placement(self):
        cols = set(Sensor.__table__.c.keys())
        assert {"label", "placement", "last_seen"} <= cols

    def test_metadata_columns_have_expected_shape(self):
        assert Sensor.__table__.c.label.nullable is True

        placement = Sensor.__table__.c.placement
        assert placement.nullable is False
        assert placement.default is not None
        assert placement.default.arg == "unassigned"

        last_seen = Sensor.__table__.c.last_seen
        assert last_seen.nullable is True
        assert isinstance(last_seen.type, DateTime)
        assert last_seen.type.timezone is True
