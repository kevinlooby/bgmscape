import { useState } from 'react'
import { useEditor } from '../../store/editor'
import type { Node, Edge } from '../../types'

const s = {
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12, fontFamily: 'monospace' },
  th: { background: '#1e2a3a', color: '#8a9bb0', padding: '6px 10px', textAlign: 'left' as const, borderBottom: '1px solid #2d4a6e' },
  td: { padding: '6px 10px', borderBottom: '1px solid #1a2a3a', color: '#c8d8e8', verticalAlign: 'middle' as const },
  input: { background: '#1e2a3a', border: '1px solid #2d4a6e', borderRadius: 3, color: '#e8f0fe', padding: '3px 6px', fontSize: 11, fontFamily: 'monospace', width: '100%', boxSizing: 'border-box' as const },
  btn: (variant: 'danger' | 'primary' | 'muted') => ({
    padding: '3px 8px', borderRadius: 3, border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace',
    background: variant === 'danger' ? '#8b1a1a' : variant === 'primary' ? '#1e4a8a' : '#1e2a3a',
    color: variant === 'danger' ? '#f8c0c0' : variant === 'primary' ? '#90b8e8' : '#8a9bb0',
  } as React.CSSProperties),
  dot: (has: boolean) => ({ width: 8, height: 8, borderRadius: '50%', background: has ? '#4caf50' : '#e53935', display: 'inline-block' }),
  heading: { color: '#e8f0fe', fontSize: 13, fontFamily: 'monospace', marginBottom: 8, marginTop: 0 } as React.CSSProperties,
}

function NodeRow({ node }: { node: Node }) {
  const { updateNode, deleteNode, selectNode } = useEditor()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(node.name)
  const [region, setRegion] = useState(node.region ?? '')
  const [stay, setStay] = useState(node.stay_probability)
  const [confirm, setConfirm] = useState(false)

  const save = () => {
    updateNode(node.id, { name, region: region || null, stay_probability: stay })
    setEditing(false)
  }

  if (editing) {
    return (
      <tr style={{ background: '#0f1923' }}>
        <td style={s.td}><input style={s.input} value={name} onChange={e => setName(e.target.value)} autoFocus /></td>
        <td style={s.td}><input style={s.input} value={region} placeholder="none" onChange={e => setRegion(e.target.value)} /></td>
        <td style={s.td}><input type="number" min={0} max={1} step={0.05} style={{ ...s.input, width: 60 }} value={stay} onChange={e => setStay(parseFloat(e.target.value))} /></td>
        <td style={s.td}><span style={s.dot(!!node.audio_file_path)} /></td>
        <td style={s.td}>
          <button style={s.btn('primary')} onClick={save}>Save</button>
          <button style={{ ...s.btn('muted'), marginLeft: 4 }} onClick={() => setEditing(false)}>Cancel</button>
        </td>
      </tr>
    )
  }

  return (
    <tr style={{ cursor: 'pointer' }} onDoubleClick={() => { selectNode(node.id); setEditing(true) }}>
      <td style={s.td}>{node.name}</td>
      <td style={s.td}>{node.region ?? <span style={{ color: '#4a6a8a' }}>—</span>}</td>
      <td style={s.td}>{Math.round(node.stay_probability * 100)}%</td>
      <td style={s.td}><span style={s.dot(!!node.audio_file_path)} /></td>
      <td style={s.td}>
        <button style={s.btn('muted')} onClick={() => setEditing(true)}>Edit</button>
        <button style={{ ...s.btn('danger'), marginLeft: 4 }} onClick={() => {
          if (confirm) { deleteNode(node.id); setConfirm(false) } else setConfirm(true)
        }}>
          {confirm ? 'Confirm' : 'Delete'}
        </button>
      </td>
    </tr>
  )
}

