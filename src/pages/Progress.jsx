import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import {
  computeBacklogProjection, computeBacklogMomentum, computeBacklogByGenre, computeBacklogGraveyard,
  classifyGameStatus, formatHours, minutesToHours, fetchGenres,
} from '../utils/steam.js';
import { GameHeader } from '../components/GameImage.jsx';
import GameDetailPanel from '../components/GameDetailPanel.jsx';
import { ProgressRing, categoryColor, PageHeader } from '../components/designSystem.jsx';

// ── The 7-bucket spectrum every owned game falls into exactly once ─────────
// 'unplayed' needs no HLTB data (playtime alone). 'unmatched' is playtime > 0
// with no HLTB estimate yet — either still loading or genuinely no match.
// The other 5 mirror getCompletionStatus()'s existing ratio tiers.
const STATUS_ORDER = ['unplayed', 'unmatched', 'barely', 'inprogress', 'gettingthere', 'completed', 'overplayer'];
const STATUS_META = {
  unplayed:     { label: 'Unplayed',       color: 'var(--text-muted)',     icon: '📥' },
  unmatched:    { label: 'No Estimate',    color: 'var(--text-muted)',     icon: '❔' },
  barely:       { label: 'Barely Started', color: 'var(--accent-rose)',    icon: '💤' },
  inprogress:   { label: 'In Progress',    color: 'var(--accent-blue)',    icon: '🎮' },
  gettingthere: { label: 'Getting There',  color: 'var(--accent-amber)',   icon: '🔥' },
  completed:    { label: 'Completed',      color: 'var(--accent-emerald)', icon: '🏁' },
  overplayer:   { label: 'Overplayer',     color: 'var(--accent-violet)',  icon: '🐙' },
};

// ── Severity tiers for the burn-down projection ─────────────────────────────
const getTier = (years) => {
  if (years < 1)  return { label: 'Very manageable',  emoji: '😌', color: 'var(--accent-emerald)' };
  if (years < 5)  return { label: 'A commitment',      emoji: '🤔', color: 'var(--accent-blue)' };
  if (years < 15) return { label: 'A lifestyle choice', emoji: '😅', color: 'var(--accent-amber)' };
  if (years < 50) return { label: 'Generational',       emoji: '😰', color: 'var(--accent-rose)' };
  return { label: 'Outlives the sun', emoji: '💀', color: 'var(--accent-violet)' };
};

function getGenreColor(genre) {
  let hash = 0;
  for (let i = 0; i < genre.length; i++) hash = (hash * 31 + genre.charCodeAt(i)) | 0;
  return categoryColor(Math.abs(hash));
}

