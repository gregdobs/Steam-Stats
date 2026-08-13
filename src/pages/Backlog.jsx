import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import {
  computeBacklogProjection, computeBacklogMomentum, computeBacklogByGenre,
  fetchGenres, formatHours,
} from '../utils/steam.js';
import { GameHeader } from '../components/GameImage.jsx';
import GameDetailPanel from '../components/GameDetailPanel.jsx';
import { categoryColor, PageHeader } from '../components/designSystem.jsx';

// Stable per-genre color: hashed by name into the shared 5-color warm palette.
function getGenreColor(genre) {
  let hash = 0;
  for (let i = 0; i < genre.length; i++) hash = (hash * 31 + genre.charCodeAt(i)) | 0;
  return categoryColor(Math.abs(hash));
}

// ── Severity tiers for the headline projection ─────────────────────────────
const getTier = (years) => {
  if (years < 1)  return { label: 'Very manageable',  emoji: '😌', color: 'var(--accent-emerald)' };
  if (years < 5)  return { label: 'A commitment',      emoji: '🤔', color: 'var(--accent-blue)' };
  if (years < 15) return { label: 'A lifestyle choice', emoji: '😅', color: 'var(--accent-amber)' };
  if (years < 50) return { label: 'Generational',       emoji: '😰', color: 'var(--accent-rose)' };
  return { label: 'Outlives the sun', emoji: '💀', color: 'var(--accent-violet)' };
};

// ── "Pick for me" randomizer ────────────────────────────────────────────────
function PickForMe({ unplayedGames, onSelect }) {
  const [spinning, setSpinning] = useState(false);
  const [displayGame, setDisplayGame] = useState(null);
  const [revealed, setRevealed] = useState(null);
  const spinRef = useRef(null);

  const spin = useCallback(() => {
    if (unplayedGames.length === 0) return;
    setSpinning(true);
    setRevealed(null);
    let ticks = 0;
    const totalTicks = 18 + Math.floor(Math.random() * 8);
    clearInterval(spinRef.current);
    spinRef.current = setInterval(() => {
      const g = unplayedGames[Math.floor(Math.random() * unplayedGames.length)];
      setDisplayGame(g);
      ticks++;
      if (ticks >= totalTicks) {
        clearInterval(spinRef.current);
        setSpinning(false);
        setRevealed(g);
      }
    }, 70 + ticks * 4); // gradually slows down like a slot machine
  }, [unplayedGames]);

  useEffect(() => () => clearInterval(spinRef.current), []);

  const shown = revealed || displayGame;

  return (
    <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 3 }}>
          🎰 Pick For Me
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Can't decide? Let fate choose your next game.</p>
      </div>

      <div style={{
        width: 160, aspectRatio: '460/215', borderRadius: 'var(--radius-lg)',
        overflow: 'hidden', background: 'var(--bg-tertiary)', position: 'relative',
        border: revealed ? '2px solid var(--accent-blue)' : '2px solid transparent',
        boxShadow: revealed ? '0 0 24px var(--accent-blue-dim)' : 'none',
        transition: 'border 0.3s, box-shadow 0.3s',
      }}>
        {shown && (
          <div style={{ width: '100%', height: '100%', opacity: spinning ? 0.6 : 1, filter: spinning ? 'blur(1px)' : 'none', transition: 'opacity 0.1s' }}>
            <GameHeader appId={shown.appid} name={shown.name} />
          </div>
        )}
        {!shown && (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🎮</div>
        )}
      </div>

      <div style={{ textAlign: 'center', minHeight: 40 }}>
        {shown && (
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: revealed ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {shown.name}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={spin} disabled={spinning || unplayedGames.length === 0} style={{ fontSize: 13 }}>
          {spinning ? '🎲 Rolling...' : revealed ? '🔄 Spin Again' : '🎲 Spin'}
        </button>
        {revealed && (
          <button className="btn btn-ghost" onClick={(e) => onSelect(revealed, e)} style={{ fontSize: 13 }}>
            View Details
          </button>
        )}
      </div>
    </div>
  );
}

