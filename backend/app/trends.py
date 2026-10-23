"""Arrivals per hour for the trend chart, next to what is usual for that hour of the week.

With a database the counts come from TimescaleDB's hourly_visits continuous aggregate (migration 0003); without one,
the same counts are made in pandas, so the chart works either way. Only complete hours before the replay clock count,
so the chart never shows anything the hospital could not have known at that moment.
"""
import numpy as np
import pandas as pd
from sqlalchemy import Engine, text

USUAL_WEEKS = 4   # "usual" = the average of the same hour on the same weekday over the previous 4 weeks


def arrivals_per_hour(source, start, end, department=None) -> pd.Series:
    """Arrivals in every hour from start up to (not including) end. source: a database engine, or a table of visits."""
    if isinstance(source, Engine):
        sql = "SELECT hour, sum(arrivals) AS n FROM hourly_visits WHERE hour >= :start AND hour < :end"
        if department:
            sql += " AND department_id = :department"
        params = {"start": start.to_pydatetime(), "end": end.to_pydatetime(), "department": department}
        with source.connect() as conn:
            rows = conn.execute(text(sql + " GROUP BY hour"), params).all()
        counts = pd.Series({pd.Timestamp(h): n for h, n in rows}, dtype="float64")
    else:
        v = source[(source["arrival_time"] >= start) & (source["arrival_time"] < end)]
        if department:
            v = v[v["department_id"] == department]
        counts = v["arrival_time"].dt.floor("h").value_counts()
    hours = pd.date_range(start, end, freq="h", inclusive="left")
    return counts.reindex(hours, fill_value=0).astype(int)


def trends(source, t, days=7, department=None, data_start=None):
    """The last `days` days of hourly arrivals before the replay time t, with the usual count for each hour."""
    end = pd.Timestamp(t).floor("h")                    # the hour now under way is not complete yet
    start = end - pd.Timedelta(days=days)
    history = arrivals_per_hour(source, start - pd.Timedelta(weeks=USUAL_WEEKS), end, department).astype(float)
    if data_start is not None:
        history[history.index < pd.Timestamp(data_start).floor("h")] = np.nan   # before the data begins: unknown, not 0
    hours = history.index[history.index >= start]
    past = np.array([history.reindex(hours - pd.Timedelta(weeks=k)).to_numpy() for k in range(1, USUAL_WEEKS + 1)])
    known = ~np.isnan(past).all(axis=0)
    usual = np.full(len(hours), np.nan)
    usual[known] = np.nanmean(past[:, known], axis=0)
    arrivals = history.reindex(hours).to_numpy()

    last_day, usual_day = arrivals[-24:], usual[-24:]
    busier = (None if np.isnan(usual_day).any() or np.isnan(last_day).any() or usual_day.sum() == 0
              else round(100 * (last_day.sum() / usual_day.sum() - 1)))
    return {
        "hours": [h.isoformat() for h in hours],
        "arrivals": [None if np.isnan(a) else int(a) for a in arrivals],     # None = before the data begins
        "usual": [None if np.isnan(u) else round(float(u), 2) for u in usual],
        "last_24h": None if np.isnan(last_day).any() else int(last_day.sum()),
        "vs_usual_pct": busier,                         # +20 = 20% busier than usual over the last 24 hours
    }