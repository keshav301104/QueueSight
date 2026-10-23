"""Hourly visit counts per department, kept by TimescaleDB as a continuous aggregate.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-23
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # A continuous aggregate is a summary table TimescaleDB keeps up to date for us: one row per hour per department.
    # Sums, not averages, so any longer period (a day, a week) can be added up exactly from the hours.
    # materialized_only = false: hours not summarised yet are counted live from the visits, so answers are never stale.
    # WITH NO DATA: start empty (Alembic runs inside a transaction); scripts.load_db fills it after each load.
    op.execute("""
        CREATE MATERIALIZED VIEW hourly_visits
        WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
        SELECT time_bucket(INTERVAL '1 hour', arrival_time) AS hour,
               department_id,
               count(*) AS arrivals,
               count(*) FILTER (WHERE outcome = 'Left before care') AS walkouts,
               count(*) FILTER (WHERE outcome IS DISTINCT FROM 'Left before care') AS seen,
               sum(wait_minutes) FILTER (WHERE outcome IS DISTINCT FROM 'Left before care') AS seen_wait_minutes
        FROM encounters
        GROUP BY hour, department_id
        WITH NO DATA
    """)


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW hourly_visits")