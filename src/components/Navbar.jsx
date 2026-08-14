import { useState } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import SettingsModal from './SettingsModal.jsx';
import ShareCard from './ShareCard.jsx';

const ALL_TIME_PERIODS = [
  { id: '7days',   label: '7 Days',   source: 'snapshot', tooltip: 'Derived from local daily snapshots — accuracy improves over time', experimental: true },
  { id: '2weeks',  label: '2 Weeks',  source: 'api',      tooltip: 'Live from Steam API — most accurate',                              experimental: false },
  { id: '30days',  label: '30 Days',  source: 'snapshot', tooltip: 'Derived from local daily snapshots — accuracy improves over time', experimental: true },
  { id: 'alltime', label: 'All Time', source: 'api',      tooltip: 'Live from Steam API',                                             experimental: false },
];

const FEATURE_FLAGS_KEY = 'steam_dashboard_feature_flags';

function loadFeatureFlags() {
  try { return JSON.parse(localStorage.getItem(FEATURE_FLAGS_KEY) || '{}'); }
  catch { return {}; }
}

function saveFeatureFlags(flags) {
  try { localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(flags)); }
  catch {}
}

export { loadFeatureFlags, saveFeatureFlags, ALL_TIME_PERIODS, FEATURE_FLAGS_KEY };

// Thin line-art icons (stroke, no fill) matching the redesign's icon language —
// replaces the old emoji glyphs. `currentColor` picks up each nav button's text color.
const NAV_ICONS = {
  dashboard: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="2" width="5" height="5" rx="1.2"></rect><rect x="9" y="2" width="5" height="5" rx="1.2"></rect><rect x="2" y="9" width="5" height="5" rx="1.2"></rect><rect x="9" y="9" width="5" height="5" rx="1.2"></rect></svg>
  ),
  library: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="2.5" y="2.5" width="4" height="11" rx="1.2"></rect><rect x="9.5" y="2.5" width="4" height="11" rx="1.2"></rect></svg>
  ),
  progress: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="1.5" y="6" width="13" height="4" rx="2"></rect><path d="M2.5 8h6" strokeWidth="2.2"></path></svg>
  ),
  achievements: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="6.5" r="4"></circle><path d="M5.6 10l-1 4L8 12.4 11.4 14l-1-4"></path></svg>
  ),
  history: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 11.5l3.5-4 3 2.5 4.5-6"></path></svg>
  ),
};

const NAV_ITEMS = [
  { id: 'dashboard',    label: 'Dashboard' },
  { id: 'library',      label: 'Library' },
  { id: 'progress',     label: 'Progress' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'history',      label: 'History' },
];

function getConnectionStatus(profile, dataLoaded) {
  if (!profile || !dataLoaded) return 'disconnected';
  switch (profile.personastate) {
    case 1: return 'online';
    case 2: return 'busy';
    case 3: case 4: return 'away';
    default: return 'offline';
  }
}

const STATUS_COLORS = {
  online: '#10b981', busy: '#f43f5e', away: '#f59e0b',
  offline: '#64748b', disconnected: '#64748b',
};
const STATUS_LABELS = {
  online: 'Online', busy: 'Busy', away: 'Away',
  offline: 'Offline', disconnected: 'Not connected',
};

export function SourceBadge({ source, active }) {
  const isApi = source === 'api';
  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 8, fontWeight: 500, letterSpacing: '0.4px', textTransform: 'uppercase',
      padding: '1px 4px', borderRadius: 3, lineHeight: 1.4, transition: 'all 0.15s',
      background: active
        ? (isApi ? 'rgba(180,98,60,0.2)' : 'rgba(138,107,143,0.2)')
        : 'rgba(128,128,128,0.15)',
      color: active
        ? (isApi ? '#8f4b2d' : '#6b5470')
        : 'var(--text-muted)',
    }}>
      {isApi ? 'API' : 'SNP'}
    </span>
  );
}

export default function Navbar() {
  const {
    theme, toggleTheme, profile, activePage, setActivePage,
    dataLoaded, loadData, config,
  } = useApp();

  const [showSettings, setShowSettings] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);

  const connStatus = getConnectionStatus(profile, dataLoaded);
  const statusColor = STATUS_COLORS[connStatus];

  return (
    <>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: theme === 'dark' ? 'rgba(28,23,18,0.88)' : 'rgba(246,243,238,0.86)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-subtle)',
        height: 'var(--nav-height)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: '20px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--accent-blue)" strokeWidth="1.6" strokeLinecap="round"><circle cx="10" cy="10" r="7.2"></circle><path d="M10 5.4V10l3 2"></path></svg>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
            Steam Stats
          </span>
        </div>

        {/* Nav items */}
        {dataLoaded && (
          <div style={{ display: 'flex', gap: 4, flex: 1 }}>
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => setActivePage(item.id)} style={{
                background: activePage === item.id ? 'var(--accent-blue-dim)' : 'transparent',
                border: 'none', borderRadius: 9, padding: '7px 12px',
                cursor: 'pointer',
                color: activePage === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: 13.5, fontWeight: activePage === item.id ? 500 : 400,
                fontFamily: 'var(--font-body)', transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
              }}
                onMouseEnter={e => { if (activePage !== item.id) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                onMouseLeave={e => { if (activePage !== item.id) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ display: 'flex', color: activePage === item.id ? 'var(--accent-blue)' : 'currentColor' }}>{NAV_ICONS[item.id]}</span>{item.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: dataLoaded ? 0 : 1 }} />

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={toggleTheme} className="btn btn-ghost" style={{ width: 34, height: 34, padding: 0, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {dataLoaded && (
            <button
              onClick={() => loadData(config.apiKey, config.steamUrl)}
              className="btn btn-ghost"
              style={{ width: 34, height: 34, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Refresh data"
              aria-label="Refresh data"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          )}
          {dataLoaded && (
            <button
              onClick={() => setShowShareCard(true)}
              className="btn btn-ghost"
              style={{ width: 34, height: 34, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Create share card"
              aria-label="Create share card"
            >
              {/* Standard "share" glyph — three connected nodes, universally recognizable */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="10.51" x2="15.42" y2="6.51" /><line x1="8.59" y1="13.49" x2="15.42" y2="17.49" />
              </svg>
            </button>
          )}

          {profile ? (
            <button
              onClick={() => setShowSettings(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)', padding: '5px 10px 5px 6px',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
              title={`${profile.personaname} — ${STATUS_LABELS[connStatus]} · Open Settings`}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img src={profile.avatarmedium} alt={profile.personaname} style={{ width: 26, height: 26, borderRadius: '50%', display: 'block' }} />
                <div style={{
                  position: 'absolute', bottom: -1, right: -1,
                  width: 9, height: 9, borderRadius: '50%',
                  background: statusColor, border: '2px solid var(--bg-primary)',
                  boxShadow: `0 0 6px ${statusColor}`, transition: 'background 0.3s',
                }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                  {profile.personaname}
                </span>
                <span style={{ fontSize: 10, color: statusColor, lineHeight: 1.2, fontWeight: 500 }}>
                  {STATUS_LABELS[connStatus]}
                </span>
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 2 }}>⚙</span>
            </button>
          ) : (
            <button onClick={() => setShowSettings(true)} className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 15 }} title="Settings">⚙️</button>
          )}
        </div>
      </nav>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showShareCard && <ShareCard onClose={() => setShowShareCard(false)} />}
    </>
  );
}
