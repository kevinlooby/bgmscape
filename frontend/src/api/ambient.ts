import client from './client'
import type { AmbientAsset, AmbientAssetCreate, AmbientAssetUpdate } from '../types'
import { STATIC_MODE } from '../static/mode'
import * as staticSrc from '../static/staticDataSource'

/** URL for streaming an ambient asset's audio file. */
export const ambientAssetUrl = (assetId: string): string =>
  `/api/ambient/assets/${assetId}/file`

export const listAmbientAssets = (): Promise<AmbientAsset[]> => {
  if (STATIC_MODE) return staticSrc.listAmbientAssets()
  return client.get('/api/ambient/assets').then(r => r.data)
}

export const getAmbientAsset = (id: string): Promise<AmbientAsset> => {
  if (STATIC_MODE) {
    return staticSrc.listAmbientAssets().then(assets => {
      const a = assets.find(x => x.id === id)
      if (!a) throw new Error(`Ambient asset not found: ${id}`)
      return a
    })
  }
  return client.get(`/api/ambient/assets/${id}`).then(r => r.data)
}

export const listAmbientTags = (): Promise<string[]> => {
  if (STATIC_MODE) {
    // Derived view — in static mode the tag list is just the union of
    // every asset's tags, deduplicated.
    return staticSrc.listAmbientAssets().then(assets => {
      const set = new Set<string>()
      for (const a of assets) for (const t of a.tags) set.add(t)
      return Array.from(set).sort()
    })
  }
  return client.get('/api/ambient/tags').then(r => r.data)
}

export const createAmbientAsset = (
  file: File,
  metadata: AmbientAssetCreate,
): Promise<AmbientAsset> => {
  if (STATIC_MODE) return staticSrc.writeNotSupported('createAmbientAsset')
  const form = new FormData()
  form.append('file', file)
  form.append('metadata', JSON.stringify(metadata))
  return client
    .post('/api/ambient/assets', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then(r => r.data)
}

export const updateAmbientAsset = (
  id: string,
  patch: AmbientAssetUpdate,
): Promise<AmbientAsset> => {
  if (STATIC_MODE) return staticSrc.writeNotSupported('updateAmbientAsset')
  return client.patch(`/api/ambient/assets/${id}`, patch).then(r => r.data)
}

export const deleteAmbientAsset = (id: string): Promise<void> => {
  if (STATIC_MODE) return staticSrc.writeNotSupported('deleteAmbientAsset')
  return client.delete(`/api/ambient/assets/${id}`).then(() => undefined)
}
