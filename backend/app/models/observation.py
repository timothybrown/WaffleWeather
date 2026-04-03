from sqlalchemy import Column, DateTime, Float, Integer, String

from app.models.base import Base


class WeatherObservation(Base):
    __tablename__ = "weather_observations"

    timestamp = Column(DateTime(timezone=True), primary_key=True, nullable=False)
    station_id = Column(String, nullable=False, primary_key=True)

    # Temperature
    temp_outdoor = Column(Float, nullable=True)
    temp_indoor = Column(Float, nullable=True)
    dewpoint = Column(Float, nullable=True)
    feels_like = Column(Float, nullable=True)
    heat_index = Column(Float, nullable=True)
    wind_chill = Column(Float, nullable=True)
    frost_point = Column(Float, nullable=True)

    # Humidity
    humidity_outdoor = Column(Float, nullable=True)
    humidity_indoor = Column(Float, nullable=True)

    # Pressure
    pressure_abs = Column(Float, nullable=True)
    pressure_rel = Column(Float, nullable=True)

    # Wind
    wind_speed = Column(Float, nullable=True)
    wind_gust = Column(Float, nullable=True)
    wind_dir = Column(Float, nullable=True)

    # Rain
    rain_rate = Column(Float, nullable=True)
    rain_daily = Column(Float, nullable=True)
    rain_weekly = Column(Float, nullable=True)
    rain_monthly = Column(Float, nullable=True)
    rain_yearly = Column(Float, nullable=True)
    rain_event = Column(Float, nullable=True)

    # Solar / UV
    solar_radiation = Column(Float, nullable=True)
    uv_index = Column(Float, nullable=True)

    # Air Quality
    pm25 = Column(Float, nullable=True)
    pm10 = Column(Float, nullable=True)
    co2 = Column(Float, nullable=True)

    # Soil
    soil_moisture_1 = Column(Float, nullable=True)
    soil_moisture_2 = Column(Float, nullable=True)

    # Lightning
    lightning_count = Column(Integer, nullable=True)
    lightning_distance = Column(Float, nullable=True)
    lightning_time = Column(DateTime(timezone=True), nullable=True)
