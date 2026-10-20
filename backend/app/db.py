"""QueueSight's database: every kind of hospital record as a table, defined once in Python with SQLModel.

The four hospital tables mirror the dataset's CSV files column for column, so the same cleaning and modelling code
works on either source. Visits, tests and predictions are TimescaleDB hypertables (stored in 30-day chunks by time,
see migrations/), which is why their primary keys also include the time column.

Hospital times (arrivals, tests, ...) are the hospital's own wall clock, exactly as the dataset writes them, with no
timezone: NaiveDatetime keeps them unshifted, so 09:00 stays 09:00 and hourly patterns stay true.
"""
from datetime import datetime

from pydantic import NaiveDatetime
from sqlalchemy import Engine
from sqlmodel import Field, SQLModel, create_engine

from app.config import DATABASE_URL


class Department(SQLModel, table=True):
    __tablename__ = "departments"
    department_id: str = Field(primary_key=True)
    department_name: str
    staff_count: int
    bed_count: int
    daily_capacity: int
    service_type: str


class Patient(SQLModel, table=True):
    __tablename__ = "patients"
    patient_id: str = Field(primary_key=True)
    age: int | None = None
    sex: str | None = None
    chronic_condition: str | None = None
    home_area: str | None = None
    insurance_type: str | None = None


class Encounter(SQLModel, table=True):
    """One hospital visit. A hypertable, split into 30-day chunks by arrival_time."""
    __tablename__ = "encounters"
    encounter_id: str = Field(primary_key=True)
    patient_id: str = Field(foreign_key="patients.patient_id", index=True)
    arrival_time: NaiveDatetime = Field(primary_key=True)   # a hypertable's time column must be in every unique key
    department_id: str = Field(foreign_key="departments.department_id", index=True)
    visit_type: str | None = None
    triage_level: str | None = None
    outcome: str | None = None
    service_start_time: NaiveDatetime | None = None         # empty for a patient who walked out
    service_end_time: NaiveDatetime | None = None
    wait_minutes: int | None = None
    service_minutes: int | None = None
    discharge_time: NaiveDatetime | None = None


class DiagnosticTest(SQLModel, table=True):
    """A test ordered during a visit. A hypertable, split by requested_time."""
    __tablename__ = "diagnostic_tests"
    test_id: str = Field(primary_key=True)
    encounter_id: str = Field(index=True)                   # no foreign key: a visit is unique only with its time
    test_type: str | None = None
    requested_time: NaiveDatetime = Field(primary_key=True)
    completion_time: NaiveDatetime | None = None
    priority: str | None = None


class Prediction(SQLModel, table=True):
    """The wait range our model predicted for each visit at the moment it arrived. A hypertable, like visits."""
    __tablename__ = "predictions"
    encounter_id: str = Field(primary_key=True)
    arrival_time: NaiveDatetime = Field(primary_key=True)
    department_id: str = Field(index=True)
    pred_p10: float
    pred_p50: float
    pred_p90: float


class LoadedHospital(SQLModel, table=True):
    """Which hospital is in the database right now and when it was loaded (always one row)."""
    __tablename__ = "loaded_hospital"
    id: int = Field(default=1, primary_key=True)
    source: str                                             # "datathon" or "sim"
    loaded_at: datetime                                     # a real moment (UTC), unlike the hospital clock
    encounters: int


# CSV file name -> table, in an order that respects the foreign keys when loading
CSV_TABLES = {"departments": Department, "patients": Patient, "encounters": Encounter, "diagnostic_tests": DiagnosticTest}
HYPERTABLES = {"encounters": "arrival_time", "diagnostic_tests": "requested_time", "predictions": "arrival_time"}


def get_engine(url: str | None = None) -> Engine:
    """A connection pool to the database in DATABASE_URL (or the url given)."""
    url = url or DATABASE_URL
    if not url:
        raise RuntimeError("DATABASE_URL is not set - start the database with `docker compose up -d db` and set it, "
                           "e.g. postgresql+psycopg://queuesight:queuesight@localhost:5433/queuesight")
    return create_engine(url, pool_pre_ping=True)


def is_ours(obj, name, type_, reflected, compare_to) -> bool:
    """For Alembic: compare the database only with what our models define. TimescaleDB adds a time index to every
    hypertable by itself; without this, autogenerate would think it should be deleted."""
    return not (type_ == "index" and reflected and compare_to is None)