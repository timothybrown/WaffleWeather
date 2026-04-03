"""Initial schema with hypertable, continuous aggregates, compression, and retention.

Revision ID: 001
Revises:
Create Date: 2026-04-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- Stations table ----
    op.create_table(
        "stations",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("firmware_version", sa.String(), nullable=True),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
    )

    # ---- Weather observations table ----
    op.create_table(
        "weather_observations",
        sa.Column("timestamp", sa.DateTime(timezone=True), primary_key=True, nullable=False),
        sa.Column("station_id", sa.String(), primary_key=True, nullable=False),
        # Temperature
        sa.Column("temp_outdoor", sa.Float(), nullable=True),
        sa.Column("temp_indoor", sa.Float(), nullable=True),
        sa.Column("dewpoint", sa.Float(), nullable=True),
        sa.Column("feels_like", sa.Float(), nullable=True),
        sa.Column("heat_index", sa.Float(), nullable=True),
        sa.Column("wind_chill", sa.Float(), nullable=True),
        sa.Column("frost_point", sa.Float(), nullable=True),
        # Humidity
        sa.Column("humidity_outdoor", sa.Float(), nullable=True),
        sa.Column("humidity_indoor", sa.Float(), nullable=True),
        # Pressure
        sa.Column("pressure_abs", sa.Float(), nullable=True),
        sa.Column("pressure_rel", sa.Float(), nullable=True),
        # Wind
        sa.Column("wind_speed", sa.Float(), nullable=True),
        sa.Column("wind_gust", sa.Float(), nullable=True),
        sa.Column("wind_dir", sa.Float(), nullable=True),
        # Rain
        sa.Column("rain_rate", sa.Float(), nullable=True),
        sa.Column("rain_daily", sa.Float(), nullable=True),
        sa.Column("rain_weekly", sa.Float(), nullable=True),
        sa.Column("rain_monthly", sa.Float(), nullable=True),
        sa.Column("rain_yearly", sa.Float(), nullable=True),
        sa.Column("rain_event", sa.Float(), nullable=True),
        # Solar / UV
        sa.Column("solar_radiation", sa.Float(), nullable=True),
        sa.Column("uv_index", sa.Float(), nullable=True),
        # Air Quality
        sa.Column("pm25", sa.Float(), nullable=True),
        sa.Column("pm10", sa.Float(), nullable=True),
        sa.Column("co2", sa.Float(), nullable=True),
        # Soil
        sa.Column("soil_moisture_1", sa.Float(), nullable=True),
        sa.Column("soil_moisture_2", sa.Float(), nullable=True),
        # Lightning
        sa.Column("lightning_count", sa.Integer(), nullable=True),
        sa.Column("lightning_distance", sa.Float(), nullable=True),
        sa.Column("lightning_time", sa.DateTime(timezone=True), nullable=True),
    )

    # ---- Convert to TimescaleDB hypertable ----
    op.execute(
        "SELECT create_hypertable('weather_observations', 'timestamp', "
        "chunk_time_interval => INTERVAL '1 day', "
        "if_not_exists => TRUE)"
    )

    # Index for per-station time-ordered queries
    op.create_index(
        "ix_observations_station_time",
        "weather_observations",
        ["station_id", sa.text("timestamp DESC")],
    )

    # ---- Compression ----
    op.execute(
        "ALTER TABLE weather_observations SET ("
        "timescaledb.compress, "
        "timescaledb.compress_segmentby = 'station_id', "
        "timescaledb.compress_orderby = 'timestamp DESC'"
        ")"
    )
    op.execute(
        "SELECT add_compression_policy('weather_observations', INTERVAL '14 days')"
    )

    # ---- Continuous Aggregates ----

    # Hourly (from raw data)
    op.execute("""
        CREATE MATERIALIZED VIEW observations_hourly
        WITH (timescaledb.continuous) AS
        SELECT
            station_id,
            time_bucket('1 hour', timestamp) AS bucket,
            AVG(temp_outdoor) AS temp_outdoor_avg,
            MIN(temp_outdoor) AS temp_outdoor_min,
            MAX(temp_outdoor) AS temp_outdoor_max,
            AVG(humidity_outdoor) AS humidity_outdoor_avg,
            AVG(pressure_rel) AS pressure_rel_avg,
            AVG(wind_speed) AS wind_speed_avg,
            MAX(wind_gust) AS wind_gust_max,
            MAX(rain_daily) AS rain_daily_max,
            AVG(solar_radiation) AS solar_radiation_avg,
            MAX(uv_index) AS uv_index_max
        FROM weather_observations
        GROUP BY station_id, time_bucket('1 hour', timestamp)
        WITH NO DATA
    """)
    op.execute("""
        SELECT add_continuous_aggregate_policy('observations_hourly',
            start_offset => INTERVAL '3 hours',
            end_offset => INTERVAL '1 hour',
            schedule_interval => INTERVAL '1 hour'
        )
    """)

    # Daily (from hourly -- hierarchical)
    op.execute("""
        CREATE MATERIALIZED VIEW observations_daily
        WITH (timescaledb.continuous) AS
        SELECT
            station_id,
            time_bucket('1 day', bucket) AS bucket,
            AVG(temp_outdoor_avg) AS temp_outdoor_avg,
            MIN(temp_outdoor_min) AS temp_outdoor_min,
            MAX(temp_outdoor_max) AS temp_outdoor_max,
            AVG(humidity_outdoor_avg) AS humidity_outdoor_avg,
            AVG(pressure_rel_avg) AS pressure_rel_avg,
            AVG(wind_speed_avg) AS wind_speed_avg,
            MAX(wind_gust_max) AS wind_gust_max,
            MAX(rain_daily_max) AS rain_daily_max,
            AVG(solar_radiation_avg) AS solar_radiation_avg,
            MAX(uv_index_max) AS uv_index_max
        FROM observations_hourly
        GROUP BY station_id, time_bucket('1 day', bucket)
        WITH NO DATA
    """)
    op.execute("""
        SELECT add_continuous_aggregate_policy('observations_daily',
            start_offset => INTERVAL '3 days',
            end_offset => INTERVAL '1 day',
            schedule_interval => INTERVAL '1 day'
        )
    """)

    # Monthly (from daily -- hierarchical)
    op.execute("""
        CREATE MATERIALIZED VIEW observations_monthly
        WITH (timescaledb.continuous) AS
        SELECT
            station_id,
            time_bucket('1 month', bucket) AS bucket,
            AVG(temp_outdoor_avg) AS temp_outdoor_avg,
            MIN(temp_outdoor_min) AS temp_outdoor_min,
            MAX(temp_outdoor_max) AS temp_outdoor_max,
            AVG(humidity_outdoor_avg) AS humidity_outdoor_avg,
            AVG(pressure_rel_avg) AS pressure_rel_avg,
            AVG(wind_speed_avg) AS wind_speed_avg,
            MAX(wind_gust_max) AS wind_gust_max,
            MAX(rain_daily_max) AS rain_daily_max,
            AVG(solar_radiation_avg) AS solar_radiation_avg,
            MAX(uv_index_max) AS uv_index_max
        FROM observations_daily
        GROUP BY station_id, time_bucket('1 month', bucket)
        WITH NO DATA
    """)
    op.execute("""
        SELECT add_continuous_aggregate_policy('observations_monthly',
            start_offset => INTERVAL '3 months',
            end_offset => INTERVAL '1 month',
            schedule_interval => INTERVAL '1 day'
        )
    """)

    # ---- Retention policy: drop raw data older than 1 year ----
    op.execute(
        "SELECT add_retention_policy('weather_observations', INTERVAL '1 year')"
    )


def downgrade() -> None:
    op.execute("SELECT remove_retention_policy('weather_observations', if_exists => true)")
    op.execute("SELECT remove_continuous_aggregate_policy('observations_monthly', if_not_exists => true)")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS observations_monthly CASCADE")
    op.execute("SELECT remove_continuous_aggregate_policy('observations_daily', if_not_exists => true)")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS observations_daily CASCADE")
    op.execute("SELECT remove_continuous_aggregate_policy('observations_hourly', if_not_exists => true)")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS observations_hourly CASCADE")
    op.execute("SELECT remove_compression_policy('weather_observations', if_exists => true)")
    op.drop_index("ix_observations_station_time", table_name="weather_observations")
    op.drop_table("weather_observations")
    op.drop_table("stations")
