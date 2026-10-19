// App shell: navigation, the replay clock, and the page area. The patient drawer opens from any page via ?patient=ID
import { FlaskConical, LayoutDashboard, Pause, Play, Radar as RadarIcon, ShieldCheck, Target } from 'lucide-react'
import { NavLink, Route, Routes, useSearchParams } from 'react-router-dom'
import PatientDrawer from './components/PatientDrawer'
import { fmtDate, fmtTime, HOSPITAL_NAME, toLocalIso } from './lib/api'
import { useClock } from './lib/clock'
import CommandCenter from './pages/CommandCenter'
import DataQuality from './pages/DataQuality'
import ModelLab from './pages/ModelLab'
import RadarPage from './pages/Radar'

const NAV = [
  { to: '/', label: 'Command center', icon: LayoutDashboard },
  { to: '/radar', label: 'Forgotten patients', icon: RadarIcon },
  { to: '/model-lab', label: 'Model lab', icon: FlaskConical },
  { to: '/data-quality', label: 'Data quality', icon: ShieldCheck },
]

const SPEEDS = [
  { v: 1, label: '1 min/s' },
  { v: 10, label: '10 min/s' },
  { v: 60, label: '1 h/s' },
]

function ReplayClock() {
  const { time, setTime, playing, setPlaying, speed, setSpeed, meta } = useClock()
  if (!time || !meta) return <div className="h-16" />

  const t0 = new Date(meta.time_min).getTime()
  const t1 = new Date(meta.time_max).getTime()
  const total = Math.round((t1 - t0) / 60_000)
  const value = Math.round((new Date(time).getTime() - t0) / 60_000)
  const testPct = (100 * (new Date(meta.test_period_start).getTime() - t0)) / (t1 - t0)

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="min-w-[11rem]">
        <div className="text-sm text-muted">{fmtDate(time)}</div>
        <div className="text-4xl font-extrabold leading-none tracking-tight">{fmtTime(time)}</div>
      </div>

      <button
        onClick={() => setPlaying(!playing)}
        className="grid size-11 place-items-center rounded-full bg-teal text-paper hover:brightness-110"
        aria-label={playing ? 'Pause replay' : 'Play replay'}
      >
        {playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
      </button>

      <div className="flex rounded-full border border-rule bg-paper p-0.5 text-sm" role="group" aria-label="Replay speed">
        {SPEEDS.map((s) => (
          <button
            key={s.v}
            onClick={() => setSpeed(s.v)}
            className={`rounded-full px-3 py-1 ${speed === s.v ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="min-w-[16rem] flex-1">
        <div className="relative">
          {/* shaded part of the track = Nov-Dec, the period the models never saw */}
          <div
            className="pointer-events-none absolute inset-y-[7px] right-0 rounded-r-full bg-teal-soft"
            style={{ left: `${testPct}%` }}
          />
          <input
            type="range" min={0} max={total} value={value}
            onChange={(e) => setTime(toLocalIso(new Date(t0 + Number(e.target.value) * 60_000)))}
            className="relative w-full accent-[var(--color-teal)]"
            aria-label="Replay time"
          />
        </div>
        <div className="flex justify-between text-xs text-muted">
          <span>Jan 2025</span>
          <span>Shaded: unseen by the models</span>
          <span>Dec 2025</span>
        </div>
      </div>

      <button
        onClick={() => setTime(meta.default_time.slice(0, 16))}
        className="flex items-center gap-1.5 rounded-full border border-rule bg-paper px-3 py-1.5 text-sm hover:border-teal"
      >
        <Target size={15} /> Busiest moment
      </button>
    </div>
  )
}

export default function App() {
    const { metaError, meta } = useClock()
  const [params, setParams] = useSearchParams()
  const patient = params.get('patient')

  if (metaError) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md rounded-2xl border border-rule bg-paper p-6">
          <h1 className="text-xl font-bold">QueueSight can't reach its API</h1>
          <p className="mt-2 text-muted">Start the backend in another terminal, then refresh this page:</p>
          <pre className="mt-3 rounded-lg bg-linen p-3 text-sm">cd backend{'\n'}uvicorn app.main:app --reload --port 8000</pre>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-rule bg-paper px-5 py-4 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:py-7">
        <div className="flex items-baseline gap-2 lg:block">
          <div className="text-2xl font-extrabold tracking-tight text-teal">QueueSight</div>
          <div className="text-sm text-muted">No patient forgotten</div>
        </div>
        <nav className="mt-4 flex gap-1 lg:mt-10 lg:flex-col">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[15px] ${
                  isActive ? 'bg-teal-soft font-semibold text-teal' : 'text-muted hover:bg-linen hover:text-ink'
                }`
              }
            >
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        {meta && (
          <div className="mt-10 hidden lg:block">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Data</div>
            <div className="mt-1 text-sm font-semibold">{HOSPITAL_NAME[meta.data_source]}</div>
            <p className="mt-1 text-xs leading-relaxed text-muted">{meta.disclaimer}</p>
          </div>
        )}
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-rule bg-linen/90 px-5 py-4 backdrop-blur lg:px-8">
          <ReplayClock />
        </header>
        <main className="px-5 py-6 lg:px-8">
          <Routes>
            <Route path="/" element={<CommandCenter />} />
            <Route path="/radar" element={<RadarPage />} />
            <Route path="/model-lab" element={<ModelLab />} />
            <Route path="/data-quality" element={<DataQuality />} />
          </Routes>
        </main>
      </div>

      <PatientDrawer
        encounterId={patient}
        onClose={() => {
          params.delete('patient')
          setParams(params)
        }}
      />
    </div>
  )
}