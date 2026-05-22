export interface Node {
  id: string
  graph_id: string
  name: string
  audio_file_path: string | null
  stay_probability: number
  region: string | null
  canvas_x: number
  canvas_y: number
}

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
  game_title: string
  created_at: string
  nodes: Node[]
  edges: Edge[]
}

export interface GraphListItem {
  id: string
  name: string
  game_title: string
  created_at: string
  node_count: number
}

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
