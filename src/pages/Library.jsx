import { useRef, useState, useCallback } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import { formatHours, formatLastPlayed, daysSincePlayed, recencyBucket, RECENCY_BUCKETS, computeLibraryDerivedStats } from '../utils/steam.js';
import { GameHeader } from '../components/GameImage.jsx';
import GameDetailPanel from '../components/GameDetailPanel.jsx';
import GenreAllocation from '../components/GenreAllocation.jsx';
import { chartRgba, categoryColor, PageHeader, SectionHeading, CrossFilterBanner } from '../components/designSystem.jsx';

// ── Colour tokens ──────────────────────────────────────────────────────────
const BUCKET_META = [
  { key: 'Never played',   color: 'var(--ss-ink4)', min: 0,   max: 0    },
  { key: '< 1 hour',       color: categoryColor(0), min: 0,   max: 1    },
  { key: '1–10 hours',     color: categoryColor(1), min: 1,   max: 10   },
  { key: '10–50 hours',    color: categoryColor(2), min: 10,  max: 50   },
  { key: '50–200 hours',   color: categoryColor(3), min: 50,  max: 200  },
  { key: '200–500 hours',  color: categoryColor(4), min: 200, max: 500  },
  { key: '500+ hours',     color: 'var(--ss-ink)', min: 500, max: Infinity },
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

function platformLabel(game) {
  const win = game.playtime_windows_forever || 0;
  const deck = game.playtime_deck_forever || 0;
  if (win === 0 && deck === 0) return '—';
  if (win > 0 && deck > 0) return 'Mixed';
  return deck > win ? 'Deck' : 'Windows';
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

  const centerCount = activeFilter?.type === 'bucket' ? counts[activeFilter.value] : total;
  const centerLabel = activeFilter?.type === 'bucket' ? activeFilter.value : 'total games';

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} style={{ overflow: 'visible' }}>
          {arcs.map(arc => (
            <path
              key={arc.key}
              d={arc.pts}
              fill={arc.color}
              opacity={activeFilter?.type === 'bucket' && !arc.isSel ? 0.35 : 1}
              style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
              onClick={() => onFilter(arc.isSel ? null : { type: 'bucket', value: arc.key, label: arc.key, color: arc.color })}
              onMouseEnter={() => setHovered(arc.key)}
              onMouseLeave={() => setHovered(null)}
              role="button"
              aria-label={`${arc.key}: ${arc.count} games`}
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onFilter(arc.isSel ? null : { type: 'bucket', value: arc.key, label: arc.key, color: arc.color })}
            >
              <title>{`${arc.key}: ${arc.count} games (${Math.round(arc.fraction * 100)}%) — click to filter`}</title>
            </path>
          ))}
          <circle cx={CX} cy={CY} r={R_IN - 4} fill="var(--ss-inset)" />
          <text x={CX} y={CY - 8} textAnchor="middle" dominantBaseline="central" fill="var(--ss-ink)" fontSize={22} fontWeight={600}>
            {centerCount}
          </text>
          <text x={CX} y={CY + 14} textAnchor="middle" dominantBaseline="central" fill="var(--ss-ink3)" fontSize={10}>
            {centerLabel}
          </text>
        </svg>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
        {BUCKET_META.map(b => {
          const count = counts[b.key];
          const isSel = activeFilter?.type === 'bucket' && activeFilter.value === b.key;
          return (
            <button key={b.key} onClick={() => onFilter(isSel ? null : { type: 'bucket', value: b.key, label: b.key, color: b.color })}
              title={`${b.key}: ${count} game${count === 1 ? '' : 's'} — click to filter`}
              className="ss-pill"
              style={{
                justifyContent: 'flex-start', width: '100%',
                background: isSel ? 'var(--ss-pill-bg)' : 'transparent',
                borderColor: isSel ? 'var(--ss-pill-line)' : 'transparent',
                opacity: activeFilter?.type === 'bucket' && !isSel ? 0.5 : 1,
              }}
            >
              <div style={{ width: 9, height: 9, borderRadius: 2, background: b.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--ss-ink2)', flex: 1 }}>{b.key}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: isSel ? 'var(--ss-pill-ink)' : 'var(--ss-ink3)' }}>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Derived stat chips ──────────────────────────────────────────────────────
function DerivedStats({ ownedGames }) {
  const { medianHours, top10Pct, gamesToHit50PctPlayed } = computeLibraryDerivedStats(ownedGames);
  const items = [
    { label: 'Median hours on a played game', value: medianHours >= 10 ? `${Math.round(medianHours)}h` : `${medianHours.toFixed(1)}h` },
    { label: '% of hours in top 10', value: `${top10Pct}%` },
    {
      label: 'Games to launch for 50% played',
      value: gamesToHit50PctPlayed === 0 ? 'Already there' : gamesToHit50PctPlayed,
    },
  ];
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--ss-line-soft)' }}>
      {items.map(it => (
        <div key={it.label} style={{ flex: 1, minWidth: 140, padding: '10px 12px', borderRadius: 12, background: 'var(--ss-inset)', border: '1px solid var(--ss-line-soft)' }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ss-ink)' }}>{it.value}</div>
          <div style={{ fontSize: 10.5, color: 'var(--ss-ink3)', marginTop: 3, lineHeight: 1.3 }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Recency lanes — size-coded dots per game, bucketed by last-played ──────
function dotSize(game) {
  const hours = (game.playtime_forever || 0) / 60;
  return Math.max(6, Math.min(22, Math.round(6 + Math.sqrt(hours) * 2.4)));
}

function RecencyLanes({ games, activeFilter, onFilter }) {
  const played = games.filter(g => g.playtime_forever > 0);
  const lanes = RECENCY_BUCKETS.map(b => ({
    ...b,
    games: played
      .filter(g => recencyBucket(daysSincePlayed(g)) === b.id)
      .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0)),
  })).filter(lane => lane.games.length > 0);

  if (lanes.length === 0) return null;
  const MAX_DOTS = 24;

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {lanes.map(lane => (
          <div key={lane.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 90, flexShrink: 0, fontSize: 12, color: 'var(--ss-ink3)' }}>{lane.label}</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {lane.games.slice(0, MAX_DOTS).map(g => {
                const size = dotSize(g);
                const isSel = activeFilter?.type === 'game' && activeFilter.value === g.appid;
                return (
                  <div
                    key={g.appid}
                    onClick={() => onFilter(isSel ? null : { type: 'game', value: g.appid, label: g.name })}
                    title={`${g.name} — ${formatHours(g.playtime_forever)}`}
                    style={{
                      width: size, height: size, borderRadius: '50%', cursor: 'pointer',
                      background: isSel ? 'var(--ss-chart-hi)' : chartRgba(0.55),
                      border: isSel ? '2px solid var(--ss-accent)' : '1px solid var(--ss-line)',
                      opacity: activeFilter?.type === 'game' && !isSel ? 0.3 : 1,
                      transition: 'opacity 0.15s, transform 0.1s',
                    }}
                  />
                );
              })}
              {lane.games.length > MAX_DOTS && (
                <span style={{ fontSize: 11, color: 'var(--ss-ink4)' }}>+{lane.games.length - MAX_DOTS} more</span>
              )}
            </div>
            <div style={{ width: 30, flexShrink: 0, fontSize: 12, color: 'var(--ss-ink3)', textAlign: 'right' }}>{lane.games.length}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--ss-line-soft)', fontSize: 11, color: 'var(--ss-ink4)' }}>
        <span>Dot size = lifetime hours</span>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: chartRgba(0.55) }} />
        <span>~1h</span>
        <span style={{ width: 14, height: 14, borderRadius: '50%', background: chartRgba(0.55) }} />
        <span>~25h</span>
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: chartRgba(0.55) }} />
        <span>100h+</span>
      </div>
    </div>
  );
}

// ── Interactive SVG Bar Chart (top 15) ────────────────────────────────────
function TopGamesBar({ games, activeFilter, onFilter }) {
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
        const barColor = isSel ? 'var(--ss-chart-hi)' : chartRgba(Math.max(0.85 - i * 0.04, 0.35));

        return (
          <div key={game.appid}
            onClick={() => onFilter(isSel ? null : { type: 'game', value: game.appid, label: game.name })}
            onMouseEnter={() => setHovered(game.appid)}
            onMouseLeave={() => setHovered(null)}
            role="button" tabIndex={0}
            title={`${game.name} — ${hours >= 100 ? Math.round(hours) : hours.toFixed(1)}h — click to filter`}
            onKeyDown={e => e.key === 'Enter' && onFilter(isSel ? null : { type: 'game', value: game.appid, label: game.name })}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '5px 8px', borderRadius: 10, cursor: 'pointer',
              background: isSel ? 'var(--ss-pill-bg)' : isHov ? 'var(--ss-btn)' : 'transparent',
              border: isSel ? '1px solid var(--ss-pill-line)' : '1px solid transparent',
              opacity: activeFilter?.type === 'game' && !isSel ? 0.45 : 1,
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--ss-ink3)', width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
            <span style={{
              fontSize: 12, color: isSel ? 'var(--ss-pill-ink)' : 'var(--ss-ink2)',
              fontWeight: isSel ? 600 : 400,
              width: 160, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {game.name}
            </span>
            <div style={{ flex: 1, height: 8, background: 'var(--ss-track)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct * 100}%`, background: barColor, borderRadius: 99, transition: 'width 0.4s ease, background 0.15s' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: isSel ? 'var(--ss-accent)' : 'var(--ss-ink3)', width: 44, textAlign: 'right', flexShrink: 0 }}>
              {hours >= 100 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Library page ──────────────────────────────────────────────────────
export default function Library() {
  const { ownedGames, gamesPlayed, totalHoursAllTime, achCache } = useApp();
  const [sortBy, setSortBy]       = useState('hours');
  const [activeFilter, setActiveFilter] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedGameRect, setSelectedGameRect] = useState(null);

  const handleSelectGame = useCallback((game, e) => {
    setSelectedGame(prev => prev?.appid === game.appid ? null : game);
    setSelectedGameRect(e ? e.currentTarget.getBoundingClientRect() : null);
  }, []);

  const tableRef = useRef(null);

  const baseSorted = [...ownedGames].filter(g => g.playtime_forever > 0).sort((a, b) => {
    if (sortBy === 'hours')   return b.playtime_forever - a.playtime_forever;
    if (sortBy === '2weeks')  return (b.playtime_2weeks || 0) - (a.playtime_2weeks || 0);
    if (sortBy === 'name')    return a.name.localeCompare(b.name);
    return b.playtime_forever - a.playtime_forever;
  });

  const filteredGames = activeFilter
    ? activeFilter.type === 'bucket'
      ? [...ownedGames].filter(g => getBucket(g) === activeFilter.value).sort((a, b) => b.playtime_forever - a.playtime_forever)
      : activeFilter.type === 'game'
        ? baseSorted.filter(g => g.appid === activeFilter.value)
        : activeFilter.type === 'genre'
          ? baseSorted.filter(g => activeFilter.appids?.includes(g.appid))
          : baseSorted
    : baseSorted;

  const handleFilter = useCallback((f) => {
    setActiveFilter(f);
    if (f) setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, []);

  const neverPlayed = ownedGames.filter(g => !g.playtime_forever).length;
  const pctPlayed = Math.round((gamesPlayed / Math.max(ownedGames.length, 1)) * 100);
  const neverPlayedPct = Math.round((neverPlayed / Math.max(ownedGames.length, 1)) * 100);
  const topTwo = [...ownedGames].sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0)).slice(0, 2);
  const topTwoHours = topTwo.reduce((s, g) => s + (g.playtime_forever || 0), 0) / 60;
  const topTwoPct = totalHoursAllTime > 0 ? Math.round((topTwoHours / totalHoursAllTime) * 100) : 0;

  return (
    <div style={{ padding: '34px 26px 120px', maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
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

      {activeFilter && <CrossFilterBanner label={activeFilter.label} onClear={() => setActiveFilter(null)} />}

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18 }}>
        <div className="ss-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <SectionHeading title="Library utilization" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, marginLeft: 12, flexShrink: 0 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ss-cat-3)' }}>{pctPlayed}%</div>
                <div style={{ fontSize: 10, color: 'var(--ss-ink3)' }}>played</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ss-ink3)' }}>{neverPlayed}</div>
                <div style={{ fontSize: 10, color: 'var(--ss-ink3)' }}>untouched</div>
              </div>
            </div>
          </div>
          <DistributionDonut games={ownedGames} activeFilter={activeFilter} onFilter={handleFilter} />
          <DerivedStats ownedGames={ownedGames} />
          <p style={{ margin: '14px 0 0', fontSize: 11, color: 'var(--ss-ink4)', textAlign: 'center' }}>
            Click a segment to filter every panel on this page
          </p>
        </div>

        <div className="ss-panel">
          <SectionHeading title="Recency lanes" />
          <p style={{ fontSize: 12, color: 'var(--ss-ink3)', marginTop: -12, marginBottom: 18 }}>
            Every played game bucketed by how long since you last opened it. Click a dot to filter the table below.
          </p>
          <RecencyLanes games={ownedGames} activeFilter={activeFilter} onFilter={handleFilter} />
        </div>
      </div>

      {/* Top games bar */}
      <div className="ss-panel">
        <SectionHeading title="Top 15 games by lifetime hours" trailing="Click a bar to filter the table below" />
        <TopGamesBar games={baseSorted} activeFilter={activeFilter} onFilter={handleFilter} />
      </div>

      {/* Genre allocation — sits after the instant-loading charts above since
          it depends on a rate-limited background fetch (server.js fetches
          one game's genre every ~1.2s) that can take minutes to fill in on a
          cold cache; it shouldn't be the first thing the page makes you wait on. */}
      <GenreAllocation activeFilter={activeFilter} onFilter={handleFilter} />

      {/* Game table */}
      <div className="ss-panel" ref={tableRef}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--ss-ink)' }}>
              {activeFilter ? `Filtered games (${filteredGames.length})` : 'All played games'}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['hours', 'By Lifetime'], ['2weeks', 'By 2 Weeks'], ['name', 'A–Z']].map(([key, label]) => (
              <button key={key} onClick={() => setSortBy(key)} className={`ss-pill${sortBy === key ? ' active' : ''}`}>{label}</button>
            ))}
          </div>
        </div>

        {filteredGames.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ss-ink3)', fontSize: 13 }}>
            No games match this filter.{' '}
            <button onClick={() => setActiveFilter(null)} style={{ background: 'none', border: 'none', color: 'var(--ss-accent)', cursor: 'pointer', fontSize: 13 }}>
              Clear filter
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['#', 'Game', 'Lifetime', '2 Weeks', 'Platform', 'Last played'].map(h => (
                    <th key={h} style={{
                      textAlign: h === 'Game' ? 'left' : 'right',
                      padding: '8px 12px', color: 'var(--ss-ink3)', fontWeight: 500,
                      fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px',
                      borderBottom: '1px solid var(--ss-line)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredGames.map((game, i) => {
                  const isSel = selectedGame?.appid === game.appid || (activeFilter?.type === 'game' && activeFilter.value === game.appid);
                  const lastPlayed = game.rtime_last_played || game.localLastPlayed;
                  return (
                    <tr key={game.appid}
                      style={{
                        borderBottom: '1px solid var(--ss-line-soft)',
                        background: isSel ? 'var(--ss-pill-bg)' : '',
                        transition: 'background 0.1s', cursor: 'pointer',
                      }}
                      onClick={(e) => handleSelectGame(game, e)}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--ss-btn)'; }}
                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = ''; }}
                    >
                      <td style={{ padding: '10px 12px', color: 'var(--ss-ink3)', textAlign: 'right', width: 36 }}>{i + 1}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 40, height: 22, borderRadius: 5, overflow: 'hidden', flexShrink: 0, background: 'var(--ss-inset)' }}>
                            <GameHeader appId={game.appid} name={game.name} />
                          </div>
                          <span style={{ fontWeight: isSel ? 600 : 400, color: isSel ? 'var(--ss-pill-ink)' : 'var(--ss-ink)' }}>{game.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--ss-accent)' }}>{formatHours(game.playtime_forever)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ss-ink2)' }}>{game.playtime_2weeks ? formatHours(game.playtime_2weeks) : '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ss-ink3)' }}>{platformLabel(game)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ss-ink3)' }}>{lastPlayed ? formatLastPlayed(lastPlayed) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {selectedGame && (
          <GameDetailPanel
            game={selectedGame}
            achData={achCache[selectedGame.appid]}
            anchorRect={selectedGameRect}
            onClose={() => setSelectedGame(null)}
          />
        )}
      </div>
    </div>
  );
}
