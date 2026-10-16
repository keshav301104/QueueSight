// Typed client for the QueueSight API. Every screen gets its data through these functions.

export type Status = 'critical' | 'elevated' | 'normal' | 'quiet'
export type RadarState = 'waiting' | 'left_unseen' | 'was_overdue'

export interface Meta {
  product: string
  time_min: string
  time_max: string
  test_period_start: string
  default_time: string
  departments: { id: string; name: string }[]
  disclaimer: string
}

export interface Kpis {
  waiting_now: number
  in_service_now: number
  arrivals_today: number
  median_wait_today: number | null
  overdue_today: number
  walkouts_today: number
  departments_under_pressure: number
}

export interface Department {
  department_id: string
  name: string
  waiting_now: number
  in_service_now: number
  arrivals_today: number
  seen_today: number
  median_wait_today: number | null
  normal_wait: number | null
  predicted_median_today: number | null
  ratio_vs_normal: number | null
  status: Status
  overdue_today: number
  walkouts_today: number
  trend_7d: (number | null)[]
}

export interface Snapshot { time: string; kpis: Kpis; departments: Department[] }

export interface RadarItem {
  encounter_id: string
  patient_id: string
  department: string
  department_id: string
  triage_level: string
  visit_type: string
  age: number | null
  arrival_time: string
  state: RadarState
  waited_min: number
  pred_p10: number
  pred_p50: number
  pred_p90: number
  minutes_over_p90: number
  overdue: boolean
  walkout_risk_now: number | null
  priority_score: number
}

export interface Driver { feature: string; label: string; effect: number; direction: 'up' | 'down'; unit: string }

export interface EncounterDetail {
  encounter_id: string
  patient_id: string
  patient: { age: number | null; sex: string; chronic_condition: string; insurance_type: string; home_area: string }
  department: string
  triage_level: string
  visit_type: string
  arrival_time: string
  status: 'seen' | 'waiting'
  waited_min: number
  outcome: string | null
  prediction: { p10: number; p50: number; p90: number }
  why_wait: { base: number; drivers: Driver[] }
  why_risk: { base: number; drivers: Driver[] }
  walkout_risk_now: number
  risk_curve: { wait_min: number; risk: number }[]
  tests: { test_id: string; type: string; priority: string; requested: string; completed: string; tat_min: number }[]
  history: { encounter_id: string; arrival_time: string; department: string; outcome: string; wait_min: number }[]
}

// In development Vite forwards /api to localhost:8000. In production set VITE_API_URL to the deployed API.
const BASE: string = import.meta.env.VITE_API_URL ?? ''

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(BASE + path, window.location.origin)
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`The QueueSight API answered ${res.status} for ${path}. Is the backend running on port 8000?`)
  return res.json() as Promise<T>
}

export const api = {
  meta: () => get<Meta>('/api/meta'),
  snapshot: (t: string) => get<Snapshot>('/api/snapshot', { t }),
  radar: (t: string, hours = 24) => get<{ time: string; window_hours: number; items: RadarItem[] }>('/api/radar', { t, hours }),
  encounter: (id: string, t: string) => get<EncounterDetail>(`/api/encounters/${id}`, { t }),
  metrics: () => get<Record<string, unknown>>('/api/metrics'),
  quality: () => get<Record<string, unknown>>('/api/quality'),
}

// ---- time helpers: the API speaks local "YYYY-MM-DDTHH:mm" timestamps (no time zone)
const pad = (n: number) => String(n).padStart(2, '0')
export const toLocalIso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
export const addMinutes = (iso: string, mins: number) => toLocalIso(new Date(new Date(iso).getTime() + mins * 60_000))
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

export const TRIAGE_COLOR: Record<string, string> = {
  Critical: 'var(--color-crit)', High: 'var(--color-elev)', Medium: 'var(--color-watch)', Low: 'var(--color-ok)',
}
export const STATUS_COLOR: Record<Status, string> = {
  critical: 'var(--color-crit)', elevated: 'var(--color-elev)', normal: 'var(--color-ok)', quiet: 'var(--color-quiet)',
}