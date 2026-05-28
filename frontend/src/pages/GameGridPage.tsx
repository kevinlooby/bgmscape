import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as gamesApi from '../api/games'
import type { GameListItem } from '../types'

const MONO = 'monospace'

export default function GameGridPage() {
  const navigate = useNavigate()
  const [games, setGames] = useState<GameListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    gamesApi.listGames()
      .then(g => { if (!cancelled) setGames(g) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load games') })
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: '100vh',
      background: '#0a1520', fontFamily: MONO, color: '#c8d8e8',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px',
        background: '#0f1923', borderBottom: '1px solid #2d4a6e',
      }}>
        <span style={{ color: '#4a90d9', fontWeight: 700, fontSize: 16 }}>bgmscape</span>
        <div style={{ width: 1, height: 16, background: '#2d4a6e' }} />
        <span style={{ color: '#4a6a8a', fontSize: 12 }}>game library</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => navigate('/ambient')}
          style={{
            padding: '6px 12px', borderRadius: 4,
            background: '#1e2a3a', color: '#8a9bb0',
            border: '1px solid #2d4a6e', cursor: 'pointer',
            fontFamily: MONO, fontSize: 12,
          }}
          title="Manage the global ambient (wind, water, fauna, …) sound library"
        >
          Ambient library
        </button>
      </div>

      {/* Body */}
      <div style={{
        flex: 1, padding: '52px 24px 40px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{ width: '100%', maxWidth: 960 }}>
          <div style={{
            fontSize: 11, color: '#4a6a8a', letterSpacing: 3,
            textTransform: 'uppercase', marginBottom: 14,
          }}>
            Choose a game
          </div>
          <div style={{ fontSize: 26, color: '#e8f0fe', fontWeight: 700, marginBottom: 32 }}>
            What would you like to listen to?
          </div>

          {error && (
            <div style={{ fontSize: 13, color: '#f87171', marginBottom: 20 }}>
              {error}
            </div>
          )}

          {games === null && !error && (
            <div style={{ fontSize: 12, color: '#4a6a8a' }}>loading…</div>
          )}

          {games && games.length === 0 && (
            <div style={{
              padding: 24, border: '1px dashed #2d4a6e', borderRadius: 6,
              color: '#4a6a8a', fontSize: 13, lineHeight: 1.6,
            }}>
              No games yet. Run <code style={{ color: '#90b8e8' }}>python scripts/load_audio.py</code> against
              a seed file (e.g. <code style={{ color: '#90b8e8' }}>data/oot_v2.bgmscape.json</code>) to
              import a game.
            </div>
          )}

          {games && games.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 16,
            }}>
              {games.map(g => (
                <GameCard key={g.id} game={g} onListen={() => navigate(`/listen/${g.slug}`)} onEdit={() => navigate(`/games/${g.slug}/edit`)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GameCard({ game, onListen, onEdit }: { game: GameListItem; onListen: () => void; onEdit: () => void }) {
  const hasDefault = game.default_graph_id !== null
  return (
    <div style={{
      background: '#0f1923', border: '1px solid #2d4a6e', borderRadius: 8,
      padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div>
        <div style={{ fontSize: 18, color: '#e8f0fe', fontWeight: 700, marginBottom: 4 }}>
          {game.name}
        </div>
        <div style={{ fontSize: 11, color: '#4a6a8a' }}>
          {game.graph_count} {game.graph_count === 1 ? 'graph' : 'graphs'}
          {!hasDefault && ' · no default set'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <button
          onClick={onListen}
          disabled={!hasDefault}
          title={hasDefault ? 'Open the listener with this game\'s default graph' : 'Set a default graph in the editor first'}
          style={{
            flex: 1,
            padding: '8px 12px', borderRadius: 4,
            background: hasDefault ? '#1e4a8a' : '#1a2a3a',
            color: hasDefault ? '#90b8e8' : '#4a6a8a',
            border: `1px solid ${hasDefault ? '#4a90d9' : '#2d4a6e'}`,
            cursor: hasDefault ? 'pointer' : 'not-allowed',
            fontFamily: MONO, fontSize: 13, fontWeight: 700,
          }}
        >
          ▶ Listen
        </button>
        <button
          onClick={onEdit}
          style={{
            padding: '8px 12px', borderRadius: 4,
            background: '#1e2a3a', color: '#8a9bb0',
            border: '1px solid #2d4a6e', cursor: 'pointer',
            fontFamily: MONO, fontSize: 13,
          }}
        >
          ✎ Edit
        </button>
      </div>
    </div>
  )
}
