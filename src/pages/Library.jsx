import { useRef, useState, useEffect, useCallback } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import { formatHours } from '../utils/steam.js';
import { GameHeader } from '../components/GameImage.jsx';
import GameDetailPanel from '../components/GameDetailPanel.jsx';
import GenreAllocation from '../components/GenreAllocation.jsx';
import { ACCENT_HEX, hexToRgba, categoryColor, PageHeader } from '../components/designSystem.jsx';

// ── Colour tokens ──────────────────────────────────────────────────────────
const BUCKET_META = [
  { key: 'Never played',   color: 'var(--text-muted)', min: 0,   max: 0    },
  { key: '< 1 hour',       color: categoryColor(0), min: 0,   max: 1    },
  { key: '1–10 hours',     color: categoryColor(1), min: 1,   max: 10   },
  { key: '10–50 hours',    color: categoryColor(2), min: 10,  max: 50   },
  { key: '50–200 hours',   color: categoryColor(3), min: 50,  max: 200  },
  { key: '200–500 hours',  color: categoryColor(4), min: 200, max: 500  },
  { key: '500+ hours',     color: 'var(--text-primary)', min: 500, max: Infinity },
];

function getBucket(game) {
  const h = (game.playtime_forever || 0) / 60;
  if (h === 0)   return 'Never played';
  if (h < 1)     return '< 1 hour';
  if (h < 10)    return '1–10 hours';
  if (h < 50)    return '10–50 hours';
  if (h < 200)   return '50–200 hours';
  if (h < 500)   return '200–500 hours';
  return '500+ hours';
}

