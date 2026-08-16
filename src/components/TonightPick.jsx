import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import { GameHeader } from './GameImage.jsx';
import GameDetailPanel from './GameDetailPanel.jsx';

const REROLL_BUDGET = 3;
const PLAYTIME_CEILING_MINUTES = 180; // < 3 hours — matches the design's single pool
const SPIN_STEPS = 14; // number of slot-reel ticks before landing on the real pick

function statusPhrase(hours) {
  if (hours <= 0) return 'never launched';
  if (hours < 1) return 'barely started';
  return 'in progress';
}

export default function TonightPick() {
  const { ownedGames, hltbCache, getHltbForGame, achCache, getAchievementsForGames } = useApp();
  const [pick, setPick] = useState(null);
  const [rerollsUsed, setRerollsUsed] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const [detailRect, setDetailRect] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [spinName, setSpinName] = useState('');
  const [spinPick, setSpinPick] = useState(null);
  const [spinTick, setSpinTick] = useState(0);
  const [landed, setLanded] = useState(false);
  const rollTimer = useRef(null);

  const pool = useMemo(
    () => ownedGames.filter(g => (g.playtime_forever || 0) < PLAYTIME_CEILING_MINUTES),
    [ownedGames]
  );

  const clearRollTimer = () => {
    if (rollTimer.current) {
      clearTimeout(rollTimer.current);
      rollTimer.current = null;
    }
  };

  useEffect(() => clearRollTimer, []);

  // Cycles through random pool entries at an accelerating delay (slot-reel
  // deceleration) before settling on the real target — same effect for the
  // first roll and every reroll, so the pick always feels like it was won.
  const roll = useCallback((isReroll) => {
    if (pool.length === 0 || rolling) return;
    if (isReroll && rerollsUsed >= REROLL_BUDGET) return;
    setShowDetail(false);
    clearRollTimer();

    const choices = pool.length > 1 ? pool.filter(g => g.appid !== pick?.appid) : pool;
    const target = choices[Math.floor(Math.random() * choices.length)];
    if (isReroll) setRerollsUsed(c => c + 1);

    setRolling(true);
    setLanded(false);

    let i = 0;
    const step = () => {
      i += 1;
      const isLast = i >= SPIN_STEPS;
      const frame = isLast ? target : pool[Math.floor(Math.random() * pool.length)];
      setSpinName(frame.name);
      setSpinPick(frame);
      setSpinTick(c => c + 1);
      if (!isLast) {
        const progress = i / SPIN_STEPS;
        const delay = 40 + progress * progress * 260; // ease into a slow final tick
        rollTimer.current = setTimeout(step, delay);
      } else {
        rollTimer.current = setTimeout(() => {
          setPick(target);
          setRolling(false);
          setLanded(true);
          rollTimer.current = setTimeout(() => setLanded(false), 480);
        }, 220);
      }
    };
    rollTimer.current = setTimeout(step, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, rerollsUsed, pick, rolling]);

  // First pick is free — doesn't touch the reroll budget.
  useEffect(() => {
    if (pool.length > 0 && !pick && !rolling) roll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.length]);

  // HowLongToBeat main-story estimate shows inline on the card itself (not
  // just inside the detail sheet), so fetch it as soon as a pick lands.
  useEffect(() => {
    if (pick && hltbCache[pick.name] === undefined) getHltbForGame(pick.name);
  }, [pick, hltbCache, getHltbForGame]);

  const openDetail = (e) => {
    if (!pick || rolling) return;
    setShowDetail(true);
    setDetailRect(e ? e.currentTarget.getBoundingClientRect() : null);
    getAchievementsForGames([pick.appid]);
  };

  if (pool.length === 0) return null;

  const rerollsLeft = REROLL_BUDGET - rerollsUsed;
  const hoursLogged = pick ? (pick.playtime_forever || 0) / 60 : 0;
  const hltbMain = pick ? hltbCache[pick.name]?.mainStory : null;
  const detail = pick && !rolling
    ? [
        `${hoursLogged.toFixed(1)}h logged`,
        statusPhrase(hoursLogged),
        hltbMain ? `~${hltbMain}h main story` : null,
      ].filter(Boolean).join(' · ')
    : (rolling ? 'rolling the dice…' : '');
  const displayName = rolling ? spinName : (pick ? pick.name : '—');

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 500, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ss-ink3)' }}>
          Tonight
        </h2>
        <span style={{ height: 1, flex: 1, background: 'var(--ss-line-soft)' }} />
        <span style={{ fontSize: 12.5, color: 'var(--ss-ink3)' }}>
          {rerollsLeft > 0 ? `${rerollsLeft} reroll${rerollsLeft === 1 ? '' : 's'} left` : 'No rerolls left'} · picks from anything under 3 hours
        </span>
      </div>

      <div
        className="ss-panel"
        style={{
          display: 'flex', gap: 24, alignItems: 'center', overflow: 'hidden',
          animation: landed ? 'tpLand 0.42s cubic-bezier(.22,1,.36,1) both, tpGlow 0.48s ease both' : undefined,
        }}
      >
        <div style={{ position: 'relative', width: 150, height: 70, borderRadius: 14, overflow: 'hidden', flexShrink: 0, background: 'linear-gradient(140deg,#161c26,#0c1017)' }}>
          <div style={{ width: '100%', height: '100%', animation: rolling ? 'tpReel 0.32s ease-in-out infinite' : undefined }}>
            {rolling
              ? (spinPick && <GameHeader key={spinTick} appId={spinPick.appid} name={spinPick.name} />)
              : (pick && <GameHeader appId={pick.appid} name={pick.name} />)}
          </div>
          {rolling && (
            <div style={{
              position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, background: 'rgba(8,11,16,0.55)', backdropFilter: 'blur(2px)',
            }}>
              🎲
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ss-ink3)', marginBottom: 5, fontWeight: 500 }}>
            What should I play tonight
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.4px', lineHeight: 1.25, overflow: 'hidden' }}>
            <span
              key={rolling ? `spin-${spinTick}` : `pick-${pick?.appid ?? 'none'}`}
              style={{ display: 'inline-block', animation: rolling ? 'tpFlicker 0.16s ease both' : undefined }}
            >
              {displayName}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ss-ink2)', marginTop: 3 }}>{detail}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button
            onClick={() => roll(true)}
            disabled={pool.length < 2 || rerollsLeft === 0 || rolling}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 16,
              background: 'var(--ss-btn)', border: '1px solid var(--ss-line)', color: 'var(--ss-ink)',
              fontSize: 13.5, cursor: 'pointer', opacity: (pool.length < 2 || rerollsLeft === 0 || rolling) ? 0.5 : 1,
            }}
            onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--ss-btn-hi)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--ss-btn)'; }}
          >
            <span style={{ display: 'inline-block', animation: rolling ? 'spin 0.5s linear infinite' : undefined }}>🎲</span>
            {rolling ? 'Rolling…' : 'Reroll'}
          </button>
          <button
            onClick={openDetail}
            disabled={!pick || rolling}
            style={{
              padding: '11px 18px', borderRadius: 16, cursor: 'pointer', fontSize: 13.5, color: 'var(--ss-ink)',
              background: 'linear-gradient(160deg, rgba(111,200,247,.34), rgba(111,200,247,.14))',
              border: '1px solid rgba(111,200,247,.42)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.24)',
              opacity: (!pick || rolling) ? 0.5 : 1,
            }}
            onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'linear-gradient(160deg, rgba(111,200,247,.46), rgba(111,200,247,.2))'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(160deg, rgba(111,200,247,.34), rgba(111,200,247,.14))'; }}
          >
            Open details
          </button>
        </div>
      </div>

      {showDetail && pick && (
        <GameDetailPanel
          game={pick}
          achData={achCache[pick.appid]}
          hltbData={hltbCache[pick.name]}
          anchorRect={detailRect}
          onClose={() => setShowDetail(false)}
        />
      )}
    </section>
  );
}
