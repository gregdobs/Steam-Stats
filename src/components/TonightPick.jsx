import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import { fetchGenres } from '../utils/steam.js';
import { GameHeader } from './GameImage.jsx';
import GameDetailPanel from './GameDetailPanel.jsx';

const REROLL_BUDGET = 3;
const PLAYTIME_CEILING_MINUTES = 180; // < 3 hours

// Two pools, one picker — this used to be two separate features (this one,
// and Backlog's "Pick For Me") built independently with different rules.
// "Quick" answers "something short tonight"; "Anything unplayed" answers
// "I can't decide what to start next" — Pick For Me's old job, folded in
// here instead of living as an uncoordinated duplicate slot machine.
const POOL_MODES = [
  { id: 'quick', label: 'Quick (<3h)' },
  { id: 'anything', label: 'Anything unplayed' },
];

export default function TonightPick() {
  const { ownedGames, hltbCache, getHltbForGame, achCache, getAchievementsForGames } = useApp();
  const [poolMode, setPoolMode] = useState('quick');
  const [genreData, setGenreData] = useState({});
  const [spinning, setSpinning] = useState(false);
  const [displayGame, setDisplayGame] = useState(null);
  const [pick, setPick] = useState(null);
  const [rerollsUsed, setRerollsUsed] = useState(0);
  const [rollId, setRollId] = useState(0);
  const [justLanded, setJustLanded] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const spinRef = useRef(null);
  const pollRef = useRef(null);
  const landRef = useRef(null);

  const quickPool = useMemo(
    () => ownedGames.filter(g => (g.playtime_forever || 0) < PLAYTIME_CEILING_MINUTES),
    [ownedGames]
  );
  const anythingPool = useMemo(
    () => ownedGames.filter(g => !g.playtime_forever || g.playtime_forever === 0),
    [ownedGames]
  );
  const pool = poolMode === 'quick' ? quickPool : anythingPool;

  const spin = useCallback((isReroll) => {
    if (pool.length === 0) return;
    if (isReroll && rerollsUsed >= REROLL_BUDGET) return;
    setShowDetail(false);
    setSpinning(true);
    setPick(null);
    let ticks = 0;
    const totalTicks = 18 + Math.floor(Math.random() * 8);
    clearInterval(spinRef.current);
    spinRef.current = setInterval(() => {
      const g = pool[Math.floor(Math.random() * pool.length)];
      setDisplayGame(g);
      ticks++;
      if (ticks >= totalTicks) {
        clearInterval(spinRef.current);
        setSpinning(false);
        setPick(g);
        setRollId(id => id + 1);
        if (isReroll) setRerollsUsed(c => c + 1);
      }
    }, 70 + ticks * 4); // gradually slows down like a slot machine
  }, [pool, rerollsUsed]);

  // Auto-roll once a pool exists — the first roll is free, doesn't touch the
  // reroll budget. Keyed on poolMode too, not just pool.length, so switching
  // modes always re-triggers even if both pools happen to be the same size.
  useEffect(() => {
    if (pool.length > 0 && !pick && !spinning && displayGame === null) spin(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolMode, pool.length]);

  // Switching pools is a different question — starts fresh with its own budget.
  const handlePoolChange = (mode) => {
    if (mode === poolMode) return;
    clearInterval(spinRef.current);
    setPoolMode(mode);
    setPick(null);
    setDisplayGame(null);
    setSpinning(false);
    setRerollsUsed(0);
    setShowDetail(false);
  };

  useEffect(() => () => clearInterval(spinRef.current), []);

  // Brief "landed" flourish (pop + glow ring) each time a pick resolves,
  // whether that's the first auto-roll or a reroll. Keyed on rollId rather
  // than the pick object itself, since rolling the same game twice in a row
  // wouldn't otherwise re-trigger a state change.
  useEffect(() => {
    if (rollId === 0) return;
    setJustLanded(true);
    clearTimeout(landRef.current);
    landRef.current = setTimeout(() => setJustLanded(false), 700);
    return () => clearTimeout(landRef.current);
  }, [rollId]);

  // Genre tags are cosmetic (a badge on the pick), fetch only once landed.
  useEffect(() => {
    if (!pick) return;
    let cancelled = false;
    const load = async () => {
      const result = await fetchGenres([pick.appid]);
      if (cancelled) return;
      setGenreData(prev => ({ ...prev, ...result.genres }));
      if (result.pending > 0) {
        pollRef.current = setInterval(async () => {
          const retry = await fetchGenres([pick.appid]);
          if (cancelled) return;
          setGenreData(prev => ({ ...prev, ...retry.genres }));
          if (retry.pending === 0) clearInterval(pollRef.current);
        }, 3000);
      }
    };
    load();
    return () => { cancelled = true; if (pollRef.current) clearInterval(pollRef.current); };
  }, [pick?.appid]);

  const openDetail = () => {
    if (spinning || !pick) return;
    setShowDetail(true);
    getHltbForGame(pick.name);
    getAchievementsForGames([pick.appid]);
  };

  // Only fully hide when there's genuinely nothing to offer in either pool —
  // otherwise keep the toggle visible so an empty "Quick" pool doesn't hide
  // the door to "Anything unplayed", which might still have plenty.
  if (quickPool.length === 0 && anythingPool.length === 0) return null;

  const shown = pick || displayGame;
  const genres = pick ? genreData[pick.appid]?.genres : null;
  const rerollsLeft = REROLL_BUDGET - rerollsUsed;
  const hoursLogged = shown ? (shown.playtime_forever || 0) / 60 : 0;

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--ss-ink3)' }}>
          Tonight
        </h2>
        <span style={{ height: 1, flex: 1, background: 'var(--ss-line-soft)' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {POOL_MODES.map(m => {
            const active = poolMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handlePoolChange(m.id)}
                style={{
                  fontSize: 11, padding: '4px 10px',
                  borderRadius: 99, cursor: 'pointer',
                  border: `1px solid ${active ? 'var(--ss-accent)' : 'var(--ss-line)'}`,
                  background: active ? 'var(--ss-accent)' : 'transparent',
                  color: active ? '#fff' : 'var(--ss-ink2)',
                  transition: 'all 0.15s ease',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--ss-ink3)' }}>
          {rerollsLeft > 0 ? `${rerollsLeft} reroll${rerollsLeft === 1 ? '' : 's'} left` : 'No rerolls left'}
        </span>
      </div>

      {pool.length === 0 ? (
        <div className="ss-panel" style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--ss-ink3)', fontSize: 13 }}>
          Nothing in this pool right now — try the other mode.
        </div>
      ) : (
        <article
          className="ss-panel"
          onClick={openDetail}
          title={!spinning && pick ? 'Click for details' : undefined}
          style={{
            padding: 0,
            borderRadius: 26,
            overflow: 'hidden',
            cursor: !spinning && pick ? 'pointer' : 'default',
            animation: justLanded ? 'tpPop 0.5s cubic-bezier(.34,1.56,.64,1), tpRing 0.7s ease-out' : 'none',
          }}
        >
          <div style={{ height: 'clamp(200px, 28vw, 280px)', background: 'var(--ss-inset)', position: 'relative', overflow: 'hidden' }}>
            {shown && (
              <div
                style={{
                  width: '100%', height: '100%',
                  filter: spinning ? 'blur(2px) saturate(1.15)' : 'none',
                  transition: 'filter 0.15s',
                  animation: spinning ? 'tpReel 0.22s ease-in-out infinite' : 'none',
                }}
              >
                <GameHeader appId={shown.appid} name={shown.name} />
              </div>
            )}
            {spinning && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute', top: 0, bottom: 0, left: 0, width: '45%',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                  animation: 'tpSweep 0.9s linear infinite',
                  pointerEvents: 'none',
                }}
              />
            )}
            {!spinning && pick && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 45%)',
                pointerEvents: 'none',
              }} />
            )}
            {!spinning && pick && (
              <div style={{
                position: 'absolute', top: 12, right: 14,
                fontSize: 10.5, fontWeight: 700,
                letterSpacing: '0.4px', color: '#fff',
                background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 99, padding: '4px 10px',
                display: 'flex', alignItems: 'center', gap: 5,
                animation: justLanded ? 'fadeInFast 0.4s ease 0.15s both' : 'none',
                pointerEvents: 'none',
              }}>
                🎯 Click for details
              </div>
            )}
          </div>
          <div style={{ padding: '24px 26px 26px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, letterSpacing: '1.1px', textTransform: 'uppercase', color: 'var(--ss-accent)', marginBottom: 9, display: 'flex', alignItems: 'center', gap: 7 }}>
                {spinning && (
                  <span style={{ display: 'inline-block', animation: 'tpDice 0.5s linear infinite' }}>🎲</span>
                )}
                {spinning ? 'Rolling…' : poolMode === 'quick' ? 'Random pick · under 3h in' : 'Random pick · anything unplayed'}
              </div>
              <h3 style={{
                margin: '0 0 8px', fontSize: 'clamp(21px, 2.4vw, 28px)', fontWeight: 600, letterSpacing: '-0.4px',
                animation: justLanded ? 'fadeInFast 0.35s ease' : 'none',
              }}>
                {shown ? shown.name : '—'}
              </h3>
              {genres?.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {genres.slice(0, 3).map(g => (
                    <span key={g} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--ss-btn)', color: 'var(--ss-ink3)' }}>
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
              {shown && (
                <div style={{ fontSize: 13, color: 'var(--ss-ink3)' }}>
                  {hoursLogged > 0 ? `${hoursLogged.toFixed(1)}h logged so far` : 'Never launched'}
                </div>
              )}
              <button
                onClick={e => { e.stopPropagation(); spin(true); }}
                disabled={spinning || pool.length < 2 || rerollsLeft === 0}
                style={{
                  fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 12,
                  border: 'none', cursor: 'pointer', color: '#fff', background: 'var(--ss-accent)',
                  opacity: (spinning || pool.length < 2 || rerollsLeft === 0) ? 0.5 : 1,
                  animation: spinning ? 'tpFloat 0.6s ease-in-out infinite' : 'none',
                }}
              >
                {spinning ? '🎲 Rolling…' : rerollsLeft === 0 ? "That's tonight's pick" : '🎲 Reroll'}
              </button>
            </div>
          </div>
        </article>
      )}

      {showDetail && pick && (
        <GameDetailPanel
          game={pick}
          achData={achCache[pick.appid]}
          hltbData={hltbCache[pick.name]}
          onClose={() => setShowDetail(false)}
        />
      )}
    </section>
  );
}
