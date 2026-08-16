"""Auxiliary sensor observations: hypertable, aggregates, and gateway backfill.

Revision ID: 011
Revises: 010
Create Date: 2026-08-16
"""

from datetime import datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.config import Settings

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_VIEWS = (
    "sensor_observations_hourly",
    "sensor_observations_daily",
    "sensor_observations_monthly",
)


def _next_month(dt: datetime) -> datetime:
    """Return the first instant of the month after dt."""
    month_start = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if month_start.month == 12:
        return month_start.replace(year=month_start.year + 1, month=1)
    return month_start.replace(month=month_start.month + 1)


def _sql_literal(value: str) -> str:
    return value.replace("'", "''")


def upgrade() -> None:
    tz = _sql_literal(Settings().station_timezone)

    # ---- Metadata table ----
    op.create_table(
        "sensors",
        sa.Column("station_id", sa.String(), primary_key=True, nullable=False),
        sa.Column("sensor_key", sa.String(), primary_key=True, nullable=False),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("placement", sa.String(), nullable=False, server_default="unassigned"),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
    )

    # ---- Readings hypertable ----
    op.create_table(
        "sensor_observations",
        sa.Column("timestamp", sa.DateTime(timezone=True), primary_key=True, nullable=False),
        sa.Column("station_id", sa.String(), primary_key=True, nullable=False),
        sa.Column("sensor_key", sa.String(), primary_key=True, nullable=False),
        sa.Column("temp", sa.Float(), nullable=True),
        sa.Column("humidity", sa.Float(), nullable=True),
    )
    op.execute(
        "SELECT create_hypertable('sensor_observations', 'timestamp', "
        "chunk_time_interval => INTERVAL '1 day', "
        "if_not_exists => TRUE)"
    )

    # ---- Seed the gateway sensor ----
    op.execute(
        "INSERT INTO sensors (station_id, sensor_key, label, placement) "
        "SELECT DISTINCT station_id, 'gw', 'Indoor', 'indoor' "
        "FROM weather_observations "
        "ON CONFLICT (station_id, sensor_key) DO NOTHING"
    )

    # ---- Backfill, batched by month ----
    # A single INSERT..SELECT over a year of 16s-cadence rows can spike memory
    # on the 4GB Pi. Walk month by month instead.
    conn = op.get_bind()
    bounds = conn.execute(
        sa.text(
            "SELECT MIN(timestamp), MAX(timestamp) "
            "FROM weather_observations "
            "WHERE temp_indoor IS NOT NULL OR humidity_indoor IS NOT NULL"
        )
    ).fetchone()

    if bounds and bounds[0] is not None and bounds[1] is not None:
        cursor = bounds[0].replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        final = bounds[1]
        while cursor <= final:
            nxt = _next_month(cursor)
            conn.execute(
                sa.text(
                    "INSERT INTO sensor_observations "
                    "    (timestamp, station_id, sensor_key, temp, humidity) "
                    "SELECT timestamp, station_id, 'gw', temp_indoor, humidity_indoor "
                    "FROM weather_observations "
                    "WHERE timestamp >= :start AND timestamp < :end "
                    "  AND (temp_indoor IS NOT NULL OR humidity_indoor IS NOT NULL) "
                    "ON CONFLICT DO NOTHING"
                ),
                {"start": cursor, "end": nxt},
            )
            cursor = nxt

    # ---- Continuous aggregates ----
    op.execute(
        """
        CREATE MATERIALIZED VIEW sensor_observations_hourly
        WITH (timescaledb.continuous) AS
        SELECT
            station_id,
            sensor_key,
            time_bucket('1 hour', timestamp) AS bucket,
            AVG(temp) AS temp_avg,
            MIN(temp) AS temp_min,
            MAX(temp) AS temp_max,
            AVG(humidity) AS humidity_avg,
            MIN(humidity) AS humidity_min,
            MAX(humidity) AS humidity_max
        FROM sensor_observations
        GROUP BY station_id, sensor_key, time_bucket('1 hour', timestamp)
        WITH NO DATA
        """
    )

    op.execute(
        f"""
        CREATE MATERIALIZED VIEW sensor_observations_daily
        WITH (timescaledb.continuous) AS
        SELECT
            station_id,
            sensor_key,
            time_bucket('1 day', bucket, timezone => '{tz}') AS bucket,
            AVG(temp_avg) AS temp_avg,
            MIN(temp_min) AS temp_min,
            MAX(temp_max) AS temp_max,
            AVG(humidity_avg) AS humidity_avg,
            MIN(humidity_min) AS humidity_min,
            MAX(humidity_max) AS humidity_max
        FROM sensor_observations_hourly
        GROUP BY station_id, sensor_key, time_bucket('1 day', bucket, timezone => '{tz}')
        WITH NO DATA
        """
    )

    op.execute(
        f"""
        CREATE MATERIALIZED VIEW sensor_observations_monthly
        WITH (timescaledb.continuous) AS
        SELECT
            station_id,
            sensor_key,
            time_bucket('1 month', bucket, timezone => '{tz}') AS bucket,
            AVG(temp_avg) AS temp_avg,
            MIN(temp_min) AS temp_min,
            MAX(temp_max) AS temp_max,
            AVG(humidity_avg) AS humidity_avg,
            MIN(humidity_min) AS humidity_min,
            MAX(humidity_max) AS humidity_max
        FROM sensor_observations_daily
        GROUP BY station_id, sensor_key, time_bucket('1 month', bucket, timezone => '{tz}')
        WITH NO DATA
        """
    )

    # ---- Refresh policies ----
    op.execute(
        """
        SELECT add_continuous_aggregate_policy('sensor_observations_hourly',
            start_offset => INTERVAL '3 hours',
            end_offset => INTERVAL '1 hour',
            schedule_interval => INTERVAL '1 hour')
        """
    )
    op.execute(
        """
        SELECT add_continuous_aggregate_policy('sensor_observations_daily',
            start_offset => INTERVAL '3 days',
            end_offset => INTERVAL '1 day',
            schedule_interval => INTERVAL '1 day')
        """
    )
    op.execute(
        """
        SELECT add_continuous_aggregate_policy('sensor_observations_monthly',
            start_offset => INTERVAL '3 months',
            end_offset => INTERVAL '1 month',
            schedule_interval => INTERVAL '1 day')
        """
    )

    for view in _VIEWS:
        op.execute(
            f"ALTER MATERIALIZED VIEW {view} SET (timescaledb.materialized_only = false)"
        )

    # ---- Compression and retention ----
    op.execute(
        "ALTER TABLE sensor_observations SET ("
        "timescaledb.compress, "
        "timescaledb.compress_segmentby = 'station_id, sensor_key', "
        "timescaledb.compress_orderby = 'timestamp DESC'"
        ")"
    )
    op.execute(
        "SELECT add_compression_policy('sensor_observations', INTERVAL '14 days')"
    )
    op.execute("SELECT add_retention_policy('sensor_observations', INTERVAL '1 year')")


def downgrade() -> None:
    op.execute("SELECT remove_retention_policy('sensor_observations', if_exists => true)")
    op.execute("SELECT remove_compression_policy('sensor_observations', if_exists => true)")

    for view in reversed(_VIEWS):
        op.execute(
            f"SELECT remove_continuous_aggregate_policy('{view}', if_not_exists => true)"
        )
        op.execute(f"DROP MATERIALIZED VIEW IF EXISTS {view} CASCADE")

    op.drop_table("sensor_observations")
    op.drop_table("sensors")
