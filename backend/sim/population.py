"""The people who can visit the hospital. Patients with long-term conditions come back more often."""
import numpy as np
import pandas as pd

CONDITIONS = ["Hypertension", "Diabetes", "Asthma", "Cardiac", "Other"]
CONDITION_WEIGHTS = [0.30, 0.25, 0.15, 0.15, 0.15]


def make_population(n: int, rng: np.random.Generator) -> pd.DataFrame:
    # Age: about 20% children, adults skewed older (they use hospitals more)
    child = rng.random(n) < 0.20
    age = np.where(child, rng.integers(0, 16, n), np.clip(rng.gamma(4.0, 13.0, n) + 16, 16, 95)).astype(int)

    # The chance of a long-term condition rises with age; children mostly have asthma
    p_chronic = 0.08 + 0.55 * (age / 95)
    has_chronic = rng.random(n) < p_chronic
    condition = rng.choice(CONDITIONS, n, p=CONDITION_WEIGHTS)
    condition = np.where(child & has_chronic, "Asthma", condition)
    condition = np.where(has_chronic, condition, "None")

    area_w = np.linspace(2.0, 0.5, 20)  # closer areas send more patients
    pop = pd.DataFrame({
        "patient_id": [f"P{i:05d}" for i in range(1, n + 1)],
        "age": age,
        "sex": rng.choice(["F", "M", "Other", "Unknown"], n, p=[0.49, 0.49, 0.005, 0.015]),
        "chronic_condition": condition,
        "home_area": [f"AREA_{a:02d}" for a in rng.choice(np.arange(1, 21), n, p=area_w / area_w.sum())],
        "insurance_type": rng.choice(["Public", "Private", "Self-pay", "Unknown"], n, p=[0.45, 0.30, 0.18, 0.07]),
    })
    # Visit weight: people with a long-term condition are about 3x more likely to be the next arrival
    pop["visit_weight"] = np.where(has_chronic, 3.0, 1.0)
    return pop


def pick_patients(pop: pd.DataFrame, who: str, n: int, rng: np.random.Generator) -> np.ndarray:
    """Choose which patients make n visits to a department that sees 'all', 'adults' or 'children'."""
    if who == "children":
        mask = pop["age"].to_numpy() < 16
    elif who == "adults":
        mask = pop["age"].to_numpy() >= 16
    else:
        mask = np.ones(len(pop), bool)
    idx = np.flatnonzero(mask)
    w = pop["visit_weight"].to_numpy()[idx]
    return rng.choice(idx, n, p=w / w.sum())