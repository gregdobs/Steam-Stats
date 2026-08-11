import { useState, useEffect } from 'react';
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

const NAV_ITEMS = [
  { id: 'dashboard',    label: 'Dashboard',    icon: '⊞' },
  { id: 'library',      label: 'Library',      icon: '📚' },
  { id: 'backlog',      label: 'Backlog',      icon: '📥' },
  { id: 'achievements', label: 'Achievements', icon: '🏆' },
  { id: 'hltb',         label: 'Completion',   icon: '🎯' },
  { id: 'history',      label: 'History',      icon: '📈' },
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

function SourceBadge({ source, active }) {
  const isApi = source === 'api';
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase',
      padding: '1px 4px', borderRadius: 3, lineHeight: 1.4, transition: 'all 0.15s',
      background: active
        ? (isApi ? 'rgba(59,130,246,0.25)' : 'rgba(139,92,246,0.25)')
        : 'rgba(128,128,128,0.15)',
      color: active
        ? (isApi ? '#93c5fd' : '#c4b5fd')
        : 'var(--text-muted)',
    }}>
      {isApi ? 'API' : 'SNP'}
    </span>
  );
}

export default function Navbar() {
  const {
    theme, toggleTheme, profile, activePage, setActivePage,
    timePeriod, setTimePeriod, dataLoaded, loadData, config,
  } = useApp();

  const [showSettings, setShowSettings] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [hoveredPeriod, setHoveredPeriod] = useState(null);
  const [featureFlags, setFeatureFlags] = useState(loadFeatureFlags);

  // Keep featureFlags in sync with localStorage changes (e.g. from Settings)
  useEffect(() => {
    const onStorage = () => setFeatureFlags(loadFeatureFlags());
    window.addEventListener('storage', onStorage);
    // Also poll for changes made in the same tab (Settings modal)
    const interval = setInterval(() => setFeatureFlags(loadFeatureFlags()), 500);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(interval); };
  }, []);

  // Filter to only enabled periods; if current period is now disabled, reset to 2weeks
  const enabledPeriods = ALL_TIME_PERIODS.filter(p => !p.experimental || featureFlags[`period_${p.id}`]);
  useEffect(() => {
    if (!enabledPeriods.find(p => p.id === timePeriod)) {
      setTimePeriod('2weeks');
    }
  }, [featureFlags]);

  const connStatus = getConnectionStatus(profile, dataLoaded);
  const statusColor = STATUS_COLORS[connStatus];

  return (
    <>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: theme === 'dark' ? 'rgba(8,12,20,0.88)' : 'rgba(248,250,252,0.88)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border-subtle)',
        height: 'var(--nav-height)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: '20px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🎮</div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
            Steam<span style={{ color: 'var(--accent-blue)' }}>Stats</span>
          </span>
        </div>

        {/* Nav items */}
        {dataLoaded && (
          <div style={{ display: 'flex', gap: 2, flex: 1 }}>
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => setActivePage(item.id)} style={{
                background: activePage === item.id ? 'var(--accent-blue-dim)' : 'transparent',
                border: 'none', borderRadius: 'var(--radius-md)', padding: '6px 12px',
                cursor: 'pointer',
                color: activePage === item.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: activePage === item.id ? 600 : 400,
                fontFamily: 'var(--font-body)', transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              }}
                onMouseEnter={e => { if (activePage !== item.id) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                onMouseLeave={e => { if (activePage !== item.id) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 13 }}>{item.icon}</span>{item.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: dataLoaded ? 0 : 1 }} />

        {/* Time period toggle */}
        {dataLoaded && activePage === 'dashboard' && (
          <div style={{ position: 'relative' }}>
            <div style={{
              display: 'flex', gap: 2, padding: 3,
              background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}>
              {enabledPeriods.map(p => {
                const isActive = timePeriod === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setTimePeriod(p.id)}
                    onMouseEnter={() => setHoveredPeriod(p.id)}
                    onMouseLeave={() => setHoveredPeriod(null)}
                    title={p.tooltip}
                    style={{
                      background: isActive ? 'var(--bg-secondary)' : 'transparent',
                      border: isActive ? '1px solid var(--border-default)' : '1px solid transparent',
                      borderRadius: 'calc(var(--radius-md) - 2px)',
                      padding: '4px 10px',
                      cursor: 'pointer',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontFamily: 'var(--font-body)', transition: 'all 0.15s ease',
                      boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: isActive ? 600 : 400, lineHeight: 1 }}>{p.label}</span>
                    <SourceBadge source={p.source} active={isActive} />
                  </button>
                );
              })}
            </div>

            {/* Hover tooltip */}
            {hoveredPeriod && (() => {
              const p = ALL_TIME_PERIODS.find(p => p.id === hoveredPeriod);
              return (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'var(--text-primary)', color: 'var(--text-inverse)',
                  padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                  fontSize: 11, whiteSpace: 'nowrap', zIndex: 200,
                  pointerEvents: 'none', animation: 'fadeInFast 0.1s ease',
                }}>
                  <span style={{ fontWeight: 700 }}>{p?.label}</span>{' — '}
                  <span style={{ opacity: 0.8 }}>{p?.tooltip}</span>
                </div>
              );
            })()}
          </div>
        )}

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
