// Model lab: how good our models really are, measured only on months they never saw.
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import { useClock } from '../lib/clock'

interface WaitMetrics {
  rows: { train: number; valid: number; test: number }
  baselines_test_mae: Record<string, number>
  best_baseline: string
  model_test_mae: number
  interval_p10_p90_coverage_pct: number
  interval_mean_width_min: number
  mae_by_department: Record<string, number>
  feature_importance_gain: Record<string, number>
}
interface Score { auc: number | null; pr_auc: number | null; recall_top10pct: number }
interface Band { band: string; shown: number; really_left: number; n: number }
interface LiveMetrics {
  patient_moments: number
  model: { auc: number | null; pr_auc: number | null; brier: number | null }
  rules: Record<string, { auc: number | null; pr_auc: number | null }>
  calibration_before: Band[]
  calibration_after: Band[]
}
interface WalkoutMetrics {
  positive_rate_test_pct: number
  baselines: Record<string, Score>
  model: Score & { brier: number }
  live?: LiveMetrics
}
interface Metrics { wait_time: WaitMetrics; walkout_risk: WalkoutMetrics }

const FEATURE_NAMES: Record<string, string> = {
  triage_level: 'Triage level', department_id: 'Department', visit_type: 'Visit type', sex: 'Sex',
  chronic_condition: 'Chronic condition', insurance_type: 'Insurance', hour: 'Arrival hour', dow: 'Weekday',
  is_weekend: 'Weekend', age: 'Age', prior_visits: 'Earlier visits', days_since_last: 'Days since last visit',
  waiting_now: 'Patients already waiting', in_service_now: 'Patients in care', dept_prev_24h: 'Dept arrivals, last 24h',
  hosp_prev_3h: 'Hospital arrivals, last 3h', dept_hist_median_wait: "Dept's recent median wait", wait_minutes: 'Minutes waited',
}
// Each hindsight rule and the live rule it corresponds to
const WALKOUT_RULES: { label: string; hindsight: string; live: string }[] = [
  { label: 'Minutes waited (simple rule)', hindsight: 'wait-only rule', live: 'minutes waited so far' },
  { label: 'Triage walk-out rate (simple rule)', hindsight: 'triage rate', live: 'triage rate' },
]
const pct = (x: number) => `${Math.round(100 * x)}%`

const BASELINE_NAMES: Record<string, string> = {
  'global median': 'Average-wait display (global median)',
  'dept x 4h median': 'Department × time of day',
  'triage median': 'Triage only',
  'dept x triage median': 'Department × triage (best rule)',
}

