import client from './client'
import type { AudioUploadResponse, LoopAnalysisResult } from '../types'

/**
 * Build the streaming URL for an audio file given its relative path
 * (as stored on Node.audio_file_path, e.g. "game-id/filename.mp3").
 *
 * In static-deploy mode the returned string is still used as a stable cache
 * key by AudioManager — the AudioFetcher injected at construction time is
 * what actually translates the key into bytes. See `AudioFetcher` below.
 */
export const audioUrl = (filePath: string): string => `/api/audio/${filePath}`

/**
 * Resolves a logical audio key (the string returned by `audioUrl` or
 * `ambientAssetUrl`) to decoded bytes. Lets the audio engines stay
 * framework-agnostic and origin-agnostic — in HTTP mode the key is a real
 * URL fetched normally; in static mode the key is opaque and the fetcher
 * looks up bytes from a FileSystemDirectoryHandle.
 */
export type AudioFetcher = (key: string) => Promise<ArrayBuffer>

/** Default fetcher: treats the key as an HTTP URL and fetches it directly. */
export const httpFetcher: AudioFetcher = async (key) => {
  const response = await fetch(key)
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${key} (${response.status})`)
  }
  return response.arrayBuffer()
}

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
