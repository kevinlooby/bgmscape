// ListenerPage — The primary listening experience.
// Full implementation in: bgmscape: Listener UI project (NIN-143, NIN-144, NIN-145)

import { useParams } from 'react-router-dom'

export default function ListenerPage() {
  const { graphId } = useParams<{ graphId: string }>()

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>bgmscape — Listener</h1>
      <p>Now-playing UI coming soon. (NIN-143)</p>
      {graphId && <p>Graph ID: <code>{graphId}</code></p>}
    </div>
  )
}
