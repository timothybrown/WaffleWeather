from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+asyncpg://waffleweather:devpassword@localhost:5432/waffleweather"
    )
    mqtt_broker: str = "localhost"
    mqtt_port: int = 1883
    mqtt_topic: str = "ecowitt2mqtt/#"
    mqtt_client_id: str = "waffleweather-backend"
    cors_origins: list[str] = ["http://localhost:3000"]

    # Station metadata
    station_name: str | None = None
    station_latitude: float | None = None
    station_longitude: float | None = None
    station_altitude: float | None = None  # meters above sea level

    model_config = {"env_file": ".env", "env_prefix": "WW_"}
