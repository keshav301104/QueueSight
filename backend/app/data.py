"""Load the 4 raw CSVs correctly and clean them. Everything else in QueueSight starts from load_clean()."""
import io

import numpy as np
import pandas as pd

from app.config import DATA_SOURCE, RAW_DIR

ENC_TIMES = ["arrival_time", "service_start_time", "service_end_time", "discharge_time"]
TEST_TIMES = ["requested_time", "completion_time"]
TRIAGE_ORDER = ["Critical", "High", "Medium", "Low"]
LBC = "Left before care"

# load_raw()'s name for each table -> (file / database table, its time columns, row order)
TABLES = {
    "patients": ("patients", [], "patient_id"),
    "encounters": ("encounters", ENC_TIMES, "arrival_time, encounter_id"),
    "departments": ("departments", [], "department_id"),
    "tests": ("diagnostic_tests", TEST_TIMES, "test_id"),
}


def _parse(source, date_cols):
    """One table from CSV text: a file, or the same text streamed out of the database."""
    # keep_default_na=False: pandas would otherwise turn the real value "None" into NaN
    df = pd.read_csv(source, keep_default_na=False, na_values=[""])
    for c in date_cols:
        df[c] = pd.to_datetime(df[c], errors="coerce")
    return df


def _read(raw_dir, name, date_cols):
    path = raw_dir / f"{name}.csv"
    if not path.exists():
        fix = ("create the simulated hospital first:  python -m scripts.simulate" if DATA_SOURCE == "sim"
               else "put the DATATHON CSVs in data/raw/")
        raise FileNotFoundError(f"{path} not found - {fix}")
    return _parse(path, date_cols)


def load_raw(raw_dir=RAW_DIR):
    return {key: _read(raw_dir, name, times) for key, (name, times, _) in TABLES.items()}


def _minutes(a, b):
    return (b - a).dt.total_seconds() / 60


def clean(raw):
    """Return cleaned copies. We never silently delete: rows are dropped only when unusable."""
    pat = raw["patients"].drop_duplicates("patient_id").copy()
    dep = raw["departments"].drop_duplicates("department_id").copy()
    tst = raw["tests"].drop_duplicates("test_id").copy()
    enc = raw["encounters"].drop_duplicates("encounter_id").copy()

    # An encounter without an arrival time cannot be placed in time -> unusable
    enc = enc[enc["arrival_time"].notna()]
    # Keep only rows that join to known patients and departments
    enc = enc[enc["patient_id"].isin(pat["patient_id"]) & enc["department_id"].isin(dep["department_id"])]

    # Trust timestamps over the pre-computed columns; fill the minute columns from timestamps when missing
    enc["wait_calc"] = _minutes(enc["arrival_time"], enc["service_start_time"])
    enc["service_calc"] = _minutes(enc["service_start_time"], enc["service_end_time"])
    enc["wait_minutes"] = enc["wait_minutes"].fillna(enc["wait_calc"])
    enc["service_minutes"] = enc["service_minutes"].fillna(enc["service_calc"])
    enc = enc[enc["wait_minutes"].notna() & (enc["wait_minutes"] >= 0)]

    # When each patient stopped waiting: the moment they were called in, or - for a walk-out
    # who was never called - the moment they gave up and left (arrival + how long they waited)
    left_at = enc["arrival_time"] + pd.to_timedelta(enc["wait_minutes"], unit="min")
    enc["wait_end_time"] = enc["service_start_time"].fillna(left_at)

    enc["is_lbc"] = enc["outcome"].eq(LBC).astype(int)
    enc["triage_rank"] = enc["triage_level"].map({t: i for i, t in enumerate(TRIAGE_ORDER)})
    enc = enc.merge(dep[["department_id", "department_name"]], on="department_id", how="left")
    enc = enc.sort_values(["arrival_time", "encounter_id"]).reset_index(drop=True)  # same order every time

    tst = tst[tst["encounter_id"].isin(enc["encounter_id"])]
    tst["tat_minutes"] = _minutes(tst["requested_time"], tst["completion_time"])
    tst = tst[tst["tat_minutes"].notna() & (tst["tat_minutes"] >= 0)].reset_index(drop=True)

    pat["sex"] = pat["sex"].fillna("Unknown")
    pat["insurance_type"] = pat["insurance_type"].fillna("Unknown")
    pat["chronic_condition"] = pat["chronic_condition"].fillna("Unknown")
    return {"patients": pat, "encounters": enc, "departments": dep, "tests": tst}


def load_clean():
    raw = load_raw()
    return raw, clean(raw)


def load_clean_from_db(engine):
    """The cleaned hospital, read back from the database. PostgreSQL streams each table out as CSV text (COPY, its
    fastest way out) and the same _parse() reads it, so everything downstream runs exactly as it does on the files."""
    from app.db import CSV_TABLES

    frames = {}
    with engine.connect() as conn, conn.connection.driver_connection.cursor() as cur:
        for key, (name, times, order) in TABLES.items():
            columns = ", ".join(CSV_TABLES[name].__table__.columns.keys())
            text = io.BytesIO()
            sql = f"COPY (SELECT {columns} FROM {name} ORDER BY {order}) TO STDOUT (FORMAT csv, HEADER)"
            with cur.copy(sql) as copy:
                for chunk in copy:
                    text.write(chunk)
            text.seek(0)
            frames[key] = _parse(text, times)
    return clean(frames)  # the database holds cleaned rows; cleaning again only adds the derived columns


def days_covered(enc):
    return max(int(enc["arrival_time"].dt.normalize().nunique()), 1)


def safe_float(x, nd=2):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), nd)