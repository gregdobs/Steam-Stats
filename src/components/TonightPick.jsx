import { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import { fetchGenres, recommendTonight } from '../utils/steam.js';
import { GameHeader } from './GameImage.jsx';

const BUDGETS = [
  { label: 'any', value: null },
  { label: '<5h', value: 5 },
  { label: '<10h', value: 10 },
  { label: '<20h', value: 20 },
];

export default function TonightPick() {
  const { ownedGames, hltbCache } = useApp();
  const [maxHours, setMaxHours] = useState(null);
  const [genreData, setGenreData] = useState({});
  const pollRef = useRef(null);

  const unplayedGames = useMemo(
    () => ownedGames.filter(g => !g.playtime_forever || g.playtime_forever === 0),
    [ownedGames]
  );

  const results = useMemo(
    () => recommendTonight(unplayedGames, hltbCache, {}, { maxHours }),
    [unplayedGames, hltbCache, maxHours]
  );

  const shown = results.slice(0, 6);
  const shownIds = shown.map(g => g.appid).join(',');

  // Genre tags here are purely cosmetic (a badge on the featured pick), so
  // only fetch for what's actually on screen rather than the whole backlog.
  useEffect(() => {
    if (shown.length === 0) return;
    let cancelled = false;
    const appIds = shown.map(g => g.appid);

    const load = async () => {
      const result = await fetchGenres(appIds);
      if (cancelled) return;
      setGenreData(prev => ({ ...prev, ...result.genres }));
      if (result.pending > 0) {
        pollRef.current = setInterval(async () => {
          const retry = await fetchGenres(appIds);
          if (cancelled) return;
          setGenreData(prev => ({ ...prev, ...retry.genres }));
          if (retry.pending === 0) clearInterval(pollRef.current);
        }, 3000);
      }
    };
    load();
    return () => { cancelled = true; if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownIds]);

  if (unplayedGames.length === 0) return null;

  const pick = shown[0];
  const alternates = shown.slice(1, 6);
  const pickGenres = pick ? genreData[pick.appid]?.genres : null;
  const knownCount = results.filter(g => g.estimateHours != null).length;

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Tonight
        </h2>
        <span style={{ height: 1, flex: 1, background: 'var(--border-subtle)' }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {BUDGETS.map(b => {
            const active = maxHours === b.value;
            return (
              <button
                key={b.label}
                onClick={() => setMaxHours(b.value)}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11.5, padding: '5px 11px',
                  borderRadius: 'var(--radius-full)', cursor: 'pointer',
                  border: `1px solid ${active ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                  background: active ? 'var(--accent-blue)' : 'transparent',
                  color: active ? '#fffdfa' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                }}
              >
                {b.label}
              </button>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {maxHours != null
            ? 'Nothing in your backlog is confirmed to fit that budget yet — HLTB estimates fill in as you browse Backlog/Completion.'
            : 'No games match this filter.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
          <article className="card" style={{ borderRadius: 26, overflow: 'hidden' }}>
            <div style={{ height: 150, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
              <GameHeader appId={pick.appid} name={pick.name} />
            </div>
            <div style={{ padding: '22px 24px 24px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '1.1px', textTransform: 'uppercase', color: 'var(--accent-blue)', marginBottom: 9 }}>
                Shortest unplayed pick
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 21, fontWeight: 600, letterSpacing: '-0.3px' }}>
                {pick.name}
              </h3>
              {pickGenres?.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
                  {pickGenres.slice(0, 3).map(g => (
                    <span key={g} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                      {g}
                    </span>
                  ))}
                </div>
              )}
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--text-primary)' }}>
                  {pick.estimateHours != null ? `~${pick.estimateHours}h` : 'Length unknown'}
                </div>
                {pick.estimateHours != null && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>main story</div>
                )}
              </div>
            </div>
          </article>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {alternates.map(g => (
              <div key={g.appid} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 14px', borderRadius: 16 }}>
                <div style={{ width: 74, height: 35, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
                  <GameHeader appId={g.appid} name={g.name} />
                </div>
                <span style={{ flex: 1, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.name}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {g.estimateHours != null ? `~${g.estimateHours}h` : 'unknown'}
                </span>
              </div>
            ))}
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: 14 }}>
              {knownCount} of {unplayedGames.length} unplayed games have a known length.
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
