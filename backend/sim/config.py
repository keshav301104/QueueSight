"""Simulation settings: departments, staffing, demand patterns and patient behaviour.
Every number is an assumption you can change. The defaults describe a busy mid-size hospital."""
from dataclasses import dataclass, field

TRIAGE_LEVELS = ["Critical", "High", "Medium", "Low"]  # list position = queue priority (0 is seen first)
TEST_TYPES = ["Blood test", "Urine test", "ECG", "X-ray", "CT scan", "MRI"]

# Share of a day's arrivals that land in each hour (00:00 ... 23:00); normalised by the engine.
HOURLY_PROFILE = {
    # Emergency-style: open 24/7, busiest late morning and early evening
    "emergency": [2.0, 1.6, 1.3, 1.1, 1.0, 1.1, 1.6, 2.6, 3.8, 4.8, 5.4, 5.6,
                  5.3, 5.0, 4.9, 4.9, 5.0, 5.2, 5.4, 5.2, 4.6, 3.9, 3.1, 2.5],
    # Clinic-style: registration 07:00-19:00 with a strong morning rush (people come early to get a token)
    "clinic": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 3.0, 11.0, 13.0, 12.0, 9.0,
               6.0, 5.0, 6.0, 5.5, 4.5, 3.0, 1.5, 0.0, 0.0, 0.0, 0.0, 0.0],
}

# Arrival multiplier for Monday ... Sunday
WEEKDAY_FACTOR = {
    "emergency": (1.12, 1.03, 1.00, 1.00, 1.02, 0.94, 0.92),
    "clinic": (1.15, 1.08, 1.04, 1.02, 0.98, 0.45, 0.12),
}

# Which visit types each kind of department sees by default (Emergency, Walk-in, Scheduled, Follow-up)
VISIT_TYPE_MIX = {
    "emergency": {"Emergency": 0.75, "Walk-in": 0.25},
    "clinic": {"Walk-in": 0.35, "Scheduled": 0.45, "Follow-up": 0.20},
}


@dataclass
class Department:
    id: str
    name: str
    service_type: str
    profile: str                          # "emergency" or "clinic" (arrival pattern + weekend staffing)
    daily_arrivals: float                 # average visits per day
    shifts: dict[int, int]                # hour a shift starts -> clinicians on duty until the next shift
    service_median_min: float             # clinician minutes per Medium-triage patient (consultation + notes)
    bed_count: int
    triage_mix: tuple[float, float, float, float]  # share of Critical, High, Medium, Low
    test_rate: float                      # chance a visit orders at least one diagnostic test
    test_mix: dict[str, float]            # which tests this department orders
    patients: str = "all"                 # "all", "adults" (16+) or "children" (under 16)
    visit_mix: dict[str, float] | None = None  # override the profile's visit-type mix


