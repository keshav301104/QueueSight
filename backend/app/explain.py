"""Turn model internals into plain English: 'why is this patient predicted to wait 48 min?'
Uses LightGBM's built-in SHAP values (pred_contrib) - exact per-feature contributions, no extra service."""
import numpy as np

from app.features import to_model_frame

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _label(feat, val, dept_names):
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return {"days_since_last": "First recorded visit", "dept_hist_median_wait": "No recent wait history"}.get(
            feat, f"{feat} unknown")
    v = val
    return {
        "department_id": lambda: f"Department: {dept_names.get(v, v)}",
        "triage_level": lambda: f"Triage level: {v}",
        "visit_type": lambda: f"Visit type: {v}",
        "sex": lambda: f"Sex: {v}",
        "chronic_condition": lambda: f"Chronic condition: {v}",
        "insurance_type": lambda: f"Insurance: {v}",
        "hour": lambda: f"Arrived around {int(v):02d}:00",
        "dow": lambda: f"Arrived on a {DAYS[int(v)]}",
        "is_weekend": lambda: "Weekend arrival" if int(v) else "Weekday arrival",
        "age": lambda: f"Age {int(v)}",
        "prior_visits": lambda: f"{int(v)} earlier visit(s) on record",
        "days_since_last": lambda: f"Last visit {v:.0f} day(s) earlier",
        "waiting_now": lambda: f"{int(v)} patient(s) already waiting in this department",
        "in_service_now": lambda: f"{int(v)} patient(s) being treated in this department",
        "dept_prev_24h": lambda: f"{int(v)} arrivals in this department in the last 24h",
        "hosp_prev_3h": lambda: f"{int(v)} arrivals hospital-wide in the last 3h",
        "dept_hist_median_wait": lambda: f"Department's recent median wait is {v:.0f} min",
        "wait_minutes": lambda: f"Has waited {v:.0f} min so far",
    }.get(feat, lambda: f"{feat} = {v}")()


def contributions(model, df_row, features, categories, dept_names, top=4, unit="min"):
    """Top drivers for one row. unit='min' for the wait model, 'logodds' for the risk model."""
    X = to_model_frame(df_row, features, categories)
    contrib = model.predict(X, pred_contrib=True)[0]
    base, parts = float(contrib[-1]), contrib[:-1]
    order = np.argsort(-np.abs(parts))[:top]
    out = []
    for j in order:
        f = features[j]
        raw = df_row.iloc[0][f]
        val = raw.item() if hasattr(raw, "item") else raw
        eff = float(parts[j])
        out.append({
            "feature": f,
            "label": _label(f, val, dept_names),
            "effect": round(eff, 2),
            "direction": "up" if eff > 0 else "down",
            "unit": unit,
        })
    return {"base": round(base, 2), "drivers": out}