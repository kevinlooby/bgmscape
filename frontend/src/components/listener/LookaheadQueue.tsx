import { useCallback, useEffect, useRef, useState } from 'react'
import { lookaheadSession } from '../../api/sessions'
import { usePlayback } from '../../store/playback'
import type { LookaheadStep } from '../../types'

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

interface LookaheadQueueProps {
  sessionId: string
  currentNodeId: string
  currentNodeName: string
}

export default function LookaheadQueue({
  sessionId,
  currentNodeId,
  currentNodeName,
}: LookaheadQueueProps) {
  // Used only to visually flag upcoming steps that share the current
  // node's audio_file_path (those are the "same-track cluster" the dwell
  // scheduler treats as one continuous listening run).
  const currentAudio = usePlayback(s => s.currentNode?.audio_file_path ?? null)
  const [steps, setSteps] = useState<LookaheadStep[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchGenRef = useRef(0) // cancel stale fetches
  const prevNodeIdRef = useRef(currentNodeId)

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
      {/* The wrapping CollapsiblePanel provides the title + chevron, and the
       *  list auto-tops-up when it drops below 6 entries — so this component
       *  no longer needs its own header bar or refresh button.
       *
       *  If you ever need to surface the manual-refresh action again, pass it
       *  to CollapsiblePanel via `headerExtra` from the panel's call site. */}
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

      {/* Future steps. We mark a step as "continuing the same track" if its
       *  audio_file_path matches the immediately preceding item shown — the
       *  current node for step 0, or the previous step otherwise. The arrow
       *  glyph swaps from "→" (new track) to "♪" (still on the same track) so
       *  a 3-node castle cluster reads as one continuous listening run. */}
      {steps?.map((step, i) => {
        const prevAudio = i === 0 ? currentAudio : steps[i - 1].audio_file_path
        const continuesAudio = !!(step.audio_file_path && step.audio_file_path === prevAudio)
        return (
          <div key={`${step.node_id}-${i}`} style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, opacity: loading ? 0.5 : 1,
          }}>
            <span
              style={{ fontSize: 10, color: continuesAudio ? '#4a90d9' : '#2d4a6e', flexShrink: 0, width: 8 }}
              title={continuesAudio ? 'same track as above' : undefined}
            >
              {continuesAudio ? '♪' : '→'}
            </span>
            {step.region && (
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: regionColor(step.region), flexShrink: 0,
              }} />
            )}
            <span style={{ fontSize: 11, color: '#8a9bb0', flex: 1 }}>
              {step.node_name}
            </span>
          </div>
        )
      })}

      {steps && steps.length === 0 && (
        <div style={{ fontSize: 11, color: '#4a6a8a', fontStyle: 'italic' }}>
          No path predicted.
        </div>
      )}
    </div>
  )
}
