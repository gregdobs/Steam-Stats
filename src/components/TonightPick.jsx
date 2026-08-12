import { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import { fetchGenres, recommendTonight, formatHours } from '../utils/steam.js';
import { GameHeader } from './GameImage.jsx';

const TIME_BUDGETS = [
  { label: 'Any length', value: null },
  { label: '< 5h', value: 5 },
  { label: '< 10h', value: 10 },
  { label: '< 20h', value: 20 },
];

export default function TonightPick() {
  const { ownedGames, hltbCache } = useApp();
  const [maxHours, setMaxHours] = useState(null);
  const [genre, setGenre] = useState(null);
  const [genreData, setGenreData] = useState({});
  const pollRef = useRef(null);

  const unplayedGames = useMemo(
    () => ownedGames.filter(g => !g.playtime_forever || g.playtime_forever === 0),
    [ownedGames]
  );

  // Fetches nothing itself beyond genre tags (needed for the genre filter
  // dropdown) — HLTB data is read from the already-shared cache, populated
  // by Backlog/Completion page visits, not fetched fresh here. Deliberately
  // an instant filter over existing data, not another loading state.
  useEffect(() => {
    if (unplayedGames.length === 0) return;
    let cancelled = false;
    const appIds = unplayedGames.map(g => g.appid);

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
  }, [unplayedGames.length]);

  const availableGenres = useMemo(() => {
    const set = new Set();
    for (const g of unplayedGames) {
      const entry = genreData[g.appid];
      if (entry?.genres) entry.genres.forEach(x => set.add(x));
    }
    return [...set].sort();
  }, [unplayedGames, genreData]);

  const results = useMemo(
    () => recommendTonight(unplayedGames, hltbCache, genreData, { maxHours, genre }),
    [unplayedGames, hltbCache, genreData, maxHours, genre]
  );

  if (unplayedGames.length === 0) return null;

  return (
    <div className="card" style={{ padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
          🎲 What Should I Play Tonight
        </h3>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        Picks from your backlog using cached HowLongToBeat estimates — shortest known games first.
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>Time tonight</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TIME_BUDGETS.map(b => (
              <button key={b.label} onClick={() => setMaxHours(b.value)} className="btn btn-ghost" style={{
                fontSize: 12, padding: '5px 12px',
                background: maxHours === b.value ? 'var(--accent-blue-dim)' : undefined,
                color: maxHours === b.value ? 'var(--accent-blue)' : undefined,
                borderColor: maxHours === b.value ? 'var(--accent-blue)' : undefined,
              }}>{b.label}</button>
            ))}
          </div>
        </div>

        {availableGenres.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>Genre</div>
            <select
              className="input"
              value={genre || ''}
              onChange={e => setGenre(e.target.value || null)}
              style={{ fontSize: 12, padding: '5px 10px', width: 'auto' }}
            >
              <option value="">Any genre</option>
              {availableGenres.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {maxHours != null
            ? "Nothing in your backlog is confirmed to fit that budget yet — HLTB estimates fill in as you browse Backlog/Completion."
            : 'No games match this filter.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {results.slice(0, 8).map(game => (
            <div key={game.appid} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ height: 70, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                <GameHeader appId={game.appid} name={game.name} />
              </div>
              <div style={{ padding: '9px 11px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
                  {game.name}
                </div>
                {game.estimateHours != null ? (
                  <div style={{ fontSize: 11, color: 'var(--accent-emerald)' }}>~{game.estimateHours}h main story</div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Length unknown</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
