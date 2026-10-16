// Data quality center: every problem found in the raw dataset, how big it is, and how QueueSight handles it.
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

interface Issue { id: string; table: string; severity: 'high' | 'medium' | 'low'; title: string; count: number; total: number; pct: number; handling: string }
interface Quality {
  summary: { raw_rows: Record<string, number>; issues_found: number; days_covered: number; date_range: string[]; visits_per_day: number }
  issues: Issue[]
}

const SEVERITY = {
  high: { label: 'High', color: 'var(--color-crit)' },
  medium: { label: 'Medium', color: 'var(--color-elev)' },
  low: { label: 'Low', color: 'var(--color-quiet)' },
}

export default function DataQuality() {
  const q = useQuery({ queryKey: ['quality'], queryFn: api.quality })
  if (q.isError) return <p className="text-crit">{(q.error as Error).message}</p>
  if (!q.data) return <p className="text-muted">Checking the data…</p>
  const { summary: s, issues } = q.data as unknown as Quality

  const tiles = [
    { label: 'Patients', value: s.raw_rows.patients },
    { label: 'Visits', value: s.raw_rows.encounters },
    { label: 'Departments', value: s.raw_rows.departments },
    { label: 'Diagnostic tests', value: s.raw_rows.tests },
    { label: 'Visits per day', value: s.visits_per_day },
    { label: 'Issues found', value: s.issues_found, alert: true },
  ]

  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-extrabold tracking-tight">Data quality</h1>
        <p className="mt-1 text-muted">
          Before any model sees the data, QueueSight checks it. Every issue below was found automatically in the provided
          dataset, with its size and exactly how we handle it. Nothing is silently deleted.
        </p>
      </div>

      <section className="grid grid-cols-2 divide-rule overflow-hidden rounded-2xl border border-rule bg-paper sm:grid-cols-3 xl:grid-cols-6 xl:divide-x">
        {tiles.map((t) => (
          <div key={t.label} className="border-b border-rule px-5 py-4 xl:border-b-0">
            <div className={`text-3xl font-extrabold ${t.alert ? 'text-elev' : ''}`}>{t.value.toLocaleString()}</div>
            <div className="mt-1 text-sm text-muted">{t.label}</div>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-rule bg-paper">
        <div className="hidden grid-cols-[6rem_minmax(14rem,2fr)_minmax(10rem,1fr)_minmax(14rem,1.6fr)] gap-x-5 border-b border-rule px-5 py-2 text-sm text-muted md:grid">
          <span>Severity</span><span>Issue</span><span>Rows affected</span><span>How we handle it</span>
        </div>
        {issues.map((i) => (
          <div key={i.id} className="grid gap-x-5 gap-y-1 border-b border-rule px-5 py-3 last:border-b-0 md:grid-cols-[6rem_minmax(14rem,2fr)_minmax(10rem,1fr)_minmax(14rem,1.6fr)] md:items-center">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="size-2.5 rounded-full" style={{ background: SEVERITY[i.severity].color }} />
              {SEVERITY[i.severity].label}
            </span>
            <span>
              <span className="block font-semibold">{i.title}</span>
              <span className="text-sm text-muted">{i.table}</span>
            </span>
            <span className="text-sm">
              <span className="block">{i.count.toLocaleString()} of {i.total.toLocaleString()} ({i.pct}%)</span>
              <span className="mt-1 block h-2 rounded-r bg-linen">
                <span className="block h-2 rounded-r" style={{ width: `${Math.min(100, i.pct)}%`, background: SEVERITY[i.severity].color }} />
              </span>
            </span>
            <span className="text-sm text-muted">{i.handling}</span>
          </div>
        ))}
      </section>

      <p className="text-sm text-muted">
        Covers {s.days_covered} days, {s.date_range[0].slice(0, 10)} to {s.date_range[1].slice(0, 10)}. Synthetic educational
        data from DATATHON 2026, not real patient records.
      </p>
    </div>
  )
}