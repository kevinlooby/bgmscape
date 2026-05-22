import { useEffect, useRef, useState } from 'react'
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
  title: { color: '#4a90d9', fontWeight: 700, fontSize: 14, marginRight: 8 } as React.CSSProperties,
}

export default function GraphToolbar({ view, onViewChange }: Props) {
  const { graphs, activeGraphId, graph, saving, loadGraphList, loadGraph, createGraph, updateGraph, deleteActiveGraph } = useEditor()
  const navigate = useNavigate()
  const importRef = useRef<HTMLInputElement>(null)

  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Inline graph metadata editing
  const [editingMeta, setEditingMeta] = useState(false)
  const [metaName, setMetaName] = useState('')
  const [metaTitle, setMetaTitle] = useState('')

  useEffect(() => { loadGraphList() }, [])

  const handleGraphSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    if (id) loadGraph(id)
    setEditingMeta(false)
  }

  const handleCreate = async () => {
    if (!newName.trim() || !newTitle.trim()) return
    await createGraph(newName.trim(), newTitle.trim())
    setShowNew(false)
    setNewName('')
    setNewTitle('')
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
    setMetaTitle(graph.game_title)
    setEditingMeta(true)
    setShowNew(false)
  }

  const saveMeta = async () => {
    const updates: { name?: string; game_title?: string } = {}
    if (metaName.trim() && metaName.trim() !== graph?.name) updates.name = metaName.trim()
    if (metaTitle.trim() && metaTitle.trim() !== graph?.game_title) updates.game_title = metaTitle.trim()
    if (Object.keys(updates).length > 0) await updateGraph(updates)
    setEditingMeta(false)
  }

  // Export current graph as JSON download
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

  // Import a graph JSON file
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const imported = await importGraph(data)
      // Reload the list and switch to the imported graph
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
        <span style={s.title}>bgmscape</span>
        <div style={s.sep} />

        {/* Graph selector */}
        <select style={s.select} value={activeGraphId ?? ''} onChange={handleGraphSelect}>
          <option value="">— select graph —</option>
          {graphs.map(g => (
            <option key={g.id} value={g.id}>{g.name} ({g.node_count} nodes)</option>
          ))}
        </select>

        <button style={s.btn()} onClick={() => { setShowNew(v => !v); setConfirmDelete(false); setEditingMeta(false) }}>
          {showNew ? '✕ Cancel' : '+ New Graph'}
        </button>

        {activeGraphId && !editingMeta && (
          <button style={s.btn()} onClick={startEditMeta} title="Edit graph name / game title">
            ✎ Edit
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
          {/* Saving indicator */}
          {saving && (
            <span style={{ fontSize: 11, color: '#4a90d9', fontFamily: 'monospace' }}>saving…</span>
          )}

          {activeGraphId && (
            <button
              style={{ ...s.btn(), color: '#4caf50', borderColor: '#1a4a2e' }}
              onClick={() => navigate(`/listen/${activeGraphId}`)}
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
            style={{ ...s.select, minWidth: 160 }}
            placeholder="Graph name (e.g. Ocarina of Time)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            autoFocus
          />
          <input
            style={{ ...s.select, minWidth: 200 }}
            placeholder="Game title (e.g. The Legend of Zelda: OOT)"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <button style={s.btn(true)} onClick={handleCreate} disabled={!newName.trim() || !newTitle.trim()}>
            Create
          </button>
        </div>
      )}

      {/* Edit graph metadata form */}
      {editingMeta && graph && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px', background: '#0f1923', borderBottom: '1px solid #2d4a6e', fontFamily: 'monospace', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#4a6a8a', flexShrink: 0 }}>Graph name:</span>
          <input
            style={{ ...s.input, minWidth: 160 }}
            value={metaName}
            onChange={e => setMetaName(e.target.value)}
            autoFocus
          />
          <span style={{ fontSize: 11, color: '#4a6a8a', flexShrink: 0 }}>Game title:</span>
          <input
            style={{ ...s.input, minWidth: 220 }}
            value={metaTitle}
            onChange={e => setMetaTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveMeta(); if (e.key === 'Escape') setEditingMeta(false) }}
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
