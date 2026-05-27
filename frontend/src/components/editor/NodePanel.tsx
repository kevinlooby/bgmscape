import { useRef, useState, useEffect } from 'react'
import { useEditor } from '../../store/editor'
import { analyzeAudioLoop, audioUrl } from '../../api/audio'
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
  muted: { background: '#1e2a3a', color: '#8a9bb0', border: '1px solid #2d4a6e' } as React.CSSProperties,
  audioRow: { display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
  dot: (has: boolean) => ({ width: 10, height: 10, borderRadius: '50%', background: has ? '#4caf50' : '#e53935', flexShrink: 0 } as React.CSSProperties),
  filename: { color: '#8a9bb0', fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 140 },
}

export default function NodePanel({ node }: Props) {
  const { updateNode, deleteNode, uploadNodeAudio, selectNode } = useEditor()
  const fileRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [name, setName] = useState(node.name)
  const [region, setRegion] = useState(node.region ?? '')
  const [loopStart, setLoopStart] = useState(node.loop_start ?? '')
  const [loopEnd, setLoopEnd] = useState(node.loop_end ?? '')

  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Sync when selected node changes
  useEffect(() => {
    setName(node.name)
    setRegion(node.region ?? '')
    setLoopStart(node.loop_start ?? '')
    setLoopEnd(node.loop_end ?? '')
    setConfirmDelete(false)
    setAnalyzeError(null)
    stopPreview()
  }, [node.id])

  // Clean up audio element on unmount
  useEffect(() => () => stopPreview(), [])

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
    stopPreview()
    await deleteNode(node.id)
    selectNode(null)
  }

  // Audio preview using a plain HTMLAudioElement (no Web Audio API needed)
  const togglePreview = () => {
    if (!node.audio_file_path) return
    if (previewing) {
      stopPreview()
    } else {
      startPreview()
    }
  }

  const startPreview = () => {
    if (!node.audio_file_path) return
    const el = new Audio(audioUrl(node.audio_file_path))
    el.volume = 0.6
    el.addEventListener('ended', () => setPreviewing(false))
    el.addEventListener('error', () => setPreviewing(false))
    el.play().catch(() => setPreviewing(false))
    audioRef.current = el
    setPreviewing(true)
  }

  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPreviewing(false)
  }

  // Loop-point detection
  const handleAnalyze = async () => {
    if (!node.audio_file_path) return
    const parts = node.audio_file_path.split('/')
    const folder = parts[0]
    const filename = parts.slice(1).join('/')
    if (!folder || !filename) return

    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      const result = await analyzeAudioLoop(folder, filename)
      // Apply detected values
      setLoopStart(result.loop_start)
      setLoopEnd(result.loop_end)
      save({ loop_start: result.loop_start, loop_end: result.loop_end })
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? (e instanceof Error ? e.message : 'Analysis failed')
      setAnalyzeError(msg)
    } finally {
      setAnalyzing(false)
    }
  }

  const saveLoopPoints = () => {
    const ls = loopStart === '' ? null : Number(loopStart)
    const le = loopEnd === '' ? null : Number(loopEnd)
    save({ loop_start: isNaN(ls as number) ? null : ls, loop_end: isNaN(le as number) ? null : le })
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

      {/* ── Audio track ───────────────────────────────────────────────────── */}
      <div style={s.section}>
        <label style={s.label}>Audio track</label>
        <div style={s.audioRow}>
          <div style={s.dot(!!node.audio_file_path)} />
          {filename
            ? <span style={s.filename} title={node.audio_file_path ?? ''}>{filename}</span>
            : <span style={{ color: '#8a9bb0', fontSize: 11 }}>No audio</span>
          }
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            style={{ ...s.btn, ...s.primary }}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : filename ? 'Replace' : 'Upload Audio'}
          </button>
          {filename && (
            <button
              style={{ ...s.btn, ...s.muted }}
              onClick={togglePreview}
              title={previewing ? 'Stop preview' : 'Preview audio'}
            >
              {previewing ? '■ Stop' : '▶ Preview'}
            </button>
          )}
        </div>
        <input
          ref={fileRef} type="file" accept="audio/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      {/* ── Transition / play-once flag ───────────────────────────────────── */}
      <div style={s.section}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontFamily: 'monospace' }}>
          <input
            type="checkbox"
            checked={node.is_transition}
            onChange={e => save({ is_transition: e.target.checked })}
            style={{ marginTop: 2, accentColor: '#4a90d9' }}
          />
          <span>
            <div style={{ color: '#e8f0fe', fontSize: 12 }}>Plays once (transition)</div>
            <div style={{ color: '#8a9bb0', fontSize: 10, marginTop: 2, lineHeight: 1.4 }}>
              Track plays once at full length, then moves to the next node. Ignores dwell variance.
            </div>
          </span>
        </label>
      </div>

      {/* ── Loop points ───────────────────────────────────────────────────── */}
      <div style={s.section}>
        <label style={s.label}>Loop points (seconds)</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: '#4a6a8a', marginBottom: 2 }}>Start</div>
            <input
              type="number" min={0} step={0.001}
              style={{ ...s.input, fontSize: 11 }}
              placeholder="0.000"
              value={loopStart}
              onChange={e => setLoopStart(e.target.value === '' ? '' : parseFloat(e.target.value))}
              onBlur={saveLoopPoints}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: '#4a6a8a', marginBottom: 2 }}>End</div>
            <input
              type="number" min={0} step={0.001}
              style={{ ...s.input, fontSize: 11 }}
              placeholder="(track end)"
              value={loopEnd}
              onChange={e => setLoopEnd(e.target.value === '' ? '' : parseFloat(e.target.value))}
              onBlur={saveLoopPoints}
            />
          </div>
        </div>
        {node.audio_file_path && (
          <button
            style={{ ...s.btn, ...s.muted, width: '100%' }}
            onClick={handleAnalyze}
            disabled={analyzing}
            title="Auto-detect loop start and end using audio analysis"
          >
            {analyzing ? '⟳ Analyzing…' : '⟳ Auto-detect loop points'}
          </button>
        )}
        {analyzeError && (
          <div style={{ fontSize: 10, color: '#f87171', marginTop: 4 }}>{analyzeError}</div>
        )}
        {(node.loop_start != null || node.loop_end != null) && (
          <div style={{ fontSize: 10, color: '#4a6a8a', marginTop: 4 }}>
            {node.loop_start != null && `start: ${node.loop_start.toFixed(3)}s`}
            {node.loop_start != null && node.loop_end != null && '  ·  '}
            {node.loop_end != null && `end: ${node.loop_end.toFixed(3)}s`}
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid #2d4a6e', paddingTop: 12, marginTop: 8 }}>
        <button style={{ ...s.btn, ...s.danger }} onClick={handleDelete}>
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
