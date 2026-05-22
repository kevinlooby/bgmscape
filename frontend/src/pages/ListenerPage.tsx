import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePlayback } from '../store/playback'
import type { Node } from '../types'

const MONO = 'monospace'

export default function ListenerPage() {
  const { graphId } = useParams<{ graphId: string }>()
  const navigate = useNavigate()

  const {
    sessionId, graph, currentNode, wanderActive, transitioning, nominatedNextNodeId,
    wanderHistory,
    startSession, advance, setWanderActive, steerTo, teleportTo, reset, setVolume,
  } = usePlayback()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [volume, setVolumeLocal] = useState(1)
  const [showTeleport, setShowTeleport] = useState(false)

  // Fade out audio and clear state when leaving the page
  useEffect(() => () => { reset() }, [reset])

  const handleStart = async () => {
    if (!graphId) return
    setLoading(true)
    setError(null)
    try {
      await startSession(graphId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start session')
    } finally {
      setLoading(false)
    }
  }

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    setVolumeLocal(v)
    setVolume(v)
  }

  // Reachable neighbors from current node (for steering)
  const neighbors = useMemo((): Node[] => {
    if (!graph || !currentNode) return []
    const seen = new Set<string>()
    const result: Node[] = []
    for (const edge of graph.edges) {
      let nid: string | null = null
      if (edge.source_node_id === currentNode.id) nid = edge.target_node_id
      else if (edge.bidirectional && edge.target_node_id === currentNode.id) nid = edge.source_node_id
      if (nid && !seen.has(nid)) {
        const node = graph.nodes.find(n => n.id === nid)
        if (node) { seen.add(nid); result.push(node) }
      }
    }
    return result
  }, [graph, currentNode])

  // All nodes except the current one (for teleport)
  const allOtherNodes = useMemo(
    () => graph?.nodes.filter(n => n.id !== currentNode?.id) ?? [],
    [graph, currentNode]
  )

  const audioFileName = currentNode?.audio_file_path?.split('/').pop() ?? null
  const nominatedNode = graph?.nodes.find(n => n.id === nominatedNextNodeId)

  // ── Header (shared between splash and now-playing) ────────────────────────

  const header = (showVolume: boolean) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
      background: '#0f1923', borderBottom: '1px solid #2d4a6e', flexShrink: 0, fontSize: 12,
      fontFamily: MONO,
    }}>
      <span style={{ color: '#4a90d9', fontWeight: 700, fontSize: 14 }}>bgmscape</span>

      {graph && (
        <>
          <div style={{ width: 1, height: 16, background: '#2d4a6e' }} />
          <span style={{ color: '#4a6a8a' }}>{graph.game_title}</span>
        </>
      )}

      <div style={{ flex: 1 }} />

      {showVolume && (
        <label style={{ color: '#4a6a8a', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>vol</span>
          <input
            type="range" min={0} max={1} step={0.05} value={volume}
            onChange={handleVolume}
            style={{ width: 72, cursor: 'pointer', accentColor: '#4a90d9' }}
          />
        </label>
      )}

      <button
        onClick={() => navigate('/editor')}
        style={{
          background: 'none', border: '1px solid #2d4a6e', borderRadius: 4,
          color: '#8a9bb0', cursor: 'pointer', fontSize: 12, fontFamily: MONO, padding: '4px 10px',
        }}
      >
        ← Editor
      </button>
    </div>
  )

  // ── Render: splash ────────────────────────────────────────────────────────

  if (!sessionId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a1520', fontFamily: MONO }}>
        {header(false)}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 20,
        }}>
          <div style={{ fontSize: 11, color: '#4a6a8a', letterSpacing: 3, textTransform: 'uppercase' }}>
            bgmscape
          </div>
          <div style={{ fontSize: 34, color: '#e8f0fe', fontWeight: 700 }}>
            Ready to listen?
          </div>
          {error && (
            <div style={{ fontSize: 13, color: '#f87171', maxWidth: 360, textAlign: 'center' }}>
              {error}
            </div>
          )}
          <button
            onClick={handleStart}
            disabled={loading}
            style={{
              padding: '12px 36px', borderRadius: 6,
              background: loading ? '#1a2a3a' : '#1e4a8a',
              color: loading ? '#4a6a8a' : '#90b8e8',
              border: `2px solid ${loading ? '#2d4a6e' : '#4a90d9'}`,
              cursor: loading ? 'wait' : 'pointer',
              fontSize: 16, fontFamily: MONO, fontWeight: 700,
            }}
          >
            {loading ? 'Starting…' : '▶  Start Listening'}
          </button>
        </div>
      </div>
    )
  }

  // ── Render: now playing ───────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#0a1520', fontFamily: MONO, overflow: 'hidden',
    }}>
      {header(true)}

      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '52px 24px 40px', color: '#c8d8e8',
      }}>

        {/* ── Now-playing card ─────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <div style={{
            fontSize: 10, color: '#4a6a8a', letterSpacing: 4,
            textTransform: 'uppercase', marginBottom: 14,
          }}>
            Now Playing
          </div>

          <div style={{
            fontSize: 34, color: '#e8f0fe', fontWeight: 700,
            marginBottom: 8, maxWidth: 500, lineHeight: 1.2,
          }}>
            {currentNode?.name ?? '—'}
          </div>

          {currentNode?.region && (
            <div style={{ fontSize: 12, color: '#4a90d9', marginBottom: 6 }}>
              {currentNode.region}
            </div>
          )}

          <div style={{ fontSize: 11, color: '#4a6a8a', marginBottom: 14 }}>
            {audioFileName ? `♪  ${audioFileName}` : 'No audio assigned to this node'}
          </div>

          {/* Status badges */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', minHeight: 22 }}>
            {transitioning && (
              <span style={{
                fontSize: 11, color: '#4a90d9',
                background: '#0d2040', border: '1px solid #2d4a6e',
                borderRadius: 10, padding: '2px 12px',
              }}>
                ↝  crossfading…
              </span>
            )}
            {nominatedNode && !transitioning && (
              <span style={{
                fontSize: 11, color: '#90b8e8',
                background: '#0d2040', border: '1px solid #2a4870',
                borderRadius: 10, padding: '2px 12px',
              }}>
                → steering to {nominatedNode.name}
              </span>
            )}
          </div>
        </div>

        {/* ── Controls ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 44, alignItems: 'center' }}>
          {/* Wander toggle */}
          <button
            onClick={() => setWanderActive(!wanderActive)}
            disabled={transitioning}
            style={{
              padding: '9px 22px', borderRadius: 20, fontFamily: MONO, fontSize: 13, fontWeight: 700,
              border: `2px solid ${wanderActive ? '#4a90d9' : '#2d4a6e'}`,
              background: wanderActive ? '#1e4a8a' : '#1e2a3a',
              color: wanderActive ? '#90b8e8' : '#8a9bb0',
              cursor: transitioning ? 'not-allowed' : 'pointer',
              minWidth: 148, transition: 'background 0.15s, color 0.15s, border-color 0.15s',
            }}
          >
            {wanderActive ? '⟳  Wander ON' : '◼  Wander OFF'}
          </button>

          {/* Skip / manual advance */}
          <button
            onClick={() => advance()}
            disabled={transitioning}
            title="Advance to next location now"
            style={{
              padding: '9px 22px', borderRadius: 20, fontFamily: MONO, fontSize: 13,
              border: '1px solid #2d4a6e', background: '#1e2a3a',
              color: transitioning ? '#2d4a6e' : '#8a9bb0',
              cursor: transitioning ? 'not-allowed' : 'pointer',
            }}
          >
            ⏭  Skip
          </button>
        </div>

        {/* ── Wander trail ─────────────────────────────────────────────────── */}
        {wanderHistory.length > 1 && (
          <div style={{ width: '100%', maxWidth: 580, marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: '#4a6a8a', letterSpacing: 3, textTransform: 'uppercase', flexShrink: 0 }}>
                Trail
              </span>
              <div style={{ height: 1, flex: 1, background: '#1a2a3a' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: 11, color: '#4a6a8a', fontFamily: MONO }}>
              {wanderHistory.slice(-7).map((id, i, arr) => {
                const nodeName = graph?.nodes.find(n => n.id === id)?.name ?? id.slice(0, 8)
                const isLast = i === arr.length - 1
                return (
                  <span key={`${id}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: isLast ? '#8a9bb0' : '#2d4a6e' }}>{nodeName}</span>
                    {!isLast && <span style={{ color: '#1a2a3a' }}>→</span>}
                  </span>
                )
              })}
              <span style={{ color: '#2d4a6e' }}>→</span>
              <span style={{ color: '#90b8e8', fontWeight: 700 }}>{currentNode?.name}</span>
            </div>
          </div>
        )}

        {/* ── Steer ────────────────────────────────────────────────────────── */}
        {neighbors.length > 0 && (
          <div style={{ width: '100%', maxWidth: 580, marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{
                fontSize: 10, color: '#4a6a8a', letterSpacing: 3,
                textTransform: 'uppercase', flexShrink: 0,
              }}>
                Steer
              </span>
              <div style={{ height: 1, flex: 1, background: '#1a2a3a' }} />
              <span style={{ fontSize: 10, color: '#2d4a6e' }}>queue next destination</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {neighbors.map(n => {
                const isNominated = n.id === nominatedNextNodeId
                return (
                  <button
                    key={n.id}
                    onClick={() => steerTo(n.id)}
                    style={{
                      padding: '5px 14px', borderRadius: 4, fontFamily: MONO, fontSize: 12,
                      border: `1px solid ${isNominated ? '#4a90d9' : '#2d4a6e'}`,
                      background: isNominated ? '#1e4a8a' : '#1e2a3a',
                      color: isNominated ? '#90b8e8' : '#8a9bb0',
                      cursor: 'pointer',
                    }}
                  >
                    {isNominated ? '→ ' : ''}{n.name}
                  </button>
                )
              })}
            </div>

            {nominatedNextNodeId && (
              <div style={{ fontSize: 10, color: '#4a6a8a', marginTop: 7 }}>
                {wanderActive
                  ? 'Will play at the next wander step — or click Skip ⏭ to advance now'
                  : 'Click Skip ⏭ to advance now'}
              </div>
            )}
          </div>
        )}

        {/* ── Teleport ─────────────────────────────────────────────────────── */}
        <div style={{ width: '100%', maxWidth: 580 }}>
          <div
            onClick={() => setShowTeleport(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer' }}
          >
            <span style={{
              fontSize: 10, color: '#4a6a8a', letterSpacing: 3,
              textTransform: 'uppercase', flexShrink: 0,
            }}>
              {showTeleport ? '▾' : '▸'} Teleport
            </span>
            <div style={{ height: 1, flex: 1, background: '#1a2a3a' }} />
            <span style={{ fontSize: 10, color: '#2d4a6e' }}>jump anywhere immediately</span>
          </div>

          {showTeleport && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allOtherNodes.map(n => (
                <button
                  key={n.id}
                  onClick={() => !transitioning && teleportTo(n.id)}
                  disabled={transitioning}
                  style={{
                    padding: '5px 14px', borderRadius: 4, fontFamily: MONO, fontSize: 12,
                    border: '1px solid #2d4a6e', background: '#1e2a3a',
                    color: transitioning ? '#2d4a6e' : '#8a9bb0',
                    cursor: transitioning ? 'not-allowed' : 'pointer',
                  }}
                >
                  ⚡  {n.name}
                </button>
              ))}
              {allOtherNodes.length === 0 && (
                <span style={{ fontSize: 12, color: '#4a6a8a' }}>
                  No other locations in this graph yet.
                </span>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
