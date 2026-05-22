import { useEditor } from '../../store/editor'
import NodePanel from './NodePanel'
import EdgePanel from './EdgePanel'

export default function Sidebar() {
  const { graph, selectedNodeId, selectedEdgeId } = useEditor()

  const selectedNode = graph?.nodes.find(n => n.id === selectedNodeId) ?? null
  const selectedEdge = graph?.edges.find(e => e.id === selectedEdgeId) ?? null

  const sidebarStyle: React.CSSProperties = {
    width: 260,
    flexShrink: 0,
    background: '#0f1923',
    borderLeft: '1px solid #2d4a6e',
    padding: 16,
    overflowY: 'auto',
    height: '100%',
    boxSizing: 'border-box',
  }

  if (selectedNode) {
    return <div style={sidebarStyle}><NodePanel node={selectedNode} /></div>
  }

  if (selectedEdge) {
    return <div style={sidebarStyle}><EdgePanel edge={selectedEdge} /></div>
  }

  // Default: graph info
  return (
    <div style={sidebarStyle}>
      {graph ? (
        <>
          <h3 style={{ color: '#e8f0fe', marginTop: 0, fontSize: 14, fontFamily: 'monospace' }}>Graph Info</h3>
          <div style={{ color: '#8a9bb0', fontSize: 12, fontFamily: 'monospace', lineHeight: 2 }}>
            <div><span style={{ color: '#4a90d9' }}>name</span> {graph.name}</div>
            <div><span style={{ color: '#4a90d9' }}>game</span> {graph.game_title}</div>
            <div><span style={{ color: '#4a90d9' }}>nodes</span> {graph.nodes.length}</div>
            <div><span style={{ color: '#4a90d9' }}>edges</span> {graph.edges.length}</div>
          </div>
          <div style={{ marginTop: 16, color: '#4a6a8a', fontSize: 11, fontFamily: 'monospace' }}>
            Click a node or edge to edit it.
          </div>
        </>
      ) : (
        <div style={{ color: '#4a6a8a', fontSize: 12, fontFamily: 'monospace' }}>
          Select or create a graph to get started.
        </div>
      )}
    </div>
  )
}