// ── Interactive SVG Donut ──────────────────────────────────────────────────
function DistributionDonut({ games, activeFilter, onFilter }) {
  const [hovered, setHovered] = useState(null);
  const SIZE = 220, CX = 110, CY = 110, R_OUT = 90, R_IN = 56, GAP = 0.022;

  const counts = {};
  BUCKET_META.forEach(b => { counts[b.key] = 0; });
  games.forEach(g => { counts[getBucket(g)]++; });
  const total = games.length;

  let cursor = -Math.PI / 2;
  const arcs = BUCKET_META.map(b => {
    const count = counts[b.key];
    const fraction = total > 0 ? count / total : 0;
    const angle = fraction * 2 * Math.PI - GAP;
    const start = cursor + GAP / 2;
    const end = start + Math.max(angle, 0);
    cursor += fraction * 2 * Math.PI;

    const isSel = activeFilter?.type === 'bucket' && activeFilter.value === b.key;
    const isHov = hovered === b.key;
    const r = isSel ? R_OUT + 8 : isHov ? R_OUT + 4 : R_OUT;
    const ri = isSel ? R_IN - 4 : R_IN;

    const large = angle > Math.PI ? 1 : 0;
    const pts = fraction > 0.001 ? [
      `M ${CX + r * Math.cos(start)} ${CY + r * Math.sin(start)}`,
      `A ${r} ${r} 0 ${large} 1 ${CX + r * Math.cos(end)} ${CY + r * Math.sin(end)}`,
      `L ${CX + ri * Math.cos(end)} ${CY + ri * Math.sin(end)}`,
      `A ${ri} ${ri} 0 ${large} 0 ${CX + ri * Math.cos(start)} ${CY + ri * Math.sin(start)}`,
      'Z',
    ].join(' ') : null;

    return { ...b, count, fraction, pts, isSel, isHov };
  }).filter(a => a.pts);

  const selBucket = BUCKET_META.find(b => b.key === activeFilter?.value);
  const centerCount = activeFilter?.type === 'bucket'
    ? counts[activeFilter.value]
    : total;
  const centerLabel = activeFilter?.type === 'bucket' ? activeFilter.value : 'total games';

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} style={{ overflow: 'visible' }}>
          <defs>
            <filter id="dshadow"><feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,0.25)" /></filter>
          </defs>
          {arcs.map(arc => (
            <path
              key={arc.key}
              d={arc.pts}
              fill={arc.color}
              opacity={activeFilter?.type === 'bucket' && !arc.isSel ? 0.35 : 1}
              filter={arc.isSel ? 'url(#dshadow)' : undefined}
              style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
              onClick={() => onFilter(
                arc.isSel ? null : { type: 'bucket', value: arc.key, label: arc.key, color: arc.color }
              )}
              onMouseEnter={() => setHovered(arc.key)}
              onMouseLeave={() => setHovered(null)}
              role="button"
              aria-label={`${arc.key}: ${arc.count} games`}
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onFilter(arc.isSel ? null : { type: 'bucket', value: arc.key, label: arc.key, color: arc.color })}
            />
          ))}
          {/* center hole */}
          <circle cx={CX} cy={CY} r={R_IN - 4} fill="var(--bg-card)" />
          <text x={CX} y={CY - 8} textAnchor="middle" dominantBaseline="central"
            fill="var(--text-primary)" fontSize={22} fontWeight={700} fontFamily="'DM Sans', sans-serif">
            {centerCount}
          </text>
          <text x={CX} y={CY + 14} textAnchor="middle" dominantBaseline="central"
            fill="var(--text-muted)" fontSize={10} fontFamily="'DM Mono', monospace">
            {centerLabel}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
        {BUCKET_META.map(b => {
          const count = counts[b.key];
          const isSel = activeFilter?.type === 'bucket' && activeFilter.value === b.key;
          return (
            <button key={b.key} onClick={() => onFilter(isSel ? null : { type: 'bucket', value: b.key, label: b.key, color: b.color })}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 'var(--radius-md)', width: '100%',
                border: isSel ? `1px solid ${b.color}` : '1px solid transparent',
                background: isSel ? `color-mix(in srgb, ${b.color} 15%, transparent)` : 'transparent',
                cursor: 'pointer', textAlign: 'left',
                opacity: activeFilter?.type === 'bucket' && !isSel ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ width: 9, height: 9, borderRadius: 2, background: b.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{b.key}</span>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)', color: isSel ? b.color : 'var(--text-muted)' }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Interactive SVG Bar Chart (top 15) ────────────────────────────────────
function TopGamesBar({ games, activeFilter, onFilter, theme }) {
  const [hovered, setHovered] = useState(null);
  const top = games.slice(0, 15);
  const maxVal = Math.max(...top.map(g => g.playtime_forever || 0), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {top.map((game, i) => {
        const hours = (game.playtime_forever || 0) / 60;
        const pct = (game.playtime_forever || 0) / maxVal;
        const isSel = activeFilter?.type === 'game' && activeFilter.value === game.appid;
        const isHov = hovered === game.appid;
        const barColor = isSel ? 'var(--accent-blue)' : hexToRgba(ACCENT_HEX, Math.max(0.85 - i * 0.04, 0.35));

        return (
          <div key={game.appid}
            onClick={() => onFilter(isSel ? null : { type: 'game', value: game.appid, label: game.name })}
            onMouseEnter={() => setHovered(game.appid)}
            onMouseLeave={() => setHovered(null)}
            role="button" tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onFilter(isSel ? null : { type: 'game', value: game.appid, label: game.name })}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '5px 8px', borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              background: isSel ? 'var(--accent-blue-dim)' : isHov ? 'var(--bg-tertiary)' : 'transparent',
              border: isSel ? '1px solid var(--accent-blue)' : '1px solid transparent',
              opacity: activeFilter?.type === 'game' && !isSel ? 0.45 : 1,
              transition: 'all 0.15s',
            }}
          >
            {/* Rank */}
            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 18, textAlign: 'right', flexShrink: 0 }}>
              {i + 1}
            </span>
            {/* Name */}
            <span style={{
              fontSize: 12, color: isSel ? 'var(--accent-blue)' : 'var(--text-secondary)',
              fontWeight: isSel ? 600 : 400,
              width: 160, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {game.name}
            </span>
            {/* Bar */}
            <div style={{ flex: 1, height: 8, background: 'var(--border-default)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct * 100}%`,
                background: barColor,
                borderRadius: 99,
                boxShadow: isSel ? '0 0 8px var(--accent-blue)' : 'none',
                transition: 'width 0.4s ease, background 0.15s',
              }} />
            </div>
            {/* Hours */}
            <span style={{
              fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700,
              color: isSel ? 'var(--accent-blue)' : 'var(--text-muted)',
              width: 44, textAlign: 'right', flexShrink: 0,
            }}>
              {hours >= 100 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Scatter Plot ───────────────────────────────────────────────────────────
function ScatterPlot({ games, activeFilter, onFilter }) {
  const [hovered, setHovered] = useState(null);
  const withData = games.filter(g => g.launchCount && g.playtime_forever > 0);

  if (withData.length < 5) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      Launch count data becomes available after connecting your local Steam installation.
    </div>
  );

  const maxLaunches = Math.max(...withData.map(g => g.launchCount));
  const maxHours = Math.max(...withData.map(g => g.playtime_forever / 60));
  const TOOLTIP_W = 160;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ position: 'relative', minWidth: 400, height: 300 }}>
        {/* Axis labels */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 20, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', padding: '0 8px' }}>
          <span>Low launches</span><span>→ Launches →</span><span>High launches</span>
        </div>
        {/* Quadrant labels */}
        <div style={{ position: 'absolute', top: 4, left: 8, fontSize: 9, color: 'var(--text-muted)', opacity: 0.6, lineHeight: 1.4 }}>Long sessions,<br />rare player</div>
        <div style={{ position: 'absolute', top: 4, right: 8, fontSize: 9, color: 'var(--text-muted)', opacity: 0.6, textAlign: 'right', lineHeight: 1.4 }}>Frequent,<br />deep player</div>
        <div style={{ position: 'absolute', bottom: 24, left: 8, fontSize: 9, color: 'var(--text-muted)', opacity: 0.6, lineHeight: 1.4 }}>Casual,<br />rarely played</div>
        <div style={{ position: 'absolute', bottom: 24, right: 8, fontSize: 9, color: 'var(--text-muted)', opacity: 0.6, textAlign: 'right', lineHeight: 1.4 }}>Habitually<br />launched</div>
        {/* Grid lines */}
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--border-subtle)' }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 20, width: 1, background: 'var(--border-subtle)' }} />
        {/* Dots */}
        {withData.slice(0, 80).map(g => {
          const x = (g.launchCount / maxLaunches) * 90 + 5;
          const y = 100 - ((g.playtime_forever / 60) / maxHours) * 88 - 5;
          const size = Math.max(7, Math.min(20, Math.sqrt(g.playtime_forever / 60) * 1.4));
          const isSel = activeFilter?.type === 'game' && activeFilter.value === g.appid;
          const isHov = hovered === g.appid;

          return (
            <div key={g.appid}
              onClick={() => onFilter(isSel ? null : { type: 'game', value: g.appid, label: g.name })}
              onMouseEnter={() => setHovered(g.appid)}
              onMouseLeave={() => setHovered(null)}
              role="button"
              tabIndex={0}
              aria-label={`${g.name}: ${Math.round(g.playtime_forever / 60)}h, ${g.launchCount} launches`}
              onKeyDown={e => e.key === 'Enter' && onFilter(isSel ? null : { type: 'game', value: g.appid, label: g.name })}
              style={{
                position: 'absolute',
                left: `${x}%`, top: `${y}%`,
                width: size, height: size,
                borderRadius: '50%',
                background: isSel ? 'var(--accent-emerald)' : 'var(--accent-blue)',
                opacity: activeFilter?.type === 'game' && !isSel ? 0.2 : isSel ? 1 : isHov ? 1 : 0.65,
                transform: 'translate(-50%, -50%) scale(' + (isSel ? 1.4 : isHov ? 1.25 : 1) + ')',
                cursor: 'pointer',
                transition: 'opacity 0.15s, transform 0.15s, background 0.15s',
                border: isSel ? '2px solid var(--accent-emerald)' : `1.5px solid ${hexToRgba(ACCENT_HEX, 0.4)}`,
                boxShadow: isSel ? '0 0 8px var(--accent-emerald)' : 'none',
                zIndex: isSel || isHov ? 10 : 1,
              }}
            >
              {/* Tooltip on hover */}
              {isHov && (
                <div style={{
                  position: 'absolute',
                  bottom: size + 4, left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'var(--text-primary)', color: 'var(--text-inverse)',
                  borderRadius: 'var(--radius-sm)', padding: '5px 8px',
                  fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none',
                  zIndex: 20, lineHeight: 1.5,
                }}>
                  <div style={{ fontWeight: 600 }}>{g.name.length > 22 ? g.name.slice(0, 20) + '…' : g.name}</div>
                  <div style={{ opacity: 0.75 }}>{Math.round(g.playtime_forever / 60)}h · {g.launchCount}× launched</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Filter pill ────────────────────────────────────────────────────────────
function FilterPill({ filter, onClear }) {
  if (!filter) return null;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '5px 12px', borderRadius: 'var(--radius-full)',
      background: filter.color ? `color-mix(in srgb, ${filter.color} 18%, transparent)` : 'var(--accent-blue-dim)',
      border: `1px solid ${filter.color || 'var(--accent-blue)'}`,
      fontSize: 12, fontWeight: 600,
      color: filter.color || 'var(--accent-blue)',
      animation: 'fadeInFast 0.15s ease',
    }}>
      <span>Filtered: {filter.label}</span>
      <button onClick={onClear} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        color: 'inherit', fontSize: 12, lineHeight: 1, opacity: 0.7,
        display: 'flex', alignItems: 'center',
      }}>✕</button>
    </div>
  );
}

// ── Main Library page ──────────────────────────────────────────────────────
export default function Library() {
  const { ownedGames, gamesPlayed, totalHoursAllTime, localConfig, theme, achCache } = useApp();
  const [sortBy, setSortBy]       = useState('hours');
  const [activeFilter, setActiveFilter] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [anchorRect, setAnchorRect] = useState(null);

  const handleSelectGame = useCallback((game, e) => {
    if (selectedGame?.appid === game.appid) { setSelectedGame(null); setAnchorRect(null); }
    else { setSelectedGame(game); setAnchorRect(e?.currentTarget?.getBoundingClientRect() ?? null); }
  }, [selectedGame]);

  const tableRef = useRef(null);

  const baseSorted = [...ownedGames].filter(g => g.playtime_forever > 0).sort((a, b) => {
    if (sortBy === 'hours')   return b.playtime_forever - a.playtime_forever;
    if (sortBy === 'launches') return (b.launchCount || 0) - (a.launchCount || 0);
    if (sortBy === 'name')    return a.name.localeCompare(b.name);
    return b.playtime_forever - a.playtime_forever;
  });

  // Apply active filter to table
  const filteredGames = activeFilter
    ? activeFilter.type === 'bucket'
      ? [...ownedGames].filter(g => getBucket(g) === activeFilter.value)
          .sort((a, b) => b.playtime_forever - a.playtime_forever)
      : activeFilter.type === 'game'
        ? baseSorted.filter(g => g.appid === activeFilter.value)
        : baseSorted
    : baseSorted;

  const handleFilter = useCallback((f) => {
    setActiveFilter(f);
    // Scroll to table after a tick
    if (f) setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, []);

  const neverPlayed = ownedGames.filter(g => !g.playtime_forever).length;
  const pctPlayed = Math.round((gamesPlayed / Math.max(ownedGames.length, 1)) * 100);
  const neverPlayedPct = Math.round((neverPlayed / Math.max(ownedGames.length, 1)) * 100);
  const topTwo = [...ownedGames].sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0)).slice(0, 2);
  const topTwoHours = topTwo.reduce((s, g) => s + (g.playtime_forever || 0), 0) / 60;
  const topTwoPct = totalHoursAllTime > 0 ? Math.round((topTwoHours / totalHoursAllTime) * 100) : 0;

  return (
    <div style={{ padding: '56px 24px 96px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 40 }}>
        <PageHeader
          eyebrow="Library"
          title={<><span style={{ fontWeight: 600 }}>{ownedGames.length.toLocaleString()} games</span> owned, {gamesPlayed.toLocaleString()} ever played.</>}
          subtitle={
            <>
              {neverPlayedPct >= 1 ? `${neverPlayedPct}% of the library has never been launched.` : 'Nearly everything in the library has been launched at least once.'}
              {topTwoPct >= 15 && ` The top ${topTwo.length} games account for ${topTwoPct}% of all recorded hours.`}
            </>
          }
        />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>

        {/* Distribution donut */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
              Library utilization
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--accent-emerald)' }}>{pctPlayed}%</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>played</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-muted)' }}>{neverPlayed}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>untouched</div>
              </div>
            </div>
          </div>
          <DistributionDonut games={ownedGames} activeFilter={activeFilter} onFilter={handleFilter} />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
            Click a segment to filter the game table
          </p>
        </div>

        {/* Scatter */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>
            Launch frequency vs. hours played
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            Dot size = total hours · Click a dot to highlight in table · {localConfig?.found ? 'Local data active' : 'Connect Steam locally for launch data'}
          </p>
          <ScatterPlot games={baseSorted} activeFilter={activeFilter} onFilter={handleFilter} />
        </div>
      </div>

      {/* Top games bar */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            Top 15 games by playtime
          </h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Click a bar to filter the table below</p>
        </div>
        <TopGamesBar games={baseSorted} activeFilter={activeFilter} onFilter={handleFilter} theme={theme} />
      </div>

      {/* Genre allocation — sits after the instant-loading charts above since
          it depends on a rate-limited background fetch (server.js fetches
          one game's genre every ~1.2s) that can take minutes to fill in on a
          cold cache; it shouldn't be the first thing the page makes you wait on. */}
      <GenreAllocation />

      {/* Game table */}
      <div className="card" style={{ padding: 24 }} ref={tableRef}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
              {activeFilter ? 'Filtered games' : 'All played games'}
            </h3>
            <FilterPill filter={activeFilter} onClear={() => setActiveFilter(null)} />
            {activeFilter && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {filteredGames.length} game{filteredGames.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['hours', 'By Hours'], ['launches', 'By Launches'], ['name', 'A–Z']].map(([key, label]) => (
              <button key={key} onClick={() => setSortBy(key)} className="btn btn-ghost" style={{
                padding: '5px 12px', fontSize: 12,
                background: sortBy === key ? 'var(--accent-blue-dim)' : undefined,
                color: sortBy === key ? 'var(--accent-blue)' : undefined,
                borderColor: sortBy === key ? 'var(--accent-blue)' : undefined,
              }}>{label}</button>
            ))}
          </div>
        </div>

        {filteredGames.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No games match this filter.{' '}
            <button onClick={() => setActiveFilter(null)} style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13 }}>
              Clear filter
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, alignItems: 'start' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['#', 'Game', 'Hours', 'Launches', 'Avg Session'].map(h => (
                      <th key={h} style={{
                        textAlign: ['#', 'Hours', 'Launches', 'Avg Session'].includes(h) ? 'right' : 'left',
                        padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600,
                        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredGames.map((game, i) => {
                    const avgSession = game.launchCount ? (game.playtime_forever / 60 / game.launchCount) : null;
                    const isSel = selectedGame?.appid === game.appid || (activeFilter?.type === 'game' && activeFilter.value === game.appid);
                    return (
                      <tr key={game.appid}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          background: isSel ? 'var(--accent-blue-dim)' : '',
                          transition: 'background 0.1s', cursor: 'pointer',
                        }}
                        onClick={(e) => handleSelectGame(game, e)}
                        onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                        onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isSel ? 'var(--accent-blue-dim)' : ''; }}
                      >
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', textAlign: 'right', width: 40 }}>{i + 1}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 40, height: 22, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-tertiary)' }}>
                              <GameHeader appId={game.appid} name={game.name} />
                            </div>
                            <span style={{ fontWeight: isSel ? 700 : 500, color: isSel ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                              {game.name}
                            </span>
                            {isSel && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'var(--accent-blue)', color: 'white', fontWeight: 700 }}>selected</span>}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--accent-blue)' }}>
                          {formatHours(game.playtime_forever)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {game.launchCount ? `${game.launchCount}×` : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {avgSession ? `${avgSession.toFixed(1)}h` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {selectedGame && (
          <GameDetailPanel
            game={selectedGame}
            achData={achCache[selectedGame.appid]}
            anchorRect={anchorRect}
            onClose={() => { setSelectedGame(null); setAnchorRect(null); }}
          />
        )}
      </div>
    </div>
  );
}
