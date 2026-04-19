from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str  # Required — set WW_DATABASE_URL in .env
    mqtt_broker: str = "localhost"
    mqtt_port: int = 1883
    mqtt_topic: str = "ecowitt2mqtt/#"
    mqtt_client_id: str = "waffleweather-backend"
    mqtt_username: str | None = None
    mqtt_password: str | None = None
    cors_origins: list[str] = ["http://localhost"]
    enable_docs: bool = False  # Set WW_ENABLE_DOCS=true to expose /docs and /openapi.json
    api_key: str | None = None  # Set WW_API_KEY to require authentication on all endpoints

    # Lightning false-positive filter
    lightning_filter_enabled: bool = False
    lightning_filter_distances: list[float] = []
    lightning_filter_max_strikes: int = 1

    # Station metadata
    station_name: str | None = None
    station_latitude: float | None = None
    station_longitude: float | None = None
    station_altitude: float | None = None  # meters above sea level
    station_timezone: str = "UTC"  # IANA timezone (e.g. "America/New_York")

    model_config = {"env_file": [".env", "../.env"], "env_prefix": "WW_", "extra": "ignore"}
