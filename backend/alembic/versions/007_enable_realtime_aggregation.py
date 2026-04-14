"""Enable real-time aggregation on continuous aggregates.

With materialized_only=true (the default for WITH NO DATA views),
queries only see fully materialized buckets. The current hour/day/month
is invisible until the refresh policy runs after the bucket closes.

Setting materialized_only=false lets TimescaleDB merge materialized data
with a real-time query of raw data for the most recent, not-yet-materialized
bucket — so the current hour always appears in results.

Revision ID: 007
Revises: 006
Create Date: 2026-04-14

"""
from typing import Sequence, Union

from alembic import op

revision: str = "007"
down_revision: str = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_VIEWS = ["observations_hourly", "observations_daily", "observations_monthly"]


def upgrade() -> None:
    for view in _VIEWS:
        op.execute(
            f"ALTER MATERIALIZED VIEW {view} SET (timescaledb.materialized_only = false)"
        )


def downgrade() -> None:
    for view in _VIEWS:
        op.execute(
            f"ALTER MATERIALIZED VIEW {view} SET (timescaledb.materialized_only = true)"
        )
