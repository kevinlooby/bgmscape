# bgmscape

## Vision

bgmscape recreates a feeling that game soundtracks lose when listened to as albums: the sense that music is flowing and shifting because someone nearby is playing the game. Tracks loop smoothly, transitions happen naturally, and the listener drifts through the game world without interruption.

The app models a game world as a graph. Each node is a location with a looping audio track. Edges connect adjacent locations. The listener — or the app itself — traverses this graph, crossfading between tracks as they move through the world.

**Tagline**: *Listen to a game soundtrack as though someone near you were playing — with the emphasis on the music.*

---

## Core Concepts

### Graph Model
- **Node**: a game location with a name, an audio track, and a stay probability
- **Edge**: a connection between two nodes with a traversal weight
- **Graph**: the complete map for one game/soundtrack; each game has its own graph

### Playback
- While at a node, the track loops seamlessly (end-to-start initially; auto loop-point detection later)
- Transitions trigger at natural phrase boundaries where possible, otherwise after a minimum dwell time
- All transitions are purely crossfade or fade-to-silence / fade-in — no interstitial audio

### Auto-Wander (primary feature)
The app traverses the graph autonomously. Navigation is governed by:
- **Edge weights**: some connections are more likely than others; hub nodes get higher inbound weight; recency weighting reduces ping-ponging between two nodes
- **Stay probability**: per-node chance of looping the current track again before moving, simulating a player lingering in an area
- **Manual steering**: while wandering, the user can nominate the next destination (takes effect at the next transition) without interrupting the current track
- **Teleport**: jump to any node in the graph immediately, triggering a transition from the current track

### Listener UX
- Default view: minimal now-playing panel (location name, track info)
- Expandable: full pixel-art map showing current position, animated avatar, and reachable neighbors
- The pixel-art map is the primary visual surface — auto-generated from graph structure, generic style across all games
- The avatar animates along the path between nodes on transition; it does not move on the node/edge designer canvas

### Map Editor (separate from listener)
- **Diagram view**: drag-and-drop node/edge canvas
- **Form view**: list-based editing of nodes and edges
- Per node: location name, audio file, stay probability
- Per edge: source, target, traversal weight, bidirectional flag
- Region/zone grouping on nodes (future: used for visual clustering and wander arc shaping)

---

## Phases

### Phase 1 — Local MVP
- FastAPI backend, React + TypeScript frontend, SQLite storage
- Graph data model (nodes, edges, weights, stay probabilities)
- Audio upload and local file management
- End-to-start track looping with crossfade transitions
- Auto-wander engine with weighted edge traversal and stay probability
- Manual steer and teleport controls
- Map editor (diagram + form view)
- Minimal now-playing listener UI

### Phase 2 — Listener Polish
- Pixel-art map view with animated avatar
- Auto loop-point detection (find the natural loop section of a track so the intro plays once)
- Natural transition timing (phrase-boundary detection or beat-sync)
- Region/zone grouping in the editor and map view
- Wander history / breadcrumb trail

### Phase 3 — Content & Discovery
- First complete graph: *The Legend of Zelda: Ocarina of Time*
- Graph sharing (export/import as JSON)
- Multi-user support and public graph library (when ready to deploy)

### Phase 4 — Sound Effects Layer
- Optional ambient/SFX layer per node
- Transition sound effects
- Volume mixing between music and effects

### Phase 5 — Mobile
- React → React Native port
- Android and iOS

---

## Tech Stack

### Backend
- **Python + FastAPI** — async, modern, auto-generates OpenAPI docs, easy path to production
- **SQLite via SQLAlchemy** — zero setup, file-based, swap for PostgreSQL when deploying
- **Audio files** — stored in a local folder; path configurable in settings

### Frontend
- **React + TypeScript** — component model maps cleanly to React Native for future mobile
- **Web Audio API** — looping, crossfading, gain control, future SFX mixing
- **HTML5 Canvas** — pixel-art map rendering with pixelated scaling
- **Graph layout** — force-directed layout (e.g., d3-force) to auto-position nodes on the pixel-art map

### Portability notes
- Keep backend business logic (wander engine, graph traversal, loop detection) in pure Python modules, independent of FastAPI — these can be reused or tested in isolation
- Keep audio logic in the Web Audio API layer cleanly separated from UI components — this eases porting to React Native (which will use a different audio library)
- SQLAlchemy models should work against both SQLite and PostgreSQL with no changes

---

## Data Model (initial)

```
Graph
  id, name, game_title, created_at

Node
  id, graph_id, name, audio_file_path, stay_probability (0.0–1.0)
  region (nullable)
  canvas_x, canvas_y  (position in diagram editor)

Edge
  id, graph_id, source_node_id, target_node_id
  weight (float, default 1.0)
  bidirectional (bool)

PlaybackSession
  id, graph_id, current_node_id, wander_history (JSON), created_at
```

---

## Wander Engine (behavior spec)

At each transition decision:
1. Roll against the current node's `stay_probability` — if hit, loop the current track and re-evaluate later
2. Collect outgoing edges; compute effective weight for each:
   - Base edge weight
   - Recency penalty: divide by (times traversed recently + 1) to suppress back-and-forth
3. Sample next node from weighted distribution
4. If user has nominated a next destination via steer, use that instead and clear the nomination
5. Initiate crossfade transition; update session history

---

## First Graph: Ocarina of Time

Start with a representative subset (~15–20 nodes) covering the main overworld and a few dungeons, then expand. Key locations to include in v1:
- Hyrule Field, Kokiri Forest, Kakariko Village, Goron City, Zora's Domain, Lake Hylia, Gerudo Valley, Lon Lon Ranch, Temple of Time, Market / Hyrule Castle Town
- At least one dungeon (e.g., Dodongo's Cavern or the Forest Temple)

---

## Design Principles

- The music is the product. The graph is infrastructure.
- Transitions should feel inevitable, not mechanical.
- Wander mode should be satisfying to just leave running.
- The map editor must be approachable — you'll be using it a lot to build graphs.
- Build locally first; design for portability from day one.
