"""Recreate daily and monthly aggregates with timezone-aware time_bucket.

Revision ID: 010
Revises: 009
Create Date: 2026-04-19
"""
import os
from typing import Sequence, Union

from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TZ = os.environ.get("WW_STATION_TIMEZONE", "UTC")


def upgrade() -> None:
    # Drop in reverse dependency order (monthly depends on daily)
    op.execute("SELECT remove_continuous_aggregate_policy('observations_monthly', if_not_exists => true)")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS observations_monthly CASCADE")
    op.execute("SELECT remove_continuous_aggregate_policy('observations_daily', if_not_exists => true)")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS observations_daily CASCADE")

    # Recreate daily with timezone-aware bucket boundaries
    op.execute(f"""
        CREATE MATERIALIZED VIEW observations_daily
        WITH (timescaledb.continuous) AS
        SELECT
            station_id,
            time_bucket('1 day', bucket, timezone => '{_TZ}') AS bucket,
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
        GROUP BY station_id, time_bucket('1 day', bucket, timezone => '{_TZ}')
        WITH NO DATA
    """)
    op.execute("""
        SELECT add_continuous_aggregate_policy('observations_daily',
            start_offset => INTERVAL '3 days',
            end_offset => INTERVAL '1 day',
            schedule_interval => INTERVAL '1 day'
        )
    """)

    # Recreate monthly with timezone-aware bucket boundaries
    op.execute(f"""
        CREATE MATERIALIZED VIEW observations_monthly
        WITH (timescaledb.continuous) AS
        SELECT
            station_id,
            time_bucket('1 month', bucket, timezone => '{_TZ}') AS bucket,
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
        GROUP BY station_id, time_bucket('1 month', bucket, timezone => '{_TZ}')
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
    for view in ["observations_daily", "observations_monthly"]:
        op.execute(
            f"ALTER MATERIALIZED VIEW {view} SET (timescaledb.materialized_only = false)"
        )

    # Backfill from existing hourly data.
    # refresh_continuous_aggregate() cannot run inside a transaction block,
    # so we commit the DDL first and re-open a transaction for alembic's stamp.
    op.execute("COMMIT")
    op.execute("CALL refresh_continuous_aggregate('observations_daily', '2020-01-01', now()::timestamptz)")
    op.execute("CALL refresh_continuous_aggregate('observations_monthly', '2020-01-01', now()::timestamptz)")
    op.execute("BEGIN")


def downgrade() -> None:
    # Revert to UTC-based buckets (same as 009 state)
    op.execute("SELECT remove_continuous_aggregate_policy('observations_monthly', if_not_exists => true)")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS observations_monthly CASCADE")
    op.execute("SELECT remove_continuous_aggregate_policy('observations_daily', if_not_exists => true)")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS observations_daily CASCADE")

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

    for view in ["observations_daily", "observations_monthly"]:
        op.execute(
            f"ALTER MATERIALIZED VIEW {view} SET (timescaledb.materialized_only = false)"
        )

    op.execute("COMMIT")
    op.execute("CALL refresh_continuous_aggregate('observations_daily', '2020-01-01', now()::timestamptz)")
    op.execute("CALL refresh_continuous_aggregate('observations_monthly', '2020-01-01', now()::timestamptz)")
    op.execute("BEGIN")
