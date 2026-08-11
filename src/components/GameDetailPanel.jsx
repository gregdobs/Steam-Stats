import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../hooks/useAppContext.jsx';
import { formatHours, formatLastPlayed, minutesToHours, getCompletionStatus } from '../utils/steam.js';
import { GameHeader } from './GameImage.jsx';

const PANEL_W = 300;
const PANEL_H = 480; // estimated max height
const MARGIN  = 12;  // gap between card edge and panel

// ── Floating popover panel ─────────────────────────────────
// anchorRect: DOMRect of the element that was clicked
// If no anchorRect, renders inline (e.g. in Settings modal)
export default function GameDetailPanel({ game, onClose, achData, hltbData, anchorRect, inline }) {
  const { ownedGames, recentGames } = useApp();
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);

  // Escape key
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Compute best position relative to anchorRect
  useEffect(() => {
    if (!anchorRect || inline) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer right of card; fall back left, then below, then above
    let left, top;

    // Try right
    if (anchorRect.right + MARGIN + PANEL_W <= vw - MARGIN) {
      left = anchorRect.right + MARGIN;
    }
    // Try left
    else if (anchorRect.left - MARGIN - PANEL_W >= MARGIN) {
      left = anchorRect.left - MARGIN - PANEL_W;
    }
    // Fall back: align to right edge of viewport
    else {
      left = Math.max(MARGIN, vw - PANEL_W - MARGIN);
    }

    // Vertically: align top with card, clamp to viewport
    top = Math.min(
      Math.max(MARGIN, anchorRect.top + window.scrollY),
      window.scrollY + vh - PANEL_H - MARGIN
    );

    setPos({ left, top });
  }, [anchorRect, inline]);

  if (!game) return null;

  const allTimeMinutes = game.playtime_forever || 0;
  const periodMinutes  = game.playtime_2weeks   || 0;
  const totalLibMin    = ownedGames.reduce((s, g) => s + (g.playtime_forever || 0), 0);
  const totalPeriodMin = recentGames.reduce((s, g) => s + (g.playtime_2weeks  || 0), 0);

  const allTimeHours = minutesToHours(allTimeMinutes);
  const libraryPct   = totalLibMin   > 0 ? Math.round((allTimeMinutes / totalLibMin)    * 100) : 0;
  const periodPct    = totalPeriodMin > 0 ? Math.round((periodMinutes  / totalPeriodMin) * 100) : 0;
  const avgSession   = game.launchCount && allTimeMinutes ? parseFloat((allTimeMinutes / 60 / game.launchCount).toFixed(1)) : null;
  const lastPlayed   = game.localLastPlayed || game.rtime_last_played;

  const rank = [...ownedGames]
    .filter(g => g.playtime_forever > 0)
    .sort((a, b) => b.playtime_forever - a.playtime_forever)
    .findIndex(g => g.appid === game.appid) + 1;

  const hltbMain        = hltbData?.mainStory;
  const completionStatus = hltbMain ? getCompletionStatus(allTimeHours, hltbMain) : null;
  const completionPct   = hltbMain ? Math.min(Math.round((allTimeHours / hltbMain) * 100), 200) : null;

  const earned     = achData?.earned    ?? null;
  const achTotal   = achData?.total     ?? null;
  const achPct     = achData?.pct       ?? null;
  const lastUnlock = achData?.lastUnlockTime;

  const STATUS_COLOR = {
    'Barely Started': 'var(--text-muted)',
    'In Progress':    'var(--accent-blue)',
    'Getting There':  'var(--accent-amber)',
    'Completed':      'var(--accent-emerald)',
    'Overplayer':     'var(--accent-violet)',
  };

  const content = (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="card"
      style={{
        width: PANEL_W,
        maxHeight: `min(${PANEL_H}px, 85vh)`,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        outline: 'none',
        boxShadow: 'var(--shadow-xl)',
        // When floating, position is handled by wrapper
      }}
    >
      {/* Header image */}
      <div style={{ height: 120, background: 'var(--bg-tertiary)', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <GameHeader appId={game.appid} name={game.name} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)' }} />
        <button
          onClick={onClose} aria-label="Close"
          style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.85)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.55)'}
        >✕</button>
        {rank > 0 && (
          <div style={{ position: 'absolute', bottom: 8, left: 10, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-display)' }}>
            #{rank} in library
          </div>
        )}
        {completionStatus && (
          <div style={{ position: 'absolute', bottom: 8, right: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: 'rgba(0,0,0,0.6)', color: STATUS_COLOR[completionStatus.label] || 'white' }}>
              {completionStatus.icon} {completionStatus.label}
            </span>
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
          {game.name}
        </div>

        {/* Period ring */}
        {periodMinutes > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', width: 46, height: 46, flexShrink: 0 }}>
              <svg viewBox="0 0 46 46" width={46} height={46}>
                <circle cx={23} cy={23} r={17} fill="none" stroke="var(--border-default)" strokeWidth={5} />
                <circle cx={23} cy={23} r={17} fill="none" stroke="var(--accent-blue)" strokeWidth={5}
                  strokeDasharray={`${2*Math.PI*17*Math.min(periodPct,100)/100} ${2*Math.PI*17}`}
                  strokeLinecap="round" transform="rotate(-90 23 23)"
                  style={{ transition: 'stroke-dasharray 0.6s ease' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700, color: 'var(--accent-blue)' }}>
                {periodPct}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 1 }}>Period share</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{periodPct}% of gaming time</div>
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            periodMinutes > 0 && { label: 'This Period', value: formatHours(periodMinutes), color: 'var(--accent-blue)' },
            { label: 'All Time',    value: formatHours(allTimeMinutes),       color: 'var(--text-secondary)' },
            avgSession &&       { label: 'Avg Session', value: `${avgSession}h`,            color: 'var(--accent-emerald)' },
            game.launchCount && { label: 'Launches',    value: `${game.launchCount}×`,      color: 'var(--text-secondary)' },
            { label: '% Library',   value: `${libraryPct}%`,                  color: 'var(--accent-amber)' },
            lastPlayed &&       { label: 'Last Played', value: formatLastPlayed(lastPlayed), color: 'var(--text-muted)' },
          ].filter(Boolean).slice(0, 6).map(s => (
            <div key={s.label} style={{ padding: '6px 8px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 1 }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Library % bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>% of library hours</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-amber)' }}>{libraryPct}%</span>
          </div>
          <div className="progress-bar" style={{ height: 4 }}>
            <div className="progress-fill" style={{ width: `${Math.min(libraryPct * 5, 100)}%`, background: 'var(--accent-amber)' }} />
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
            {formatHours(allTimeMinutes)} of {formatHours(totalLibMin)} total
          </div>
        </div>

        {/* HLTB */}
        {hltbData && !hltbData.error && hltbMain && (
          <div style={{ padding: '8px 10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>HowLongToBeat</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {hltbData.mainStory    && <div><div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Main</div><div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{hltbData.mainStory}h</div></div>}
              {hltbData.mainExtra    && <div><div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>+Extra</div><div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>{hltbData.mainExtra}h</div></div>}
              {hltbData.completionist && <div><div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>100%</div><div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>{hltbData.completionist}h</div></div>}
            </div>
            {completionPct !== null && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Your completion</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: completionPct >= 100 ? 'var(--accent-emerald)' : 'var(--accent-blue)' }}>{completionPct > 200 ? '200%+' : `${completionPct}%`}</span>
                </div>
                <div className="progress-bar" style={{ height: 4 }}>
                  <div className="progress-fill" style={{ width: `${Math.min(completionPct, 100)}%`, background: completionPct >= 100 ? 'var(--accent-emerald)' : completionPct >= 75 ? 'var(--accent-amber)' : 'var(--accent-blue)' }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Achievements */}
        {achTotal > 0 && earned !== null && (
          <div style={{ padding: '8px 10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Achievements</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: achPct === 100 ? 'var(--accent-emerald)' : 'var(--accent-blue)' }}>{earned}/{achTotal} · {achPct}%</div>
            </div>
            <div className="progress-bar" style={{ height: 4 }}>
              <div className="progress-fill" style={{ width: `${achPct ?? 0}%`, background: achPct === 100 ? 'var(--accent-emerald)' : achPct >= 75 ? 'var(--accent-amber)' : 'var(--accent-blue)' }} />
            </div>
            {lastUnlock > 0 && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Last unlock: {formatLastPlayed(lastUnlock)}</div>}
          </div>
        )}

        {/* Tags */}
        {game.userTags?.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {game.userTags.map(tag => (
              <span key={tag} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 'var(--radius-full)', background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', fontWeight: 600 }}>{tag}</span>
            ))}
          </div>
        )}

        {/* Steam store link */}
        <a href={`https://store.steampowered.com/app/${game.appid}`} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', color: 'var(--text-muted)', fontSize: 12, textDecoration: 'none', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-blue-dim)'; e.currentTarget.style.color = 'var(--accent-blue)'; e.currentTarget.style.borderColor = 'var(--accent-blue)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-tertiary)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-default)'; }}
        >
          View on Steam Store ↗
        </a>
      </div>
    </div>
  );

  // Inline mode (used inside sub-modals like Settings)
  if (inline || !anchorRect) {
    return (
      <div style={{ animation: 'fadeIn 0.22s ease' }}>
        {content}
      </div>
    );
  }

  // Floating mode — renders into a portal so it escapes any overflow:hidden containers
  return createPortal(
    <>
      {/* Click-outside backdrop (invisible) */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 399 }}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        style={{
          position: 'absolute',
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          zIndex: 400,
          animation: 'fadeIn 0.18s ease',
          pointerEvents: pos ? 'auto' : 'none',
          opacity: pos ? 1 : 0,
        }}
      >
        {content}
      </div>
    </>,
    document.body
  );
}
