"""Add lightning_events table for tracking individual storm activity.

Revision ID: 003
Revises: 002
Create Date: 2026-04-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lightning_events",
        sa.Column("timestamp", sa.DateTime(timezone=True), primary_key=True, nullable=False),
        sa.Column("station_id", sa.String(), primary_key=True, nullable=False),
        sa.Column("new_strikes", sa.Integer(), nullable=False),
        sa.Column("distance_km", sa.Float(), nullable=True),
        sa.Column("cumulative_count", sa.Integer(), nullable=False),
    )

    # Convert to TimescaleDB hypertable
    op.execute(
        "SELECT create_hypertable('lightning_events', 'timestamp', "
        "chunk_time_interval => INTERVAL '7 days', "
        "if_not_exists => TRUE)"
    )

    # Index for per-station time queries
    op.create_index(
        "ix_lightning_events_station_time",
        "lightning_events",
        ["station_id", sa.text("timestamp DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_lightning_events_station_time", table_name="lightning_events")
    op.drop_table("lightning_events")
