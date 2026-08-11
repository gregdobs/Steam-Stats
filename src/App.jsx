import { useApp } from './hooks/useAppContext.jsx';
import Navbar from './components/Navbar.jsx';
import SetupScreen from './components/SetupScreen.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Library from './pages/Library.jsx';
import Backlog from './pages/Backlog.jsx';
import Achievements from './pages/Achievements.jsx';
import History from './pages/History.jsx';
import Completion from './pages/Completion.jsx';

function LoadingOverlay() {
  const { loadingPhase } = useApp();
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', gap: 20,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24, boxShadow: '0 8px 32px rgba(59,130,246,0.35)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}>🎮</div>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
          Steam<span style={{ color: 'var(--accent-blue)' }}>Stats</span>
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{loadingPhase || 'Loading...'}</p>
      </div>
      <div style={{ width: 200, height: 3, background: 'var(--bg-tertiary)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: '60%', borderRadius: 99,
          backgroundImage: 'linear-gradient(90deg, var(--accent-blue) 0%, #93c5fd 50%, var(--accent-blue) 100%)',
          animation: 'shimmer 1.4s ease-in-out infinite', backgroundSize: '400px 100%',
        }} />
      </div>
    </div>
  );
}

function PageContent() {
  const { activePage } = useApp();
  switch (activePage) {
    case 'dashboard': return <Dashboard />;
    case 'library': return <Library />;
    case 'backlog': return <Backlog />;
    case 'achievements': return <Achievements />;
    case 'history': return <History />;
    case 'hltb': return <Completion />;
    default: return <Dashboard />;
  }
}

export default function App() {
  const { dataLoaded, loading } = useApp();
  if (!dataLoaded && !loading) return <SetupScreen />;
  if (loading) return <LoadingOverlay />;
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navbar />
      <main><PageContent /></main>
    </div>
  );
}
