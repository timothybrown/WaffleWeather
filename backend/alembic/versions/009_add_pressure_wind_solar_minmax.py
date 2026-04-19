"""Add pressure_rel min/max, wind_speed_max, solar_radiation_max to aggregate views.

Revision ID: 009
Revises: 008
Create Date: 2026-04-19

"""
from typing import Sequence, Union

from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_VIEWS = ["observations_hourly", "observations_daily", "observations_monthly"]


def upgrade() -> None:
    # TimescaleDB continuous aggregates cannot be ALTERed — must drop and recreate.
    # Order matters: monthly depends on daily, daily depends on hourly.

    # Drop in reverse dependency order
    op.execute("SELECT remove_continuous_aggregate_policy('observations_monthly', if_not_exists => true)")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS observations_monthly CASCADE")
    op.execute("SELECT remove_continuous_aggregate_policy('observations_daily', if_not_exists => true)")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS observations_daily CASCADE")
    op.execute("SELECT remove_continuous_aggregate_policy('observations_hourly', if_not_exists => true)")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS observations_hourly CASCADE")

    # Recreate hourly with pressure min/max, wind_speed_max, solar_radiation_max
    op.execute("""
        CREATE MATERIALIZED VIEW observations_hourly
        WITH (timescaledb.continuous) AS
        SELECT
            station_id,
            time_bucket('1 hour', timestamp) AS bucket,
            AVG(temp_outdoor) AS temp_outdoor_avg,
            MIN(temp_outdoor) AS temp_outdoor_min,
            MAX(temp_outdoor) AS temp_outdoor_max,
            AVG(dewpoint) AS dewpoint_avg,
            MIN(dewpoint) AS dewpoint_min,
            MAX(dewpoint) AS dewpoint_max,
            AVG(humidity_outdoor) AS humidity_outdoor_avg,
            MIN(humidity_outdoor) AS humidity_outdoor_min,
            MAX(humidity_outdoor) AS humidity_outdoor_max,
            AVG(pressure_rel) AS pressure_rel_avg,
            MIN(pressure_rel) AS pressure_rel_min,
            MAX(pressure_rel) AS pressure_rel_max,
            AVG(wind_speed) AS wind_speed_avg,
            MAX(wind_speed) AS wind_speed_max,
            MAX(wind_gust) AS wind_gust_max,
            MAX(rain_daily) AS rain_daily_max,
            AVG(solar_radiation) AS solar_radiation_avg,
            MAX(solar_radiation) AS solar_radiation_max,
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

    # Recreate daily with pressure min/max, wind_speed_max, solar_radiation_max
    op.execute("""
        CREATE MATERIALIZED VIEW observations_daily
        WITH (timescaledb.continuous) AS
        SELECT
            station_id,
            time_bucket('1 day', bucket) AS bucket,
            AVG(temp_outdoor_avg) AS temp_outdoor_avg,
            MIN(temp_outdoor_min) AS temp_outdoor_min,
            MAX(temp_outdoor_max) AS temp_outdoor_max,
            AVG(dewpoint_avg) AS dewpoint_avg,
            MIN(dewpoint_min) AS dewpoint_min,
            MAX(dewpoint_max) AS dewpoint_max,
            AVG(humidity_outdoor_avg) AS humidity_outdoor_avg,
            MIN(humidity_outdoor_min) AS humidity_outdoor_min,
            MAX(humidity_outdoor_max) AS humidity_outdoor_max,
            AVG(pressure_rel_avg) AS pressure_rel_avg,
            MIN(pressure_rel_min) AS pressure_rel_min,
            MAX(pressure_rel_max) AS pressure_rel_max,
            AVG(wind_speed_avg) AS wind_speed_avg,
            MAX(wind_speed_max) AS wind_speed_max,
            MAX(wind_gust_max) AS wind_gust_max,
            MAX(rain_daily_max) AS rain_daily_max,
            AVG(solar_radiation_avg) AS solar_radiation_avg,
            MAX(solar_radiation_max) AS solar_radiation_max,
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

    # Recreate monthly with pressure min/max, wind_speed_max, solar_radiation_max
    op.execute("""
        CREATE MATERIALIZED VIEW observations_monthly
        WITH (timescaledb.continuous) AS
        SELECT
            station_id,
            time_bucket('1 month', bucket) AS bucket,
            AVG(temp_outdoor_avg) AS temp_outdoor_avg,
            MIN(temp_outdoor_min) AS temp_outdoor_min,
            MAX(temp_outdoor_max) AS temp_outdoor_max,
            AVG(dewpoint_avg) AS dewpoint_avg,
            MIN(dewpoint_min) AS dewpoint_min,
            MAX(dewpoint_max) AS dewpoint_max,
            AVG(humidity_outdoor_avg) AS humidity_outdoor_avg,
            MIN(humidity_outdoor_min) AS humidity_outdoor_min,
            MAX(humidity_outdoor_max) AS humidity_outdoor_max,
            AVG(pressure_rel_avg) AS pressure_rel_avg,
            MIN(pressure_rel_min) AS pressure_rel_min,
            MAX(pressure_rel_max) AS pressure_rel_max,
            AVG(wind_speed_avg) AS wind_speed_avg,
            MAX(wind_speed_max) AS wind_speed_max,
            MAX(wind_gust_max) AS wind_gust_max,
            MAX(rain_daily_max) AS rain_daily_max,
            AVG(solar_radiation_avg) AS solar_radiation_avg,
            MAX(solar_radiation_max) AS solar_radiation_max,
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

    # Re-enable real-time aggregation
    for view in _VIEWS:
        op.execute(
            f"ALTER MATERIALIZED VIEW {view} SET (timescaledb.materialized_only = false)"
        )

    # Backfill aggregates from existing raw data (order matters: hourly → daily → monthly)
    op.execute("CALL refresh_continuous_aggregate('observations_hourly', '2020-01-01', now()::timestamptz)")
    op.execute("CALL refresh_continuous_aggregate('observations_daily', '2020-01-01', now()::timestamptz)")
    op.execute("CALL refresh_continuous_aggregate('observations_monthly', '2020-01-01', now()::timestamptz)")


def downgrade() -> None:
    # Reverse: drop and recreate at 008 state (with dewpoint, without pressure min/max etc.)
    op.execute("SELECT remove_continuous_aggregate_policy('observations_monthly', if_not_exists => true)")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS observations_monthly CASCADE")
    op.execute("SELECT remove_continuous_aggregate_policy('observations_daily', if_not_exists => true)")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS observations_daily CASCADE")
    op.execute("SELECT remove_continuous_aggregate_policy('observations_hourly', if_not_exists => true)")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS observations_hourly CASCADE")

    op.execute("""
        CREATE MATERIALIZED VIEW observations_hourly
        WITH (timescaledb.continuous) AS
        SELECT
            station_id,
            time_bucket('1 hour', timestamp) AS bucket,
            AVG(temp_outdoor) AS temp_outdoor_avg,
            MIN(temp_outdoor) AS temp_outdoor_min,
            MAX(temp_outdoor) AS temp_outdoor_max,
            AVG(dewpoint) AS dewpoint_avg,
            MIN(dewpoint) AS dewpoint_min,
            MAX(dewpoint) AS dewpoint_max,
            AVG(humidity_outdoor) AS humidity_outdoor_avg,
            MIN(humidity_outdoor) AS humidity_outdoor_min,
            MAX(humidity_outdoor) AS humidity_outdoor_max,
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

    op.execute("""
        CREATE MATERIALIZED VIEW observations_daily
        WITH (timescaledb.continuous) AS
        SELECT
            station_id,
            time_bucket('1 day', bucket) AS bucket,
            AVG(temp_outdoor_avg) AS temp_outdoor_avg,
            MIN(temp_outdoor_min) AS temp_outdoor_min,
            MAX(temp_outdoor_max) AS temp_outdoor_max,
            AVG(dewpoint_avg) AS dewpoint_avg,
            MIN(dewpoint_min) AS dewpoint_min,
            MAX(dewpoint_max) AS dewpoint_max,
            AVG(humidity_outdoor_avg) AS humidity_outdoor_avg,
            MIN(humidity_outdoor_min) AS humidity_outdoor_min,
            MAX(humidity_outdoor_max) AS humidity_outdoor_max,
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

    op.execute("""
        CREATE MATERIALIZED VIEW observations_monthly
        WITH (timescaledb.continuous) AS
        SELECT
            station_id,
            time_bucket('1 month', bucket) AS bucket,
            AVG(temp_outdoor_avg) AS temp_outdoor_avg,
            MIN(temp_outdoor_min) AS temp_outdoor_min,
            MAX(temp_outdoor_max) AS temp_outdoor_max,
            AVG(dewpoint_avg) AS dewpoint_avg,
            MIN(dewpoint_min) AS dewpoint_min,
            MAX(dewpoint_max) AS dewpoint_max,
            AVG(humidity_outdoor_avg) AS humidity_outdoor_avg,
            MIN(humidity_outdoor_min) AS humidity_outdoor_min,
            MAX(humidity_outdoor_max) AS humidity_outdoor_max,
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

    # Re-enable real-time aggregation (restoring 008 state)
    for view in _VIEWS:
        op.execute(
            f"ALTER MATERIALIZED VIEW {view} SET (timescaledb.materialized_only = false)"
        )

    # Backfill aggregates from existing raw data
    op.execute("CALL refresh_continuous_aggregate('observations_hourly', '2020-01-01', now()::timestamptz)")
    op.execute("CALL refresh_continuous_aggregate('observations_daily', '2020-01-01', now()::timestamptz)")
    op.execute("CALL refresh_continuous_aggregate('observations_monthly', '2020-01-01', now()::timestamptz)")
