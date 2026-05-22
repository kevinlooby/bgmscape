import client from './client'
import type { AudioUploadResponse } from '../types'

/**
 * Build the streaming URL for an audio file given its relative path
 * (as stored on Node.audio_file_path, e.g. "graph-id/filename.mp3").
 */
export const audioUrl = (filePath: string): string => `/api/audio/${filePath}`

export const uploadAudio = (graphId: string, file: File): Promise<AudioUploadResponse> => {
  const form = new FormData()
  form.append('file', file)
  return client
    .post(`/api/audio/${graphId}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then(r => r.data)
}

export const deleteAudio = (graphId: string, filename: string): Promise<void> =>
  client.delete(`/api/audio/${graphId}/${filename}`).then(() => undefined)
