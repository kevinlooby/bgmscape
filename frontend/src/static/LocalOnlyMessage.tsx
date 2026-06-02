import { Link } from 'react-router-dom'

const MONO = 'monospace'

/**
 * Rendered in place of the editor / ambient-library pages when the app
 * runs in static-deploy mode. Editing requires the local FastAPI backend
 * + SQLite, neither of which exists in the deploy.
 */
export default function LocalOnlyMessage({ feature }: { feature: string }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#0a1520', color: '#c8d8e8',
      fontFamily: MONO, display: 'flex', justifyContent: 'center',
      padding: '80px 24px',
    }}>
      <div style={{ width: '100%', maxWidth: 580 }}>
        <div style={{
          fontSize: 11, color: '#4a90d9', letterSpacing: 3,
          textTransform: 'uppercase', marginBottom: 14,
        }}>
          bgmscape
        </div>
        <div style={{ fontSize: 24, color: '#e8f0fe', fontWeight: 700, marginBottom: 18 }}>
          {feature} is local-only
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: '#8a9bb0', marginBottom: 14 }}>
          The hosted version of bgmscape is listen-only. Editing graphs,
          uploading audio, and managing the ambient library all need the
          Python backend + a writable database, which only exist on a
          local checkout.
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: '#8a9bb0', marginBottom: 24 }}>
          To edit, clone the repo and run <code style={{ color: '#90b8e8' }}>.\\start.ps1</code>{' '}
          (Windows) or the equivalent for your OS. Re-run the snapshot
          exporter to refresh the hosted build with your changes.
        </p>
        <Link to="/" style={{
          padding: '10px 18px', borderRadius: 4,
          background: '#1e4a8a', color: '#e8f0fe',
          border: '1px solid #4a90d9',
          fontFamily: MONO, fontSize: 14, fontWeight: 700,
          textDecoration: 'none',
        }}>
          ← Back to game library
        </Link>
      </div>
    </div>
  )
}
