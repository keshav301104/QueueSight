// Small hand-drawn SVG visuals used across QueueSight.
import type { Driver } from '../lib/api'

/** Predicted wait range (P10-P90 band, P50 tick) with a marker for how long the patient has actually waited. */
export function WaitBand({ p10, p50, p90, waited, scale, height = 14 }: {
  p10: number; p50: number; p90: number; waited: number; scale?: number; height?: number
}) {
  const max = scale ?? Math.max(p90, waited, 30) * 1.15
  const x = (v: number) => `${Math.min(100, (100 * v) / max)}%`
  const color = waited > p90 ? 'var(--color-crit)' : waited > p50 ? 'var(--color-elev)' : 'var(--color-ok)'
  return (
    <div className="relative w-full" style={{ height }} role="img"
      aria-label={`Waited ${Math.round(waited)} min; predicted ${Math.round(p10)} to ${Math.round(p90)} min`}>
      <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded bg-rule" />
      <div className="absolute top-0 h-full rounded bg-teal-soft" style={{ left: x(p10), width: `calc(${x(p90)} - ${x(p10)})` }} />
      <div className="absolute top-0 h-full w-[2px] bg-teal" style={{ left: x(p50) }} />
      <div
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper"
        style={{ left: x(waited), background: color }}
      />
    </div>
  )
}

/** 7-day sparkline; gaps where a day had no visits. */
export function Sparkline({ values, width = 84, height = 26 }: { values: (number | null)[]; width?: number; height?: number }) {
  const nums = values.filter((v): v is number => v !== null)
  if (nums.length < 2) return <span className="text-xs text-muted">too few visits</span>
  const lo = Math.min(...nums), hi = Math.max(...nums)
  const sx = (i: number) => (i * width) / (values.length - 1)
  const sy = (v: number) => height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6)
  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (v === null) { pen = false; return }
    d += `${pen ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)} `
    pen = true
  })
  const last = values.length - 1
  const lastV = values[last]
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke="var(--color-muted)" strokeWidth={1.5} strokeLinejoin="round" />
      {lastV !== null && <circle cx={sx(last)} cy={sy(lastV)} r={2.5} fill="var(--color-ink)" />}
    </svg>
  )
}

/** Walk-out risk as waiting time grows, with a marker at the patient's current wait. */
export function RiskCurve({ points, waited }: { points: { wait_min: number; risk: number }[]; waited: number }) {
  const W = 320, H = 120, P = 28
  const maxX = points[points.length - 1]?.wait_min ?? 180
  const maxY = Math.max(...points.map((p) => p.risk), 0.02) * 1.15
  const sx = (v: number) => P + (v / maxX) * (W - P - 8)
  const sy = (v: number) => H - 20 - (v / maxY) * (H - 30)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.wait_min)},${sy(p.risk)}`).join(' ')
  const near = points.reduce((a, b) => (Math.abs(b.wait_min - waited) < Math.abs(a.wait_min - waited) ? b : a), points[0])
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Walk-out risk by waiting time">
      <line x1={P} x2={W - 8} y1={H - 20} y2={H - 20} stroke="var(--color-rule)" />
      {[0, 60, 120, 180].filter((v) => v <= maxX).map((v) => (
        <text key={v} x={sx(v)} y={H - 5} fontSize={10} textAnchor={v === maxX ? 'end' : 'middle'} fill="var(--color-muted)">{v}m</text>
      ))}
      <text x={P - 4} y={sy(maxY / 1.15)} fontSize={10} textAnchor="end" fill="var(--color-muted)">
        {Math.round((100 * maxY) / 1.15)}%
      </text>
      <path d={d} fill="none" stroke="var(--color-teal)" strokeWidth={2} />
      {near && (
        <g>
          <line x1={sx(waited)} x2={sx(waited)} y1={10} y2={H - 20} stroke="var(--color-crit)" strokeDasharray="3 3" />
          <circle cx={sx(near.wait_min)} cy={sy(near.risk)} r={4} fill="var(--color-crit)" />
        </g>
      )}
    </svg>
  )
}

/** Plain-English drivers as a diverging bar list (what pushed the prediction up or down). */
export function DriverBars({ drivers, unit }: { drivers: Driver[]; unit: 'min' | 'risk' }) {
  const max = Math.max(...drivers.map((d) => Math.abs(d.effect)), 1e-6)
  return (
    <ul className="space-y-2">
      {drivers.map((d) => {
        const up = d.effect > 0
        const pct = (50 * Math.abs(d.effect)) / max
        return (
          <li key={d.feature} className="grid grid-cols-[1fr_7rem] items-center gap-3 text-sm">
            <span>{d.label}</span>
            <span className="relative h-2.5 rounded bg-linen">
              <span className="absolute inset-y-0 left-1/2 w-px bg-rule" />
              <span
                className="absolute inset-y-0 rounded"
                style={{
                  left: up ? '50%' : `${50 - pct}%`, width: `${pct}%`,
                  background: up ? 'var(--color-elev)' : 'var(--color-ok)',
                }}
              />
            </span>
            <span className="col-span-2 -mt-1.5 text-xs text-muted">
              {unit === 'min'
                ? `${up ? 'adds' : 'saves'} about ${Math.abs(d.effect).toFixed(1)} min`
                : `${up ? 'raises' : 'lowers'} risk`}
            </span>
          </li>
        )
      })}
    </ul>
  )
}