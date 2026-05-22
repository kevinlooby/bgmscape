import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { Node as DomainNode } from '../../types'

const styles = {
  node: {
    background: '#1e2a3a',
    border: '2px solid #4a90d9',
    borderRadius: 8,
    padding: '10px 14px',
    minWidth: 160,
    cursor: 'pointer',
    fontFamily: 'monospace',
  } as React.CSSProperties,
  nodeSelected: {
    border: '2px solid #f0c040',
  } as React.CSSProperties,
  name: {
    color: '#e8f0fe',
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 4,
  } as React.CSSProperties,
  region: {
    display: 'inline-block',
    background: '#2d4a6e',
    color: '#90b8e8',
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    marginBottom: 4,
  } as React.CSSProperties,
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  } as React.CSSProperties,
  dot: (hasAudio: boolean) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: hasAudio ? '#4caf50' : '#e53935',
    flexShrink: 0,
  } as React.CSSProperties),
  stay: {
    color: '#8a9bb0',
    fontSize: 10,
  } as React.CSSProperties,
}

function LocationNode({ data, selected }: NodeProps<DomainNode>) {
  const hasAudio = !!data.audio_file_path

  return (
    <div style={{ ...styles.node, ...(selected ? styles.nodeSelected : {}) }}>
      <Handle type="target" position={Position.Left} style={{ background: '#4a90d9' }} />
      <div style={styles.name}>{data.name}</div>
      {data.region && <div style={styles.region}>{data.region}</div>}
      <div style={styles.meta}>
        <div style={styles.dot(hasAudio)} title={hasAudio ? 'Audio assigned' : 'No audio'} />
        <span style={styles.stay}>stay {Math.round(data.stay_probability * 100)}%</span>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#4a90d9' }} />
    </div>
  )
}

export default memo(LocationNode)
