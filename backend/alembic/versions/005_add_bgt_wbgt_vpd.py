"""Add BGT, WBGT, and VPD columns to weather_observations.

Revision ID: 005
Revises: 004
Create Date: 2026-04-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("weather_observations", sa.Column("bgt", sa.Float(), nullable=True))
    op.add_column("weather_observations", sa.Column("wbgt", sa.Float(), nullable=True))
    op.add_column("weather_observations", sa.Column("vpd", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("weather_observations", "vpd")
    op.drop_column("weather_observations", "wbgt")
    op.drop_column("weather_observations", "bgt")
