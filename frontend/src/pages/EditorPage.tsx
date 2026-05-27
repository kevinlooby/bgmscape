import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import GraphToolbar from '../components/editor/GraphToolbar'
import GraphCanvas from '../components/editor/GraphCanvas'
import FormView from '../components/editor/FormView'
import Sidebar from '../components/editor/Sidebar'
import { useEditor } from '../store/editor'

export default function EditorPage() {
  const { gameSlug } = useParams<{ gameSlug: string }>()
  const navigate = useNavigate()
  const [view, setView] = useState<'diagram' | 'list'>('diagram')
  const [loadError, setLoadError] = useState<string | null>(null)

  const { game, loadGameBySlug } = useEditor()

  useEffect(() => {
    if (!gameSlug) return
    setLoadError(null)
    loadGameBySlug(gameSlug).catch(e => {
      setLoadError(e instanceof Error ? e.message : 'Failed to load game')
    })
  }, [gameSlug])

  if (loadError) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', height: '100vh',
        background: '#0a1520', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'monospace', color: '#f87171', gap: 16, padding: 24,
      }}>
        <div style={{ fontSize: 14 }}>Could not load game "{gameSlug}":</div>
        <div style={{ fontSize: 12, color: '#8a9bb0' }}>{loadError}</div>
        <button
          onClick={() => navigate('/')}
          style={{ background: '#1e4a8a', color: '#90b8e8', border: '1px solid #4a90d9', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace' }}
        >
          ← Back to games
        </button>
      </div>
    )
  }

  if (!game) {
    return (
      <div style={{
        display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center',
        background: '#0a1520', color: '#4a6a8a', fontFamily: 'monospace', fontSize: 13,
      }}>
        loading…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a1520', overflow: 'hidden' }}>
      <GraphToolbar view={view} onViewChange={setView} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {view === 'diagram' ? <GraphCanvas /> : <FormView />}
        <Sidebar />
      </div>
    </div>
  )
}
