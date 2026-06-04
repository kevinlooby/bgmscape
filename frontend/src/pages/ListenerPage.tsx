import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Pencil, Play, Settings, Volume2 } from 'lucide-react'
import { usePlayback } from '../store/playback'
import * as gamesApi from '../api/games'
import ListenerGraphView from '../components/listener/ListenerGraphView'
import LookaheadQueue from '../components/listener/LookaheadQueue'
import { NowPlayingCard } from '../components/listener/NowPlayingCard'
import { PlaybackControls } from '../components/listener/PlaybackControls'
import { AtmosphereCard } from '../components/listener/AtmosphereCard'
import { SteerCard } from '../components/listener/SteerCard'
import { TrailCard } from '../components/listener/TrailCard'
import { TeleportButton } from '../components/listener/TeleportModal'
import { CountdownBar } from '../components/listener/CountdownBar'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { CollapsiblePanel } from '@/ui/CollapsiblePanel'
import { IconButton, iconSize } from '@/ui/IconButton'
import { PageHeader } from '@/ui/PageHeader'
import { breakpoint, color, font, fontSize, space, weight } from '@/ui/tokens'
import { useMediaQuery } from '../hooks/useMediaQuery'
import type { Game, Node } from '../types'

export default function ListenerPage() {
  const { gameSlug, graphId: directGraphId } = useParams<{ gameSlug?: string; graphId?: string }>()
  const navigate = useNavigate()

  const {
    sessionId, graph, currentNode, playing, wanderActive, transitioning, nominatedNextNodeId,
    wanderHistory,
    startSession, advance, setPlaying, setWanderActive, steerTo, teleportTo, reset, setVolume,
  } = usePlayback()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [volume, setVolumeLocal] = useState(1)
  const [game, setGame] = useState<Game | null>(null)

  const isWide = useMediaQuery(`(min-width: ${breakpoint.wide}px)`)

  // Tear down on unmount so audio stops and state clears when leaving.
  useEffect(() => () => { reset() }, [reset])

  // Resolve route → graphId.
  // /listen/:gameSlug      → fetch game, use its default_graph_id
  // /listen/graph/:graphId → use graphId directly (game stays null)
  const [resolvedGraphId, setResolvedGraphId] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setResolveError(null)
    setResolvedGraphId(null)
    setGame(null)

    if (directGraphId) {
      setResolvedGraphId(directGraphId)
      return
    }
    if (!gameSlug) return

    gamesApi.getGameBySlug(gameSlug)
      .then(g => {
        if (cancelled) return
        setGame(g)
        if (g.default_graph_id) {
          setResolvedGraphId(g.default_graph_id)
        } else {
          setResolveError(`The game "${g.name}" has no default graph yet. Set one in the editor.`)
        }
      })
      .catch(e => {
        if (cancelled) return
        setResolveError(e instanceof Error ? e.message : 'Failed to load game')
      })

    return () => { cancelled = true }
  }, [gameSlug, directGraphId])

  const handleStart = async () => {
    if (!resolvedGraphId) return
    setLoading(true)
    setError(null)
    try {
      await startSession(resolvedGraphId)
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

  const allOtherNodes = useMemo(
    () => graph?.nodes.filter(n => n.id !== currentNode?.id) ?? [],
    [graph, currentNode]
  )

  const audioFileName = currentNode?.audio_file_path?.split('/').pop() ?? null
  const nominatedNode = graph?.nodes.find(n => n.id === nominatedNextNodeId) ?? null
  const headerSubtitle = game?.name ?? graph?.name ?? undefined
  const editHref = game ? `/games/${game.slug}/edit` : null

  // ── Header (shared between splash and now-playing) ────────────────────────

  const header = (showVolume: boolean) => (
    <PageHeader title="bgmscape" subtitle={headerSubtitle}>
      {showVolume && (
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: space.sm,
          color: color.textFaint, fontFamily: font.sans, fontSize: fontSize.sm,
        }}>
          <Volume2 size={14} />
          <input
            type="range" min={0} max={1} step={0.05} value={volume}
            onChange={handleVolume}
            style={{ width: 88, cursor: 'pointer', accentColor: color.accent }}
            aria-label="Volume"
          />
        </label>
      )}

      <IconButton
        aria-label="Settings"
        size="md"
        variant="secondary"
        onClick={() => navigate('/settings')}
      >
        <Settings size={iconSize.md} />
      </IconButton>

      {editHref && (
        <Button
          variant="secondary"
          size="sm"
          leading={<Pencil size={14} />}
          onClick={() => navigate(editHref)}
        >
          Edit
        </Button>
      )}
    </PageHeader>
  )

  // ── Splash (no session yet) ───────────────────────────────────────────────

  if (!sessionId) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', minHeight: '100vh', background: color.bg,
      }}>
        {header(false)}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: space.xl, padding: space.xl,
        }}>
          <div style={{
            fontFamily: font.sans, fontSize: fontSize.xs, color: color.textDim,
            letterSpacing: '0.3em', textTransform: 'uppercase',
          }}>
            bgmscape
          </div>
          <h1 style={{
            margin: 0,
            fontFamily: font.sans, fontSize: fontSize.hero, color: color.textPrimary,
            fontWeight: weight.bold, textAlign: 'center', lineHeight: 1.15,
            letterSpacing: '-0.02em',
          }}>
            {game ? `Ready to listen to ${game.name}?` : 'Ready to listen?'}
          </h1>

          {resolveError && (
            <div style={{ maxWidth: 480, textAlign: 'center' }}>
              <div style={{
                fontFamily: font.sans, fontSize: fontSize.md, color: color.danger,
                marginBottom: space.md,
              }}>
                {resolveError}
              </div>
              {gameSlug && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => navigate(`/games/${gameSlug}/edit`)}
                >
                  Open editor →
                </Button>
              )}
            </div>
          )}

          {error && (
            <div style={{
              fontFamily: font.sans, fontSize: fontSize.md, color: color.danger,
              maxWidth: 360, textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          {!resolveError && (
            <Button
              variant="primary"
              size="lg"
              disabled={loading || !resolvedGraphId}
              leading={<Play size={iconSize.lg} fill="currentColor" />}
              onClick={handleStart}
              style={{ padding: `${space.md}px ${space.xxl}px` }}
            >
              {loading ? 'Starting…' : !resolvedGraphId ? 'Loading…' : 'Start listening'}
            </Button>
          )}
        </div>
      </div>
    )
  }

  // ── Now-playing flow ──────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: '100vh', background: color.bg,
    }}>
      {header(true)}

      <div style={{
        flex: 1,
        maxWidth: 1400,
        width: '100%',
        margin: '0 auto',
        padding: `${space.xl}px ${space.lg}px ${space.xxl}px`,
        display: 'grid',
        gridTemplateColumns: isWide ? 'minmax(0, 0.85fr) minmax(0, 1.15fr)' : 'minmax(0, 1fr)',
        gap: space.xl,
        alignItems: 'start',
      }}>
        {/* ── Left column ─ "Playing & controls" ──────────────────────────── */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: space.lg,
          // Sticky on wide screens so controls stay accessible while the world
          // column scrolls. `top` accounts for header height + breathing room.
          position: isWide ? 'sticky' : 'static',
          top: isWide ? space.xl : undefined,
        }}>
          <NowPlayingCard
            nodeName={currentNode?.name ?? null}
            region={currentNode?.region ?? null}
            transitioning={transitioning}
            nominatedName={nominatedNode?.name ?? null}
          />

          {audioFileName && (
            <div style={{
              fontFamily: font.mono,
              fontSize: fontSize.xs,
              color: color.textDim,
              textAlign: 'center',
              wordBreak: 'break-all',
            }}>
              ♪ {audioFileName}
            </div>
          )}

          <CountdownBar />

          <PlaybackControls
            playing={playing}
            wanderActive={wanderActive}
            transitioning={transitioning}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onSkip={() => advance()}
            onToggleWander={() => setWanderActive(!wanderActive)}
          />

          <AtmosphereCard />

          <SteerCard
            neighbors={neighbors}
            nominatedNextNodeId={nominatedNextNodeId}
            wanderActive={wanderActive}
            onSteer={steerTo}
          />

          <TrailCard
            wanderHistory={wanderHistory}
            nodes={graph?.nodes ?? []}
            currentNode={currentNode}
          />
        </div>

        {/* ── Right column ─ "World" ──────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
          {graph && currentNode && <ListenerGraphView />}

          {sessionId && currentNode && (
            <CollapsiblePanel
              title="Up next"
              storageKey="listener-lookahead"
              defaultOpen={false}
            >
              <LookaheadQueue
                sessionId={sessionId}
                currentNodeId={currentNode.id}
                currentNodeName={currentNode.name}
              />
            </CollapsiblePanel>
          )}

          {/* Teleport button — lives alongside the graph, since picking a
              destination is a 'where in the world' action. */}
          <Card variant="subtle" padding={space.md}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
              <TeleportButton
                nodes={allOtherNodes}
                transitioning={transitioning}
                onTeleport={teleportTo}
              />
              <span style={{
                fontFamily: font.sans, fontSize: fontSize.xs, color: color.textFaint,
              }}>
                Jump anywhere on the map, immediately.
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
