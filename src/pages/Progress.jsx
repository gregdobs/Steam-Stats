import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import {
  computeBacklogProjection, computeBacklogMomentum, computeBacklogByGenre,
  computeDormantLongest, getUnplayedCountSeries,
  classifyGameStatus, formatHours, formatLastPlayed, minutesToHours, fetchGenres,
} from '../utils/steam.js';
import { GameHeader } from '../components/GameImage.jsx';
import GameDetailPanel from '../components/GameDetailPanel.jsx';
import { ProgressRing, categoryColor, rampColor, PageHeader, SectionHeading } from '../components/designSystem.jsx';

// ── The 7-bucket spectrum every owned game falls into exactly once ─────────
// 'unplayed' needs no HLTB data (playtime alone). 'unmatched' is playtime > 0
// with no HLTB estimate yet — either still loading or genuinely no match.
// All 7 sit on the shared cool-to-warm ramp (unplayed = coolest blue,
// overplayer = warmest rose), independent of theme accent, so no bucket —
// including the two "no data yet" ones — falls back to a neutral grey.
const STATUS_ORDER = ['unplayed', 'unmatched', 'barely', 'inprogress', 'gettingthere', 'completed', 'overplayer'];
const STATUS_META = {
  unplayed:     { label: 'Unplayed',       color: rampColor(0), icon: '📥' },
  unmatched:    { label: 'No Estimate',    color: rampColor(1), icon: '❔' },
  barely:       { label: 'Barely Started', color: rampColor(2), icon: '💤' },
  inprogress:   { label: 'In Progress',    color: rampColor(3), icon: '🎮' },
  gettingthere: { label: 'Getting There',  color: rampColor(4), icon: '🔥' },
  completed:    { label: 'Completed',      color: rampColor(5), icon: '🏁' },
  overplayer:   { label: 'Overplayer',     color: rampColor(6), icon: '🐙' },
};

// ── Severity tiers for the burn-down projection ─────────────────────────────
const getTier = (years) => {
  if (years < 1)  return { label: 'Very manageable',  emoji: '😌', color: rampColor(2) };
  if (years < 5)  return { label: 'A commitment',      emoji: '🤔', color: 'var(--ss-accent)' };
  if (years < 15) return { label: 'A lifestyle choice', emoji: '😅', color: rampColor(4) };
  if (years < 50) return { label: 'Generational',       emoji: '😰', color: rampColor(6) };
  return { label: 'Outlives the sun', emoji: '💀', color: 'var(--ss-cat-2)' };
};

function getGenreColor(genre) {
  let hash = 0;
  for (let i = 0; i < genre.length; i++) hash = (hash * 31 + genre.charCodeAt(i)) | 0;
  return categoryColor(Math.abs(hash));
}

