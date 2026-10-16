<div align="center">

# QueueSight

### No patient forgotten.

**Hospital-flow intelligence that gives every patient a personal predicted wait,<br>flags anyone who falls outside it, and explains why.**

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![LightGBM](https://img.shields.io/badge/LightGBM-trained%20from%20scratch-2F8452)
![FastAPI](https://img.shields.io/badge/FastAPI-0E6B66?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38BDF8?logo=tailwindcss&logoColor=white)
![No API keys](https://img.shields.io/badge/API%20keys-none-C2312B)

**DATATHON 2026 · VIT-AP · Track 1 Health: The Forgotten Patient · Team Extremers**

![QueueSight command center](docs/screenshots/01-command-center.png)

</div>

---

## The problem

A hospital dashboard usually shows one number: *average wait*. Averages hide people.

A patient can sit far longer than someone like them normally would, and nobody notices until they walk out. In this dataset **3% of visits end with the patient leaving before care**, and on a bad day a department runs **25 minutes slower than its own normal**.

Operations managers need a direct answer to one question:

> **"Who is being forgotten right now, what is slowing them down, and where should we look first?"**

## What QueueSight does

| | Feature | What it means for the ops team |
|---|---|---|
| 🎯 | **Personal predicted wait range** | The moment a patient arrives, three models we trained predict a short, likely and long wait (P10 / P50 / P90) for *that* patient. |
| 🚨 | **Forgotten Patient Radar** | Anyone who has waited past their own P90, left without being seen, or is still waiting is ranked in one list. |
| 🏥 | **Department board** | Each department's wait today vs *its own* normal, with a 7-day trend, sorted by pressure, in the triage colours staff already know. |
| 💬 | **Plain-English explanations** | Every prediction shows its reasons, e.g. *"Triage level: High saves about 23 min."* Exact per-feature contributions come from the model itself (SHAP). |
| ⏯️ | **Live replay clock** | The 2025 data plays back like a live feed. The demo starts on **23 Nov 2025, a month the models never saw**. In production, this clock becomes a live hospital feed. |
| 🧪 | **Data Quality report** | 9 issues found in the raw data, each with its size and how we handled it. |

<table>
<tr>
<td width="50%"><img src="docs/screenshots/02-forgotten-patient-radar.png" alt="Forgotten patient radar"><br><b>Forgotten Patient Radar.</b> Shaded band = predicted wait, tick = most likely, dot = actual wait so far.</td>
<td width="50%"><img src="docs/screenshots/03-patient-explanation.png" alt="Patient explanation"><br><b>Why this prediction.</b> High triage saves 23 min and Pharmacy saves 4.5 min, so the most likely wait is 24 min.</td>
</tr>
<tr>
<td colspan="2"><img src="docs/screenshots/04-overdue-patient.png" alt="Overdue patient"><br><b>A forgotten patient.</b> Predicted 16–66 min, actually waited 68. The dot has crossed the band, so the patient is flagged.</td>
</tr>
</table>

---

## How it works

```mermaid
flowchart LR
    A[4 CSVs<br/>patients · visits<br/>departments · tests] --> B[Load + clean<br/>9 quality checks]
    B --> C[Leakage-safe features<br/>17 facts known at arrival]
    C --> D[LightGBM x3<br/>P10 · P50 · P90 wait]
    C --> E[LightGBM<br/>walk-out classifier]
    D --> F[FastAPI<br/>7 endpoints + SHAP reasons]
    E --> F
    F --> G[React dashboard<br/>board · radar · patient view]
    G --> H[Ops manager acts:<br/>call patient · move staff]
```

**Input → output → action:** a patient arrives (triage, department, current queue). QueueSight predicts their personal range and the reasons behind it. If they wait past the range, they're flagged on the radar, and the manager checks the department board and acts.

---

## The data, and what we found in it

All four tables are joined: `patients (2,000) → encounters (8,000) → departments (12)` and `encounters → diagnostic_tests (5,000)`. That covers 365 days at about **22 visits/day**.

### Insights
- **Triage drives waiting.** Median wait: Critical **13 min**, High **26**, Medium **49**, Low **72**.
- **Departments add up to 17 min.** Pediatrics and Laboratory are slowest (median 62); Cardiology, Pharmacy and Admissions are fastest (45).
- **Time doesn't matter.** Arrival hour, weekday, month and visit type have no measurable effect on wait.
- **Urgent tests are no faster than Routine.** Both have a median turnaround of about 58 min. In a real hospital, that means the priority flag isn't being honoured.
- **Returns:** 7.6% of patients come back within 7 days; 3.0% leave before being seen.

### Data quality: 9 issues, each handled explicitly

| Issue | Rows affected | How we handled it |
|---|---|---|
| Test requested after the visit ended | 2,517 / 5,000 (50.3%) | Flagged; test timestamps are not linked to visits |
| Test requested before the patient arrived | 2,481 / 5,000 (49.6%) | Flagged; test timestamps are not linked to visits |
| `chronic_condition` value **"None"** is silently read as *missing* by default CSV readers | 747 / 2,000 (37.4%) | Loaded with NA-parsing disabled so "None" stays a real value |
| "Left before care" visits still have service start/end times | 242 / 242 (100%) | Outcome label trusted; service times treated as unreliable |
| `daily_capacity` is 85–240× actual visits/day | 12 / 12 (100%) | Capacity not used literally; load is modelled from observed arrivals |
| Admitted/Transferred visits have a `discharge_time` | 2,073 / 2,073 (100%) | Interpreted as "left this department" |
| Insurance type Unknown | 110 / 2,000 (5.5%) | Kept as its own category |
| Sex recorded as Unknown/Other | 73 / 2,000 (3.7%) | Kept as its own category |
| Non-clinical departments list beds (e.g. Pharmacy) | 4 / 12 | `bed_count` not used as a feature |

> Reproduce with `python -m scripts.profile_data`. The full report is in `backend/artifacts/quality.json`.

---

## Machine learning

### Models, all trained from scratch on the provided data

| # | Model | Predicts | Used for |
|---|---|---|---|
| 1 | LightGBM, quantile loss α=0.1 | **P10**: a short wait for this patient | Lower edge of the band |
| 2 | LightGBM, quantile loss α=0.5 | **P50**: the most likely wait | Tick on the band, "why" explanations |
| 3 | LightGBM, quantile loss α=0.9 | **P90**: a long wait for this patient | **The alarm line.** Waiting past it means forgotten |
| 4 | LightGBM, binary classifier | Chance of leaving before care, given minutes waited | Reported honestly (see below) |

**Why three wait models instead of one?** One number can't say whether 30 minutes is normal or alarming for a given patient. A range can. The range width is learned per patient, not fixed:

| Triage | P10 | P50 | P90 | Width |
|---|---|---|---|---|
| Critical | 4 | 17 | 40 | 37 min |
| High | 9 | 29 | 50 | 41 min |
| Medium | 26 | 48 | 69 | 45 min |
| Low | 45 | 70 | 91 | 46 min |

### Features: 17 facts known *at the moment of arrival*
Triage, department, visit type, age, sex, chronic condition, insurance, hour, weekday, prior visits, days since last visit, **patients already waiting in that department**, patients in care, department arrivals in the last 24 h, hospital arrivals in the last 3 h, and the **department's median wait over the previous 30 days** (counting only patients who had already been seen).

**Leakage is blocked in code.** `app/features.py` holds a `FORBIDDEN` list (service times, discharge, outcome) and an `assert` that stops the program if any of them reaches the model.

### Evaluation: split by time, never randomly

| Split | Period | Visits |
|---|---|---|
| Train | Jan–Sep 2025 | 5,980 |
| Validation (early stopping, baseline choice) | Oct 2025 | 699 |
| **Test (reported)** | **Nov–Dec 2025, never seen** | **1,321** |

### Results on the unseen test months

| Method | MAE (minutes) |
|---|---|
| Global median (an "average wait" display) | 19.74 |
| Department × time-of-day median | 19.94 |
| Triage median | 14.26 |
| Department × triage median (best hand-built rule) | 13.66 |
| **QueueSight (LightGBM P50)** | **13.61** |

- **31% more accurate than an average-wait display.**
- **Matches the best hand-built rule without being told it.** In this data, wait ≈ triage + department + noise. The model found that structure by itself (triage carries about 72% of its learned importance), and the remaining ~13.6 min is noise no model can predict.
- **Calibrated ranges:** the P10–P90 band contains **79.3%** of real waits against an 80% target.

### An honest negative result
We also trained a walk-out ("left before care") classifier. On the test months it scored **AUC 0.533** (0.5 = coin flip), PR-AUC 0.033 against a 2.95% base rate. Simple rules scored the same (wait-only 0.532, triage 0.469). **In this dataset, walk-outs are not predictable from anything recorded, including how long someone waited.** We report this rather than show a confident-looking risk score, and the radar does not rely on it.

### Explainability
Every prediction is broken into exact per-feature contributions using LightGBM's built-in SHAP values (`pred_contrib`), then translated into plain English in `app/explain.py`.

---

## Tech stack, and why

| Layer | Choice | Why |
|---|---|---|
| Data | Python, pandas, NumPy | Joins, cleaning, time-based features |
| Models | **LightGBM**, scikit-learn | The strongest method for tabular data; quantile loss gives ranges; trains in about 1 s |
| Explanations | SHAP (LightGBM `pred_contrib`) | Exact contributions, no extra service |
| API | **FastAPI** | Typed, fast, auto-generated docs at `/docs` |
| Frontend | **React 19, TypeScript, Vite** | Fast, typed, product-grade UI |
| UI | Tailwind CSS 4, TanStack Query, Framer Motion | Design tokens, cached live data, motion only where it explains a change |
| Design | Triage colours, Atkinson Hyperlegible font | Status colours staff already know; a typeface designed for legibility |

**No LLM, no API keys, no pretrained models.** The predictions come from models we trained. Patient data never leaves the machine.

---

## Run it locally

**Prerequisites:** Python 3.11+ and Node 20+.

### 1. Backend
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m scripts.train_models      # trains all 4 models in ~1 s and prints results
uvicorn app.main:app --reload --port 8000
```
Check that http://localhost:8000/api/health returns `{"status":"ok"}`. Interactive API docs are at http://localhost:8000/docs.

### 2. Frontend (second terminal)
```powershell
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173**. Press ▶ to replay, and click any patient to see why.

### Optional: data health report
```powershell
cd backend
python -m scripts.profile_data
```

---

## API

| Endpoint | Returns |
|---|---|
| `GET /api/health` | Service status |
| `GET /api/meta` | Time range, test period start, departments, demo start time |
| `GET /api/snapshot?t=` | KPIs and the department board at time `t` |
| `GET /api/radar?t=&hours=` | Forgotten patients in a look-back window |
| `GET /api/encounters/{id}?t=` | One patient: predicted range, reasons, risk curve, tests, history |
| `GET /api/metrics` | All model metrics vs baselines |
| `GET /api/quality` | Data-quality report |

---

## Project structure

```
QueueSight/
├── data/raw/                     # DATATHON 2026 Track 1 dataset (synthetic)
├── backend/
│   ├── app/
│   │   ├── config.py             # paths + time split
│   │   ├── data.py               # safe CSV loading + cleaning
│   │   ├── quality.py            # data-quality checks
│   │   ├── features.py           # leakage-safe features + guard
│   │   ├── ml.py                 # models, baselines, evaluation
│   │   ├── explain.py            # SHAP → plain English
│   │   ├── state.py              # loads data + models at startup
│   │   ├── snapshot.py           # board, radar, patient detail at time t
│   │   └── main.py               # FastAPI app
│   ├── scripts/
│   │   ├── profile_data.py       # data health + signal check
│   │   └── train_models.py       # one-command training pipeline
│   └── artifacts/                # trained models, metrics.json, quality.json
├── frontend/src/
│   ├── lib/                      # typed API client, replay clock
│   ├── components/               # WaitBand, Sparkline, RiskCurve, PatientDrawer
│   └── pages/                    # CommandCenter, Radar
└── docs/screenshots/
```

---

## Mapping to the judging rubric

| Criterion | Where to look |
|---|---|
| Problem understanding & user need | [The problem](#the-problem). User: hospital ops managers; workflow: "who is being forgotten" |
| Provided dataset usage | All 4 tables joined; [9 quality issues](#data-quality-9-issues-each-handled-explicitly); 5 insights |
| Data science / ML quality | 4 baselines, time split, MAE + calibration, honest negative result |
| ML model from scratch | 4 LightGBM models trained on the provided data; no API keys or pretrained models |
| Working product & workflow | FastAPI + React, live replay, input → prediction → reason → action |
| USP & innovation | Personal predicted *range*, explained flags, replay on unseen months |
| Impact & responsible use | [Limitations](#responsible-use-and-limitations) below |

---

## Responsible use and limitations

- **Synthetic data.** Results show the method works; they do not prove real-world performance.
- **Low volume:** about 22 visits/day across 12 departments, so per-department signals are thin.
- **Test timestamps are not linked to visits** in this dataset, so per-visit test timing can't be trusted.
- **Walk-outs are not predictable** here (AUC 0.53), so that model is not used for alerts.
- **Decision support only.** QueueSight never replaces clinical triage, takes no automatic actions, and uses no real patient data.

## Roadmap
- Diagnostics Monitor: test turnaround and "Urgent not honoured" alerts
- Data Quality Center and Model Lab pages in the UI
- What-if staffing simulator
- Live HL7/FHIR feed instead of the replay clock; retraining and drift monitoring on real hospital data
- Optional on-premise AI shift briefing that only narrates QueueSight's own numbers

## Disclosures
- **Dataset:** DATATHON 2026 Track 1 synthetic dataset from the organisers (Data Science Club × IIEC, VIT-AP). No external data.
- **Models:** all trained by the team from scratch. No pretrained models, no hosted APIs, no API keys.
- **Libraries:** open-source only (pandas, NumPy, scikit-learn, LightGBM, FastAPI, React, Vite, Tailwind, TanStack Query, Framer Motion, lucide-react).
- **Tools:** an AI coding assistant was used during development. All code was reviewed, run and tested by the team.

## References
- Ke et al., *LightGBM: A Highly Efficient Gradient Boosting Decision Tree*, NeurIPS 2017
- Lundberg & Lee, *A Unified Approach to Interpreting Model Predictions* (SHAP), NeurIPS 2017
- Koenker & Bassett, *Regression Quantiles*, Econometrica 1978

## Team Extremers
- Keshav Sharma
- *[add teammate]*

<div align="center"><sub>Synthetic educational data. Not for clinical decisions.</sub></div>
