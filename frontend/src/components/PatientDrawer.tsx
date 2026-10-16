// Patient detail drawer: the prediction, why the model made it, walk-out risk over time, tests and history.
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect } from 'react'
import { api, fmtDate, fmtTime, TRIAGE_COLOR } from '../lib/api'
import { useClock } from '../lib/clock'
import { DriverBars, RiskCurve, WaitBand } from './viz'

export default function PatientDrawer({ encounterId, onClose }: { encounterId: string | null; onClose: () => void }) {
  const { time } = useClock()
  const q = useQuery({
    queryKey: ['encounter', encounterId, time],
    queryFn: () => api.encounter(encounterId!, time!),
    enabled: !!encounterId && !!time,
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const d = q.data
  return (
    <AnimatePresence>
      {encounterId && (
        <>
          <motion.div className="fixed inset-0 z-30 bg-ink/25" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside
            role="dialog" aria-label="Patient detail"
            className="fixed inset-y-0 right-0 z-40 w-full max-w-xl overflow-y-auto border-l border-rule bg-paper shadow-2xl"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          >
            <div className="sticky top-0 flex items-start justify-between border-b border-rule bg-paper px-6 py-4">
              <div>
                <div className="text-sm text-muted">{encounterId}</div>
                <h2 className="text-xl font-bold">{d ? `${d.patient_id}, ${d.department}` : 'Loading…'}</h2>
              </div>
              <button onClick={onClose} className="rounded-full p-1.5 hover:bg-linen" aria-label="Close"><X size={20} /></button>
            </div>

            {q.isError && <p className="px-6 py-4 text-crit">{(q.error as Error).message}</p>}
            {d && (
              <div className="space-y-7 px-6 py-5">
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="rounded-full px-2.5 py-0.5 font-semibold text-paper" style={{ background: TRIAGE_COLOR[d.triage_level] }}>
                    {d.triage_level} triage
                  </span>
                  <span className="rounded-full bg-linen px-2.5 py-0.5">{d.visit_type}</span>
                  <span className="rounded-full bg-linen px-2.5 py-0.5">Age {d.patient.age}, {d.patient.sex}</span>
                  <span className="rounded-full bg-linen px-2.5 py-0.5">{d.patient.chronic_condition === 'None' ? 'No chronic condition' : d.patient.chronic_condition}</span>
                </div>

                <section>
                  <h3 className="font-bold">
                    {d.status === 'waiting' ? `Waiting ${Math.round(d.waited_min)} min` : `Waited ${Math.round(d.waited_min)} min`}
                  </h3>
                  <p className="text-sm text-muted">
                    Arrived {fmtDate(d.arrival_time)}, {fmtTime(d.arrival_time)}.
                    Predicted wait {Math.round(d.prediction.p10)} to {Math.round(d.prediction.p90)} min, most likely {Math.round(d.prediction.p50)}.
                    {d.outcome && ` Outcome: ${d.outcome}.`}
                  </p>
                  <div className="mt-3"><WaitBand {...d.prediction} waited={d.waited_min} height={18} /></div>
                </section>

                <section>
                  <h3 className="font-bold">Why this prediction</h3>
                  <p className="mb-3 text-sm text-muted">Starting from a typical wait of {Math.round(d.why_wait.base)} min, these facts moved it most.</p>
                  <DriverBars drivers={d.why_wait.drivers} unit="min" />
                </section>

                <section>
                  <h3 className="font-bold">Walk-out risk {d.status === 'waiting' ? 'right now' : 'at this wait'}: {(100 * d.walkout_risk_now).toFixed(1)}%</h3>
                  <p className="mb-2 text-sm text-muted">How the chance of leaving unseen grows the longer this patient waits. Red line is now.</p>
                  <RiskCurve points={d.risk_curve} waited={d.waited_min} />
                  <div className="mt-3"><DriverBars drivers={d.why_risk.drivers} unit="risk" /></div>
                </section>

                <section>
                  <h3 className="mb-2 font-bold">Diagnostic tests</h3>
                  {d.tests.length === 0 ? <p className="text-sm text-muted">No tests ordered for this visit.</p> : (
                    <ul className="divide-y divide-rule rounded-xl border border-rule text-sm">
                      {d.tests.map((t) => (
                        <li key={t.test_id} className="flex justify-between px-3 py-2">
                          <span>{t.type} <span className="text-muted">({t.priority})</span></span>
                          <span>{Math.round(t.tat_min)} min turnaround</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className="mb-2 font-bold">Earlier visits</h3>
                  {d.history.length === 0 ? <p className="text-sm text-muted">First recorded visit.</p> : (
                    <ul className="divide-y divide-rule rounded-xl border border-rule text-sm">
                      {d.history.map((h) => (
                        <li key={h.encounter_id} className="flex justify-between px-3 py-2">
                          <span>{fmtDate(h.arrival_time)}, {h.department}</span>
                          <span className="text-muted">{h.outcome}, waited {Math.round(h.wait_min)} min</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <p className="text-xs text-muted">Synthetic data. Predictions support staff judgement and never replace clinical triage.</p>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}