// ── Status spectrum — one bar spanning the whole library, click to filter ──
function StatusSpectrum({ counts, total, activeStatus, onFilter }) {
  return (
    <div className="card" style={{ padding: 24, marginBottom: 20 }}>
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
              <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{STATUS_META[id].icon} {STATUS_META[id].label}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-display)', color: isSel ? STATUS_META[id].color : 'var(--text-muted)' }}>{counts[id]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Backlog graveyard ────────────────────────────────────────────────────────
function BacklogGraveyard({ unplayedGames, steamId }) {
  const graveyard = computeBacklogGraveyard(unplayedGames, steamId).slice(0, 8);
  if (graveyard.length === 0) return null;

  return (
    <div className="card" style={{ padding: 24, marginBottom: 24 }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Backlog Graveyard</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
        Longest tracked as unplayed — since Steam Stats started watching, not necessarily since you bought them.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {graveyard.map((g, i) => (
          <div key={g.appid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: i < graveyard.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--text-muted)', width: 18, flexShrink: 0 }}>{i + 1}</span>
            <div style={{ width: 54, height: 26, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-tertiary)' }}>
              <GameHeader appId={g.appid} name={g.name} />
            </div>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-amber)', flexShrink: 0 }}>
              {g.daysTracked === 0 ? 'New' : `${g.daysTracked}d`}
            </span>
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
    <div className="card" style={{ padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Backlog by Genre</h3>
        {loadStatus.pending > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading…</span>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>Which genres are piling up unplayed.</p>

      {byGenre.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No genre data yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {byGenre.map(([genre, count]) => (
            <div key={genre} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 130, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{genre}</span>
              <div style={{ flex: 1, height: 8, background: 'var(--border-default)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(count / maxCount) * 100}%`, background: getGenreColor(genre), borderRadius: 99, transition: 'width 0.5s ease' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)', color: getGenreColor(genre), width: 22, textAlign: 'right', flexShrink: 0 }}>{count}</span>
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
      className="card"
      style={{ overflow: 'hidden', cursor: 'pointer', border: isSelected ? '1px solid var(--accent-blue)' : undefined, transition: 'transform 0.2s, box-shadow 0.2s' }}
      onClick={(e) => onClick?.(game, e)}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      <div style={{ height: 130, position: 'relative', overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
        <GameHeader appId={game.appid} name={game.name} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 55%, transparent 100%)' }} />
        <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.55)', borderRadius: '50%', padding: 2 }}>
          <ProgressRing pct={pct ?? 0} size={48} color={status?.color || 'var(--accent-blue)'} />
        </div>
        <div style={{ position: 'absolute', bottom: 10, left: 12, right: 12 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{game.name}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{status?.icon} {status?.label} · {formatHours(game.playtime_forever)}</div>
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
  // Only meaningful once a game's actually been started — an unplayed game
  // with an HLTB match would otherwise show a redundant "0%" next to its
  // "~Xh" estimate.
  const pct = (statusId !== 'unplayed' && hltbData && !hltbData.error && hltbData.mainStory)
    ? Math.min(Math.round((steamHours / hltbData.mainStory) * 100), 200)
    : null;

  return (
    <div
      onClick={(e) => onClick?.(game, e)}
      className="card"
      style={{
        overflow: 'hidden', cursor: 'pointer', transition: 'all 0.15s',
        border: isSelected ? '1px solid var(--accent-blue)' : undefined,
        background: isSelected ? 'var(--accent-blue-dim)' : undefined,
      }}
      onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; } }}
      onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; } }}
    >
      <div style={{ height: 70, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
        <GameHeader appId={game.appid} name={game.name} />
      </div>
      <div style={{ padding: '9px 11px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: isSelected ? 'var(--accent-blue)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
          {game.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <span style={{ fontSize: 11, color: meta.color }}>
            {meta.icon} {meta.label}
            {statusId === 'unplayed' && hltbData?.mainStory ? ` · ~${hltbData.mainStory}h` : ''}
            {statusId === 'unmatched' && hltbData === undefined ? ' · loading…' : ''}
          </span>
          {pct !== null && <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-display)', color: meta.color }}>{pct > 200 ? '200%+' : `${pct}%`}</span>}
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
  const [anchorRect, setAnchorRect] = useState(null);

  const projection = computeBacklogProjection(ownedGames, steamId, hltbCache);
  const unplayedGames = projection.unplayedGames || ownedGames.filter(g => !g.playtime_forever);
  const momentum = computeBacklogMomentum(ownedGames, steamId);

  // Every OTHER owned game, not just those with > 60 minutes — this is what
  // closes the old coverage gap (games with 1-59 minutes played satisfied
  // neither Backlog's `=== 0` nor Completion's `> 60` check).
  const playedGames = [...ownedGames].filter(g => g.playtime_forever > 0).sort((a, b) => b.playtime_forever - a.playtime_forever);
  const visiblePlayed = playedGames.slice(0, visibleCount);
  const hasMorePlayed = visibleCount < playedGames.length;

  // Fetch genres for unplayed games (Backlog-by-genre breakdown)
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

  // Progressively fetch HLTB for unplayed games (burn-down accuracy)
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

  // Progressively fetch HLTB for visible played games — every game with any
  // playtime is eligible now, not just > 60 minutes.
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
    if (selectedGame?.appid === game.appid) { setSelectedGame(null); setAnchorRect(null); }
    else { setSelectedGame(game); setAnchorRect(e?.currentTarget?.getBoundingClientRect() ?? null); }
  }, [selectedGame]);

  // Classify everything currently known (all unplayed + visible played)
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
    // 'status' — least-done to most-done
    return STATUS_ORDER.indexOf(a.statusId) - STATUS_ORDER.indexOf(b.statusId);
  });

  const { unplayedCount, avgWeeklyHours, totalHoursNeeded, weeksNeeded, yearsNeeded, gamesWithRealEstimate } = projection;
  const tier = avgWeeklyHours ? getTier(yearsNeeded) : null;
  const totalKnown = classified.length;

  return (
    <div style={{ padding: '56px 24px 96px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 40 }}>
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
      </div>

      <StatusSpectrum counts={statusCounts} total={totalKnown} activeStatus={activeStatus} onFilter={setActiveStatus} />

      {/* Burn-down + Momentum — scoped to the Unplayed bucket */}
      <div style={{ display: 'grid', gridTemplateColumns: tier ? '2fr 1fr' : '1fr', gap: 20, marginBottom: 24 }}>
        {tier ? (
          <div className="card" style={{ padding: 24 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Projected at your current pace — a rough estimate, not a prediction.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px', borderRadius: 'var(--radius-lg)', background: `color-mix(in srgb, ${tier.color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${tier.color} 30%, transparent)` }}>
              <div style={{ fontSize: 44, flexShrink: 0 }}>{tier.emoji}</div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: tier.color, lineHeight: 1.1 }}>
                  {yearsNeeded < 1 ? `${weeksNeeded} weeks` : `${yearsNeeded} years`}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                  to clear your backlog — <span style={{ color: tier.color, fontWeight: 600 }}>{tier.label}</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
              <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 3 }}>Current pace</div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{avgWeeklyHours}h/wk</div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 3 }}>Hours needed</div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{totalHoursNeeded.toLocaleString()}h</div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 3 }}>Real estimates</div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--accent-blue)' }}>{gamesWithRealEstimate}/{unplayedCount}</div>
              </div>
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 12, fontStyle: 'italic' }}>
              {gamesWithRealEstimate > 0
                ? `Uses real HowLongToBeat "Main Story" estimates for ${gamesWithRealEstimate} game${gamesWithRealEstimate !== 1 ? 's' : ''}; assumes 8h for the rest while their data loads.`
                : 'Using a flat 8h/game estimate — real HowLongToBeat data will refine this as it loads in the background.'}
            </p>
          </div>
        ) : unplayedCount > 0 ? (
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Backlog Burn-down</h3>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--accent-amber)' }}>{unplayedCount}</span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>unplayed games</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{projection.message}</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No backlog — every game has been played at least once.</p>
          </div>
        )}

        {unplayedCount > 0 && (
          <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 10 }}>Backlog Momentum</div>
            {momentum ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 32, fontWeight: 700, fontFamily: 'var(--font-display)', color: momentum.delta > 0 ? 'var(--accent-rose)' : momentum.delta < 0 ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                    {momentum.delta > 0 ? '+' : ''}{momentum.delta}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>games</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                  {momentum.delta > 0 ? '📈 Growing' : momentum.delta < 0 ? '📉 Shrinking' : '➡️ Steady'} over the last {momentum.days} days
                </p>
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Building history — check back after a few days of use for a trend.</p>
            )}
          </div>
        )}
      </div>

      {unplayedCount > 0 && <BacklogGraveyard unplayedGames={unplayedGames} steamId={steamId} />}
      {unplayedCount > 0 && <BacklogByGenre unplayedGames={unplayedGames} genreData={genreData} loadStatus={loadStatus} />}

      {/* Spotlight — furthest along, scoped to games with a real HLTB match */}
      {!activeStatus && spotlightGames.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 12 }}>
            Furthest along
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {spotlightGames.map(game => (
              <SpotlightCard
                key={game.appid} game={game} hltbData={hltbCache[game.name]}
                onClick={handleSelect} isSelected={selectedGame?.appid === game.appid}
              />
            ))}
          </div>
        </div>
      )}

      {/* Full list */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            {activeStatus ? STATUS_META[activeStatus].label : 'Everything else'} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({listGames.length})</span>
          </h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['status', 'By Status'], ['shortest', 'Shortest First'], ['hours', 'Most Playtime'], ['alpha', 'A–Z']].map(([key, label]) => (
              <button key={key} onClick={() => setSortBy(key)} className="btn btn-ghost" style={{
                fontSize: 12, padding: '5px 12px',
                background: sortBy === key ? 'var(--accent-blue-dim)' : undefined,
                color: sortBy === key ? 'var(--accent-blue)' : undefined,
                borderColor: sortBy === key ? 'var(--accent-blue)' : undefined,
              }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {listGames.map(game => (
            <GameStatusCard
              key={game.appid} game={game} hltbData={hltbCache[game.name]}
              onClick={handleSelect} isSelected={selectedGame?.appid === game.appid}
            />
          ))}
        </div>

        {hasMorePlayed && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 24, padding: '16px 0 0' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {visiblePlayed.length} of {playedGames.length} played games classified so far
            </p>
            <button className="btn btn-primary" onClick={() => setVisibleCount(c => c + BATCH_SIZE)} style={{ fontSize: 13 }}>
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
          anchorRect={anchorRect}
          onClose={() => { setSelectedGame(null); setAnchorRect(null); }}
        />
      )}
    </div>
  );
}
