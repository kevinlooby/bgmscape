import client from './client'
import type { AmbientAsset, AmbientAssetCreate, AmbientAssetUpdate } from '../types'

/** URL for streaming an ambient asset's audio file. */
export const ambientAssetUrl = (assetId: string): string =>
  `/api/ambient/assets/${assetId}/file`

export const listAmbientAssets = (): Promise<AmbientAsset[]> =>
  client.get('/api/ambient/assets').then(r => r.data)

export const getAmbientAsset = (id: string): Promise<AmbientAsset> =>
  client.get(`/api/ambient/assets/${id}`).then(r => r.data)

export const listAmbientTags = (): Promise<string[]> =>
  client.get('/api/ambient/tags').then(r => r.data)

export const createAmbientAsset = (
  file: File,
  metadata: AmbientAssetCreate,
): Promise<AmbientAsset> => {
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
): Promise<AmbientAsset> =>
  client.patch(`/api/ambient/assets/${id}`, patch).then(r => r.data)

export const deleteAmbientAsset = (id: string): Promise<void> =>
  client.delete(`/api/ambient/assets/${id}`).then(() => undefined)
