import client from './client'
import type { AudioUploadResponse, LoopAnalysisResult } from '../types'

/**
 * Build the streaming URL for an audio file given its relative path
 * (as stored on Node.audio_file_path, e.g. "game-id/filename.mp3").
 */
export const audioUrl = (filePath: string): string => `/api/audio/${filePath}`

export const uploadAudio = (gameId: string, file: File): Promise<AudioUploadResponse> => {
  const form = new FormData()
  form.append('file', file)
  return client
    .post(`/api/audio/games/${gameId}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then(r => r.data)
}

export const deleteAudio = (folder: string, filename: string): Promise<void> =>
  client.delete(`/api/audio/${folder}/${encodeURIComponent(filename)}`).then(() => undefined)

export const analyzeAudioLoop = (folder: string, filename: string): Promise<LoopAnalysisResult> =>
  client.post(`/api/audio/${folder}/${encodeURIComponent(filename)}/analyze`).then(r => r.data)
