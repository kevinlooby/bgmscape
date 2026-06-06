import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { CloudFog, Loader2, Map, Music, Network, Pencil, Settings } from 'lucide-react'
import { usePlayback } from '../store/playback'
import * as gamesApi from '../api/games'
import ListenerGraphView from '../components/listener/ListenerGraphView'
import WorldSimulation from '../components/listener/WorldSimulation'
import { NowPlayingCard } from '../components/listener/NowPlayingCard'
import { PlaybackControls } from '../components/listener/PlaybackControls'
import { AtmosphereCard } from '../components/listener/AtmosphereCard'
import { SteerCard } from '../components/listener/SteerCard'
import { TrailCard } from '../components/listener/TrailCard'
import { TeleportIconButton } from '../components/listener/TeleportModal'
import { UpNextIconButton } from '../components/listener/UpNextModal'
import { CountdownBar } from '../components/listener/CountdownBar'
import { Button } from '@/ui/Button'
import { IconButton, iconSize } from '@/ui/IconButton'
import { PageHeader } from '@/ui/PageHeader'
import { breakpoint, color, font, fontSize, space } from '@/ui/tokens'
import { useMediaQuery } from '../hooks/useMediaQuery'
import type { Game, Node } from '../types'

export default function ListenerPage() {
  const { gameSlug, graphId: directGraphId } = useParams<{ gameSlug?: string; graphId?: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Right-column view selection: graph by default, pixel-art world when
  // ?world=1 is set. Toggle button in the header flips it. URL-only for now
  // so a bookmark like /listen/oot?world=1 sticks; once the world view is
  // mature enough to be the default we'll flip this default and the toggle
  // direction swaps accordingly.
  const worldEnabled = searchParams.get('world') === '1'

  const toggleWorldView = () => {
    const next = new URLSearchParams(searchParams)
    if (worldEnabled) next.delete('world')
    else next.set('world', '1')
    // replace:true — toggling a view shouldn't pile up browser history
    // entries that the back button has to step through.
    setSearchParams(next, { replace: true })
  }

  const {
    sessionId, graph, currentNode, playing, wanderActive, transitioning, nominatedNextNodeId,
    wanderHistory, musicVolume, ambientBusVolume,
    startSession, advance, setPlaying, setWanderActive, steerTo, teleportTo, reset,
    setMusicVolume, setAmbientBusVolume,
  } = usePlayback()

  const [error, setError] = useState<string | null>(null)
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

  // Auto-start the session once we know which graph to play. Replaces the
  // old "Ready to listen?" splash — that was an unnecessary click.
  //
  // The ref keeps StrictMode (and any other re-render-induced effect re-runs)
  // from double-firing startSession during the brief window when sessionId is
  // still null. We track *which* graphId we already started so switching games
  // without unmounting (e.g. URL change /listen/oot → /listen/sm64) still
  // triggers a fresh start.
  //
  // Audio doesn't actually play until the user interacts — App.tsx installs a
  // click/keydown handler that resumes the AudioContext on first input — so
  // browser autoplay policies are respected even though we kick off the
  // session without user input.
  const startedForGraphRef = useRef<string | null>(null)
  useEffect(() => {
    if (resolveError || !resolvedGraphId) return
    if (sessionId) return
    if (startedForGraphRef.current === resolvedGraphId) return
    startedForGraphRef.current = resolvedGraphId
    setError(null)
    startSession(resolvedGraphId).catch(e => {
      setError(e instanceof Error ? e.message : 'Failed to start session')
    })
  }, [resolvedGraphId, sessionId, resolveError, startSession])

  const handleMusicVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMusicVolume(parseFloat(e.target.value))
  }
  const handleAmbientVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmbientBusVolume(parseFloat(e.target.value))
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

  // ── Header ────────────────────────────────────────────────────────────────

  const header = (
    <PageHeader title="bgmscape" subtitle={headerSubtitle}>
      {/* Music + ambient volume sliders. The two buses are independent (see
       *  AudioManager): music routes through musicBus, ambient through
       *  ambientBus, and both feed masterGain. Pulling one to zero leaves the
       *  other audible. The Settings page surfaces the same two values. */}
      {sessionId && (
        <>
          <label
            title="Music volume"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: space.sm,
              color: color.textFaint, fontFamily: font.sans, fontSize: fontSize.sm,
            }}
          >
            <Music size={14} />
            <input
              type="range" min={0} max={1} step={0.05} value={musicVolume}
              onChange={handleMusicVolume}
              style={{ width: 88, cursor: 'pointer', accentColor: color.accent }}
              aria-label="Music volume"
            />
          </label>
          <label
            title="Ambient volume"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: space.sm,
              color: color.textFaint, fontFamily: font.sans, fontSize: fontSize.sm,
            }}
          >
            <CloudFog size={14} />
            <input
              type="range" min={0} max={1} step={0.05} value={ambientBusVolume}
              onChange={handleAmbientVolume}
              style={{ width: 88, cursor: 'pointer', accentColor: color.accent }}
              aria-label="Ambient volume"
            />
          </label>
        </>
      )}

      {/* "What's coming next" — read-only peek at the upcoming queue. */}
      <UpNextIconButton
        sessionId={sessionId}
        currentNodeId={currentNode?.id ?? null}
        currentNodeName={currentNode?.name ?? null}
      />

      {/* Jump-to-anywhere modal. */}
      {sessionId && (
        <TeleportIconButton
          nodes={allOtherNodes}
          transitioning={transitioning}
          onTeleport={teleportTo}
        />
      )}

      {/* View toggle: graph ⇄ pixel-art world. Icon shows the *destination*
          (the view you'd flip to) so the action reads "switch to map" or
          "switch to graph" at a glance. */}
      <IconButton
        aria-label={worldEnabled ? 'Switch to graph view' : 'Switch to world view'}
        title={worldEnabled ? 'Switch to graph view' : 'Switch to world view'}
        size="md"
        variant="secondary"
        onClick={toggleWorldView}
      >
        {worldEnabled
          ? <Network size={iconSize.md} />
          : <Map size={iconSize.md} />}
      </IconButton>

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

  // ── Error fallback (bad slug, no default graph, etc.) ────────────────────

  if (resolveError) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', minHeight: '100vh', background: color.bg,
      }}>
        {header}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl,
        }}>
          <div style={{
            maxWidth: 480, textAlign: 'center',
            fontFamily: font.sans, fontSize: fontSize.md, color: color.danger,
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
      </div>
    )
  }

  // ── Loading state (between mount and first node arriving) ───────────────
  //
  // Replaces the old splash. Shows a small spinner + "Starting session…" so
  // there's *something* on screen while resolvedGraphId loads and startSession
  // sets up the first node. Usually visible for a few hundred milliseconds.
  // Once both sessionId and currentNode are set, the full layout takes over.

  if (!sessionId || !currentNode) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', minHeight: '100vh', background: color.bg,
      }}>
        {header}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl,
        }}>
          {error ? (
            <div style={{
              fontFamily: font.sans, fontSize: fontSize.md, color: color.danger,
              maxWidth: 480, textAlign: 'center',
            }}>
              {error}
            </div>
          ) : (
            <>
              <Loader2
                size={28}
                color={color.textMuted}
                style={{ animation: 'spin 1s linear infinite' }}
              />
              <div style={{
                fontFamily: font.sans, fontSize: fontSize.sm, color: color.textMuted,
              }}>
                Starting session…
              </div>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </>
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
      {header}

      <div style={{
        flex: 1,
        maxWidth: 1400,
        width: '100%',
        margin: '0 auto',
        padding: `${space.xl}px ${space.lg}px ${space.xxl}px`,
        display: 'grid',
        // After moving Up Next + Teleport to the header, the right column
        // holds just the graph — give it more horizontal room to breathe.
        gridTemplateColumns: isWide ? 'minmax(0, 0.7fr) minmax(0, 1.3fr)' : 'minmax(0, 1fr)',
        gap: space.xl,
        alignItems: 'start',
      }}>
        {/* ── Left column ─ "Playing & controls" ──────────────────────────── */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: space.lg,
          position: isWide ? 'sticky' : 'static',
          top: isWide ? space.xl : undefined,
        }}>
          <NowPlayingCard
            nodeName={currentNode.name}
            region={currentNode.region}
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
          {graph && (worldEnabled ? <WorldSimulation /> : <ListenerGraphView />)}
        </div>
      </div>
    </div>
  )
}
