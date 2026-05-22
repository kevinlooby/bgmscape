import { useRef, useState, useEffect } from 'react'
import { useEditor } from '../../store/editor'
import type { Node } from '../../types'

interface Props {
  node: Node
}

const s = {
  section: { marginBottom: 16 } as React.CSSProperties,
  label: { display: 'block', fontSize: 11, color: '#8a9bb0', marginBottom: 4, fontFamily: 'monospace' } as React.CSSProperties,
  input: { width: '100%', background: '#1e2a3a', border: '1px solid #2d4a6e', borderRadius: 4, color: '#e8f0fe', padding: '5px 8px', fontSize: 13, boxSizing: 'border-box' } as React.CSSProperties,
  slider: { width: '100%', accentColor: '#4a90d9' } as React.CSSProperties,
  btn: { padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'monospace' } as React.CSSProperties,
  danger: { background: '#8b1a1a', color: '#f8c0c0' } as React.CSSProperties,
  primary: { background: '#1e4a8a', color: '#90b8e8' } as React.CSSProperties,
  audioRow: { display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
  dot: (has: boolean) => ({ width: 10, height: 10, borderRadius: '50%', background: has ? '#4caf50' : '#e53935', flexShrink: 0 } as React.CSSProperties),
  filename: { color: '#8a9bb0', fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 140 },
}

export default function NodePanel({ node }: Props) {
  const { updateNode, deleteNode, uploadNodeAudio, selectNode } = useEditor()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(node.name)
  const [region, setRegion] = useState(node.region ?? '')
  const [stay, setStay] = useState(node.stay_probability)
  const [uploading, setUploading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Sync when selected node changes
  useEffect(() => {
    setName(node.name)
    setRegion(node.region ?? '')
    setStay(node.stay_probability)
    setConfirmDelete(false)
  }, [node.id])

  const save = (data: Partial<Node>) => updateNode(node.id, data)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadNodeAudio(node.id, file)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    await deleteNode(node.id)
    selectNode(null)
  }

  const filename = node.audio_file_path ? node.audio_file_path.split('/').pop() : null

  return (
    <div>
      <h3 style={{ color: '#e8f0fe', marginTop: 0, fontSize: 14, fontFamily: 'monospace' }}>Node</h3>

      <div style={s.section}>
        <label style={s.label}>Name</label>
        <input
          style={s.input}
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => name !== node.name && save({ name })}
        />
      </div>

      <div style={s.section}>
        <label style={s.label}>Region (optional)</label>
        <input
          style={s.input}
          value={region}
          placeholder="e.g. Overworld"
          onChange={e => setRegion(e.target.value)}
          onBlur={() => save({ region: region || null })}
        />
      </div>

      <div style={s.section}>
        <label style={s.label}>Stay probability: {Math.round(stay * 100)}%</label>
        <input
          type="range" min={0} max={1} step={0.05}
          style={s.slider}
          value={stay}
          onChange={e => setStay(parseFloat(e.target.value))}
          onMouseUp={() => save({ stay_probability: stay })}
          onTouchEnd={() => save({ stay_probability: stay })}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8a9bb0' }}>
          <span>0% (always moves)</span><span>100% (stays forever)</span>
        </div>
      </div>

      <div style={s.section}>
        <label style={s.label}>Audio track</label>
        <div style={s.audioRow}>
          <div style={s.dot(!!node.audio_file_path)} />
          {filename
            ? <span style={s.filename} title={node.audio_file_path ?? ''}>{filename}</span>
            : <span style={{ color: '#8a9bb0', fontSize: 11 }}>No audio</span>
          }
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
          <button
            style={{ ...s.btn, ...s.primary }}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : filename ? 'Replace' : 'Upload Audio'}
          </button>
        </div>
        <input
          ref={fileRef} type="file" accept="audio/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      <div style={{ borderTop: '1px solid #2d4a6e', paddingTop: 12, marginTop: 8 }}>
        <button
          style={{ ...s.btn, ...s.danger }}
          onClick={handleDelete}
        >
          {confirmDelete ? 'Click again to confirm' : 'Delete Node'}
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
