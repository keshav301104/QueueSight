"""
QueueSight - make sure the chosen hospital is ready to serve: its data first, then its trained models.

Docker runs this before starting the API, and it is handy locally too.  Run from inside backend/:
    python -m scripts.prepare                                   (datathon: data and models are in the repo, just checks)
    $env:QUEUESIGHT_DATA="sim"; python -m scripts.prepare       (sim: the first time it simulates 2025 and trains)
"""
import time
from pathlib import Path

from app.config import ARTIFACTS_DIR, DATA_SOURCE, RAW_DIR

DATA_FILES = ["patients.csv", "encounters.csv", "departments.csv", "diagnostic_tests.csv"]
MODEL_FILES = ["models/wait_model.joblib", "models/lbc_model.joblib", "metrics.json", "quality.json"]


def steps_needed(source: str, raw_dir: Path, artifacts_dir: Path) -> list[str]:
    """What is missing for this hospital: 'simulate' (no data yet) and/or 'train' (no models yet)."""
    steps = []
    if not all((raw_dir / f).exists() for f in DATA_FILES):
        if source != "sim":
            raise SystemExit(f"{raw_dir} is missing the DATATHON CSVs - put them in data/raw/")
        steps.append("simulate")
    if "simulate" in steps or not all((artifacts_dir / f).exists() for f in MODEL_FILES):
        steps.append("train")  # new data always means new models
    return steps


def main():
    steps = steps_needed(DATA_SOURCE, RAW_DIR, ARTIFACTS_DIR)
    if not steps:
        print(f"[prepare] {DATA_SOURCE} hospital: data and models ready")
        return
    t0 = time.time()
    if "simulate" in steps:
        print("[prepare] no simulated hospital yet - simulating 2025 (about a minute) ...")
        from sim.config import SimConfig
        from sim.engine import run
        from sim.export import to_tables, write_csvs
        write_csvs(to_tables(run(SimConfig())), RAW_DIR)
    if "train" in steps:
        print(f"[prepare] no trained models for the {DATA_SOURCE} hospital yet - training ...")
        from scripts.train_models import main as train
        train()
    print(f"[prepare] {DATA_SOURCE} hospital ready in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()