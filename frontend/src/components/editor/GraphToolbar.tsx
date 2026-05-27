import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEditor } from '../../store/editor'
import { exportGraph, importGraph } from '../../api/graphs'

interface Props {
  view: 'diagram' | 'list'
  onViewChange: (v: 'diagram' | 'list') => void
}

const s = {
  bar: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
    background: '#0f1923', borderBottom: '1px solid #2d4a6e',
    fontFamily: 'monospace', fontSize: 12, flexShrink: 0,
  } as React.CSSProperties,
  select: {
    background: '#1e2a3a', border: '1px solid #2d4a6e', borderRadius: 4,
    color: '#e8f0fe', padding: '5px 8px', fontSize: 12, fontFamily: 'monospace',
    minWidth: 180,
  } as React.CSSProperties,
  input: {
    background: '#1e2a3a', border: '1px solid #2d4a6e', borderRadius: 4,
    color: '#e8f0fe', padding: '4px 8px', fontSize: 12, fontFamily: 'monospace',
  } as React.CSSProperties,
  btn: (active?: boolean) => ({
    padding: '5px 12px', borderRadius: 4, border: `1px solid ${active ? '#4a90d9' : '#2d4a6e'}`,
    cursor: 'pointer', fontSize: 12, fontFamily: 'monospace',
    background: active ? '#1e4a8a' : '#1e2a3a',
    color: active ? '#90b8e8' : '#8a9bb0',
  } as React.CSSProperties),
  sep: { width: 1, height: 20, background: '#2d4a6e', flexShrink: 0 } as React.CSSProperties,
  title: { color: '#4a90d9', fontWeight: 700, fontSize: 14, marginRight: 8, cursor: 'pointer' } as React.CSSProperties,
}

