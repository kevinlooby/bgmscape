import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as ambientApi from '../api/ambient'
import { ambientAssetUrl } from '../api/ambient'
import type { AmbientAsset, AmbientAssetCreate, AmbientAssetUpdate } from '../types'

const MONO = 'monospace'

// Each category is an independent mix/concurrency slot in the AmbientEngine.
// Fauna was split into animal types (birds emphasized); 'fire' was removed.
const CATEGORY_SUGGESTIONS = [
  'birds', 'insects', 'frogs', 'water', 'wind', 'weather', 'settlement', 'cavern',
]

const TAG_SUGGESTIONS = [
  'field', 'forest', 'mountain', 'cave', 'desert', 'ocean', 'river',
  'urban', 'indoor', 'dungeon', 'day', 'night', 'dawn', 'dusk', 'rain', 'snow',
]

const DEFAULT_FORM: AmbientAssetCreate = {
  name: '',
  category: 'wind',
  tags: [],
  default_volume: 0.5,
  play_probability: 1.0,
  min_play_duration_s: 45,
  max_play_duration_s: 120,
  fade_in_ms: 2000,
  fade_out_ms: 3000,
  license: '',
}

export default function AmbientLibraryPage() {
  const navigate = useNavigate()
  const [assets, setAssets] = useState<AmbientAsset[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = () => {
    ambientApi.listAmbientAssets()
      .then(setAssets)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load ambient library'))
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!assets) return []
    if (!filterCategory) return assets
    return assets.filter(a => a.category === filterCategory)
  }, [assets, filterCategory])

  const allCategories = useMemo(() => {
    if (!assets) return []
    return Array.from(new Set(assets.map(a => a.category))).sort()
  }, [assets])

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
        <span
          style={{ color: '#4a90d9', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          bgmscape
        </span>
        <div style={{ width: 1, height: 16, background: '#2d4a6e' }} />
        <span style={{ color: '#4a6a8a', fontSize: 12 }}>ambient library</span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '32px 24px 40px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 1000 }}>
          <div style={{ fontSize: 11, color: '#4a6a8a', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14 }}>
            Atmospheric sound library
          </div>
          <div style={{ fontSize: 24, color: '#e8f0fe', fontWeight: 700, marginBottom: 8 }}>
            Birds, water, weather, and more
          </div>
          <div style={{ fontSize: 12, color: '#7a8aa0', marginBottom: 28, lineHeight: 1.5 }}>
            These ambient loops are global across all games. Tag a node in any game's editor with
            one of these tags and the engine will mix the matching ambient layers under the music.
          </div>

          {error && (
            <div style={{ fontSize: 13, color: '#f87171', marginBottom: 20 }}>
              {error}
            </div>
          )}

          <UploadForm onCreated={load} onError={setError} />

          {/* Filter + table */}
          <div style={{ marginTop: 32 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12,
            }}>
              <div style={{ fontSize: 11, color: '#4a6a8a', letterSpacing: 2, textTransform: 'uppercase' }}>
                Library {assets ? `(${assets.length})` : ''}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 11, color: '#7a8aa0' }}>Filter category</label>
                <select
                  value={filterCategory}
                  onChange={e => setFilterCategory(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">all</option>
                  {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {assets === null && !error && (
              <div style={{ fontSize: 12, color: '#4a6a8a' }}>loading…</div>
            )}

            {assets && filtered.length === 0 && (
              <div style={{
                padding: 24, border: '1px dashed #2d4a6e', borderRadius: 6,
                color: '#4a6a8a', fontSize: 13, lineHeight: 1.6,
              }}>
                No assets yet. Upload your first ambient loop above.
              </div>
            )}

            {filtered.length > 0 && (
              <div style={{ border: '1px solid #2d4a6e', borderRadius: 6, overflow: 'hidden' }}>
                {filtered.map(asset => (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    expanded={editingId === asset.id}
                    onToggle={() => setEditingId(editingId === asset.id ? null : asset.id)}
                    onSaved={load}
                    onDeleted={load}
                    onError={setError}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Upload form ──────────────────────────────────────────────────────────────

function UploadForm({ onCreated, onError }: { onCreated: () => void; onError: (msg: string) => void }) {
  const [form, setForm] = useState<AmbientAssetCreate>(DEFAULT_FORM)
  const [file, setFile] = useState<File | null>(null)
  const [tagsText, setTagsText] = useState('')
  const [uploading, setUploading] = useState(false)

  const reset = () => {
    setForm(DEFAULT_FORM)
    setFile(null)
    setTagsText('')
  }

  const submit = async () => {
    if (!file) { onError('Pick an audio file to upload'); return }
    if (!form.name.trim()) { onError('Asset name is required'); return }
    if (!form.category.trim()) { onError('Category is required'); return }
    if (form.min_play_duration_s > form.max_play_duration_s) {
      onError('Min play duration must be <= max play duration'); return
    }

    setUploading(true)
    try {
      const tags = tagsText
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0)
      await ambientApi.createAmbientAsset(file, {
        ...form,
        tags,
        license: form.license?.trim() || null,
      })
      reset()
      onCreated()
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{
      background: '#0f1923', border: '1px solid #2d4a6e', borderRadius: 8, padding: 20,
    }}>
      <div style={{ fontSize: 11, color: '#4a6a8a', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>
        Upload new asset
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Audio file">
          <input
            type="file"
            accept="audio/*"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            style={{ ...inputStyle, padding: 6 }}
          />
        </Field>
        <Field label="Name">
          <input
            type="text"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="wind-light-meadow"
            style={inputStyle}
          />
        </Field>
        <Field label="Category">
          <input
            type="text"
            value={form.category}
            onChange={e => setForm({ ...form, category: e.target.value })}
            list="ambient-categories"
            style={inputStyle}
          />
          <datalist id="ambient-categories">
            {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
          </datalist>
        </Field>
        <Field label="Tags (comma-separated)">
          <input
            type="text"
            value={tagsText}
            onChange={e => setTagsText(e.target.value)}
            placeholder={TAG_SUGGESTIONS.slice(0, 4).join(', ')}
            style={inputStyle}
          />
        </Field>
        <SliderField
          label="Default volume"
          value={form.default_volume} min={0} max={1} step={0.05}
          format={v => v.toFixed(2)}
          onChange={v => setForm({ ...form, default_volume: v })}
        />
        <SliderField
          label="Play probability"
          value={form.play_probability} min={0} max={1} step={0.05}
          format={v => v.toFixed(2)}
          onChange={v => setForm({ ...form, play_probability: v })}
        />
        <SliderField
          label="Min play duration (s)"
          value={form.min_play_duration_s} min={1} max={300} step={1}
          format={v => `${v}s`}
          onChange={v => setForm({ ...form, min_play_duration_s: v })}
        />
        <SliderField
          label="Max play duration (s)"
          value={form.max_play_duration_s} min={1} max={600} step={1}
          format={v => `${v}s`}
          onChange={v => setForm({ ...form, max_play_duration_s: v })}
        />
        <SliderField
          label="Fade in (ms)"
          value={form.fade_in_ms} min={0} max={10000} step={100}
          format={v => `${v}ms`}
          onChange={v => setForm({ ...form, fade_in_ms: v })}
        />
        <SliderField
          label="Fade out (ms)"
          value={form.fade_out_ms} min={0} max={10000} step={100}
          format={v => `${v}ms`}
          onChange={v => setForm({ ...form, fade_out_ms: v })}
        />
        <Field label="License (optional)">
          <input
            type="text"
            value={form.license ?? ''}
            onChange={e => setForm({ ...form, license: e.target.value })}
            placeholder="CC0, Pixabay, Acoustic Nature, …"
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
        <button onClick={submit} disabled={uploading} style={primaryButtonStyle}>
          {uploading ? 'Uploading…' : 'Upload asset'}
        </button>
        <button onClick={reset} disabled={uploading} style={secondaryButtonStyle}>
          Reset
        </button>
      </div>
    </div>
  )
}

// ── Asset row ────────────────────────────────────────────────────────────────

function AssetRow({
  asset, expanded, onToggle, onSaved, onDeleted, onError,
}: {
  asset: AmbientAsset
  expanded: boolean
  onToggle: () => void
  onSaved: () => void
  onDeleted: () => void
  onError: (msg: string) => void
}) {
  return (
    <div style={{ borderBottom: '1px solid #2d4a6e', background: expanded ? '#0c1822' : 'transparent' }}>
      <div
        onClick={onToggle}
        style={{
          display: 'grid', gridTemplateColumns: '1.5fr 0.8fr 2fr 0.6fr 0.6fr 0.6fr',
          gap: 12, padding: '12px 16px', alignItems: 'center', cursor: 'pointer',
        }}
      >
        <div style={{ color: '#e8f0fe', fontSize: 13 }}>{asset.name}</div>
        <div>
          <span style={categoryBadge}>{asset.category}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {asset.tags.length === 0 && (
            <span style={{ color: '#4a6a8a', fontSize: 11 }}>—</span>
          )}
          {asset.tags.map(t => <span key={t} style={tagChip}>{t}</span>)}
        </div>
        <div style={{ color: '#7a8aa0', fontSize: 11, textAlign: 'right' }}>
          vol {asset.default_volume.toFixed(2)}
        </div>
        <div style={{ color: '#7a8aa0', fontSize: 11, textAlign: 'right' }}>
          p {asset.play_probability.toFixed(2)}
        </div>
        <div style={{ color: '#7a8aa0', fontSize: 11, textAlign: 'right' }}>
          {asset.min_play_duration_s}–{asset.max_play_duration_s}s
        </div>
      </div>

      {expanded && (
        <EditPanel asset={asset} onSaved={onSaved} onDeleted={onDeleted} onError={onError} />
      )}
    </div>
  )
}

function EditPanel({
  asset, onSaved, onDeleted, onError,
}: {
  asset: AmbientAsset
  onSaved: () => void
  onDeleted: () => void
  onError: (msg: string) => void
}) {
  const [draft, setDraft] = useState<AmbientAsset>(asset)
  const [tagsText, setTagsText] = useState(asset.tags.join(', '))
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (draft.min_play_duration_s > draft.max_play_duration_s) {
      onError('Min play duration must be <= max play duration'); return
    }
    const tags = tagsText.split(',').map(s => s.trim()).filter(s => s.length > 0)
    const patch: AmbientAssetUpdate = {
      name: draft.name,
      category: draft.category,
      tags,
      default_volume: draft.default_volume,
      play_probability: draft.play_probability,
      min_play_duration_s: draft.min_play_duration_s,
      max_play_duration_s: draft.max_play_duration_s,
      fade_in_ms: draft.fade_in_ms,
      fade_out_ms: draft.fade_out_ms,
      license: draft.license?.trim() || null,
    }
    setSaving(true)
    try {
      await ambientApi.updateAmbientAsset(asset.id, patch)
      onSaved()
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Delete "${asset.name}"? This removes the audio file too.`)) return
    setSaving(true)
    try {
      await ambientApi.deleteAmbientAsset(asset.id)
      onDeleted()
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '16px 20px', borderTop: '1px solid #1a2a3a' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Name">
          <input
            type="text" value={draft.name}
            onChange={e => setDraft({ ...draft, name: e.target.value })}
            style={inputStyle}
          />
        </Field>
        <Field label="Category">
          <input
            type="text" value={draft.category}
            onChange={e => setDraft({ ...draft, category: e.target.value })}
            list="ambient-categories"
            style={inputStyle}
          />
        </Field>
        <Field label="Tags (comma-separated)">
          <input
            type="text" value={tagsText}
            onChange={e => setTagsText(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="License">
          <input
            type="text" value={draft.license ?? ''}
            onChange={e => setDraft({ ...draft, license: e.target.value })}
            style={inputStyle}
          />
        </Field>
        <SliderField
          label="Default volume"
          value={draft.default_volume} min={0} max={1} step={0.05}
          format={v => v.toFixed(2)}
          onChange={v => setDraft({ ...draft, default_volume: v })}
        />
        <SliderField
          label="Play probability"
          value={draft.play_probability} min={0} max={1} step={0.05}
          format={v => v.toFixed(2)}
          onChange={v => setDraft({ ...draft, play_probability: v })}
        />
        <SliderField
          label="Min play duration (s)"
          value={draft.min_play_duration_s} min={1} max={300} step={1}
          format={v => `${v}s`}
          onChange={v => setDraft({ ...draft, min_play_duration_s: v })}
        />
        <SliderField
          label="Max play duration (s)"
          value={draft.max_play_duration_s} min={1} max={600} step={1}
          format={v => `${v}s`}
          onChange={v => setDraft({ ...draft, max_play_duration_s: v })}
        />
        <SliderField
          label="Fade in (ms)"
          value={draft.fade_in_ms} min={0} max={10000} step={100}
          format={v => `${v}ms`}
          onChange={v => setDraft({ ...draft, fade_in_ms: v })}
        />
        <SliderField
          label="Fade out (ms)"
          value={draft.fade_out_ms} min={0} max={10000} step={100}
          format={v => `${v}ms`}
          onChange={v => setDraft({ ...draft, fade_out_ms: v })}
        />
      </div>

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={save} disabled={saving} style={primaryButtonStyle}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <audio
          controls
          src={ambientAssetUrl(asset.id)}
          style={{ height: 32, flex: 1, minWidth: 240 }}
        />
        <button onClick={remove} disabled={saving} style={dangerButtonStyle}>
          Delete
        </button>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: '#4a6a8a' }}>
        File: {asset.file_path}
      </div>
    </div>
  )
}

// ── Small form helpers ──────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: '#7a8aa0' }}>{label}</span>
      {children}
    </div>
  )
}

function SliderField({
  label, value, min, max, step, format, onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7a8aa0' }}>
        <span>{label}</span>
        <span style={{ color: '#90b8e8' }}>{format(value)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#0a1520', color: '#e8f0fe', border: '1px solid #2d4a6e',
  borderRadius: 4, padding: '6px 10px', fontFamily: MONO, fontSize: 12,
}

const selectStyle: React.CSSProperties = {
  ...inputStyle, padding: '4px 8px',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 4, background: '#1e4a8a',
  color: '#e8f0fe', border: '1px solid #4a90d9', cursor: 'pointer',
  fontFamily: MONO, fontSize: 13, fontWeight: 700,
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 4, background: '#1e2a3a',
  color: '#8a9bb0', border: '1px solid #2d4a6e', cursor: 'pointer',
  fontFamily: MONO, fontSize: 13,
}

const dangerButtonStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 4, background: '#3a1e1e',
  color: '#f8a0a0', border: '1px solid #8a3a3a', cursor: 'pointer',
  fontFamily: MONO, fontSize: 12,
}

const categoryBadge: React.CSSProperties = {
  display: 'inline-block', padding: '2px 8px', borderRadius: 10,
  background: '#1e2a3a', border: '1px solid #2d4a6e',
  color: '#90b8e8', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
}

const tagChip: React.CSSProperties = {
  display: 'inline-block', padding: '1px 7px', borderRadius: 8,
  background: '#162230', color: '#8aa8c8', fontSize: 10,
  border: '1px solid #2d4a6e',
}