// ── Status spectrum — one bar spanning the whole library, click to filter ──
function StatusSpectrum({ counts, total, activeStatus, onFilter }) {
  return (
    <div className="ss-panel">
      <div style={{ display: 'flex', gap: 3, height: 20, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
        {STATUS_ORDER.map(id => {
          const count = counts[id] || 0;
          if (count === 0) return null;
          const pct = total > 0 ? (count / total) * 100 : 0;
          const isSel = activeStatus === id;
          return (
            <div
              key={id}
              onClick={() => onFilter(isSel ? null : id)}
              title={`${STATUS_META[id].label}: ${count} games`}
              role="button" tabIndex={0}
              style={{
                width: `${pct}%`, background: STATUS_META[id].color, cursor: 'pointer',
                opacity: activeStatus && !isSel ? 0.35 : 1, transition: 'opacity 0.15s',
                minWidth: pct > 0.3 ? 2 : 0,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
        {STATUS_ORDER.filter(id => counts[id] > 0).map(id => {
          const isSel = activeStatus === id;
          return (
            <button
              key={id}
              onClick={() => onFilter(isSel ? null : id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                opacity: activeStatus && !isSel ? 0.5 : 1,
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: 3, background: STATUS_META[id].color, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: 'var(--ss-ink2)' }}>{STATUS_META[id].icon} {STATUS_META[id].label}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: isSel ? STATUS_META[id].color : 'var(--ss-ink3)' }}>{counts[id]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Momentum sparkline — 14-day unplayed-count bar strip ───────────────────
function MomentumSparkline({ series }) {
  const withData = series.filter(d => d.count != null);
  if (withData.length < 2) return null;
  const max = Math.max(...withData.map(d => d.count), 1);
  const min = Math.min(...withData.map(d => d.count));
  const first = withData[0].count;
  const last = withData[withData.length - 1].count;

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40 }}>
        {series.map((d, i) => {
          if (d.count == null) return <div key={i} style={{ flex: 1 }} />;
          const range = Math.max(max - min, 1);
          const h = Math.max(3, Math.round(((d.count - min) / range) * 36) + 4);
          return (
            <div key={i} title={`${d.count} unplayed`} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ width: '100%', borderRadius: 3, height: h, background: 'var(--ss-chart-fill)' }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--ss-ink4)' }}>
        <span>{first}</span><span>{last} TODAY</span>
      </div>
    </div>
  );
}

// ── Dormant longest — played then abandoned, ranked by last-played recency ─
function DormantLongest({ dormant }) {
  if (dormant.length === 0) return null;

  return (
    <div className="ss-panel">
      <SectionHeading title="Dormant longest" />
      <p style={{ fontSize: 12, color: 'var(--ss-ink3)', marginTop: -12, marginBottom: 18 }}>
        Games with real playtime that have gone quiet — ranked by days since you last opened them.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {dormant.map((g, i) => (
          <div key={g.appid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: i < dormant.length - 1 ? '1px solid var(--ss-line-soft)' : 'none' }}>
            <span style={{ fontSize: 12, color: 'var(--ss-ink3)', width: 18, flexShrink: 0 }}>{i + 1}</span>
            <div style={{ width: 54, height: 26, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--ss-inset)' }}>
              <GameHeader appId={g.appid} name={g.name} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--ss-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ss-ink4)' }}>{formatHours(g.playtime_forever)} lifetime</div>
            </div>
            <span style={{ fontSize: 12, color: rampColor(4), flexShrink: 0 }}>{formatLastPlayed(g.rtime_last_played)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Backlog by genre mini chart ─────────────────────────────────────────────
function BacklogByGenre({ unplayedGames, genreData, loadStatus }) {
  const byGenre = computeBacklogByGenre(unplayedGames, genreData).slice(0, 8);
  const maxCount = Math.max(...byGenre.map(([, c]) => c), 1);

  return (
    <div className="ss-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <SectionHeading title="Backlog by genre" />
        {loadStatus.pending > 0 && <span style={{ fontSize: 11, color: 'var(--ss-ink3)', marginLeft: 12, flexShrink: 0 }}>Loading…</span>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--ss-ink3)', marginTop: -12, marginBottom: 18 }}>Which genres are piling up unplayed.</p>

      {byGenre.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ss-ink3)', fontSize: 13 }}>No genre data yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {byGenre.map(([genre, count]) => (
            <div key={genre} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--ss-ink2)', width: 130, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{genre}</span>
              <div style={{ flex: 1, height: 8, background: 'var(--ss-track)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(count / maxCount) * 100}%`, background: getGenreColor(genre), borderRadius: 99, transition: 'width 0.5s ease' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: getGenreColor(genre), width: 22, textAlign: 'right', flexShrink: 0 }}>{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Spotlight card — furthest-along games get the bigger treatment ─────────
function SpotlightCard({ game, hltbData, onClick, isSelected }) {
  const steamHours = minutesToHours(game.playtime_forever);
  const hltbMain = (!hltbData?.error && hltbData?.mainStory) ? hltbData.mainStory : null;
  const status = hltbMain ? STATUS_META[classifyGameStatus(game, hltbData)] : null;
  const pct = hltbMain ? Math.min(Math.round((steamHours / hltbMain) * 100), 200) : null;

  return (
    <div
      className="ss-panel"
      style={{ padding: 0, overflow: 'hidden', cursor: 'pointer', border: isSelected ? '1px solid var(--ss-accent)' : undefined }}
      onClick={(e) => onClick?.(game, e)}
    >
      <div style={{ height: 130, position: 'relative', overflow: 'hidden', background: 'var(--ss-inset)' }}>
        <GameHeader appId={game.appid} name={game.name} />
        <div style={{ position: 'absolute', inset: 0, background: 'var(--ss-scrim)' }} />
        <div style={{ position: 'absolute', top: 10, left: 10, background: 'var(--ss-inset)', borderRadius: '50%', padding: 2 }}>
          <ProgressRing pct={pct ?? 0} size={48} color={status?.color || 'var(--ss-accent)'} textColor="var(--ss-ink)" />
        </div>
        <div style={{ position: 'absolute', bottom: 10, left: 12, right: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ss-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{game.name}</div>
          <div style={{ fontSize: 12, color: 'var(--ss-ink2)' }}>{status?.icon} {status?.label} · {formatHours(game.playtime_forever)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Compact row — the rest of the filtered/paginated list ──────────────────
function GameStatusCard({ game, hltbData, onClick, isSelected }) {
  const statusId = classifyGameStatus(game, hltbData);
  const meta = STATUS_META[statusId];
  const steamHours = minutesToHours(game.playtime_forever);
  const pct = (statusId !== 'unplayed' && hltbData && !hltbData.error && hltbData.mainStory)
    ? Math.min(Math.round((steamHours / hltbData.mainStory) * 100), 200)
    : null;

  return (
    <div
      onClick={(e) => onClick?.(game, e)}
      className="ss-panel"
      style={{
        padding: 0, overflow: 'hidden', cursor: 'pointer',
        border: isSelected ? '1px solid var(--ss-accent)' : undefined,
        background: isSelected ? 'var(--ss-pill-bg)' : undefined,
      }}
    >
      <div style={{ height: 70, background: 'var(--ss-inset)', overflow: 'hidden' }}>
        <GameHeader appId={game.appid} name={game.name} />
      </div>
      <div style={{ padding: '9px 11px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: isSelected ? 'var(--ss-accent)' : 'var(--ss-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
          {game.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <span style={{ fontSize: 11, color: meta.color }}>
            {meta.icon} {meta.label}
            {statusId === 'unplayed' && hltbData?.mainStory ? ` · ~${hltbData.mainStory}h` : ''}
            {statusId === 'unmatched' && hltbData === undefined ? ' · loading…' : ''}
          </span>
          {pct !== null && <span style={{ fontSize: 11, fontWeight: 600, color: meta.color }}>{pct > 200 ? '200%+' : `${pct}%`}</span>}
        </div>
      </div>
    </div>
  );
}

const BATCH_SIZE = 60;

export default function Progress() {
  const { ownedGames, steamId, hltbCache, getHltbForGame, achCache } = useApp();
  const [genreData, setGenreData] = useState({});
  const [loadStatus, setLoadStatus] = useState({ cached: 0, pending: 0 });
  const [activeStatus, setActiveStatus] = useState(null);
  const [sortBy, setSortBy] = useState('status');
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedGameRect, setSelectedGameRect] = useState(null);

  const projection = computeBacklogProjection(ownedGames, steamId, hltbCache);
  const unplayedGames = projection.unplayedGames || ownedGames.filter(g => !g.playtime_forever);
  const momentum = computeBacklogMomentum(ownedGames, steamId);
  const momentumSeries = steamId ? getUnplayedCountSeries(steamId, 14) : [];

  const playedGames = [...ownedGames].filter(g => g.playtime_forever > 0).sort((a, b) => b.playtime_forever - a.playtime_forever);
  const visiblePlayed = playedGames.slice(0, visibleCount);
  const hasMorePlayed = visibleCount < playedGames.length;

  useEffect(() => {
    if (unplayedGames.length === 0) return;
    let cancelled = false;
    const appIds = unplayedGames.map(g => g.appid);
    const load = async () => {
      const result = await fetchGenres(appIds);
      if (cancelled) return;
      setGenreData(prev => ({ ...prev, ...result.genres }));
      setLoadStatus({ cached: result.cached, pending: result.pending });
      if (result.pending > 0) {
        const poll = setInterval(async () => {
          const retry = await fetchGenres(appIds);
          if (cancelled) { clearInterval(poll); return; }
          setGenreData(prev => ({ ...prev, ...retry.genres }));
          setLoadStatus({ cached: retry.cached, pending: retry.pending });
          if (retry.pending === 0) clearInterval(poll);
        }, 2000);
        return () => clearInterval(poll);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [unplayedGames.length]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (const game of unplayedGames.slice(0, 80)) {
        if (cancelled) return;
        if (hltbCache[game.name] !== undefined) continue;
        await getHltbForGame(game.name);
        await new Promise(r => setTimeout(r, 300));
      }
    };
    run();
    return () => { cancelled = true; };
  }, [unplayedGames.length]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const toFetch = visiblePlayed.filter(g => hltbCache[g.name] === undefined);
      for (let i = 0; i < toFetch.length; i += 5) {
        if (cancelled) return;
        await Promise.all(toFetch.slice(i, i + 5).map(g => getHltbForGame(g.name)));
        if (i + 5 < toFetch.length) await new Promise(r => setTimeout(r, 400));
      }
    };
    run();
    return () => { cancelled = true; };
  }, [visibleCount, ownedGames.length]);

  const handleSelect = useCallback((game, e) => {
    setSelectedGame(prev => prev?.appid === game.appid ? null : game);
    setSelectedGameRect(e ? e.currentTarget.getBoundingClientRect() : null);
  }, []);

  const classified = [...unplayedGames, ...visiblePlayed].map(g => ({
    ...g, statusId: classifyGameStatus(g, hltbCache[g.name]),
  }));

  const statusCounts = {};
  for (const g of classified) statusCounts[g.statusId] = (statusCounts[g.statusId] || 0) + 1;

  const spotlightGames = [...visiblePlayed]
    .filter(g => classifyGameStatus(g, hltbCache[g.name]) !== 'unmatched')
    .sort((a, b) => {
      const ah = hltbCache[a.name], bh = hltbCache[b.name];
      const apct = Math.min((minutesToHours(a.playtime_forever) / ah.mainStory) * 100, 200);
      const bpct = Math.min((minutesToHours(b.playtime_forever) / bh.mainStory) * 100, 200);
      return bpct - apct;
    })
    .slice(0, 4);
  const spotlightIds = new Set(spotlightGames.map(g => g.appid));

  let listGames = activeStatus ? classified.filter(g => g.statusId === activeStatus) : classified;
  if (!activeStatus) listGames = listGames.filter(g => !spotlightIds.has(g.appid));

  listGames = [...listGames].sort((a, b) => {
    if (sortBy === 'alpha') return a.name.localeCompare(b.name);
    if (sortBy === 'hours') return (b.playtime_forever || 0) - (a.playtime_forever || 0);
    if (sortBy === 'shortest') {
      const ah = hltbCache[a.name]?.mainStory ?? 999;
      const bh = hltbCache[b.name]?.mainStory ?? 999;
      return ah - bh;
    }
    return STATUS_ORDER.indexOf(a.statusId) - STATUS_ORDER.indexOf(b.statusId);
  });

  const { unplayedCount, avgWeeklyHours, totalHoursNeeded, weeksNeeded, yearsNeeded, gamesWithRealEstimate } = projection;
  const tier = avgWeeklyHours ? getTier(yearsNeeded) : null;
  const totalKnown = classified.length;
  const playedCount = ownedGames.filter(g => g.playtime_forever > 0).length;
  const clearedPct = ownedGames.length > 0 ? Math.round((playedCount / ownedGames.length) * 100) : 0;
  const dormant = computeDormantLongest(ownedGames).slice(0, 8);

  return (
    <div style={{ padding: '34px 26px 120px', maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <PageHeader
        eyebrow="Progress"
        title={
          <>
            <span style={{ fontWeight: 600 }}>{unplayedCount.toLocaleString()} unplayed</span>,{' '}
            <span style={{ fontWeight: 600 }}>{(statusCounts.completed || 0) + (statusCounts.overplayer || 0)} completed</span>{' '}
            of {ownedGames.length.toLocaleString()} owned.
          </>
        }
        subtitle="Where every game in your library sits, from untouched to overplayed — click any segment below to filter."
      />

      <StatusSpectrum counts={statusCounts} total={totalKnown} activeStatus={activeStatus} onFilter={setActiveStatus} />

      {/* Burn-down + Momentum — scoped to the Unplayed bucket */}
      <div style={{ display: 'grid', gridTemplateColumns: tier ? 'minmax(0,2fr) minmax(0,1fr)' : '1fr', gap: 18 }}>
        {tier ? (
          <div className="ss-panel">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
              <SectionHeading title="Backlog burn-down" />
              <span style={{ fontSize: 11.5, color: 'var(--ss-ink4)', flexShrink: 0, marginLeft: 12 }}>Projected at your current pace — an estimate, not a prediction</span>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 22, padding: '22px 24px', borderRadius: 20,
              background: 'linear-gradient(155deg, color-mix(in srgb, var(--ss-cat-2) 18%, transparent), color-mix(in srgb, var(--ss-cat-2) 5%, transparent))',
              border: '1px solid color-mix(in srgb, var(--ss-cat-2) 30%, transparent)', boxShadow: 'inset 0 1px 0 var(--ss-hi)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 40, fontWeight: 500, lineHeight: 1, color: tier.color }}>
                  {yearsNeeded < 1 ? `${weeksNeeded} weeks` : `${yearsNeeded} years`}
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--ss-ink2)', marginTop: 8 }}>
                  to clear your backlog — <span style={{ color: tier.color, fontWeight: 600 }}>{tier.label}</span>
                </div>
              </div>
              <div style={{ width: 130, height: 130, flexShrink: 0, position: 'relative' }}>
                <svg viewBox="0 0 130 130" width={130} height={130}>
                  <circle cx={65} cy={65} r={54} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth={9} />
                  <circle
                    cx={65} cy={65} r={54} fill="none" stroke={tier.color} strokeWidth={9} strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 54 * (clearedPct / 100)} ${2 * Math.PI * 54}`}
                    transform="rotate(-90 65 65)" style={{ transition: 'stroke-dasharray 0.6s ease' }}
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 20, lineHeight: 1, color: 'var(--ss-ink)' }}>{clearedPct}%</span>
                  <span style={{ fontSize: 10, color: 'var(--ss-ink3)' }}>cleared</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
              <div style={{ padding: '10px 12px', background: 'var(--ss-inset)', borderRadius: 14, border: '1px solid var(--ss-line-soft)' }}>
                <div style={{ fontSize: 10, color: 'var(--ss-ink3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Current pace</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ss-ink)' }}>{avgWeeklyHours}h/wk</div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--ss-inset)', borderRadius: 14, border: '1px solid var(--ss-line-soft)' }}>
                <div style={{ fontSize: 10, color: 'var(--ss-ink3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Hours needed</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ss-ink)' }}>{totalHoursNeeded.toLocaleString()}h</div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--ss-inset)', borderRadius: 14, border: '1px solid var(--ss-line-soft)' }}>
                <div style={{ fontSize: 10, color: 'var(--ss-ink3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Real estimates</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ss-accent)' }}>{gamesWithRealEstimate}/{unplayedCount}</div>
              </div>
            </div>
            <p style={{ fontSize: 10.5, color: 'var(--ss-ink4)', marginTop: 12, fontStyle: 'italic' }}>
              {gamesWithRealEstimate > 0
                ? `Uses real HowLongToBeat "Main Story" estimates for ${gamesWithRealEstimate} game${gamesWithRealEstimate !== 1 ? 's' : ''}; assumes 8h for the rest while their data loads.`
                : 'Using a flat 8h/game estimate — real HowLongToBeat data will refine this as it loads in the background.'}
            </p>
          </div>
        ) : unplayedCount > 0 ? (
          <div className="ss-panel">
            <SectionHeading title="Backlog burn-down" />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: -6, marginBottom: 10 }}>
              <span style={{ fontSize: 28, fontWeight: 600, color: rampColor(0) }}>{unplayedCount}</span>
              <span style={{ fontSize: 13, color: 'var(--ss-ink3)' }}>unplayed games</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ss-ink3)' }}>{projection.message}</p>
          </div>
        ) : (
          <div className="ss-panel" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
            <p style={{ fontSize: 13, color: 'var(--ss-ink3)' }}>No backlog — every game has been played at least once.</p>
          </div>
        )}

        {unplayedCount > 0 && (
          <div className="ss-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--ss-ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 10 }}>Backlog Momentum</div>
            {momentum ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 32, fontWeight: 600, color: momentum.delta > 0 ? rampColor(6) : momentum.delta < 0 ? rampColor(2) : 'var(--ss-ink3)' }}>
                    {momentum.delta > 0 ? '+' : ''}{momentum.delta}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--ss-ink3)' }}>games</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--ss-ink2)', marginTop: 6 }}>
                  {momentum.delta > 0 ? '📈 Growing' : momentum.delta < 0 ? '📉 Shrinking' : '➡️ Steady'} over the last {momentum.days} days
                </p>
                <MomentumSparkline series={momentumSeries} />
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--ss-ink3)' }}>Building history — check back after a few days of use for a trend.</p>
            )}
          </div>
        )}
      </div>

      {(dormant.length > 0 || unplayedCount > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18 }}>
          <DormantLongest dormant={dormant} />
          {unplayedCount > 0 && <BacklogByGenre unplayedGames={unplayedGames} genreData={genreData} loadStatus={loadStatus} />}
        </div>
      )}

      {/* Spotlight — furthest along, scoped to games with a real HLTB match */}
      {!activeStatus && spotlightGames.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--ss-ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 12 }}>
            Furthest along
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
            {spotlightGames.map(game => (
              <SpotlightCard
                key={game.appid} game={game} hltbData={hltbCache[game.name]}
                onClick={handleSelect} isSelected={selectedGame?.appid === game.appid}
              />
            ))}
          </div>
        </div>
      )}

      {/* Full list — data-tilt-flat: this outer container is too large to
          tilt as a whole without judder, but the GameStatusCards inside
          are normal card-sized and keep their own individual tilt. */}
      <div className="ss-panel" data-tilt-flat>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--ss-ink)' }}>
            {activeStatus ? STATUS_META[activeStatus].label : 'Everything else'} <span style={{ color: 'var(--ss-ink3)', fontWeight: 400 }}>({listGames.length})</span>
          </h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['status', 'By Status'], ['shortest', 'Shortest First'], ['hours', 'Most Playtime'], ['alpha', 'A–Z']].map(([key, label]) => (
              <button key={key} onClick={() => setSortBy(key)} className={`ss-pill${sortBy === key ? ' active' : ''}`}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 14 }}>
          {listGames.map(game => (
            <GameStatusCard
              key={game.appid} game={game} hltbData={hltbCache[game.name]}
              onClick={handleSelect} isSelected={selectedGame?.appid === game.appid}
            />
          ))}
        </div>

        {hasMorePlayed && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 24, padding: '16px 0 0' }}>
            <p style={{ fontSize: 13, color: 'var(--ss-ink3)' }}>
              {visiblePlayed.length} of {playedGames.length} played games classified so far
            </p>
            <button
              onClick={() => setVisibleCount(c => c + BATCH_SIZE)}
              style={{
                padding: '10px 20px', borderRadius: 16, cursor: 'pointer', fontSize: 13, color: 'var(--ss-ink)',
                background: 'linear-gradient(160deg, color-mix(in srgb, var(--ss-accent) 30%, transparent), color-mix(in srgb, var(--ss-accent) 12%, transparent))',
                border: '1px solid color-mix(in srgb, var(--ss-accent) 40%, transparent)', boxShadow: 'inset 0 1px 0 var(--ss-hi)',
              }}
            >
              Load {Math.min(BATCH_SIZE, playedGames.length - visibleCount)} More
            </button>
          </div>
        )}
      </div>

      {selectedGame && (
        <GameDetailPanel
          game={selectedGame}
          achData={achCache[selectedGame.appid]}
          hltbData={hltbCache[selectedGame.name]}
          anchorRect={selectedGameRect}
          onClose={() => setSelectedGame(null)}
        />
      )}
    </div>
  );
}
