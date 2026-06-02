import client from './client'
import type { Game, GameListItem } from '../types'
import { STATIC_MODE } from '../static/mode'
import * as staticSrc from '../static/staticDataSource'

export const listGames = (): Promise<GameListItem[]> => {
  if (STATIC_MODE) {
    return staticSrc.getGames().then(games =>
      games.map(g => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
        default_graph_id: g.default_graph_id,
        graph_count: g.graphs.length,
        created_at: g.created_at,
      }))
    )
  }
  return client.get('/api/games').then(r => r.data)
}

export const getGame = (gameId: string): Promise<Game> => {
  if (STATIC_MODE) return staticSrc.getGame(gameId)
  return client.get(`/api/games/${gameId}`).then(r => r.data)
}

export const getGameBySlug = (slug: string): Promise<Game> => {
  if (STATIC_MODE) return staticSrc.getGameBySlug(slug)
  return client.get(`/api/games/by-slug/${slug}`).then(r => r.data)
}

export const createGame = (name: string, slug: string): Promise<Game> => {
  if (STATIC_MODE) return staticSrc.writeNotSupported('createGame')
  return client.post('/api/games', { name, slug }).then(r => r.data)
}

export const updateGame = (
  gameId: string,
  data: { name?: string; slug?: string; default_graph_id?: string | null }
): Promise<Game> => {
  if (STATIC_MODE) return staticSrc.writeNotSupported('updateGame')
  return client.patch(`/api/games/${gameId}`, data).then(r => r.data)
}

export const setDefaultGraph = (gameId: string, graphId: string): Promise<Game> =>
  updateGame(gameId, { default_graph_id: graphId })

export const deleteGame = (gameId: string): Promise<void> => {
  if (STATIC_MODE) return staticSrc.writeNotSupported('deleteGame')
  return client.delete(`/api/games/${gameId}`).then(() => undefined)
}
