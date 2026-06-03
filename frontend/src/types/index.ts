export interface Node {
  id: string
  graph_id: string
  name: string
  audio_file_path: string | null
  region: string | null
  canvas_x: number
  canvas_y: number
  loop_start: number | null
  loop_end: number | null
  /**
   * When true, the node's track plays exactly once (no looping) and the wander
   * timer fires at trackDuration with no variance added. Used for short
   * directional cues that aren't meant to loop.
   */
  is_transition: boolean
  /**
   * Free-form tags matched against the ambient asset library to pick which
   * atmospheric sounds (wind, water, fauna, …) play at this node. Empty
   * means no ambient layer for the node.
   */
  ambient_tags: string[]
}

// ── Ambient ──────────────────────────────────────────────────────────────────

/**
 * Vetting state set in the Vetting tab of /ambient. The runtime ambient engine
 * filters `marked_for_removal` out of selectActiveAssets, so flagging an asset
 * stops it from playing immediately; deletion is a separate manual step.
 */
export type AmbientReviewStatus = 'unreviewed' | 'included' | 'marked_for_removal'

export interface AmbientAsset {
  id: string
  name: string
  file_path: string
  category: string
  tags: string[]
  default_volume: number
  play_probability: number
  min_play_duration_s: number
  max_play_duration_s: number
  fade_in_ms: number
  fade_out_ms: number
  license: string | null
  review_status: AmbientReviewStatus
  created_at: string
}

export interface AmbientAssetCreate {
  name: string
  category: string
  tags: string[]
  default_volume: number
  play_probability: number
  min_play_duration_s: number
  max_play_duration_s: number
  fade_in_ms: number
  fade_out_ms: number
  license?: string | null
  review_status?: AmbientReviewStatus
}

export type AmbientAssetUpdate = Partial<AmbientAssetCreate>

export interface Edge {
  id: string
  graph_id: string
  source_node_id: string
  target_node_id: string
  weight: number
  bidirectional: boolean
}

export interface Graph {
  id: string
  name: string
  game_id: string | null
  created_at: string
  nodes: Node[]
  edges: Edge[]
}

export interface GraphListItem {
  id: string
  name: string
  game_id: string | null
  created_at: string
  node_count: number
}

// ── Games ────────────────────────────────────────────────────────────────────

export interface GameListItem {
  id: string
  name: string
  slug: string
  default_graph_id: string | null
  graph_count: number
  created_at: string
}

export interface GameGraphSummary {
  id: string
  name: string
  created_at: string
  node_count: number
  is_default: boolean
}

export interface Game {
  id: string
  name: string
  slug: string
  default_graph_id: string | null
  created_at: string
  graphs: GameGraphSummary[]
}

// ── Playback / sessions ──────────────────────────────────────────────────────

export interface PlaybackSession {
  id: string
  graph_id: string
  current_node_id: string | null
  wander_active: boolean
  nominated_next_node_id: string | null
  wander_history: string[]
  created_at: string
  updated_at: string
}

export interface AdvanceResponse {
  next_node_id: string
  node_name: string
  audio_file_path: string | null
}

export interface AudioUploadResponse {
  file_path: string
  filename: string
  size_bytes: number
}

export interface LoopAnalysisResult {
  loop_start: number
  loop_end: number
  duration: number
  confidence: number
}

export interface LookaheadStep {
  node_id: string
  node_name: string
  region: string | null
}

export interface LookaheadResponse {
  steps: LookaheadStep[]
}

export interface GraphExport {
  version: string
  name: string
  game_slug?: string | null
  game_title?: string | null
  nodes: Array<{
    id: string
    name: string
    region: string | null
    canvas_x: number
    canvas_y: number
    loop_start: number | null
    loop_end: number | null
    is_transition?: boolean
    ambient_tags?: string[]
  }>
  edges: Array<{
    id: string
    source_node_id: string
    target_node_id: string
    weight: number
    bidirectional: boolean
  }>
}
