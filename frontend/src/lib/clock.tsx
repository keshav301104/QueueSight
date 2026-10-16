// The replay clock: one shared "current time" for the whole app.
// On real hospital data this would simply be the wall clock; here it replays 2025 so the demo feels live.
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { addMinutes, api } from './api'
import type { Meta } from './api'

interface Clock {
  time: string | null
  setTime: (t: string) => void
  playing: boolean
  setPlaying: (p: boolean) => void
  speed: number // replay minutes per real second
  setSpeed: (s: number) => void
  meta: Meta | undefined
  metaError: Error | null
}

const ClockContext = createContext<Clock | null>(null)

export function ClockProvider({ children }: { children: ReactNode }) {
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta })
  const [time, setTime] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(10)

  // Start at the busiest moment of the test period (data the models never trained on)
  useEffect(() => {
    if (meta.data && time === null) setTime(meta.data.default_time.slice(0, 16))
  }, [meta.data, time])

  useEffect(() => {
    if (!playing || !meta.data) return
    const end = meta.data.time_max.slice(0, 16)
    const id = setInterval(() => {
      setTime((t) => {
        if (!t) return t
        const next = addMinutes(t, speed)
        if (next >= end) { setPlaying(false); return end }
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [playing, speed, meta.data])

  return (
    <ClockContext.Provider
      value={{ time, setTime, playing, setPlaying, speed, setSpeed, meta: meta.data, metaError: meta.error }}
    >
      {children}
    </ClockContext.Provider>
  )
}

export function useClock() {
  const c = useContext(ClockContext)
  if (!c) throw new Error('useClock must be used inside <ClockProvider>')
  return c
}