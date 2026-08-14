import { useState, useEffect, useMemo } from 'react';
import { fetchAchievementRarity } from '../utils/steam.js';

const CHUNK_SIZE = 40; // matches the server's per-request cap

// "Rarest achievements you've actually earned" — cross-references the
// earnedDetails already carried on achCache entries (see server.js's
// achievements-batch) against GetGlobalAchievementPercentagesForApp, fetched
// progressively in chunks so a large library doesn't fire one giant request.
export default function AchievementRarity({ games, achCache }) {
  const candidates = useMemo(
    () => games.filter(g => achCache[g.appid]?.earnedDetails?.length > 0),
    [games, achCache]
  );
  const candidateIds = candidates.map(g => g.appid).join(',');

  const [percentages, setPercentages] = useState({});

  useEffect(() => {
    if (candidates.length === 0) return;
    let cancelled = false;
    const ids = candidates.map(g => g.appid);

    (async () => {
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        if (cancelled) return;
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const result = await fetchAchievementRarity(chunk);
        if (cancelled) return;
        setPercentages(prev => ({ ...prev, ...result }));
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateIds]);

  const rarest = useMemo(() => {
    const list = [];
    for (const game of candidates) {
      const gamePercents = percentages[game.appid];
      if (!gamePercents) continue;
      for (const ach of achCache[game.appid].earnedDetails) {
        const percent = gamePercents[ach.apiname];
        if (percent == null) continue;
        list.push({ ...ach, percent, gameName: game.name, appid: game.appid });
      }
    }
    return list.sort((a, b) => a.percent - b.percent).slice(0, 10);
  }, [candidates, percentages, achCache]);

  if (rarest.length === 0) return null;

  return (
    <div className="card" style={{ padding: 24, marginBottom: 28 }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        Rarest Unlocks
      </h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
        The achievements you've earned that the fewest other players have.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
        {rarest.map(a => (
          <div key={`${a.appid}-${a.apiname}`} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
            {a.icon ? (
              <img
                src={a.icon} alt="" width={36} height={36}
                style={{ borderRadius: 6, flexShrink: 0 }}
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 6, background: 'var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                🏆
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {a.displayName}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {a.gameName}
              </div>
            </div>
            <div style={{
              flexShrink: 0, fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
              color: a.percent < 5 ? 'var(--accent-violet)' : a.percent < 15 ? 'var(--accent-rose)' : 'var(--accent-amber)',
            }}>
              {a.percent < 1 ? a.percent.toFixed(1) : Math.round(a.percent)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
