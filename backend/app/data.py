"""Load the 4 raw CSVs correctly and clean them. Everything else in QueueSight starts from load_clean()."""
import numpy as np
import pandas as pd

from app.config import DATA_SOURCE, RAW_DIR

ENC_TIMES = ["arrival_time", "service_start_time", "service_end_time", "discharge_time"]
TEST_TIMES = ["requested_time", "completion_time"]
TRIAGE_ORDER = ["Critical", "High", "Medium", "Low"]
LBC = "Left before care"


def _read(name, date_cols=()):
    path = RAW_DIR / name
    if not path.exists():
        fix = ("create the simulated hospital first:  python -m scripts.simulate" if DATA_SOURCE == "sim"
               else "put the DATATHON CSVs in data/raw/")
        raise FileNotFoundError(f"{path} not found - {fix}")
    # keep_default_na=False: pandas would otherwise turn the real value "None" into NaN
    df = pd.read_csv(path, keep_default_na=False, na_values=[""])
    for c in date_cols:
        df[c] = pd.to_datetime(df[c], errors="coerce")
    return df


def load_raw():
    return {
        "patients": _read("patients.csv"),
        "encounters": _read("encounters.csv", ENC_TIMES),
        "departments": _read("departments.csv"),
        "tests": _read("diagnostic_tests.csv", TEST_TIMES),
    }


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
    enc = enc.sort_values("arrival_time").reset_index(drop=True)

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


def days_covered(enc):
    return max(int(enc["arrival_time"].dt.normalize().nunique()), 1)


def safe_float(x, nd=2):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), nd)