"""Hourly arrivals for the trend chart: only complete hours before the clock, a fair "usual", and TimescaleDB's
continuous aggregate agreeing with pandas. The database tests need TEST_DATABASE_URL (see test_migrations.py)."""
import os
from pathlib import Path

import pandas as pd
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import DATA_SOURCES, ROOT_DIR
from app.data import clean, load_raw
from app.trends import trends
from scripts.load_db import load
from tests.test_load_db import copy_hospital

TEST_URL = os.getenv("TEST_DATABASE_URL")
BACKEND = Path(__file__).resolve().parents[1]
RAW = DATA_SOURCES["datathon"]
ARTIFACTS = ROOT_DIR / "backend" / "artifacts" / "datathon"
MONDAY = pd.Timestamp("2025-03-03 10:30")


def visits(*times, department="D01"):
    return pd.DataFrame({"arrival_time": pd.to_datetime(list(times)), "department_id": department})


def at(r, hour):
    return r["hours"].index(pd.Timestamp(hour).isoformat())


def test_only_complete_hours_before_the_clock_count():
    r = trends(visits("2025-03-03 08:10", "2025-03-03 09:05", "2025-03-03 09:50", "2025-03-03 10:10"), MONDAY, days=1)
    assert r["hours"][-1] == "2025-03-03T09:00:00"     # 10:00-11:00 is still under way at 10:30
    assert r["arrivals"][-2:] == [1, 2]
    assert r["last_24h"] == 3                           # the 10:10 arrival is not counted yet


def test_usual_is_the_average_of_the_same_hour_in_the_4_weeks_before():
    # at 09:15 on Mondays: 1 arrival a week ago, 2 two weeks ago, 3, then 4, and 100 five weeks ago
    nine = MONDAY.replace(hour=9, minute=15)
    times = [nine - pd.Timedelta(weeks=k) for k, n in [(1, 1), (2, 2), (3, 3), (4, 4), (5, 100)] for _ in range(n)]
    r = trends(visits(*times), MONDAY, days=1)
    assert r["usual"][at(r, "2025-03-03 09:00")] == pytest.approx(2.5)   # (1 + 2 + 3 + 4) / 4; week 5 is too old


def test_hours_before_the_data_begins_are_unknown_not_zero():
    r = trends(visits("2025-01-01 09:00"), "2025-01-02 10:30", days=7, data_start="2025-01-01 00:06")
    assert r["arrivals"][at(r, "2024-12-31 23:00")] is None and r["arrivals"][at(r, "2025-01-01 09:00")] == 1
    assert set(r["usual"]) == {None} and r["vs_usual_pct"] is None


def test_one_department_counts_only_its_own_visits():
    v = pd.concat([visits("2025-03-03 09:10"), visits("2025-03-03 09:20", department="D02")])
    assert trends(v, MONDAY, days=1, department="D02")["last_24h"] == 1


@pytest.fixture(scope="module")
def engine():
    if not TEST_URL:
        pytest.skip("needs TEST_DATABASE_URL (a spare database)")
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", TEST_URL.replace("%", "%%"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    engine = create_engine(TEST_URL)
    load(engine, "datathon", RAW, ARTIFACTS, force=True)
    yield engine
    engine.dispose()
    command.downgrade(cfg, "base")


@pytest.mark.parametrize("t, department", [("2025-11-23 20:58", None), ("2025-11-23 20:58", "D04"),
                                           ("2025-01-05 10:00", None), ("2025-12-31 23:59", "D01")])
def test_timescaledb_gives_the_same_trend_as_pandas(engine, t, department):
    v = clean(load_raw(RAW))["encounters"]
    start = v["arrival_time"].min()
    assert trends(engine, t, 7, department, start) == trends(v, t, 7, department, start)


def test_loading_another_hospital_refreshes_the_hourly_summary(engine, tmp_path):
    def summed():
        with engine.connect() as c:
            return c.execute(text("SELECT sum(arrivals) FROM hourly_visits")).scalar()
    assert summed() == 8000
    load(engine, "sim", *copy_hospital(tmp_path, keep_visits=500))
    assert summed() == 500                              # no hours left over from the hospital before
    load(engine, "datathon", RAW, ARTIFACTS, force=True)