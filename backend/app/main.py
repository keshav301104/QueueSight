"""QueueSight API.  Run from backend/:   uvicorn app.main:app --reload --port 8000   ->  docs at /docs"""
from contextlib import asynccontextmanager

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.snapshot import board, encounter_detail, radar
from app.state import STATE


@asynccontextmanager
async def lifespan(_app):
    STATE.load()  # data + models + predictions, ~3 s
    yield


app = FastAPI(title="QueueSight API", version="0.1.0", lifespan=lifespan,
              description="No patient forgotten - hospital-flow intelligence on the DATATHON 2026 dataset.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _clock(t):
    """Parse the replay time; default to the busiest moment in the unseen test period."""
    if not t:
        return STATE.default_time
    try:
        ts = pd.Timestamp(t)
    except ValueError:
        raise HTTPException(400, f"bad time: {t}")
    return min(max(ts, STATE.time_min), STATE.time_max)


@app.get("/api/health")
def health():
    return {"status": "ok" if STATE.ready else "loading"}


@app.get("/api/meta")
def meta():
    return {
        "product": "QueueSight",
        "time_min": STATE.time_min.isoformat(), "time_max": STATE.time_max.isoformat(),
        "test_period_start": STATE.test_start.isoformat(), "default_time": STATE.default_time.isoformat(),
        "departments": [{"id": k, "name": v} for k, v in STATE.dept_names.items()],
        "disclaimer": "Synthetic educational data. Not for clinical decisions.",
    }


@app.get("/api/snapshot")
def snapshot(t: str | None = Query(None, description="Replay time, e.g. 2025-11-14T18:30")):
    ts = _clock(t)
    kpis, departments = board(ts)
    return {"time": ts.isoformat(), "kpis": kpis, "departments": departments}


@app.get("/api/radar")
def get_radar(t: str | None = None, hours: int = Query(24, ge=1, le=168)):
    ts = _clock(t)
    return {"time": ts.isoformat(), "window_hours": hours, "items": radar(ts, hours)}


@app.get("/api/encounters/{encounter_id}")
def get_encounter(encounter_id: str, t: str | None = None):
    d = encounter_detail(encounter_id, _clock(t))
    if d is None:
        raise HTTPException(404, "encounter not found")
    return d


@app.get("/api/metrics")
def metrics():
    return STATE.metrics


@app.get("/api/quality")
def quality():
    return STATE.quality