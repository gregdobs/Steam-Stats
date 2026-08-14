import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import { fetchGenres } from '../utils/steam.js';
import { GameHeader } from './GameImage.jsx';

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
  const { ownedGames } = useApp();
  const [poolMode, setPoolMode] = useState('quick');
  const [genreData, setGenreData] = useState({});
  const [spinning, setSpinning] = useState(false);
  const [displayGame, setDisplayGame] = useState(null);
  const [pick, setPick] = useState(null);
  const [rerollsUsed, setRerollsUsed] = useState(0);
  const spinRef = useRef(null);
  const pollRef = useRef(null);

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
  };

  useEffect(() => () => clearInterval(spinRef.current), []);

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
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Tonight
        </h2>
        <span style={{ height: 1, flex: 1, background: 'var(--border-subtle)' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {POOL_MODES.map(m => {
            const active = poolMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handlePoolChange(m.id)}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 10px',
                  borderRadius: 'var(--radius-full)', cursor: 'pointer',
                  border: `1px solid ${active ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                  background: active ? 'var(--accent-blue)' : 'transparent',
                  color: active ? '#fffdfa' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-muted)' }}>
          {rerollsLeft > 0 ? `${rerollsLeft} reroll${rerollsLeft === 1 ? '' : 's'} left` : 'No rerolls left'}
        </span>
      </div>

      {pool.length === 0 ? (
        <div className="card" style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Nothing in this pool right now — try the other mode.
        </div>
      ) : (
        <article className="card" style={{ borderRadius: 26, overflow: 'hidden' }}>
          <div style={{ height: 190, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
            {shown && (
              <div style={{ width: '100%', height: '100%', opacity: spinning ? 0.6 : 1, filter: spinning ? 'blur(1.5px)' : 'none', transition: 'opacity 0.1s' }}>
                <GameHeader appId={shown.appid} name={shown.name} />
              </div>
            )}
          </div>
          <div style={{ padding: '22px 24px 24px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '1.1px', textTransform: 'uppercase', color: 'var(--accent-blue)', marginBottom: 9 }}>
                {spinning ? 'Rolling…' : poolMode === 'quick' ? 'Random pick · under 3h in' : 'Random pick · anything unplayed'}
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 21, fontWeight: 600, letterSpacing: '-0.3px' }}>
                {shown ? shown.name : '—'}
              </h3>
              {genres?.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {genres.slice(0, 3).map(g => (
                    <span key={g} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
              {shown && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }}>
                  {hoursLogged > 0 ? `${hoursLogged.toFixed(1)}h logged so far` : 'Never launched'}
                </div>
              )}
              <button
                className="btn btn-primary"
                onClick={() => spin(true)}
                disabled={spinning || pool.length < 2 || rerollsLeft === 0}
                style={{ fontSize: 13 }}
              >
                {spinning ? '🎲 Rolling…' : rerollsLeft === 0 ? "That's tonight's pick" : '🎲 Reroll'}
              </button>
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