def default_departments() -> list[Department]:
    ed_tests = {"Blood test": 0.35, "X-ray": 0.25, "CT scan": 0.15, "ECG": 0.15, "Urine test": 0.10}
    referred = {"Walk-in": 0.40, "Scheduled": 0.40, "Follow-up": 0.20}  # diagnostics/admin: open 24h, not emergencies
    gen_tests = {"Blood test": 0.45, "Urine test": 0.25, "X-ray": 0.15, "ECG": 0.15}
    # Clinic-style departments close at 20:00 (0 clinicians). Peak-hour load is set close to capacity,
    # so queues build at busy times and clear later, like a real hospital.
    return [
        Department("D01", "Emergency", "Emergency", "emergency", 70, {7: 4, 15: 4, 23: 2}, 38, 29,
                   (0.10, 0.30, 0.40, 0.20), 0.70, ed_tests),
        Department("D02", "General Medicine", "Clinical", "clinic", 45, {7: 2, 20: 0}, 19, 48,
                   (0.02, 0.15, 0.48, 0.35), 0.50, gen_tests, "adults"),
        Department("D03", "Pediatrics", "Clinical", "emergency", 36, {8: 2, 20: 1}, 23, 11,
                   (0.03, 0.17, 0.45, 0.35), 0.35, {"Blood test": 0.5, "Urine test": 0.3, "X-ray": 0.2}, "children",
                   {"Emergency": 0.30, "Walk-in": 0.40, "Scheduled": 0.20, "Follow-up": 0.10}),
        Department("D04", "Cardiology", "Clinical", "clinic", 28, {7: 2, 20: 0}, 28, 22,
                   (0.05, 0.25, 0.45, 0.25), 0.85, {"ECG": 0.55, "Blood test": 0.30, "X-ray": 0.15}, "adults"),
        Department("D05", "Orthopedics", "Clinical", "clinic", 30, {7: 2, 20: 0}, 28, 48,
                   (0.02, 0.15, 0.48, 0.35), 0.75, {"X-ray": 0.65, "CT scan": 0.15, "MRI": 0.20}, "adults"),
        Department("D06", "Radiology", "Diagnostics", "emergency", 24, {0: 1}, 29, 54,
                   (0.03, 0.17, 0.50, 0.30), 0.90, {"X-ray": 0.50, "CT scan": 0.30, "MRI": 0.20}, "all", referred),
        Department("D07", "Laboratory", "Diagnostics", "emergency", 60, {0: 1}, 12, 55,
                   (0.02, 0.13, 0.50, 0.35), 0.95, {"Blood test": 0.70, "Urine test": 0.30}, "all", referred),
        Department("D08", "Pharmacy", "Support", "clinic", 40, {7: 1, 20: 0}, 10, 26,
                   (0.00, 0.05, 0.45, 0.50), 0.00, {}),
        Department("D09", "Surgery", "Clinical", "clinic", 12, {7: 1, 20: 0}, 30, 17,
                   (0.08, 0.30, 0.40, 0.22), 0.80, {"Blood test": 0.45, "CT scan": 0.30, "X-ray": 0.25}, "adults"),
        Department("D10", "Neurology", "Clinical", "clinic", 12, {7: 1, 20: 0}, 30, 25,
                   (0.05, 0.25, 0.45, 0.25), 0.70, {"MRI": 0.40, "CT scan": 0.35, "Blood test": 0.25}, "adults"),
        Department("D11", "Outpatient", "Outpatient", "clinic", 70, {7: 3, 20: 0}, 19, 48,
                   (0.01, 0.10, 0.49, 0.40), 0.40, gen_tests),
        Department("D12", "Admissions", "Admin", "emergency", 30, {0: 1}, 20, 50,
                   (0.05, 0.20, 0.45, 0.30), 0.00, {}, "all", referred),
    ]


@dataclass
class SimConfig:
    start_date: str = "2025-01-01"
    days: int = 365
    seed: int = 42
    n_patients: int = 30_000              # size of the population that can visit (many visit more than once)

    seasonal_amplitude: float = 0.08      # demand +/-8% across the year, peak in winter
    daily_noise_cv: float = 0.10          # hospital-wide busy/quiet days beyond normal randomness
    weekend_staff_factor: float = 0.6     # clinic-style departments run fewer clinicians at weekends

    triage_service_factor: tuple[float, float, float, float] = (1.6, 1.3, 1.0, 0.8)
    service_sigma: float = 0.5            # spread of consultation length (log-normal)

    # Registration + triage + vitals before joining the clinician queue (median minutes, by triage)
    intake_median_min: tuple[float, float, float, float] = (3.0, 8.0, 12.0, 15.0)
    intake_sigma: float = 0.5

    # How long a waiting patient will tolerate before leaving unseen (median minutes, by triage).
    # Critical patients never leave on their own.
    patience_median_min: tuple[float, float, float, float] = (float("inf"), 360.0, 240.0, 180.0)
    patience_sigma: float = 0.6

    admit_prob: tuple[float, float, float, float] = (0.55, 0.30, 0.10, 0.03)
    transfer_prob: tuple[float, float, float, float] = (0.15, 0.05, 0.02, 0.01)
    after_service_median_min: float = 20.0      # paperwork / pharmacy before leaving the department
    boarding_median_min: float = 120.0          # extra delay for admitted patients waiting for a bed

    test_triage_factor: tuple[float, float, float, float] = (1.3, 1.15, 1.0, 0.85)
    urgent_prob: tuple[float, float, float, float] = (0.95, 0.80, 0.20, 0.05)
    test_tat_median_min: dict[str, float] = field(default_factory=lambda: {
        "Blood test": 45, "Urine test": 35, "ECG": 15, "X-ray": 50, "CT scan": 80, "MRI": 160})
    urgent_tat_factor: float = 0.45       # urgent tests really are faster in this hospital

    departments: list[Department] = field(default_factory=default_departments)