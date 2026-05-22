import { useState, useEffect } from 'react'
import { useEditor } from '../../store/editor'
import type { Edge } from '../../types'

interface Props {
  edge: Edge
}

const s = {
  section: { marginBottom: 16 } as React.CSSProperties,
  label: { display: 'block', fontSize: 11, color: '#8a9bb0', marginBottom: 4, fontFamily: 'monospace' } as React.CSSProperties,
  input: { width: '100%', background: '#1e2a3a', border: '1px solid #2d4a6e', borderRadius: 4, color: '#e8f0fe', padding: '5px 8px', fontSize: 13, boxSizing: 'border-box' } as React.CSSProperties,
  helper: { color: '#8a9bb0', fontSize: 10, marginTop: 3 } as React.CSSProperties,
  btn: { padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'monospace' } as React.CSSProperties,
  danger: { background: '#8b1a1a', color: '#f8c0c0' } as React.CSSProperties,
  toggle: (on: boolean) => ({
    padding: '5px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12,
    background: on ? '#1a4a2e' : '#2d1a1a', color: on ? '#4caf50' : '#e53935',
    fontFamily: 'monospace',
  } as React.CSSProperties),
}

export default function EdgePanel({ edge }: Props) {
  const { updateEdge, deleteEdge, selectEdge, graph } = useEditor()
  const [weight, setWeight] = useState(edge.weight)
  const [bidirectional, setBidirectional] = useState(edge.bidirectional)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setWeight(edge.weight)
    setBidirectional(edge.bidirectional)
    setConfirmDelete(false)
  }, [edge.id])

  const sourceName = graph?.nodes.find(n => n.id === edge.source_node_id)?.name ?? edge.source_node_id
  const targetName = graph?.nodes.find(n => n.id === edge.target_node_id)?.name ?? edge.target_node_id

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    await deleteEdge(edge.id)
    selectEdge(null)
  }

  const handleBiToggle = async () => {
    const next = !bidirectional
    setBidirectional(next)
    await updateEdge(edge.id, { bidirectional: next })
  }

  return (
    <div>
      <h3 style={{ color: '#e8f0fe', marginTop: 0, fontSize: 14, fontFamily: 'monospace' }}>Edge</h3>

      <div style={s.section}>
        <label style={s.label}>Connection</label>
        <div style={{ color: '#e8f0fe', fontSize: 13, fontFamily: 'monospace', padding: '6px 8px', background: '#1e2a3a', borderRadius: 4 }}>
          {sourceName} → {targetName}
        </div>
      </div>

      <div style={s.section}>
        <label style={s.label}>Weight</label>
        <input
          type="number" min={0.1} step={0.1}
          style={s.input}
          value={weight}
          onChange={e => setWeight(parseFloat(e.target.value) || 0.1)}
          onBlur={() => updateEdge(edge.id, { weight })}
        />
        <div style={s.helper}>Higher = more likely to traverse. Relative to sibling edges.</div>
      </div>

      <div style={s.section}>
        <label style={s.label}>Direction</label>
        <button style={s.toggle(bidirectional)} onClick={handleBiToggle}>
          {bidirectional ? '↔ Bidirectional' : '→ One-way'}
        </button>
        <div style={s.helper}>Bidirectional edges can be traversed in both directions.</div>
      </div>

      <div style={{ borderTop: '1px solid #2d4a6e', paddingTop: 12, marginTop: 8 }}>
        <button style={{ ...s.btn, ...s.danger }} onClick={handleDelete}>
          {confirmDelete ? 'Click again to confirm' : 'Delete Edge'}
        </button>
        {confirmDelete && (
          <button style={{ ...s.btn, marginLeft: 6, background: '#2d4a6e', color: '#8a9bb0' }} onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