export default function GraphToolbar({ view, onViewChange }: Props) {
  const {
    game, graphs, activeGraphId, graph, saving,
    loadGraph, createGraph, updateGraph, deleteActiveGraph, setActiveAsDefault, reloadGame,
  } = useEditor()
  const navigate = useNavigate()
  const importRef = useRef<HTMLInputElement>(null)

  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Inline graph metadata editing
  const [editingMeta, setEditingMeta] = useState(false)
  const [metaName, setMetaName] = useState('')

  const isDefault = !!(game && activeGraphId && game.default_graph_id === activeGraphId)

  const handleGraphSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    if (id) loadGraph(id)
    setEditingMeta(false)
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    await createGraph(newName.trim())
    setShowNew(false)
    setNewName('')
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    await deleteActiveGraph()
    setConfirmDelete(false)
    setEditingMeta(false)
  }

  const startEditMeta = () => {
    if (!graph) return
    setMetaName(graph.name)
    setEditingMeta(true)
    setShowNew(false)
  }

  const saveMeta = async () => {
    const updates: { name?: string } = {}
    if (metaName.trim() && metaName.trim() !== graph?.name) updates.name = metaName.trim()
    if (Object.keys(updates).length > 0) await updateGraph(updates)
    setEditingMeta(false)
  }

  const handleSetDefault = async () => {
    await setActiveAsDefault()
  }

  const handleExport = async () => {
    if (!activeGraphId) return
    try {
      const data = await exportGraph(activeGraphId)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${data.name.replace(/\s+/g, '_')}.bgmscape.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export failed', e)
    }
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const imported = await importGraph(data)
      // The import may have created a new game if the slug didn't match — reload
      // the current game and select the imported graph if it belongs here.
      await reloadGame()
      await loadGraph(imported.id)
    } catch (err) {
      console.error('Import failed', err)
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  return (
    <div>
      <div style={s.bar}>
        <span style={s.title} onClick={() => navigate('/')} title="Back to game library">bgmscape</span>
        <button
          onClick={() => navigate('/')}
          style={{ ...s.btn(), padding: '5px 10px' }}
          title="Back to game library"
        >
          ← Games
        </button>
        <div style={s.sep} />

        <span style={{ color: '#90b8e8', fontWeight: 700 }}>{game?.name ?? '—'}</span>
        <div style={s.sep} />

        {/* Graph selector */}
        <select style={s.select} value={activeGraphId ?? ''} onChange={handleGraphSelect}>
          <option value="">— select graph —</option>
          {graphs.map(g => {
            const star = game?.default_graph_id === g.id ? ' ★' : ''
            return <option key={g.id} value={g.id}>{g.name} ({g.node_count} nodes){star}</option>
          })}
        </select>

        <button style={s.btn()} onClick={() => { setShowNew(v => !v); setConfirmDelete(false); setEditingMeta(false) }}>
          {showNew ? '✕ Cancel' : '+ New Graph'}
        </button>

        {activeGraphId && !editingMeta && (
          <button style={s.btn()} onClick={startEditMeta} title="Rename this graph">
            ✎ Rename
          </button>
        )}

        {activeGraphId && (
          <button
            style={{
              ...s.btn(isDefault),
              color: isDefault ? '#90b8e8' : '#8a9bb0',
              cursor: isDefault ? 'default' : 'pointer',
            }}
            onClick={isDefault ? undefined : handleSetDefault}
            disabled={isDefault}
            title={isDefault ? 'This is the default graph for this game' : 'Make this the default graph for this game'}
          >
            {isDefault ? '★ Default' : '☆ Set as default'}
          </button>
        )}

        {activeGraphId && (
          <button
            style={{ ...s.btn(), color: confirmDelete ? '#f8c0c0' : '#8a9bb0', borderColor: confirmDelete ? '#8b1a1a' : '#2d4a6e' }}
            onClick={handleDelete}
          >
            {confirmDelete ? 'Confirm Delete' : 'Delete Graph'}
          </button>
        )}

        <div style={s.sep} />

        {/* Export / Import */}
        {activeGraphId && (
          <button style={s.btn()} onClick={handleExport} title="Export graph as JSON">
            ↓ Export
          </button>
        )}
        <button style={s.btn()} onClick={() => importRef.current?.click()} title="Import graph from JSON">
          ↑ Import
        </button>
        <input
          ref={importRef} type="file" accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />

        <div style={s.sep} />

        {/* View toggle */}
        <button style={s.btn(view === 'diagram')} onClick={() => onViewChange('diagram')}>Diagram</button>
        <button style={s.btn(view === 'list')} onClick={() => onViewChange('list')}>List</button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {saving && (
            <span style={{ fontSize: 11, color: '#4a90d9', fontFamily: 'monospace' }}>saving…</span>
          )}

          {activeGraphId && (
            <button
              style={{ ...s.btn(), color: '#4caf50', borderColor: '#1a4a2e' }}
              onClick={() => navigate(`/listen/graph/${activeGraphId}`)}
              title="Listen to this specific graph (not the game's default)"
            >
              ▶ Listen
            </button>
          )}
        </div>
      </div>

      {/* New graph form */}
      {showNew && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px', background: '#0f1923', borderBottom: '1px solid #2d4a6e', fontFamily: 'monospace' }}>
          <input
            style={{ ...s.select, minWidth: 200 }}
            placeholder={`Graph name (e.g. ${game?.name ?? ''} v3)`}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <button style={s.btn(true)} onClick={handleCreate} disabled={!newName.trim()}>
            Create
          </button>
        </div>
      )}

      {/* Rename form */}
      {editingMeta && graph && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px', background: '#0f1923', borderBottom: '1px solid #2d4a6e', fontFamily: 'monospace', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#4a6a8a', flexShrink: 0 }}>Graph name:</span>
          <input
            style={{ ...s.input, minWidth: 200 }}
            value={metaName}
            onChange={e => setMetaName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveMeta(); if (e.key === 'Escape') setEditingMeta(false) }}
            autoFocus
          />
          <button style={s.btn(true)} onClick={saveMeta} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button style={s.btn()} onClick={() => setEditingMeta(false)}>Cancel</button>
        </div>
      )}
    </div>
  )
}
