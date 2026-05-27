import { useEffect, useRef, useState } from 'react'
import { usePlayback, saveDefaults } from '../../store/playback'

const MONO = 'monospace'

// ── Countdown bar ─────────────────────────────────────────────────────────────

function CountdownBar() {
  const { nextAdvanceAt, wanderActive, transitioning } = usePlayback()
  const [secsLeft, setSecsLeft] = useState<number | null>(null)
  // We don't know the original full dwell budget from the store alone (dwell is
  // now trackDuration + variance, computed per-node). We pin it on first tick
  // after nextAdvanceAt changes so the bar fills correctly from full → empty.
  const [totalSecs, setTotalSecs] = useState<number | null>(null)

  useEffect(() => {
    if (!wanderActive || !nextAdvanceAt) {
      setSecsLeft(null)
      setTotalSecs(null)
      return
    }
    // Capture the total budget for this dwell once.
    setTotalSecs(Math.max(1, Math.ceil((nextAdvanceAt - Date.now()) / 1000)))
    const tick = () => {
      setSecsLeft(Math.max(0, Math.ceil((nextAdvanceAt - Date.now()) / 1000)))
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [nextAdvanceAt, wanderActive])

  if (!wanderActive || secsLeft === null || transitioning) return null

  const progress = totalSecs ? Math.max(0, Math.min(1, secsLeft / totalSecs)) : 0
  // Bar fills as time runs out (inverse of progress)
  const filledWidth = Math.round((1 - progress) * 100)

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: 10, color: '#4a6a8a', letterSpacing: 2, textTransform: 'uppercase' }}>
          Next advance
        </span>
        <span style={{ fontSize: 12, color: '#90b8e8', fontWeight: 700, fontFamily: MONO }}>
          {secsLeft}s
        </span>
      </div>
      <div style={{
        height: 4, background: '#1a2a3a', borderRadius: 2, overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${filledWidth}%`,
          background: secsLeft <= 5 ? '#f87171' : '#4a90d9',
          borderRadius: 2,
          transition: 'width 0.5s linear, background 0.3s',
        }} />
      </div>
    </div>
  )
}

// ── Slider row ────────────────────────────────────────────────────────────────

function SliderRow({
  label, tooltip, value, min, max, step, format, onChange,
}: {
  label: string
  tooltip?: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span
        title={tooltip}
        style={{ fontSize: 11, color: '#6a8aaa', width: 80, flexShrink: 0, cursor: tooltip ? 'help' : undefined }}
      >{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, cursor: 'pointer', accentColor: '#4a90d9' }}
      />
      <span style={{ fontSize: 11, color: '#90b8e8', width: 44, textAlign: 'right', fontFamily: MONO }}>
        {format(value)}
      </span>
    </div>
  )
}

// ── DebugPanel (main export) ─────────────────────────────────────────────────

export default function DebugPanel() {
  const [open, setOpen] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    dwellVarianceMs, fadeOutDuration, fadeInDuration,
    travelMinMs, travelVarianceMs,
    setDwellVarianceMs, setFadeOutDuration, setFadeInDuration,
    setTravelMinMs, setTravelVarianceMs,
    wanderActive,
  } = usePlayback()

  const travelMinSecs = travelMinMs / 1000
  const travelVarSecs = travelVarianceMs / 1000
  const travelRangeLo = travelMinSecs
  const travelRangeHi = travelMinSecs + travelVarSecs

  // Clear the saved-flash timer on unmount to avoid setting state on a gone component.
  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
  }, [])

  const handleSaveDefaults = () => {
    saveDefaults({
      dwellVarianceMs, fadeOutDuration, fadeInDuration,
      travelMinMs, travelVarianceMs,
    })
    setSavedFlash(true)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSavedFlash(false), 1500)
  }

  return (
    <div style={{ width: '100%', maxWidth: 580, marginTop: 8 }}>
      {/* Collapsible header */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: open ? 16 : 0, cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 10, color: '#4a6a8a', letterSpacing: 3, textTransform: 'uppercase', flexShrink: 0 }}>
          {open ? '▾' : '▸'} Tuning
        </span>
        <div style={{ height: 1, flex: 1, background: '#1a2a3a' }} />
        <span style={{ fontSize: 10, color: '#2d4a6e' }}>timing</span>
      </div>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Countdown bar — only when wander is active */}
          {wanderActive && <CountdownBar />}

          {/* Wander timing sliders */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: '#4a6a8a', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
              Wander Timing
            </div>
            <SliderRow
              label="Variance"
              tooltip="Random extra time added on top of the track's full length. Each node plays at least once through; variance is added to keep timing from feeling mechanical. Transition nodes ignore this."
              value={dwellVarianceMs / 1000}
              min={0} max={120} step={5}
              format={v => `${v}s`}
              onChange={v => setDwellVarianceMs(v * 1000)}
            />
            <div style={{ fontSize: 10, color: '#2d4a6e', marginTop: 2 }}>
              dwell = track length + 0–{Math.round(dwellVarianceMs / 1000)}s
            </div>
          </div>

          {/* Transition sliders */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: '#4a6a8a', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
              Transitions
            </div>
            <SliderRow
              label="Fade out"
              tooltip="How long the current track fades to silence before the next one starts."
              value={fadeOutDuration}
              min={0.1} max={8} step={0.1}
              format={v => `${v.toFixed(1)}s`}
              onChange={setFadeOutDuration}
            />
            <SliderRow
              label="Fade in"
              tooltip="How long the next track fades in from silence after the previous one stops."
              value={fadeInDuration}
              min={0.1} max={8} step={0.1}
              format={v => `${v.toFixed(1)}s`}
              onChange={setFadeInDuration}
            />
          </div>

          {/* Travel time sliders */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: '#4a6a8a', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
              Travel Time
            </div>
            <SliderRow
              label="Travel min"
              tooltip="Minimum silent period between wander transitions — simulates the listener moving between locations. Teleport is unaffected."
              value={travelMinSecs}
              min={0} max={30} step={0.5}
              format={v => `${v.toFixed(1)}s`}
              onChange={v => setTravelMinMs(v * 1000)}
            />
            <SliderRow
              label="Travel variance"
              tooltip="Random extra silence on top of the minimum. Prevents travel feeling mechanical. Set to 0 for a fixed travel period."
              value={travelVarSecs}
              min={0} max={20} step={0.5}
              format={v => `${v.toFixed(1)}s`}
              onChange={v => setTravelVarianceMs(v * 1000)}
            />
            <div style={{ fontSize: 10, color: '#2d4a6e', marginTop: 2 }}>
              → range: {travelRangeLo.toFixed(1)}s – {travelRangeHi.toFixed(1)}s
            </div>
          </div>

          {/* Save as defaults — directly beneath the sliders */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleSaveDefaults}
              title="Persist current slider values as the defaults for next time the app loads"
              style={{
                background: 'none', border: '1px solid #2d4a6e', borderRadius: 3,
                color: '#6a8aaa', cursor: 'pointer',
                fontSize: 11, fontFamily: MONO, padding: '4px 12px',
              }}
            >
              ⤓ save as defaults
            </button>
            <span style={{
              fontSize: 10, color: '#4caf78', fontFamily: MONO,
              opacity: savedFlash ? 1 : 0,
              transition: 'opacity 0.3s',
            }}>
              ✓ saved
            </span>
          </div>

        </div>
      )}
    </div>
  )
}
