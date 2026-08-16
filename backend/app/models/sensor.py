from sqlalchemy import Column, DateTime, Float, String

from app.models.base import Base


class SensorObservation(Base):
    """A temperature/humidity reading from one auxiliary sensor.

    Placement lives on Sensor, not here, so moving a sensor is a metadata
    update instead of a data migration.
    """

    __tablename__ = "sensor_observations"

    timestamp = Column(DateTime(timezone=True), primary_key=True, nullable=False)
    station_id = Column(String, primary_key=True, nullable=False)
    # 'gw' for the gateway sensor; later 'ch1'..'ch8', 'zb:<ieee>'.
    sensor_key = Column(String, primary_key=True, nullable=False)

    temp = Column(Float, nullable=True)
    humidity = Column(Float, nullable=True)


class Sensor(Base):
    """Metadata for one auxiliary sensor, registered on first reading."""

    __tablename__ = "sensors"

    station_id = Column(String, primary_key=True, nullable=False)
    sensor_key = Column(String, primary_key=True, nullable=False)

    label = Column(String, nullable=True)
    # 'unassigned' | 'indoor' | 'outdoor'
    placement = Column(String, nullable=False, default="unassigned")
    last_seen = Column(DateTime(timezone=True), nullable=True)