function EdgeRow({ edge }: { edge: Edge }) {
  const { updateEdge, deleteEdge, selectEdge, graph } = useEditor()
  const [editing, setEditing] = useState(false)
  const [weight, setWeight] = useState(edge.weight)
  const [bidirectional, setBidirectional] = useState(edge.bidirectional)
  const [confirm, setConfirm] = useState(false)

  const sourceName = graph?.nodes.find(n => n.id === edge.source_node_id)?.name ?? '?'
  const targetName = graph?.nodes.find(n => n.id === edge.target_node_id)?.name ?? '?'

  const save = () => {
    updateEdge(edge.id, { weight, bidirectional })
    setEditing(false)
  }

  if (editing) {
    return (
      <tr style={{ background: '#0f1923' }}>
        <td style={s.td}>{sourceName} → {targetName}</td>
        <td style={s.td}><input type="number" min={0.1} step={0.1} style={{ ...s.input, width: 70 }} value={weight} onChange={e => setWeight(parseFloat(e.target.value))} /></td>
        <td style={s.td}>
          <button style={s.btn(bidirectional ? 'primary' : 'muted')} onClick={() => setBidirectional(b => !b)}>
            {bidirectional ? '↔ Bi' : '→ One-way'}
          </button>
        </td>
        <td style={s.td}>
          <button style={s.btn('primary')} onClick={save}>Save</button>
          <button style={{ ...s.btn('muted'), marginLeft: 4 }} onClick={() => setEditing(false)}>Cancel</button>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td style={s.td}>{sourceName} {edge.bidirectional ? '↔' : '→'} {targetName}</td>
      <td style={s.td}>×{edge.weight}</td>
      <td style={s.td}>{edge.bidirectional ? '↔ Bi' : '→ One-way'}</td>
      <td style={s.td}>
        <button style={s.btn('muted')} onClick={() => { selectEdge(edge.id); setEditing(true) }}>Edit</button>
        <button style={{ ...s.btn('danger'), marginLeft: 4 }} onClick={() => {
          if (confirm) { deleteEdge(edge.id); setConfirm(false) } else setConfirm(true)
        }}>
          {confirm ? 'Confirm' : 'Delete'}
        </button>
      </td>
    </tr>
  )
}

interface NewEdgeFormProps { onSave: (src: string, tgt: string) => void; onCancel: () => void }
function NewEdgeForm({ onSave, onCancel }: NewEdgeFormProps) {
  const { graph } = useEditor()
  const [src, setSrc] = useState('')
  const [tgt, setTgt] = useState('')
  const sel = { ...s.input, padding: '4px 6px' }
  const nodes = graph?.nodes ?? []
  return (
    <tr style={{ background: '#0f1923' }}>
      <td style={s.td}>
        <select style={sel} value={src} onChange={e => setSrc(e.target.value)}>
          <option value="">Source…</option>
          {nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        {' → '}
        <select style={sel} value={tgt} onChange={e => setTgt(e.target.value)}>
          <option value="">Target…</option>
          {nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </td>
      <td style={s.td} colSpan={2} />
      <td style={s.td}>
        <button style={s.btn('primary')} onClick={() => src && tgt && onSave(src, tgt)}>Add</button>
        <button style={{ ...s.btn('muted'), marginLeft: 4 }} onClick={onCancel}>Cancel</button>
      </td>
    </tr>
  )
}

export default function FormView() {
  const { graph, createNode, createEdge } = useEditor()
  const [addingEdge, setAddingEdge] = useState(false)

  if (!graph) {
    return <div style={{ padding: 24, color: '#4a6a8a', fontFamily: 'monospace', fontSize: 13 }}>No graph selected.</div>
  }

  return (
    <div style={{ display: 'flex', gap: 24, padding: 16, height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      {/* Nodes */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={s.heading}>Nodes ({graph.nodes.length})</h3>
          <button style={s.btn('primary')} onClick={() => createNode({ name: 'New Location' })}>+ Add Node</button>
        </div>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Name</th>
              <th style={s.th}>Region</th>
              <th style={s.th}>Stay</th>
              <th style={s.th}>Audio</th>
              <th style={s.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {graph.nodes.map(n => <NodeRow key={n.id} node={n} />)}
            {graph.nodes.length === 0 && (
              <tr><td colSpan={5} style={{ ...s.td, color: '#4a6a8a', textAlign: 'center' }}>No nodes yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edges */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={s.heading}>Edges ({graph.edges.length})</h3>
          <button style={s.btn('primary')} onClick={() => setAddingEdge(true)}>+ Add Edge</button>
        </div>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Connection</th>
              <th style={s.th}>Weight</th>
              <th style={s.th}>Direction</th>
              <th style={s.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {addingEdge && (
              <NewEdgeForm
                onSave={(src, tgt) => { createEdge({ source_node_id: src, target_node_id: tgt }); setAddingEdge(false) }}
                onCancel={() => setAddingEdge(false)}
              />
            )}
            {graph.edges.map(e => <EdgeRow key={e.id} edge={e} />)}
            {graph.edges.length === 0 && !addingEdge && (
              <tr><td colSpan={4} style={{ ...s.td, color: '#4a6a8a', textAlign: 'center' }}>No edges yet. Connect nodes in the diagram or add them here.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
