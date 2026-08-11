import { useState, useRef, useEffect, useCallback } from 'react';
import { formatHours, minutesToHours, formatLastPlayed } from '../utils/steam.js';
import { GameCapsule, GameHeader } from './GameImage.jsx';

// ── Palette: distinct, accessible, maps to game rank ──────────────────────
const SLICE_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#f43f5e', // rose
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#fb923c', // orange
  '#e879f9', // fuchsia
  '#34d399', // green
];
const OTHER_COLOR = '#475569';

// ── SVG donut chart drawn from scratch (no Chart.js) for full interaction control ─
function DonutChart({ slices, selectedId, hoveredId, onSelect, onHover, totalMinutes, timePeriod }) {
  const SIZE = 300;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R_OUTER = 118;
  const R_INNER = 72;
  const GAP = 0.018; // radians gap between slices

  // Build arc paths
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  let cursor = -Math.PI / 2; // start at top

  const arcs = slices.map((slice, i) => {
    const fraction = slice.value / total;
    const angle = fraction * 2 * Math.PI - GAP;
    const startAngle = cursor + GAP / 2;
    const endAngle = startAngle + angle;
    cursor += fraction * 2 * Math.PI;

    const isSelected = selectedId === slice.id;
    const isHovered = hoveredId === slice.id;
    const r = isSelected ? R_OUTER + 7 : isHovered ? R_OUTER + 4 : R_OUTER;
    const ri = isSelected ? R_INNER - 4 : R_INNER;

    const x1 = CX + r * Math.cos(startAngle);
    const y1 = CY + r * Math.sin(startAngle);
    const x2 = CX + r * Math.cos(endAngle);
    const y2 = CY + r * Math.sin(endAngle);
    const xi1 = CX + ri * Math.cos(endAngle);
    const yi1 = CY + ri * Math.sin(endAngle);
    const xi2 = CX + ri * Math.cos(startAngle);
    const yi2 = CY + ri * Math.sin(startAngle);
    const large = angle > Math.PI ? 1 : 0;

    const d = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
      `L ${xi1} ${yi1}`,
      `A ${ri} ${ri} 0 ${large} 0 ${xi2} ${yi2}`,
      'Z',
    ].join(' ');

    // Mid-angle for label positioning
    const midAngle = startAngle + angle / 2;
    const labelR = (r + ri) / 2;
    const lx = CX + labelR * Math.cos(midAngle);
    const ly = CY + labelR * Math.sin(midAngle);

    return { ...slice, d, color: slice.color, isSelected, isHovered, fraction, midAngle, lx, ly, startAngle, endAngle };
  });

  // Center label
  const selected = slices.find(s => s.id === selectedId);
  const hovered = slices.find(s => s.id === hoveredId);
  const displaySlice = selected || hovered;
  const centerHours = displaySlice
    ? minutesToHours(displaySlice.value)
    : minutesToHours(totalMinutes);
  const centerLabel = displaySlice
    ? (displaySlice.name.length > 14 ? displaySlice.name.slice(0, 13) + '…' : displaySlice.name)
    : (timePeriod === 'alltime' ? 'All Time' : '2 Weeks');
  const centerPct = displaySlice
    ? Math.round((displaySlice.value / total) * 100)
    : null;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={SIZE}
      height={SIZE}
      style={{ overflow: 'visible', flexShrink: 0 }}
      role="img"
      aria-label="Game playtime distribution donut chart"
    >
      {/* Drop shadow filter */}
      <defs>
        <filter id="slice-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,0.3)" />
        </filter>
      </defs>

      {/* Slices */}
      {arcs.map((arc, i) => (
        <g key={arc.id}>
          <path
            d={arc.d}
            fill={arc.color}
            opacity={selectedId && !arc.isSelected ? 0.45 : 1}
            filter={arc.isSelected ? 'url(#slice-shadow)' : undefined}
            style={{
              cursor: 'pointer',
              transition: 'opacity 0.2s ease, d 0.25s cubic-bezier(0.34,1.56,0.64,1)',
              outline: 'none',
            }}
            onClick={() => onSelect(arc.id === selectedId ? null : arc.id)}
            onMouseEnter={() => onHover(arc.id)}
            onMouseLeave={() => onHover(null)}
            role="button"
            tabIndex={0}
            aria-label={`${arc.name}: ${formatHours(arc.value)}`}
            onKeyDown={e => e.key === 'Enter' && onSelect(arc.id === selectedId ? null : arc.id)}
          />
          {/* Percentage label for slices > 8% */}
          {arc.fraction > 0.08 && (
            <text
              x={arc.lx}
              y={arc.ly}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize={arc.isSelected ? 12 : 10}
              fontWeight="700"
              fontFamily="Space Grotesk, sans-serif"
              style={{ pointerEvents: 'none', transition: 'font-size 0.2s' }}
            >
              {Math.round(arc.fraction * 100)}%
            </text>
          )}
        </g>
      ))}

      {/* Center hole content */}
      <circle cx={CX} cy={CY} r={R_INNER - 6} fill="var(--bg-secondary)" />

      {/* Center: hours */}
      <text
        x={CX} y={CY - 10}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--text-primary)"
        fontSize={displaySlice ? 22 : 26}
        fontWeight="700"
        fontFamily="Space Grotesk, sans-serif"
        style={{ transition: 'font-size 0.2s' }}
      >
        {centerHours % 1 === 0 ? `${centerHours}h` : `${centerHours.toFixed(1)}h`}
      </text>

      {/* Center: label */}
      <text
        x={CX} y={CY + 16}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--text-muted)"
        fontSize={10}
        fontFamily="Inter, sans-serif"
        fontWeight="500"
      >
        {centerLabel}
      </text>

      {/* Center: pct */}
      {centerPct !== null && (
        <text
          x={CX} y={CY + 30}
          textAnchor="middle"
          dominantBaseline="central"
          fill={slices.find(s => s.id === selectedId)?.color || 'var(--accent-blue)'}
          fontSize={11}
          fontFamily="Space Grotesk, sans-serif"
          fontWeight="700"
        >
          {centerPct}% of total
        </text>
      )}
    </svg>
  );
}

