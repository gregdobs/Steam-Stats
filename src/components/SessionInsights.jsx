import { useState } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import { estimateLibrarySessionStats, estimateSessionStats, formatHours } from '../utils/steam.js';
import { GameHeader } from './GameImage.jsx';

export default function SessionInsights() {
  const { ownedGames, localConfig } = useApp();
  const [showInfo, setShowInfo] = useState(false);

  if (!localConfig?.found) {
    return (
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          Session Insights
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Requires local Steam data (launch counts). Connect your local Steam install in Settings to unlock this.
        </p>
      </div>
    );
  }

  const stats = estimateLibrarySessionStats(ownedGames);
  if (!stats) {
    return (
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          Session Insights
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No launch data available yet.</p>
      </div>
    );
  }

  // Top 5 games by launch count — "most habitually opened"
  const mostLaunched = [...ownedGames]
    .filter(g => g.launchCount > 0)
    .sort((a, b) => b.launchCount - a.launchCount)
    .slice(0, 5);

  const bucketColors = {
    'Quick (<30m)': 'var(--accent-blue)',
    'Short (30-90m)': 'var(--accent-emerald)',
    'Medium (1.5-3h)': 'var(--accent-amber)',
    'Long (3h+)': 'var(--accent-violet)',
  };
  const maxBucket = Math.max(...Object.values(stats.buckets));

  return (
    <div className="card" style={{ padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
          Session Insights
        </h3>
        <button
          onClick={() => setShowInfo(v => !v)}
          style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: '50%', width: 20, height: 20, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >?</button>
      </div>

      {showInfo && (
        <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
          <strong>These are estimates, not exact reconstructions.</strong> Steam doesn't expose true session start/stop times through any available API or local file. These numbers are derived from total hours ÷ launch count per game — a reasonable approximation of "typical session length," not a minute-by-minute session log.
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
        Estimated from launch counts and total playtime · {stats.gamesWithData} games with data
      </p>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>Total Launches</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--accent-blue)' }}>{stats.totalLaunches.toLocaleString()}</div>
        </div>
        <div style={{ padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>Avg. Session*</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--accent-emerald)' }}>{stats.avgSessionHours}h</div>
        </div>
      </div>

      {/* Session length distribution */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 10 }}>
          Session length distribution*
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(stats.buckets).map(([label, count]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 110, flexShrink: 0 }}>{label}</span>
              <div style={{ flex: 1, height: 10, background: 'var(--border-default)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(count / maxBucket) * 100}%`, background: bucketColors[label], borderRadius: 99, transition: 'width 0.5s ease' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)', color: bucketColors[label], width: 24, textAlign: 'right', flexShrink: 0 }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Most habitually launched games */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 10 }}>
          Most habitually opened
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mostLaunched.map(game => {
            const s = estimateSessionStats(game);
            return (
              <div key={game.appid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 18, borderRadius: 3, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-tertiary)' }}>
                  <GameHeader appId={game.appid} name={game.name} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{game.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s ? `~${s.avgSessionHours}h/session` : ''}</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--accent-blue)', flexShrink: 0 }}>{game.launchCount}×</span>
              </div>
            );
          })}
        </div>
      </div>

      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 16, fontStyle: 'italic' }}>
        *Estimated as total hours ÷ launch count. Actual session lengths may vary.
      </p>
    </div>
  );
}
