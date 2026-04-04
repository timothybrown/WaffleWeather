from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str  # Required — set WW_DATABASE_URL in .env
    mqtt_broker: str = "localhost"
    mqtt_port: int = 1883
    mqtt_topic: str = "ecowitt2mqtt/#"
    mqtt_client_id: str = "waffleweather-backend"
    mqtt_username: str | None = None
    mqtt_password: str | None = None
    cors_origins: list[str] = ["http://localhost:3000"]
    enable_docs: bool = False  # Set WW_ENABLE_DOCS=true to expose /docs and /openapi.json

    # Station metadata
    station_name: str | None = None
    station_latitude: float | None = None
    station_longitude: float | None = None
    station_altitude: float | None = None  # meters above sea level

    model_config = {"env_file": ".env", "env_prefix": "WW_"}
