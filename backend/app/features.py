"""Leakage-safe features: only facts that are known at the moment a patient walks in."""
import numpy as np
import pandas as pd

# Columns that are only known AFTER the visit - never allowed as inputs for the wait model
FORBIDDEN = {"service_start_time", "service_end_time", "discharge_time", "service_minutes",
             "outcome", "wait_calc", "service_calc", "is_lbc", "wait_end_time"}

WAIT_CATS = ["department_id", "triage_level", "visit_type", "sex", "chronic_condition", "insurance_type"]
WAIT_NUMS = ["hour", "dow", "is_weekend", "age", "prior_visits", "days_since_last",
             "waiting_now", "in_service_now", "dept_prev_24h", "hosp_prev_3h", "dept_hist_median_wait"]
WAIT_FEATURES = WAIT_CATS + WAIT_NUMS

# Walk-out model: same arrival facts + how long the patient has been waiting so far
LBC_FEATURES = WAIT_FEATURES + ["wait_minutes"]


def _live_load(enc):
    """For each visit: how busy its department and the hospital were at the moment of arrival."""
    n = len(enc)
    waiting_now = np.zeros(n, int)
    in_service_now = np.zeros(n, int)
    dept_prev_24h = np.zeros(n, int)
    for _, g in enc.groupby("department_id"):
        idx = g.index.values
        arr = g["arrival_time"].values
        st = g["service_start_time"].values
        en = g["service_end_time"].values
        we = g["wait_end_time"].values  # called in, or left without being seen
        for k, i in enumerate(idx):
            t = arr[k]
            # Still waiting at time t = not called in and not walked out yet.
            # That yes/no is known at time t; we never use when they will be called.
            waiting_now[i] = np.sum(we[:k] > t)
            in_service_now[i] = np.sum((st[:k] <= t) & (en[:k] > t))
            dept_prev_24h[i] = np.sum(arr[:k] > t - np.timedelta64(24, "h"))
    all_arr = enc["arrival_time"].values
    left = np.searchsorted(all_arr, all_arr - np.timedelta64(3, "h"), side="left")
    return waiting_now, in_service_now, dept_prev_24h, np.arange(n) - left


def _past_dept_median_wait(enc, days=30):
    """Median wait in the same department over the previous 30 days.
    A past wait only counts once that patient has actually been seen (service_start < now) - strict no-leakage."""
    out = np.full(len(enc), np.nan)
    win = np.timedelta64(days, "D")
    for _, g in enc.groupby("department_id"):
        g2 = g[g["service_start_time"].notna()].sort_values("service_start_time")
        starts = g2["service_start_time"].values
        waits = g2["wait_minutes"].values
        for i, t in zip(g.index.values, g["arrival_time"].values):
            lo, hi = np.searchsorted(starts, t - win, "left"), np.searchsorted(starts, t, "left")
            if hi - lo >= 3:
                out[i] = np.median(waits[lo:hi])
    return out


def build_encounter_features(clean):
    enc = clean["encounters"].copy().sort_values("arrival_time").reset_index(drop=True)
    pat = clean["patients"]

    w, s, d24, h3 = _live_load(enc)
    enc["waiting_now"], enc["in_service_now"], enc["dept_prev_24h"], enc["hosp_prev_3h"] = w, s, d24, h3
    enc["hour"] = enc["arrival_time"].dt.hour
    enc["dow"] = enc["arrival_time"].dt.dayofweek
    enc["is_weekend"] = (enc["dow"] >= 5).astype(int)
    enc["prior_visits"] = enc.groupby("patient_id").cumcount()
    prev_dis = enc.groupby("patient_id")["discharge_time"].shift(1)
    enc["days_since_last"] = ((enc["arrival_time"] - prev_dis).dt.total_seconds() / 86400).clip(lower=0)
    enc["dept_hist_median_wait"] = _past_dept_median_wait(enc)

    enc = enc.merge(pat, on="patient_id", how="left")
    return enc


def to_model_frame(df, features, categories):
    """Cast categoricals to fixed category lists so train and serve always encode the same way."""
    X = df[features].copy()
    for c, cats in categories.items():
        if c in X:
            X[c] = pd.Categorical(X[c], categories=cats)
    return X


def category_map(df, cols):
    return {c: sorted(df[c].dropna().astype(str).unique().tolist()) for c in cols}


assert not (set(WAIT_FEATURES) & FORBIDDEN), "leakage: a post-visit column is in the wait features"