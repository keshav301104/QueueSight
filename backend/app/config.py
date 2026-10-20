"""Central settings: which hospital data to use, where files live, and how we split time for honest evaluation."""
import os
from pathlib import Path

import pandas as pd

# QueueSight/backend/app/config.py -> parents[2] is the QueueSight/ project root
ROOT_DIR = Path(__file__).resolve().parents[2]

# Which hospital QueueSight runs on. Choose with the QUEUESIGHT_DATA environment variable:
#   datathon (default) -> DATATHON 2026 Track 1 files in data/raw/
#   sim                -> the simulated hospital in data/sim/  (create it first: python -m scripts.simulate)
DATA_SOURCES = {
    "datathon": ROOT_DIR / "data" / "raw",
    "sim": ROOT_DIR / "data" / "sim",
}
DATA_SOURCE = (os.getenv("QUEUESIGHT_DATA") or "datathon").strip().lower()
if DATA_SOURCE not in DATA_SOURCES:
    raise ValueError(f"QUEUESIGHT_DATA must be one of {sorted(DATA_SOURCES)}, not {DATA_SOURCE!r}")

RAW_DIR = DATA_SOURCES[DATA_SOURCE]                               # input CSVs for the chosen hospital
ARTIFACTS_DIR = ROOT_DIR / "backend" / "artifacts" / DATA_SOURCE  # each hospital keeps its own models + reports

# Where the API reads the hospital from. Empty = straight from the CSV files above (quick local runs, tests).
# Docker sets it to the PostgreSQL + TimescaleDB container, e.g. postgresql+psycopg://queuesight:queuesight@db:5432/queuesight
DATABASE_URL = os.getenv("DATABASE_URL") or None

# Time-based split (never use the future to predict the past) - both hospitals cover calendar year 2025
#   train: Jan-Sep 2025 | validation: Oct 2025 | test: Nov-Dec 2025
TRAIN_END = pd.Timestamp("2025-10-01")
VALID_END = pd.Timestamp("2025-11-01")

RANDOM_STATE = 42