// ── Legend list beside/below chart ────────────────────────────────────────
function Legend({ slices, selectedId, hoveredId, onSelect, onHover }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      {slices.map(slice => {
        const isSelected = selectedId === slice.id;
        const isHovered = hoveredId === slice.id;
        const isOther = slice.id === '__other__';
        return (
          <button
            key={slice.id}
            onClick={() => !isOther && onSelect(slice.id === selectedId ? null : slice.id)}
            onMouseEnter={() => !isOther && onHover(slice.id)}
            onMouseLeave={() => onHover(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 10px',
              borderRadius: 'var(--radius-md)',
              border: isSelected ? `1px solid ${slice.color}` : '1px solid transparent',
              background: isSelected
                ? `${slice.color}18`
                : isHovered ? 'var(--bg-tertiary)' : 'transparent',
              cursor: isOther ? 'default' : 'pointer',
              transition: 'all 0.15s ease',
              textAlign: 'left',
              width: '100%',
              opacity: selectedId && !isSelected ? 0.6 : 1,
            }}
          >
            <div style={{
              width: 10, height: 10, borderRadius: 2, flexShrink: 0,
              background: slice.color,
              boxShadow: isSelected ? `0 0 6px ${slice.color}` : 'none',
              transition: 'box-shadow 0.15s',
            }} />
            <span style={{
              fontSize: 12, color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: isSelected ? 600 : 400,
              flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {slice.name}
            </span>
            <span style={{
              fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700,
              color: isSelected ? slice.color : 'var(--text-muted)',
              flexShrink: 0,
            }}>
              {formatHours(slice.value)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Game detail panel ──────────────────────────────────────────────────────
function GameDetailPanel({ game, allGames, totalPeriodMinutes, totalAllTimeMinutes, onClose }) {
  const periodMinutes = game.playtime_2weeks || game.playtime_forever || 0;
  const allTimeMinutes = game.playtime_forever || 0;
  const periodHours = minutesToHours(periodMinutes);
  const allTimeHours = minutesToHours(allTimeMinutes);
  const periodPct = totalPeriodMinutes > 0 ? Math.round((periodMinutes / totalPeriodMinutes) * 100) : 0;
  const libraryPct = totalAllTimeMinutes > 0 ? Math.round((allTimeMinutes / totalAllTimeMinutes) * 100) : 0;
  const avgSession = game.launchCount && allTimeMinutes ? (allTimeMinutes / 60 / game.launchCount) : null;
  const lastPlayed = game.localLastPlayed || game.rtime_last_played;

  // Rank in library by all-time
  const rank = [...allGames]
    .filter(g => g.playtime_forever > 0)
    .sort((a, b) => b.playtime_forever - a.playtime_forever)
    .findIndex(g => g.appid === game.appid) + 1;

  return (
    <div
      className="card"
      style={{
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        animation: 'fadeIn 0.25s ease',
        minHeight: 340,
      }}
    >
      {/* Header image */}
      <div style={{ height: 120, background: 'var(--bg-tertiary)', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <GameHeader appId={game.appid} name={game.name} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)' }} />

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 26, height: 26, borderRadius: '50%',
            background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
            color: 'white', fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.8)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
          aria-label="Close detail panel"
        >✕</button>

        {/* Rank badge */}
        {rank > 0 && (
          <div style={{
            position: 'absolute', bottom: 8, left: 10,
            fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.8)',
            fontFamily: 'var(--font-display)',
          }}>
            #{rank} in library
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        {/* Game name */}
        <div style={{
          fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
          fontFamily: 'var(--font-display)', lineHeight: 1.3,
        }}>
          {game.name}
        </div>

        {/* Period vs All-time comparison ring */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Mini ring */}
          <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
            <svg viewBox="0 0 56 56" width={56} height={56}>
              <circle cx={28} cy={28} r={22} fill="none" stroke="var(--border-default)" strokeWidth={7} />
              <circle
                cx={28} cy={28} r={22} fill="none"
                stroke="var(--accent-blue)" strokeWidth={7}
                strokeDasharray={`${2 * Math.PI * 22 * Math.min(periodPct, 100) / 100} ${2 * Math.PI * 22}`}
                strokeLinecap="round"
                transform="rotate(-90 28 28)"
                style={{ transition: 'stroke-dasharray 0.6s ease' }}
              />
            </svg>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
              color: 'var(--accent-blue)',
            }}>
              {periodPct}%
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 2 }}>
              Share of this period
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {periodPct}% of all gaming this period
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'This Period', value: formatHours(periodMinutes), color: 'var(--accent-blue)' },
            { label: 'All Time', value: formatHours(allTimeMinutes), color: 'var(--text-secondary)' },
            avgSession && { label: 'Avg Session', value: `${avgSession.toFixed(1)}h`, color: 'var(--accent-emerald)' },
            game.launchCount && { label: 'Launches', value: `${game.launchCount}×`, color: 'var(--text-secondary)' },
            { label: '% of Library', value: `${libraryPct}%`, color: 'var(--accent-amber)' },
            lastPlayed && { label: 'Last Played', value: formatLastPlayed(lastPlayed), color: 'var(--text-muted)' },
          ].filter(Boolean).slice(0, 6).map(stat => (
            <div key={stat.label} style={{
              padding: '8px 10px', background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 2 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)', color: stat.color }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* All-time progress bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>% of all-time library hours</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-amber)' }}>{libraryPct}%</span>
          </div>
          <div className="progress-bar" style={{ height: 6 }}>
            <div
              className="progress-fill"
              style={{ width: `${Math.min(libraryPct * 5, 100)}%`, background: 'var(--accent-amber)' }}
            />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
            {formatHours(allTimeMinutes)} of {formatHours(totalAllTimeMinutes)} total library hours
          </div>
        </div>

        {/* User tags */}
        {game.userTags && game.userTags.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {game.userTags.map(tag => (
              <span key={tag} style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)',
                fontWeight: 600, border: '1px solid var(--accent-blue-dim)',
              }}>{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main exported component ────────────────────────────────────────────────
export default function PlaytimeDonut({ games, totalPeriodMinutes, totalAllTimeMinutes, timePeriod, ownedGames }) {
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);

  // Reset selection when games change (period toggle)
  useEffect(() => {
    setSelectedId(null);
    setHoveredId(null);
  }, [timePeriod]);

  if (!games || games.length === 0) return null;

  // Build slices: top N games + "Other" for the rest
  const MAX_SLICES = 9;
  const sorted = [...games].sort((a, b) => {
    const av = timePeriod === 'alltime' ? (a.playtime_forever || 0) : (a.playtime_2weeks || 0);
    const bv = timePeriod === 'alltime' ? (b.playtime_forever || 0) : (b.playtime_2weeks || 0);
    return bv - av;
  });

  const topGames = sorted.slice(0, MAX_SLICES);
  const otherGames = sorted.slice(MAX_SLICES);

  const getVal = g => timePeriod === 'alltime' ? (g.playtime_forever || 0) : (g.playtime_2weeks || 0);

  const slices = topGames
    .filter(g => getVal(g) > 0)
    .map((g, i) => ({
      id: String(g.appid),
      name: g.name,
      value: getVal(g),
      color: SLICE_COLORS[i % SLICE_COLORS.length],
      game: g,
    }));

  const otherTotal = otherGames.reduce((s, g) => s + getVal(g), 0);
  if (otherTotal > 0) {
    slices.push({
      id: '__other__',
      name: `${otherGames.length} other games`,
      value: otherTotal,
      color: OTHER_COLOR,
      game: null,
    });
  }

  const selectedSlice = slices.find(s => s.id === selectedId);
  const selectedGame = selectedSlice?.game
    ? ownedGames.find(g => g.appid === selectedSlice.game.appid) || selectedSlice.game
    : null;

  return (
    <div className="card" style={{ padding: 24, marginBottom: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '-0.2px', marginBottom: 2,
          }}>
            Time Breakdown
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {timePeriod === 'alltime' ? 'All-time playtime distribution' : 'Last 2 weeks — click a segment or game to explore'}
          </p>
        </div>
        {selectedId && (
          <button
            onClick={() => setSelectedId(null)}
            style={{
              fontSize: 12, color: 'var(--text-muted)', background: 'none',
              border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
              padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-body)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
          >
            Clear selection ✕
          </button>
        )}
      </div>

      {/* Main layout: chart + legend + detail panel */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: selectedGame
          ? '300px 1fr 280px'
          : '300px 1fr',
        gap: 24,
        alignItems: 'flex-start',
        transition: 'grid-template-columns 0.3s ease',
      }}>
        {/* Donut chart */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <DonutChart
            slices={slices}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={setSelectedId}
            onHover={setHoveredId}
            totalMinutes={totalPeriodMinutes}
            timePeriod={timePeriod}
          />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
            Click a slice to inspect
          </p>
        </div>

        {/* Legend */}
        <Legend
          slices={slices}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={setSelectedId}
          onHover={setHoveredId}
        />

        {/* Detail panel — only when a game is selected */}
        {selectedGame && (
          <GameDetailPanel
            game={selectedGame}
            allGames={ownedGames}
            totalPeriodMinutes={totalPeriodMinutes}
            totalAllTimeMinutes={totalAllTimeMinutes}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
