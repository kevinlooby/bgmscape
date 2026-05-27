import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayback } from '../../store/playback'
import { lookaheadSession } from '../../api/sessions'
import type { LookaheadStep } from '../../types'

const MONO = 'monospace'

interface DebugPanelProps {
  sessionId: string
  currentNodeId: string
  currentNodeName: string
}

// ── Countdown bar ─────────────────────────────────────────────────────────────

function CountdownBar() {
  const { nextAdvanceAt, wanderActive, transitioning, minDwellMs, dwellVarianceMs } = usePlayback()
  const [secsLeft, setSecsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!wanderActive || !nextAdvanceAt) {
      setSecsLeft(null)
      return
    }
    const tick = () => {
      setSecsLeft(Math.max(0, Math.ceil((nextAdvanceAt - Date.now()) / 1000)))
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [nextAdvanceAt, wanderActive])

  if (!wanderActive || secsLeft === null || transitioning) return null

  const totalMs = minDwellMs + dwellVarianceMs / 2
  const totalSecs = Math.round(totalMs / 1000)
  const progress = Math.max(0, Math.min(1, secsLeft / totalSecs))

  const minSecs = Math.round(minDwellMs / 1000)
  const maxSecs = Math.round((minDwellMs + dwellVarianceMs) / 1000)

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
      <div style={{ fontSize: 10, color: '#2d4a6e', marginTop: 4 }}>
        range: {minSecs}s – {maxSecs}s
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

// ── Lookahead queue ───────────────────────────────────────────────────────────

// Simple region → color palette (same 8 colors cycling)
const REGION_COLORS = [
  '#4a90d9', '#90b848', '#d98840', '#c060c0',
  '#40c0b8', '#d94848', '#c0a840', '#7060d8',
]
const regionColorCache = new Map<string, string>()
let _regionColorIdx = 0
function regionColor(region: string | null): string {
  if (!region) return '#2d4a6e'
  if (!regionColorCache.has(region)) {
    regionColorCache.set(region, REGION_COLORS[_regionColorIdx % REGION_COLORS.length])
    _regionColorIdx++
  }
  return regionColorCache.get(region)!
}

function LookaheadQueue({
  sessionId,
  currentNodeId,
  currentNodeName,
}: {
  sessionId: string
  currentNodeId: string
  currentNodeName: string
}) {
  const { minDwellMs, dwellVarianceMs } = usePlayback()
  const [steps, setSteps] = useState<LookaheadStep[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchGenRef = useRef(0) // cancel stale fetches
  const prevNodeIdRef = useRef(currentNodeId)

  const expectedSecs = Math.round((minDwellMs + dwellVarianceMs / 2) / 1000)

  // Full (re-)fetch — called on mount, on manual refresh, and when list runs low
  const doFetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const gen = ++fetchGenRef.current
    try {
      const res = await lookaheadSession(sessionId, 12)
      if (gen !== fetchGenRef.current) return // superseded
      setSteps(res.steps)
    } catch (e) {
      if (gen !== fetchGenRef.current) return
      setError(e instanceof Error ? e.message : 'Lookahead failed')
    } finally {
      if (gen === fetchGenRef.current) setLoading(false)
    }
  }, [sessionId])

  // Initial fetch on mount / session change
  useEffect(() => { doFetch() }, [doFetch])

  // Consume one item from the front of the queue when the current node advances
  useEffect(() => {
    if (prevNodeIdRef.current === currentNodeId) return
    prevNodeIdRef.current = currentNodeId
    setSteps(prev => {
      if (!prev) return prev // initial load still in flight — leave it
      return prev.slice(1)   // drop the step that was just consumed
    })
  }, [currentNodeId])

  // Top up silently when the list gets short (runs after the consume effect settles)
  useEffect(() => {
    if (steps !== null && steps.length < 6 && !loading) {
      doFetch()
    }
  }, [steps, loading, doFetch])

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: '#4a6a8a', letterSpacing: 2, textTransform: 'uppercase' }}>
          Lookahead
        </span>
        <div style={{ flex: 1, height: 1, background: '#1a2a3a' }} />
        <button
          onClick={doFetch}
          disabled={loading}
          title="Refresh lookahead"
          style={{
            background: 'none', border: '1px solid #2d4a6e', borderRadius: 3,
            color: loading ? '#2d4a6e' : '#6a8aaa', cursor: loading ? 'default' : 'pointer',
            fontSize: 11, fontFamily: MONO, padding: '2px 8px',
          }}
        >
          ↺ refresh
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: '#f87171', marginBottom: 8 }}>{error}</div>
      )}

      {loading && !steps && (
        <div style={{ fontSize: 11, color: '#4a6a8a', fontStyle: 'italic' }}>computing…</div>
      )}

      {/* Current node */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, opacity: loading ? 0.5 : 1 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: '#4a90d9', flexShrink: 0,
          boxShadow: '0 0 4px #4a90d9',
        }} />
        <span style={{ fontSize: 12, color: '#e8f0fe', fontWeight: 700, flex: 1 }}>
          {currentNodeName}
        </span>
        <span style={{ fontSize: 10, color: '#4a6a8a' }}>(current)</span>
      </div>

      {/* Future steps */}
      {steps?.map((step, i) => (
        <div key={`${step.node_id}-${i}`} style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, opacity: loading ? 0.5 : 1,
        }}>
          <span style={{ fontSize: 10, color: '#2d4a6e', flexShrink: 0, width: 8 }}>→</span>
          {step.region && (
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: regionColor(step.region), flexShrink: 0,
            }} />
          )}
          <span style={{ fontSize: 11, color: '#8a9bb0', flex: 1 }}>
            {step.node_name}
          </span>
          <span style={{ fontSize: 10, color: '#4a6a8a', fontFamily: MONO }}>
            ~{expectedSecs}s
          </span>
        </div>
      ))}

      {steps && steps.length === 0 && (
        <div style={{ fontSize: 11, color: '#4a6a8a', fontStyle: 'italic' }}>
          No path predicted.
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 10, color: '#2d4a6e' }}>
        dwell estimate based on current slider values
      </div>
    </div>
  )
}

