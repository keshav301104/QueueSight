// Forgotten Patient Radar: everyone at risk of slipping through the cracks, ranked, with the evidence on one line.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { WaitBand } from '../components/viz'
import { api, fmtTime, TRIAGE_COLOR } from '../lib/api'
import type { RadarState } from '../lib/api'
import { useClock } from '../lib/clock'

const FILTERS: { key: RadarState | 'all'; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'waiting', label: 'Waiting now' },
  { key: 'left_unseen', label: 'Left unseen' },
  { key: 'was_overdue', label: 'Waited too long' },
]
const STATE_TEXT: Record<RadarState, string> = { waiting: 'Waiting now', left_unseen: 'Left unseen', was_overdue: 'Waited too long' }
const WINDOWS = [24, 72, 168]

export default function RadarPage() {
  const { time } = useClock()
  const [, setParams] = useSearchParams()
  const [filter, setFilter] = useState<RadarState | 'all'>('all')
  const [hours, setHours] = useState(24)
  const q = useQuery({ queryKey: ['radar', time, hours], queryFn: () => api.radar(time!, hours), enabled: !!time, placeholderData: keepPreviousData })

  const items = (q.data?.items ?? []).filter((i) => filter === 'all' || i.state === filter)
  const scale = Math.max(120, ...items.map((i) => Math.max(i.pred_p90, i.waited_min) * 1.1))

  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-extrabold tracking-tight">Forgotten patients</h1>
        <p className="mt-1 text-muted">
          Everyone waiting longer than our model expected, likely to walk out, or who already left without being seen.
          The shaded band is each patient's predicted wait; the dot is how long they have actually waited.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-rule bg-paper p-0.5 text-sm">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 ${filter === f.key ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          Look back
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))}
            className="rounded-lg border border-rule bg-paper px-2 py-1 text-ink">
            {WINDOWS.map((h) => <option key={h} value={h}>{h < 48 ? `${h} hours` : `${h / 24} days`}</option>)}
          </select>
        </label>
        <span className="text-sm text-muted">{items.length} patient(s)</span>
      </div>

      <section className="overflow-hidden rounded-2xl border border-rule bg-paper">
        <div className="hidden grid-cols-[4px_minmax(12rem,1.2fr)_8rem_minmax(14rem,2fr)_7rem_7rem] gap-x-5 border-b border-rule px-0 py-2 text-sm text-muted md:grid">
          <span /><span>Patient</span><span>Status</span><span>Waited vs predicted</span><span>Walk-out risk</span><span>Over by</span>
        </div>
        {items.length === 0 && <p className="px-5 py-8 text-muted">Nobody matches this view. Try a longer look-back window or move the clock.</p>}
        {items.map((p) => (
          <button key={`${p.state}-${p.encounter_id}`} onClick={() => setParams({ patient: p.encounter_id })}
            className="grid w-full grid-cols-[4px_1fr] gap-x-5 border-b border-rule text-left last:border-b-0 hover:bg-linen md:grid-cols-[4px_minmax(12rem,1.2fr)_8rem_minmax(14rem,2fr)_7rem_7rem] md:items-center">
            <span className="self-stretch" style={{ background: TRIAGE_COLOR[p.triage_level] }} />
            <span className="py-3">
              <span className="block font-semibold">{p.patient_id}</span>
              <span className="block text-sm text-muted">{p.department}, {p.triage_level} triage, arrived {fmtTime(p.arrival_time)}</span>
            </span>
            <span className={`text-sm font-semibold ${p.state === 'waiting' ? 'text-elev' : 'text-crit'}`}>{STATE_TEXT[p.state]}</span>
            <span className="py-2 md:py-0">
              <WaitBand p10={p.pred_p10} p50={p.pred_p50} p90={p.pred_p90} waited={p.waited_min} scale={scale} />
              <span className="mt-1 block text-xs text-muted">
                {Math.round(p.waited_min)} min waited, expected {Math.round(p.pred_p10)} to {Math.round(p.pred_p90)}
              </span>
            </span>
            <span className="text-sm">{p.walkout_risk_now === null ? '–' : `${(100 * p.walkout_risk_now).toFixed(1)}%`}</span>
            <span className={`pb-3 text-sm md:pb-0 ${p.minutes_over_p90 > 0 ? 'font-semibold text-crit' : 'text-muted'}`}>
              {p.minutes_over_p90 > 0 ? `${Math.round(p.minutes_over_p90)} min` : 'within range'}
            </span>
          </button>
        ))}
      </section>
    </div>
  )
}