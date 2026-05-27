import client from './client'
import type { Game, GameListItem } from '../types'

export const listGames = (): Promise<GameListItem[]> =>
  client.get('/api/games').then(r => r.data)

export const getGame = (gameId: string): Promise<Game> =>
  client.get(`/api/games/${gameId}`).then(r => r.data)

export const getGameBySlug = (slug: string): Promise<Game> =>
  client.get(`/api/games/by-slug/${slug}`).then(r => r.data)

export const createGame = (name: string, slug: string): Promise<Game> =>
  client.post('/api/games', { name, slug }).then(r => r.data)

export const updateGame = (
  gameId: string,
  data: { name?: string; slug?: string; default_graph_id?: string | null }
): Promise<Game> =>
  client.patch(`/api/games/${gameId}`, data).then(r => r.data)

export const setDefaultGraph = (gameId: string, graphId: string): Promise<Game> =>
  updateGame(gameId, { default_graph_id: graphId })

export const deleteGame = (gameId: string): Promise<void> =>
  client.delete(`/api/games/${gameId}`).then(() => undefined)
