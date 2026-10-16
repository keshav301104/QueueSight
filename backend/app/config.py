"""Central settings: where files live and how we split time for honest evaluation."""
from pathlib import Path

import pandas as pd

# vigil/backend/app/config.py -> parents[2] is the vigil/ project root
ROOT_DIR = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT_DIR / "data" / "raw"
PROCESSED_DIR = ROOT_DIR / "data" / "processed"
ARTIFACTS_DIR = ROOT_DIR / "backend" / "artifacts"

# Time-based split (rule 07: never use the future to predict the past)
#   train: Jan-Sep 2025 | validation: Oct 2025 | test: Nov-Dec 2025
TRAIN_END = pd.Timestamp("2025-10-01")
VALID_END = pd.Timestamp("2025-11-01")

RANDOM_STATE = 42