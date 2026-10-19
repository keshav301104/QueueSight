"""Everything the API needs, loaded once at startup: clean data, features, models, and predictions for every visit."""
import json

import joblib
import numpy as np
import pandas as pd

from app.config import ARTIFACTS_DIR, TRAIN_END, VALID_END
from app.data import load_clean
from app.features import build_encounter_features
from app.ml import predict_lbc, predict_wait

# A walk-out risk score is only worth acting on when it is clearly better than chance (AUC 0.5)
TRUSTED_AUC = 0.75


def walkout_verdict(metrics):
    """Can staff rely on the walk-out model for this hospital? Judged LIVE (risk right now vs who really left),
    not in hindsight: it must clear TRUSTED_AUC and beat every simple rule."""
    live = metrics["walkout_risk"].get("live")
    if not live:
        return {"auc": None, "best_rule_auc": None, "trusted": False}
    auc = live["model"]["auc"]
    best_rule = max((r["auc"] or 0) for r in live["rules"].values())
    return {"auc": auc, "best_rule_auc": best_rule, "trusted": bool(auc and auc >= TRUSTED_AUC and auc > best_rule)}


class State:
    def __init__(self):
        self.ready = False

    def load(self):
        models_dir = ARTIFACTS_DIR / "models"
        if not (models_dir / "wait_model.joblib").exists():
            raise RuntimeError("No trained models found - run:  python -m scripts.train_models")

        self.raw, self.clean = load_clean()
        self.wait_bundle = joblib.load(models_dir / "wait_model.joblib")
        self.lbc_bundle = joblib.load(models_dir / "lbc_model.joblib")
        self.metrics = json.loads((ARTIFACTS_DIR / "metrics.json").read_text())
        self.quality = json.loads((ARTIFACTS_DIR / "quality.json").read_text())
        self.walkout_model = walkout_verdict(self.metrics)

        df = build_encounter_features(self.clean)
        df[["pred_p10", "pred_p50", "pred_p90"]] = predict_wait(self.wait_bundle, df).values
        self.df = df
        self.tests = self.clean["tests"]
        self.departments = self.clean["departments"]
        self.dept_names = dict(zip(self.departments["department_id"], self.departments["department_name"]))

        # "Normal" wait per department = training-period median (never peeks at the test months).
        # Only patients who were called in: a walk-out's "wait" is just how long they lasted before leaving.
        train = df[(df["arrival_time"] < TRAIN_END) & df["service_start_time"].notna()]
        self.normal_wait = train.groupby("department_id")["wait_minutes"].median().to_dict()

        self.time_min = df["arrival_time"].min()
        self.time_max = df["arrival_time"].max()
        self.test_start = VALID_END
        self.default_time = self._busiest_test_moment()
        self.ready = True

    def _busiest_test_moment(self):
        """Pick the moment in the unseen test period when the most patients were waiting - a good demo start."""
        df = self.df
        arr = np.sort(df["arrival_time"].values)
        ends = np.sort(df["wait_end_time"].values)  # called in or walked out
        cands = df.loc[df["arrival_time"] >= self.test_start, "arrival_time"].values
        if len(cands) == 0:
            return self.time_max
        waiting = np.searchsorted(arr, cands, "right") - np.searchsorted(ends, cands, "right")
        return pd.Timestamp(cands[int(np.argmax(waiting))])

    def lbc_risk(self, rows, waited_minutes):
        """Walk-out risk right now, calibrated on live moments so that 30% means about 3 in 10 such patients leave."""
        raw = predict_lbc(self.lbc_bundle, rows, wait_override=waited_minutes)
        calibrator = self.lbc_bundle.get("live_calibrator")
        return calibrator.predict(raw) if calibrator is not None else raw


STATE = State()