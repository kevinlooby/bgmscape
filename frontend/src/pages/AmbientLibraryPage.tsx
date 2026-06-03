import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as ambientApi from '../api/ambient'
import { ambientAssetUrl } from '../api/ambient'
import type {
  AmbientAsset,
  AmbientAssetCreate,
  AmbientAssetUpdate,
  AmbientReviewStatus,
} from '../types'

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

type Tab = 'library' | 'vetting'

const STATUS_LABEL: Record<AmbientReviewStatus, string> = {
  unreviewed: 'Unreviewed',
  included: 'Included',
  marked_for_removal: 'Marked for removal',
}

/** Read tab + pre-selected asset from the URL hash (e.g. `#vet?asset=abc`). */
function readUrlHash(): { tab: Tab; assetId: string | null } {
  if (typeof window === 'undefined') return { tab: 'library', assetId: null }
  const hash = window.location.hash
  const match = hash.match(/^#(\w+)(?:\?asset=([^&]+))?/)
  if (!match) return { tab: 'library', assetId: null }
  const tab: Tab = match[1] === 'vet' ? 'vetting' : 'library'
  const assetId = match[2] ? decodeURIComponent(match[2]) : null
  return { tab, assetId }
}

function writeUrlHash(tab: Tab, assetId: string | null): void {
  if (typeof window === 'undefined') return
  let target = ''
  if (tab === 'vetting') target = '#vet' + (assetId ? `?asset=${encodeURIComponent(assetId)}` : '')
  const next = window.location.pathname + window.location.search + target
  if (window.location.pathname + window.location.search + window.location.hash !== next) {
    window.history.replaceState(null, '', next)
  }
}

export default function AmbientLibraryPage() {
  const navigate = useNavigate()
  const [assets, setAssets] = useState<AmbientAsset[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Hash-driven tab + selected-asset state. Initialised once from the URL so
  // clicking a status badge on the Library tab (which navigates to
  // `#vet?asset=<id>`) opens straight to that asset.
  const initial = useMemo(readUrlHash, [])
  const [tab, setTab] = useState<Tab>(initial.tab)
  const [vetSelectedId, setVetSelectedId] = useState<string | null>(initial.assetId)

  const load = useCallback(() => {
    ambientApi.listAmbientAssets()
      .then(setAssets)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load ambient library'))
  }, [])

  useEffect(() => { load() }, [load])

  // Mirror tab/selection back into the URL so a reload keeps you in place and
  // the back/forward buttons feel sensible.
  useEffect(() => {
    writeUrlHash(tab, tab === 'vetting' ? vetSelectedId : null)
  }, [tab, vetSelectedId])

  const goToVetting = useCallback((assetId: string) => {
    setVetSelectedId(assetId)
    setTab('vetting')
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
        <div style={{ width: '100%', maxWidth: 1100 }}>
          <div style={{ fontSize: 11, color: '#4a6a8a', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14 }}>
            Atmospheric sound library
          </div>
          <div style={{ fontSize: 24, color: '#e8f0fe', fontWeight: 700, marginBottom: 8 }}>
            Birds, water, weather, and more
          </div>
          <div style={{ fontSize: 12, color: '#7a8aa0', marginBottom: 24, lineHeight: 1.5 }}>
            These ambient loops are global across all games. Tag a node in any game's editor with
            one of these tags and the engine will mix the matching ambient layers under the music.
          </div>

          {/* Tab toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
            <button
              onClick={() => setTab('library')}
              style={tab === 'library' ? tabButtonActiveStyle : tabButtonStyle}
            >
              Library
            </button>
            <button
              onClick={() => setTab('vetting')}
              style={tab === 'vetting' ? tabButtonActiveStyle : tabButtonStyle}
            >
              Vetting
            </button>
          </div>

          {error && (
            <div style={{ fontSize: 13, color: '#f87171', marginBottom: 20 }}>
              {error}
            </div>
          )}

          {tab === 'library' && (
            <LibraryTab
              assets={assets}
              onCreated={load}
              onError={setError}
              onBadgeClick={goToVetting}
            />
          )}

          {tab === 'vetting' && (
            <VettingTab
              assets={assets}
              selectedId={vetSelectedId}
              setSelectedId={setVetSelectedId}
              onMutated={load}
              onError={setError}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Library tab ──────────────────────────────────────────────────────────────

function LibraryTab({
  assets, onCreated, onError, onBadgeClick,
}: {
  assets: AmbientAsset[] | null
  onCreated: () => void
  onError: (msg: string) => void
  onBadgeClick: (assetId: string) => void
}) {
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [editingId, setEditingId] = useState<string | null>(null)

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
    <>
      <UploadForm onCreated={onCreated} onError={onError} />

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

        {assets === null && (
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
                onSaved={onCreated}
                onDeleted={onCreated}
                onError={onError}
                onBadgeClick={onBadgeClick}
              />
            ))}
          </div>
        )}
      </div>
    </>
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
  asset, expanded, onToggle, onSaved, onDeleted, onError, onBadgeClick,
}: {
  asset: AmbientAsset
  expanded: boolean
  onToggle: () => void
  onSaved: () => void
  onDeleted: () => void
  onError: (msg: string) => void
  onBadgeClick: (assetId: string) => void
}) {
  return (
    <div style={{ borderBottom: '1px solid #2d4a6e', background: expanded ? '#0c1822' : 'transparent' }}>
      <div
        onClick={onToggle}
        style={{
          display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 0.9fr 1.7fr 0.5fr 0.5fr 0.6fr',
          gap: 12, padding: '12px 16px', alignItems: 'center', cursor: 'pointer',
        }}
      >
        <div style={{ color: '#e8f0fe', fontSize: 13 }}>{asset.name}</div>
        <div>
          <span style={categoryBadge}>{asset.category}</span>
        </div>
        <div>
          <StatusBadge
            status={asset.review_status}
            onClick={(e) => { e.stopPropagation(); onBadgeClick(asset.id) }}
            title="Open in Vetting tab"
          />
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

// ── Vetting tab ──────────────────────────────────────────────────────────────

type StatusFilter = 'unreviewed' | 'all' | 'included' | 'marked_for_removal'

function VettingTab({
  assets, selectedId, setSelectedId, onMutated, onError,
}: {
  assets: AmbientAsset[] | null
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  onMutated: () => void
  onError: (msg: string) => void
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('unreviewed')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const allCategories = useMemo(() => {
    if (!assets) return []
    return Array.from(new Set(assets.map(a => a.category))).sort()
  }, [assets])

  const counts = useMemo(() => {
    const c = { unreviewed: 0, included: 0, marked_for_removal: 0 }
    for (const a of assets ?? []) c[a.review_status]++
    return c
  }, [assets])

  const filtered = useMemo(() => {
    if (!assets) return []
    let list = assets
    if (statusFilter !== 'all') list = list.filter(a => a.review_status === statusFilter)
    if (categoryFilter) list = list.filter(a => a.category === categoryFilter)
    return list
  }, [assets, statusFilter, categoryFilter])

  // Keep the currently-loaded asset visible in the list even if a status change
  // would otherwise filter it out — prevents the player from going blank mid-vet
  // right after the user clicks Include or Mark for removal.
  const displayList = useMemo(() => {
    if (!selectedId || !assets) return filtered
    if (filtered.some(a => a.id === selectedId)) return filtered
    const sel = assets.find(a => a.id === selectedId)
    return sel ? [sel, ...filtered] : filtered
  }, [filtered, selectedId, assets])

  // Auto-select first asset in the list when the page opens or the filter
  // narrows to a set that doesn't include the current selection.
  useEffect(() => {
    if (!assets) return
    if (selectedId && assets.some(a => a.id === selectedId)) return
    if (filtered.length > 0) setSelectedId(filtered[0].id)
  }, [assets, selectedId, filtered, setSelectedId])

  const selected = useMemo(
    () => assets?.find(a => a.id === selectedId) ?? null,
    [assets, selectedId],
  )

  const setStatus = useCallback(async (id: string, status: AmbientReviewStatus) => {
    try {
      await ambientApi.updateAmbientAsset(id, { review_status: status })
      onMutated()
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Failed to update review status')
    }
  }, [onMutated, onError])

  const movePrev = useCallback(() => {
    if (!selected) return
    const idx = displayList.findIndex(a => a.id === selected.id)
    if (idx > 0) setSelectedId(displayList[idx - 1].id)
  }, [selected, displayList, setSelectedId])

  const moveNext = useCallback(() => {
    if (!selected) return
    const idx = displayList.findIndex(a => a.id === selected.id)
    if (idx >= 0 && idx < displayList.length - 1) setSelectedId(displayList[idx + 1].id)
  }, [selected, displayList, setSelectedId])

  // Keyboard shortcuts. Guarded against typing into the filter dropdown / inputs.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null
      if (active) {
        const tag = active.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) return
      }
      if (!selected) return
      switch (e.key) {
        case ' ':
        case 'Spacebar':
          e.preventDefault()
          if (audioRef.current) {
            if (audioRef.current.paused) void audioRef.current.play().catch(() => {})
            else audioRef.current.pause()
          }
          break
        case '1':
          void setStatus(selected.id, 'unreviewed')
          break
        case '2':
          void setStatus(selected.id, 'included')
          break
        case '3':
          void setStatus(selected.id, 'marked_for_removal')
          break
        case 'j':
        case 'J':
        case 'ArrowRight':
          e.preventDefault()
          moveNext()
          break
        case 'k':
        case 'K':
        case 'ArrowLeft':
          e.preventDefault()
          movePrev()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected, setStatus, moveNext, movePrev])

  const markedAssets = useMemo(
    () => (assets ?? []).filter(a => a.review_status === 'marked_for_removal'),
    [assets],
  )

  const bulkDelete = async () => {
    if (markedAssets.length === 0) return
    const lines = markedAssets.map(a => `  • ${a.name}`).join('\n')
    if (!confirm(
      `Delete ${markedAssets.length} marked-for-removal asset${markedAssets.length === 1 ? '' : 's'}?` +
      ` This removes the audio file${markedAssets.length === 1 ? '' : 's'} too.\n\n${lines}`,
    )) return

    let failed = 0
    for (const a of markedAssets) {
      try {
        await ambientApi.deleteAmbientAsset(a.id)
      } catch {
        failed++
      }
    }
    if (failed > 0) onError(`${failed} delete${failed === 1 ? '' : 's'} failed`)
    onMutated()
  }

  if (!assets) {
    return <div style={{ fontSize: 12, color: '#4a6a8a' }}>loading…</div>
  }

  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: 20, alignItems: 'start',
      }}>
        {/* Left column — list */}
        <div>
          <div style={{ fontSize: 11, color: '#7a8aa0', marginBottom: 10 }}>
            <span style={{ color: statusColor('unreviewed') }}>{counts.unreviewed} unreviewed</span>
            {' · '}
            <span style={{ color: statusColor('included') }}>{counts.included} included</span>
            {' · '}
            <span style={{ color: statusColor('marked_for_removal') }}>{counts.marked_for_removal} marked for removal</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {(['unreviewed', 'all', 'included', 'marked_for_removal'] as StatusFilter[]).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={statusFilter === s ? filterChipActiveStyle : filterChipStyle}
              >
                {s === 'all' ? 'All' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: '#7a8aa0' }}>Category</label>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="">all</option>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ marginLeft: 'auto', fontSize: 11, color: '#4a6a8a' }}>
              {displayList.length} shown
            </div>
          </div>

          {displayList.length === 0 && (
            <div style={{
              padding: 18, border: '1px dashed #2d4a6e', borderRadius: 6,
              color: '#4a6a8a', fontSize: 12,
            }}>
              No assets match the current filter.
            </div>
          )}

          {displayList.length > 0 && (
            <div style={{
              border: '1px solid #2d4a6e', borderRadius: 6, overflow: 'hidden',
              maxHeight: 'calc(100vh - 320px)', overflowY: 'auto',
            }}>
              {displayList.map(asset => {
                const isSelected = asset.id === selectedId
                return (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedId(asset.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', cursor: 'pointer',
                      borderBottom: '1px solid #1a2a3a',
                      background: isSelected ? '#172638' : 'transparent',
                    }}
                  >
                    <StatusDot status={asset.review_status} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        color: isSelected ? '#e8f0fe' : '#c8d8e8', fontSize: 12,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {asset.name}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                        <span style={categoryBadge}>{asset.category}</span>
                        {asset.tags.slice(0, 4).map(t => (
                          <span key={t} style={tagChip}>{t}</span>
                        ))}
                        {asset.tags.length > 4 && (
                          <span style={{ ...tagChip, color: '#4a6a8a' }}>+{asset.tags.length - 4}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Bulk delete sits beneath the list */}
          <div style={{ marginTop: 16 }}>
            <button
              onClick={bulkDelete}
              disabled={markedAssets.length === 0}
              style={markedAssets.length === 0 ? dangerButtonDisabledStyle : dangerButtonStyle}
            >
              Delete all marked for removal ({markedAssets.length})
            </button>
          </div>
        </div>

        {/* Right column — player + actions */}
        <div style={{ position: 'sticky', top: 16 }}>
          {!selected && (
            <div style={{
              padding: 24, border: '1px dashed #2d4a6e', borderRadius: 8,
              color: '#4a6a8a', fontSize: 13, textAlign: 'center',
            }}>
              Pick a track on the left to start listening.
            </div>
          )}

          {selected && (
            <VettingPlayer
              asset={selected}
              audioRef={audioRef}
              onStatus={(status) => void setStatus(selected.id, status)}
              onPrev={movePrev}
              onNext={moveNext}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function VettingPlayer({
  asset, audioRef, onStatus, onPrev, onNext,
}: {
  asset: AmbientAsset
  audioRef: React.MutableRefObject<HTMLAudioElement | null>
  onStatus: (status: AmbientReviewStatus) => void
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div style={{
      background: '#0f1923', border: '1px solid #2d4a6e', borderRadius: 8, padding: 18,
    }}>
      <div style={{
        fontSize: 18, color: '#e8f0fe', fontWeight: 700, marginBottom: 6,
        wordBreak: 'break-word',
      }}>
        {asset.name}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={categoryBadge}>{asset.category}</span>
        {asset.tags.map(t => <span key={t} style={tagChip}>{t}</span>)}
      </div>
      {asset.license && (
        <div style={{ fontSize: 11, color: '#4a6a8a', marginBottom: 10 }}>
          License: {asset.license}
        </div>
      )}

      <audio
        ref={audioRef}
        key={asset.id}
        controls
        autoPlay
        src={ambientAssetUrl(asset.id)}
        style={{ width: '100%', marginBottom: 14 }}
      />

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['unreviewed', 'included', 'marked_for_removal'] as AmbientReviewStatus[]).map(s => (
          <button
            key={s}
            onClick={() => onStatus(s)}
            style={asset.review_status === s ? statusButtonActiveStyle(s) : statusButtonStyle(s)}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button onClick={onPrev} style={secondaryButtonStyle}>← Prev</button>
        <button onClick={onNext} style={secondaryButtonStyle}>Next →</button>
      </div>

      <div style={{
        background: '#0a1520', border: '1px solid #1a2a3a', borderRadius: 6,
        padding: 10, fontSize: 11, color: '#7a8aa0', marginBottom: 10,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 4, columnGap: 12 }}>
          <span>Default volume</span><span style={{ color: '#90b8e8' }}>{asset.default_volume.toFixed(2)}</span>
          <span>Play probability</span><span style={{ color: '#90b8e8' }}>{asset.play_probability.toFixed(2)}</span>
          <span>Play duration</span><span style={{ color: '#90b8e8' }}>{asset.min_play_duration_s}–{asset.max_play_duration_s}s</span>
          <span>Fade in / out</span><span style={{ color: '#90b8e8' }}>{asset.fade_in_ms} / {asset.fade_out_ms} ms</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: '#4a6a8a', wordBreak: 'break-all' }}>
          {asset.file_path}
        </div>
      </div>

      <div style={{ fontSize: 10, color: '#4a6a8a', lineHeight: 1.5 }}>
        Keyboard: <code style={kbdStyle}>Space</code> play/pause ·
        {' '}<code style={kbdStyle}>1</code>/<code style={kbdStyle}>2</code>/<code style={kbdStyle}>3</code> unreviewed/include/mark ·
        {' '}<code style={kbdStyle}>J</code>/<code style={kbdStyle}>K</code> next/prev
      </div>
    </div>
  )
}

// ── Status helpers ───────────────────────────────────────────────────────────

function statusColor(status: AmbientReviewStatus): string {
  switch (status) {
    case 'unreviewed': return '#8a9bb0'
    case 'included': return '#4ade80'
    case 'marked_for_removal': return '#f87171'
  }
}

function statusBg(status: AmbientReviewStatus): string {
  switch (status) {
    case 'unreviewed': return '#1e2a3a'
    case 'included': return '#143824'
    case 'marked_for_removal': return '#3a1e1e'
  }
}

function statusBorder(status: AmbientReviewStatus): string {
  switch (status) {
    case 'unreviewed': return '#2d4a6e'
    case 'included': return '#2f7a4a'
    case 'marked_for_removal': return '#8a3a3a'
  }
}

function StatusBadge({
  status, onClick, title,
}: {
  status: AmbientReviewStatus
  onClick?: (e: React.MouseEvent) => void
  title?: string
}) {
  return (
    <span
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 8px', borderRadius: 10,
        background: statusBg(status),
        border: `1px solid ${statusBorder(status)}`,
        color: statusColor(status),
        fontSize: 10, letterSpacing: 0.5,
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  )
}

function StatusDot({ status }: { status: AmbientReviewStatus }) {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: statusColor(status),
    }} />
  )
}

function statusButtonStyle(status: AmbientReviewStatus): React.CSSProperties {
  return {
    padding: '7px 12px', borderRadius: 4,
    background: '#0a1520',
    color: statusColor(status),
    border: `1px solid ${statusBorder(status)}`,
    cursor: 'pointer', fontFamily: MONO, fontSize: 12,
  }
}

function statusButtonActiveStyle(status: AmbientReviewStatus): React.CSSProperties {
  return {
    padding: '7px 12px', borderRadius: 4,
    background: statusBg(status),
    color: statusColor(status),
    border: `1px solid ${statusColor(status)}`,
    cursor: 'pointer', fontFamily: MONO, fontSize: 12, fontWeight: 700,
  }
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

const dangerButtonDisabledStyle: React.CSSProperties = {
  ...dangerButtonStyle,
  background: '#1a1416', color: '#5a3030', borderColor: '#3a2424',
  cursor: 'not-allowed',
}

const tabButtonStyle: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 4,
  background: '#0f1923', color: '#8a9bb0',
  border: '1px solid #2d4a6e', cursor: 'pointer',
  fontFamily: MONO, fontSize: 13,
}

const tabButtonActiveStyle: React.CSSProperties = {
  ...tabButtonStyle,
  background: '#1e4a8a', color: '#e8f0fe',
  borderColor: '#4a90d9', fontWeight: 700,
}

const filterChipStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 12,
  background: '#0f1923', color: '#8a9bb0',
  border: '1px solid #2d4a6e', cursor: 'pointer',
  fontFamily: MONO, fontSize: 11,
}

const filterChipActiveStyle: React.CSSProperties = {
  ...filterChipStyle,
  background: '#1e4a8a', color: '#e8f0fe',
  borderColor: '#4a90d9', fontWeight: 700,
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

const kbdStyle: React.CSSProperties = {
  background: '#1a2a3a', border: '1px solid #2d4a6e', borderRadius: 3,
  padding: '0 4px', color: '#90b8e8', fontFamily: MONO, fontSize: 10,
}
