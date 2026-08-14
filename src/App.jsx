import { useApp } from './hooks/useAppContext.jsx';
import Navbar from './components/Navbar.jsx';
import SetupScreen from './components/SetupScreen.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Library from './pages/Library.jsx';
import Progress from './pages/Progress.jsx';
import Achievements from './pages/Achievements.jsx';
import History from './pages/History.jsx';

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
        background: 'var(--accent-blue-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}>
        <svg width="26" height="26" viewBox="0 0 20 20" fill="none" stroke="var(--accent-blue)" strokeWidth="1.5" strokeLinecap="round"><circle cx="10" cy="10" r="7.2"></circle><path d="M10 5.4V10l3 2"></path></svg>
      </div>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          Steam Stats
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
    case 'progress': return <Progress />;
    case 'achievements': return <Achievements />;
    case 'history': return <History />;
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
