import { useState, useEffect, useRef } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import { fetchGenres, loadSnapshots, formatHours } from '../utils/steam.js';
import { categoryColor, SectionHeading } from './designSystem.jsx';

// Stable per-genre color: hashed by name (not by sort rank, which shifts as
// hour totals change) into the shared categorical palette.
function getColor(genre) {
  let hash = 0;
  for (let i = 0; i < genre.length; i++) hash = (hash * 31 + genre.charCodeAt(i)) | 0;
  return categoryColor(Math.abs(hash));
}

export default function GenreAllocation({ activeFilter, onFilter }) {
  const { ownedGames, steamId } = useApp();
  const [genreData, setGenreData] = useState({});
  const [loadStatus, setLoadStatus] = useState({ cached: 0, pending: 0 });
  const [hoveredGenre, setHoveredGenre] = useState(null);
  const pollRef = useRef(null);

  const playedGames = ownedGames.filter(g => g.playtime_forever > 0);

  // Kick off genre fetch for played games, then poll until the background queue drains
  useEffect(() => {
    if (playedGames.length === 0) return;

    let cancelled = false;
    const appIds = playedGames.map(g => g.appid);

    const load = async () => {
      const result = await fetchGenres(appIds);
      if (cancelled) return;
      setGenreData(prev => ({ ...prev, ...result.genres }));
      setLoadStatus({ cached: result.cached, pending: result.pending });

      // If there's a pending background fetch, poll for updates
      if (result.pending > 0) {
        pollRef.current = setInterval(async () => {
          const retry = await fetchGenres(appIds);
          if (cancelled) return;
          setGenreData(prev => ({ ...prev, ...retry.genres }));
          setLoadStatus({ cached: retry.cached, pending: retry.pending });
          if (retry.pending === 0) clearInterval(pollRef.current);
        }, 3000);
      }
    };
    load();

    return () => { cancelled = true; if (pollRef.current) clearInterval(pollRef.current); };
  }, [playedGames.length]);

  // Compute genre hour totals — all time
  const genreHoursAllTime = {};
  for (const game of playedGames) {
    const entry = genreData[game.appid];
    if (!entry || entry.notFound || !entry.genres?.length) continue;
    // Split hours evenly across a game's genres to avoid double-counting total time
    const hoursPerGenre = (game.playtime_forever || 0) / entry.genres.length;
    for (const genre of entry.genres) {
      genreHoursAllTime[genre] = (genreHoursAllTime[genre] || 0) + hoursPerGenre;
    }
  }

  const totalCategorizedMinutes = Object.values(genreHoursAllTime).reduce((s, v) => s + v, 0);
  const sortedGenres = Object.entries(genreHoursAllTime)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  // Genre trend over time using snapshots (last 8 data points)
  const snapshots = steamId ? loadSnapshots(steamId) : [];
  const trendPoints = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const prevMap = new Map(prev.games.map(g => [g.appid, g.playtime_forever]));
    const genreDeltas = {};
    for (const g of curr.games) {
      const delta = g.playtime_forever - (prevMap.get(g.appid) || 0);
      if (delta <= 0) continue;
      const entry = genreData[g.appid];
      if (!entry || !entry.genres?.length) continue;
      const perGenre = delta / entry.genres.length;
      for (const genre of entry.genres) {
        genreDeltas[genre] = (genreDeltas[genre] || 0) + perGenre;
      }
    }
    if (Object.keys(genreDeltas).length > 0) {
      trendPoints.push({ date: curr.date, timestamp: curr.timestamp, genres: genreDeltas });
    }
  }
  const recentTrend = trendPoints.slice(-8);

  const isLoading = loadStatus.pending > 0;
  const noDataYet = sortedGenres.length === 0 && !isLoading;

  const selectedGenre = activeFilter?.type === 'genre' ? activeFilter.value : null;

  const toggleGenre = (genre) => {
    if (!onFilter) return;
    if (selectedGenre === genre) { onFilter(null); return; }
    const appids = playedGames.filter(g => genreData[g.appid]?.genres?.includes(genre)).map(g => g.appid);
    onFilter({ type: 'genre', value: genre, label: genre, appids, color: getColor(genre) });
  };

  return (
    <div className="ss-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <SectionHeading title="Genre allocation" />
        {isLoading && (
          <span style={{ fontSize: 11, color: 'var(--ss-ink3)', marginLeft: 12, flexShrink: 0 }}>
            Loading genres… {loadStatus.cached} cached, {loadStatus.pending} pending
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: 'var(--ss-ink3)', marginTop: -12, marginBottom: 18 }}>
        How your all-time hours split across genres. Click a segment to filter the table below.
      </p>

      {sortedGenres.length > 0 && (
        <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--ss-ink3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Top Genre</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: getColor(sortedGenres[0][0]) }}>{sortedGenres[0][0]}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--ss-ink3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Hours in it</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ss-ink)' }}>{formatHours(sortedGenres[0][1])}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--ss-ink3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Genres tracked</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ss-ink)' }}>{sortedGenres.length}</div>
          </div>
        </div>
      )}

      {noDataYet && (
        <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--ss-ink3)', fontSize: 13 }}>
          No genre data available yet.
        </div>
      )}

      {sortedGenres.length > 0 && (
        <>
          {/* Horizontal stacked bar */}
          <div style={{ display: 'flex', height: 28, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            {sortedGenres.map(([genre, minutes]) => {
              const pct = (minutes / totalCategorizedMinutes) * 100;
              const isHovered = hoveredGenre === genre;
              const isSel = selectedGenre === genre;
              return (
                <div
                  key={genre}
                  onClick={() => toggleGenre(genre)}
                  onMouseEnter={() => setHoveredGenre(genre)}
                  onMouseLeave={() => setHoveredGenre(null)}
                  style={{
                    width: `${pct}%`,
                    background: getColor(genre),
                    opacity: selectedGenre ? (isSel ? 1 : 0.3) : (hoveredGenre && !isHovered ? 0.4 : 1),
                    outline: isSel ? '2px solid var(--ss-hi)' : 'none',
                    outlineOffset: -2,
                    transition: 'opacity 0.15s',
                    cursor: onFilter ? 'pointer' : 'default',
                    minWidth: pct > 0.5 ? 2 : 0,
                  }}
                  title={`${genre}: ${formatHours(minutes)} (${pct.toFixed(1)}%)`}
                />
              );
            })}
          </div>

          {/* Legend grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: recentTrend.length > 1 ? 24 : 0 }}>
            {sortedGenres.map(([genre, minutes]) => {
              const pct = (minutes / totalCategorizedMinutes) * 100;
              const isHovered = hoveredGenre === genre;
              const isSel = selectedGenre === genre;
              return (
                <div
                  key={genre}
                  onClick={() => toggleGenre(genre)}
                  onMouseEnter={() => setHoveredGenre(genre)}
                  onMouseLeave={() => setHoveredGenre(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, cursor: onFilter ? 'pointer' : 'default',
                    padding: '6px 8px', borderRadius: 10,
                    background: isSel ? 'var(--ss-pill-bg)' : isHovered ? 'var(--ss-btn)' : 'transparent',
                    border: isSel ? '1px solid var(--ss-pill-line)' : '1px solid transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: getColor(genre), flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--ss-ink2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{genre}</span>
                  <span style={{ fontSize: 11, color: 'var(--ss-ink3)', flexShrink: 0 }}>{formatHours(minutes)}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ss-ink)', width: 34, textAlign: 'right', flexShrink: 0 }}>{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>

          {/* Trend over time — simple stacked mini bars per snapshot */}
          {recentTrend.length > 1 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--ss-ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 10 }}>
                Recent genre mix by session
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 90 }}>
                {recentTrend.map((point, i) => {
                  const total = Object.values(point.genres).reduce((s, v) => s + v, 0);
                  const topGenres = Object.entries(point.genres).sort(([, a], [, b]) => b - a).slice(0, 6);
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse', height: '100%', borderRadius: 3, overflow: 'hidden' }} title={new Date(point.timestamp).toLocaleDateString()}>
                      {topGenres.map(([genre, minutes]) => (
                        <div
                          key={genre}
                          style={{
                            height: `${(minutes / total) * 100}%`,
                            background: getColor(genre),
                            opacity: hoveredGenre && hoveredGenre !== genre ? 0.35 : 1,
                            transition: 'opacity 0.15s',
                          }}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--ss-ink3)' }}>{new Date(recentTrend[0].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                <span style={{ fontSize: 10, color: 'var(--ss-ink3)' }}>{new Date(recentTrend[recentTrend.length - 1].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