// ── Backlog by genre mini chart ─────────────────────────────────────────────
function BacklogByGenre({ unplayedGames, genreData, loadStatus }) {
  const byGenre = computeBacklogByGenre(unplayedGames, genreData).slice(0, 8);
  const maxCount = Math.max(...byGenre.map(([, c]) => c), 1);

  return (
    <div className="card" style={{ padding: 24 }}>
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

// ── Main page ────────────────────────────────────────────────────────────
export default function Backlog() {
  const { ownedGames, steamId, hltbCache, getHltbForGame, achCache } = useApp();
  const [genreData, setGenreData] = useState({});
  const [loadStatus, setLoadStatus] = useState({ cached: 0, pending: 0 });
  const [sortBy, setSortBy] = useState('alpha');
  const [selectedGame, setSelectedGame] = useState(null);
  const [anchorRect, setAnchorRect] = useState(null);
  const [hltbLoadedCount, setHltbLoadedCount] = useState(0);
  const pollRef = useRef(null);

  const projection = computeBacklogProjection(ownedGames, steamId, hltbCache);
  const unplayedGames = projection.unplayedGames || ownedGames.filter(g => !g.playtime_forever);
  const momentum = computeBacklogMomentum(ownedGames, steamId);

  // Fetch genres for unplayed games (for the by-genre breakdown)
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
        pollRef.current = setInterval(async () => {
          const retry = await fetchGenres(appIds);
          if (cancelled) return;
          setGenreData(prev => ({ ...prev, ...retry.genres }));
          setLoadStatus({ cached: retry.cached, pending: retry.pending });
          if (retry.pending === 0) clearInterval(pollRef.current);
        }, 2000);
      }
    };
    load();
    return () => { cancelled = true; if (pollRef.current) clearInterval(pollRef.current); };
  }, [unplayedGames.length]);

  // Progressively fetch HLTB data for unplayed games (shared cache — also
  // benefits Completion page and vice versa) so the burn-down projection
  // gets more accurate the longer the app is used.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (const game of unplayedGames.slice(0, 80)) {
        if (cancelled) return;
        if (hltbCache[game.name] !== undefined) continue;
        await getHltbForGame(game.name);
        setHltbLoadedCount(c => c + 1);
        await new Promise(r => setTimeout(r, 300));
      }
    };
    run();
    return () => { cancelled = true; };
  }, [unplayedGames.length]);

  const handleSelect = useCallback((game, e) => {
    if (selectedGame?.appid === game.appid) { setSelectedGame(null); setAnchorRect(null); }
    else { setSelectedGame(game); setAnchorRect(e?.currentTarget?.getBoundingClientRect() ?? null); }
  }, [selectedGame]);

  const sortedUnplayed = [...unplayedGames].sort((a, b) => {
    if (sortBy === 'alpha') return a.name.localeCompare(b.name);
    if (sortBy === 'hltb') {
      const ah = hltbCache[a.name]?.mainStory ?? 999;
      const bh = hltbCache[b.name]?.mainStory ?? 999;
      return ah - bh;
    }
    return 0;
  });

  if (projection.unplayedCount === 0) {
    return (
      <div style={{ padding: '28px 24px', maxWidth: 1400, margin: '0 auto' }}>
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>No Backlog</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Every game in your library has been played at least once. Impressive.</p>
        </div>
      </div>
    );
  }

  const { unplayedCount, avgWeeklyHours, totalHoursNeeded, weeksNeeded, yearsNeeded, gamesWithRealEstimate } = projection;
  const tier = avgWeeklyHours ? getTier(yearsNeeded) : null;
  const hltbCoveragePct = Math.round((gamesWithRealEstimate / unplayedCount) * 100);

  return (
    <div style={{ padding: '56px 24px 96px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 40 }}>
        <PageHeader
          eyebrow="Backlog"
          title={
            <>
              <span style={{ fontWeight: 600 }}>{unplayedCount.toLocaleString()} games</span> unplayed.
              {tier && (yearsNeeded < 1
                ? <> At your current pace, about <span style={{ fontWeight: 600 }}>{weeksNeeded} weeks</span> to clear.</>
                : <> At your current pace, about <span style={{ fontWeight: 600 }}>{yearsNeeded} years</span> to clear.</>)}
            </>
          }
          subtitle={gamesWithRealEstimate > 0 ? `${hltbCoveragePct}% have real HowLongToBeat completion estimates.` : undefined}
        />
      </div>

      {/* Headline projection + momentum */}
      <div style={{ display: 'grid', gridTemplateColumns: tier ? '2fr 1fr' : '1fr', gap: 20, marginBottom: 20 }}>
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
        ) : (
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Backlog Burn-down</h3>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--accent-amber)' }}>{unplayedCount}</span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>unplayed games</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{projection.message}</p>
          </div>
        )}

        {/* Momentum card */}
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
      </div>

      {/* Pick For Me + Backlog by Genre */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, marginBottom: 24 }}>
        <PickForMe unplayedGames={unplayedGames} onSelect={handleSelect} />
        <BacklogByGenre unplayedGames={unplayedGames} genreData={genreData} loadStatus={loadStatus} />
      </div>

      {/* Unplayed games grid */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            All Unplayed Games <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({unplayedCount})</span>
          </h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['alpha', 'A–Z'], ['hltb', 'Shortest First']].map(([key, label]) => (
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
          {sortedUnplayed.map(game => {
            const hltb = hltbCache[game.name];
            const isSel = selectedGame?.appid === game.appid;
            return (
              <div
                key={game.appid}
                onClick={(e) => handleSelect(game, e)}
                className="card"
                style={{
                  overflow: 'hidden', cursor: 'pointer', transition: 'all 0.15s',
                  border: isSel ? '1px solid var(--accent-blue)' : undefined,
                  background: isSel ? 'var(--accent-blue-dim)' : undefined,
                }}
                onMouseEnter={e => { if (!isSel) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; } }}
                onMouseLeave={e => { if (!isSel) { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; } }}
              >
                <div style={{ height: 70, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                  <GameHeader appId={game.appid} name={game.name} />
                </div>
                <div style={{ padding: '9px 11px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isSel ? 'var(--accent-blue)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
                    {game.name}
                  </div>
                  {hltb && !hltb.error && hltb.mainStory ? (
                    <div style={{ fontSize: 11, color: 'var(--accent-emerald)' }}>~{hltb.mainStory}h main story</div>
                  ) : hltb === null ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No HLTB match</div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading…</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedGame && (
        <GameDetailPanel
          game={selectedGame}
          hltbData={hltbCache[selectedGame.name]}
          anchorRect={anchorRect}
          onClose={() => { setSelectedGame(null); setAnchorRect(null); }}
        />
      )}
    </div>
  );
}