function Bar({ label, value, max, unit, highlight }: { label: string; value: number; max: number; unit: string; highlight?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(10rem,16rem)_1fr_4.5rem] items-center gap-3 text-sm" title={`${label}: ${value} ${unit}`}>
      <span className={highlight ? 'font-semibold' : 'text-muted'}>{label}</span>
      <span className="h-3 rounded-r bg-linen">
        <span className="block h-3 rounded-r" style={{ width: `${(100 * value) / max}%`, background: highlight ? 'var(--color-teal)' : 'var(--color-quiet)' }} />
      </span>
      <span className={`text-right ${highlight ? 'font-bold' : ''}`}>{value} {unit}</span>
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-rule bg-paper p-5">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

export default function ModelLab() {
  const { meta } = useClock()
  const q = useQuery({ queryKey: ['metrics'], queryFn: api.metrics })
  if (q.isError) return <p className="text-crit">{(q.error as Error).message}</p>
  if (!q.data) return <p className="text-muted">Loading model results…</p>
  const { wait_time: w, walkout_risk: lbc } = q.data as unknown as Metrics

  const naive = w.baselines_test_mae['global median']
  const vsNaive = Math.round((100 * (naive - w.model_test_mae)) / naive)
  const bestRule = w.baselines_test_mae[w.best_baseline]
  const vsBest = Math.round((100 * (bestRule - w.model_test_mae)) / bestRule)
  const trusted = meta?.walkout_model.trusted ?? false
  const live = lbc.live
  const bestRuleAuc = meta?.walkout_model.best_rule_auc
  const rows = [...Object.entries(w.baselines_test_mae).map(([k, v]) => ({ k: BASELINE_NAMES[k] ?? k, v, us: false })),
    { k: 'QueueSight model (LightGBM P50)', v: w.model_test_mae, us: true }].sort((a, b) => b.v - a.v)
  const maxMae = Math.max(...rows.map((r) => r.v))
  const total = w.rows.train + w.rows.valid + w.rows.test
  const feats = Object.entries(w.feature_importance_gain).slice(0, 8)
  const depts = Object.entries(w.mae_by_department).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-extrabold tracking-tight">Model lab</h1>
        <p className="mt-1 text-muted">
          Every number on this page is measured on November and December 2025, visits our models never saw while training.
          All models are LightGBM, trained from scratch on this hospital's data. No pretrained models, no API keys.
        </p>
      </div>

      <section className="grid grid-cols-1 divide-rule overflow-hidden rounded-2xl border border-rule bg-paper sm:grid-cols-3 sm:divide-x">
        <div className="px-5 py-4">
          <div className="text-3xl font-extrabold">{w.model_test_mae} min</div>
          <div className="mt-1 text-sm text-muted">Average error of the wait prediction</div>
        </div>
        <div className="px-5 py-4">
          <div className="text-3xl font-extrabold text-teal">{vsNaive}% better</div>
          <div className="mt-1 text-sm text-muted">than an average-wait display ({naive} min)</div>
        </div>
        <div className="px-5 py-4">
          <div className="text-3xl font-extrabold">{w.interval_p10_p90_coverage_pct}%</div>
          <div className="mt-1 text-sm text-muted">of real waits fell inside the predicted range (target 80%)</div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Wait-time error vs simple rules (lower is better)">
          <div className="space-y-3">{rows.map((r) => <Bar key={r.k} label={r.k} value={r.v} max={maxMae} unit="min" highlight={r.us} />)}</div>
          <p className="mt-4 text-sm text-muted">
            {vsBest >= 5
              ? `The model is ${vsBest}% more accurate than the best hand-built rule, because it also sees how busy the department is right now. `
              : `Here waiting is driven mostly by triage and department, so the model matches the best hand-built rule. `}
            It also adds what no rule can: a calibrated range per patient and a reason for every prediction.
          </p>
        </Card>

        <Card title="How the data was split (by time, never randomly)">
          <div className="flex h-9 overflow-hidden rounded-lg text-sm font-semibold text-paper">
            <div className="grid place-items-center bg-quiet" style={{ width: `${(100 * w.rows.train) / total}%` }}>Train Jan–Sep · {w.rows.train.toLocaleString()}</div>
            <div className="grid place-items-center bg-muted" style={{ width: `${(100 * w.rows.valid) / total}%` }}>Oct</div>
            <div className="grid place-items-center bg-teal" style={{ width: `${(100 * w.rows.test) / total}%` }}>Test</div>
          </div>
          <ul className="mt-4 space-y-1.5 text-sm">
            <li><b>Train</b> on January–September ({w.rows.train.toLocaleString()} visits).</li>
            <li><b>Validate</b> on October ({w.rows.valid.toLocaleString()}): stops training early and picks the fairest baseline.</li>
            <li><b>Test</b> on November–December ({w.rows.test.toLocaleString()}): reported here and used in the live demo.</li>
            <li><b>No leakage:</b> only facts known at arrival are inputs. Service times, discharge and outcome are blocked in code.</li>
          </ul>
          <div className="mt-5">
            <div className="mb-1 text-sm font-semibold">Range calibration</div>
            <div className="relative h-3 rounded bg-linen">
              <div className="h-3 rounded bg-teal" style={{ width: `${w.interval_p10_p90_coverage_pct}%` }} />
              <div className="absolute -top-1 h-5 w-[2px] bg-ink" style={{ left: '80%' }} title="Target 80%" />
            </div>
            <p className="mt-1 text-xs text-muted">
              {w.interval_p10_p90_coverage_pct}% covered, black tick = 80% target. Average range width {w.interval_mean_width_min} min.
            </p>
          </div>
        </Card>

        <Card title="What the wait model relies on">
          <div className="space-y-3">
            {feats.map(([k, v]) => <Bar key={k} label={FEATURE_NAMES[k] ?? k} value={Math.round(v * 1000) / 10} max={100 * feats[0][1]} unit="%" highlight={k === feats[0][0]} />)}
          </div>
          <p className="mt-4 text-sm text-muted">Share of what the model learned, by input.</p>
        </Card>

        <Card title="Average error by department">
          <div className="space-y-3">
            {depts.map(([k, v]) => <Bar key={k} label={k} value={v} max={depts[0][1]} unit="min" />)}
          </div>
        </Card>
      </div>

      <Card title={trusted ? 'Walk-out prediction' : 'Walk-out prediction: an honest negative result'}>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            {trusted
              ? <div className="text-3xl font-extrabold text-teal">Reliable live: AUC {live?.model.auc}</div>
              : <div className="text-3xl font-extrabold text-elev">No reliable signal</div>}
            <p className="mt-2 text-sm text-muted">
              We trained a model to predict who leaves before being seen ({lbc.positive_rate_test_pct}% of test visits).
              In hindsight, knowing each patient's final wait, it scores AUC {lbc.model.auc}. But the radar only knows how long
              someone has waited <i>so far</i>, so we also replay every 30 minutes of November–December and score it live
              {live ? ` (${live.patient_moments.toLocaleString()} patient-moments)` : ''}.
            </p>
            <p className="mt-2 text-sm text-muted">
              {trusted
                ? `Live it scores ${live?.model.auc} where 0.5 is a coin flip, ahead of the best simple rule (${bestRuleAuc}), so the radar uses it to rank patients.`
                : live
                  ? `Live it scores ${live.model.auc} where 0.5 is a coin flip, no better than simple rules, so QueueSight does not use it.`
                  : 'It has not been checked live yet: retrain the models to run the check.'}
            </p>
          </div>
          <table className="w-full self-start text-sm">
            <thead className="text-left text-muted">
              <tr><th className="pb-2 font-normal">Method (AUC)</th><th className="pb-2 font-normal">In hindsight</th><th className="pb-2 font-normal">Live, as the radar uses it</th></tr>
            </thead>
            <tbody className="divide-y divide-rule">
              <tr className="font-semibold"><td className="py-2">QueueSight model</td><td>{lbc.model.auc}</td><td>{live?.model.auc ?? '–'}</td></tr>
              {WALKOUT_RULES.map((r) => (
                <tr key={r.label}><td className="py-2">{r.label}</td><td>{lbc.baselines[r.hindsight]?.auc ?? '–'}</td><td>{live?.rules[r.live]?.auc ?? '–'}</td></tr>
              ))}
              <tr className="text-muted"><td className="py-2">Coin flip</td><td>0.5</td><td>0.5</td></tr>
            </tbody>
          </table>
        </div>

        {live && live.calibration_after.length > 0 && (
          <div className="mt-6">
            <div className="text-sm font-semibold">Do the percentages mean what they say? (November–December)</div>
            <p className="mt-1 text-sm text-muted">
              Raw scores were too confident at the top and too low at the bottom. A calibration step learned on October fixes that,
              so a patient shown at 40% really belongs to a group where about 4 in 10 walk out.
            </p>
            <div className="mt-3 grid gap-6 md:grid-cols-2">
              {([['Before calibration', live.calibration_before], ['After calibration (what staff see)', live.calibration_after]] as const).map(([title, bands]) => (
                <table key={title} className="w-full text-sm">
                  <thead className="text-left text-muted">
                    <tr><th className="pb-2 font-normal">{title}</th><th className="pb-2 font-normal">Shown</th><th className="pb-2 font-normal">Really left</th></tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {bands.map((b) => (
                      <tr key={b.band}><td className="py-1.5 text-muted">risk {b.band}</td><td>{pct(b.shown)}</td><td className="font-semibold">{pct(b.really_left)}</td></tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}