// ── DebugPanel (main export) ─────────────────────────────────────────────────

export default function DebugPanel({ sessionId, currentNodeId, currentNodeName }: DebugPanelProps) {
  const [open, setOpen] = useState(false)

  const {
    minDwellMs, dwellVarianceMs, fadeOutDuration, fadeInDuration,
    setMinDwellMs, setDwellVarianceMs, setFadeOutDuration, setFadeInDuration,
    wanderActive,
  } = usePlayback()

  const minSecs = Math.round(minDwellMs / 1000)
  const varSecs = Math.round(dwellVarianceMs / 1000)
  const rangeLo = minSecs
  const rangeHi = minSecs + varSecs

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
          {open ? '▾' : '▸'} Debug
        </span>
        <div style={{ height: 1, flex: 1, background: '#1a2a3a' }} />
        <span style={{ fontSize: 10, color: '#2d4a6e' }}>tuning &amp; lookahead</span>
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
              label="Min dwell"
              tooltip="Minimum time spent at each location before wander moves on. Actual dwell = min + random variance."
              value={minDwellMs / 1000}
              min={5} max={300} step={5}
              format={v => `${v}s`}
              onChange={v => setMinDwellMs(v * 1000)}
            />
            <SliderRow
              label="Variance"
              tooltip="Random extra time added to each dwell. Prevents wander feeling mechanical. Set to 0 for a fixed interval."
              value={dwellVarianceMs / 1000}
              min={0} max={120} step={5}
              format={v => `${v}s`}
              onChange={v => setDwellVarianceMs(v * 1000)}
            />
            <div style={{ fontSize: 10, color: '#2d4a6e', marginTop: 2 }}>
              → range: {rangeLo}s – {rangeHi}s
            </div>
          </div>

          {/* Transition sliders */}
          <div style={{ marginBottom: 20 }}>
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

          {/* Lookahead queue */}
          <LookaheadQueue
            sessionId={sessionId}
            currentNodeId={currentNodeId}
            currentNodeName={currentNodeName}
          />

        </div>
      )}
    </div>
  )
}
