import { useState } from 'react'
import GraphToolbar from '../components/editor/GraphToolbar'
import GraphCanvas from '../components/editor/GraphCanvas'
import FormView from '../components/editor/FormView'
import Sidebar from '../components/editor/Sidebar'

export default function EditorPage() {
  const [view, setView] = useState<'diagram' | 'list'>('diagram')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a1520', overflow: 'hidden' }}>
      <GraphToolbar view={view} onViewChange={setView} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {view === 'diagram' ? <GraphCanvas /> : <FormView />}
        <Sidebar />
      </div>
    </div>
  )
}
