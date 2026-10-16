// Command center: hospital KPIs, the department ward board, and who needs attention right now.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Sparkline, WaitBand } from '../components/viz'
import { api, STATUS_COLOR, TRIAGE_COLOR } from '../lib/api'
import type { Department, Kpis } from '../lib/api'
import { useClock } from '../lib/clock'

const STATUS_TEXT = { critical: 'Under heavy pressure', elevated: 'Slower than normal', normal: 'Normal', quiet: 'No visits seen yet today' }

function KpiStrip({ k }: { k: Kpis }) {
  const items = [
    { label: 'Waiting now', value: k.waiting_now },
    { label: 'Arrivals today', value: k.arrivals_today },
    { label: 'Median wait today', value: k.median_wait_today === null ? '–' : `${Math.round(k.median_wait_today)} min` },
    { label: 'Waited past prediction', value: k.overdue_today, alert: k.overdue_today > 0 },
    { label: 'Left without being seen', value: k.walkouts_today, alert: k.walkouts_today > 0 },
    { label: 'Departments under pressure', value: k.departments_under_pressure, alert: k.departments_under_pressure > 0 },
  ]
  return (
    <section className="grid grid-cols-2 divide-rule overflow-hidden rounded-2xl border border-rule bg-paper sm:grid-cols-3 xl:grid-cols-6 xl:divide-x">
      {items.map((i) => (
        <div key={i.label} className="border-b border-rule px-5 py-4 xl:border-b-0">
          <div className={`text-3xl font-extrabold ${i.alert ? 'text-crit' : ''}`}>{i.value}</div>
          <div className="mt-1 text-sm text-muted">{i.label}</div>
        </div>
      ))}
    </section>
  )
}

function DeptRow({ d }: { d: Department }) {
  const color = STATUS_COLOR[d.status]
  const scale = 120
  return (
    <div className="grid grid-cols-[6px_1fr] border-b border-rule last:border-b-0">
      <div style={{ background: color }} />
      <div className="grid gap-x-6 gap-y-2 px-4 py-3 md:grid-cols-[minmax(10rem,1.2fr)_6rem_minmax(12rem,2fr)_6rem_5rem_5rem] md:items-center">
        <div>
          <div className="font-semibold">{d.name}</div>
          <div className="flex items-center gap-1.5 text-sm" style={{ color }}>
            {d.status === 'critical' && <span className="pulse size-2 rounded-full" style={{ background: color }} />}
            {STATUS_TEXT[d.status]}
          </div>
        </div>
        <div className="text-sm">
          <span className="text-lg font-bold">{d.waiting_now}</span> waiting
          <div className="text-muted">{d.in_service_now} in care</div>
        </div>
        <div>
          {d.median_wait_today !== null && d.normal_wait !== null ? (
            <>
              <div className="relative h-3">
                <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded bg-rule" />
                <div className="absolute top-0 h-full rounded" style={{ width: `${Math.min(100, (100 * d.median_wait_today) / scale)}%`, background: color, opacity: 0.85 }} />
                <div className="absolute -top-1 h-5 w-[2px] bg-ink" style={{ left: `${Math.min(100, (100 * d.normal_wait) / scale)}%` }} title="Normal wait" />
              </div>
              <div className="mt-1 text-sm text-muted">
                <span className="font-semibold text-ink">{Math.round(d.median_wait_today)} min</span> today, normal {Math.round(d.normal_wait)}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted">{d.arrivals_today} arrival(s), none seen yet</div>
          )}
        </div>
        <div title="Median wait over the last 7 days"><Sparkline values={d.trend_7d} /></div>
        <div className="text-sm"><span className={`text-lg font-bold ${d.overdue_today ? 'text-crit' : ''}`}>{d.overdue_today}</span> overdue</div>
        <div className="text-sm"><span className={`text-lg font-bold ${d.walkouts_today ? 'text-crit' : ''}`}>{d.walkouts_today}</span> left</div>
      </div>
    </div>
  )
}

export default function CommandCenter() {
  const { time } = useClock()
  const [, setParams] = useSearchParams()
  const snap = useQuery({ queryKey: ['snapshot', time], queryFn: () => api.snapshot(time!), enabled: !!time, placeholderData: keepPreviousData })
  const radar = useQuery({ queryKey: ['radar', time, 24], queryFn: () => api.radar(time!, 24), enabled: !!time, placeholderData: keepPreviousData })

  if (snap.isError) return <p className="text-crit">{(snap.error as Error).message}</p>
  if (!snap.data) return <p className="text-muted">Loading the ward board…</p>
  const top = (radar.data?.items ?? []).slice(0, 6)

  return (
    <div className="space-y-6">
      <KpiStrip k={snap.data.kpis} />

      <div className="grid gap-6 2xl:grid-cols-[1fr_24rem]">
        <section className="overflow-hidden rounded-2xl border border-rule bg-paper">
          <div className="flex items-baseline justify-between border-b border-rule px-5 py-3">
            <h2 className="text-lg font-bold">Department board</h2>
            <span className="text-sm text-muted">Sorted by pressure. Black tick = that department's normal wait.</span>
          </div>
          {snap.data.departments.map((d) => <DeptRow key={d.department_id} d={d} />)}
        </section>

        <section className="h-fit rounded-2xl border border-rule bg-paper">
          <div className="border-b border-rule px-5 py-3">
            <h2 className="text-lg font-bold">Needs attention now</h2>
            <p className="text-sm text-muted">Waiting patients first, then the last 24 hours.</p>
          </div>
          {top.length === 0 && <p className="px-5 py-6 text-sm text-muted">Nobody is at risk of being forgotten right now.</p>}
          <ul>
            {top.map((p) => (
              <li key={p.encounter_id}>
                <button
                  onClick={() => setParams({ patient: p.encounter_id })}
                  className="grid w-full grid-cols-[4px_1fr] border-b border-rule text-left last:border-b-0 hover:bg-linen"
                >
                  <span style={{ background: TRIAGE_COLOR[p.triage_level] }} />
                  <span className="px-4 py-3">
                    <span className="flex justify-between text-sm">
                      <span className="font-semibold">{p.patient_id} <span className="font-normal text-muted">in {p.department}</span></span>
                      <span className={p.state === 'waiting' ? 'text-elev' : 'text-crit'}>
                        {p.state === 'waiting' ? 'Waiting' : p.state === 'left_unseen' ? 'Left unseen' : 'Waited too long'}
                      </span>
                    </span>
                    <span className="mt-2 block"><WaitBand p10={p.pred_p10} p50={p.pred_p50} p90={p.pred_p90} waited={p.waited_min} /></span>
                    <span className="mt-1 block text-xs text-muted">
                      {Math.round(p.waited_min)} min waited, expected {Math.round(p.pred_p10)}–{Math.round(p.pred_p90)}
                      {p.walkout_risk_now !== null && `, walk-out risk ${(100 * p.walkout_risk_now).toFixed(1)}%`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link to="/radar" className="block px-5 py-3 text-sm font-semibold text-teal hover:underline">Open the full radar</Link>
        </section>
      </div>
    </div>
  )
}