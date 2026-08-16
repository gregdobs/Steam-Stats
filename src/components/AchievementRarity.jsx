import { useState, useEffect, useMemo } from 'react';
import { fetchAchievementRarity, formatLastPlayed } from '../utils/steam.js';
import { SectionHeading } from './designSystem.jsx';

const CHUNK_SIZE = 40; // matches the server's per-request cap

// "Rarest achievements you've actually earned" — cross-references the
// earnedDetails already carried on achCache entries (see server.js's
// achievements-batch) against GetGlobalAchievementPercentagesForApp, fetched
// progressively in chunks so a large library doesn't fire one giant request.
// Scoped entirely to games already in achCache — no new fan-out beyond what
// the page has already scanned.
export default function AchievementRarity({ games, achCache, onSelect }) {
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
    <div className="ss-panel">
      <SectionHeading title="Rarest unlocks" />
      <p style={{ fontSize: 12, color: 'var(--ss-ink3)', marginTop: -12, marginBottom: 18 }}>
        The achievements you've earned that the fewest other players have. Click one for details.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rarest.map(a => {
          const oneIn = a.percent > 0 ? Math.round(100 / a.percent) : null;
          return (
            <button
              key={`${a.appid}-${a.apiname}`}
              onClick={(e) => onSelect?.(a, e)}
              style={{
                display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px',
                background: 'var(--ss-inset)', border: '1px solid var(--ss-line-soft)', borderRadius: 14,
                cursor: 'pointer', textAlign: 'left', width: '100%',
              }}
            >
              {a.icon ? (
                <img
                  src={a.icon} alt="" width={36} height={36}
                  style={{ borderRadius: 8, flexShrink: 0 }}
                  onError={e => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 8, background: 'var(--ss-btn)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                  🏆
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ss-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.displayName}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--ss-ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.gameName}{a.unlocktime ? ` · unlocked ${formatLastPlayed(a.unlocktime)}` : ''}
                </div>
                <div style={{ height: 3, borderRadius: 99, background: 'var(--ss-track)', overflow: 'hidden', marginTop: 5 }}>
                  <div style={{ height: '100%', width: `${Math.min(a.percent, 100)}%`, background: 'var(--ss-cat-2)', borderRadius: 99 }} />
                </div>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ss-cat-2)' }}>
                  {a.percent < 1 ? a.percent.toFixed(1) : Math.round(a.percent)}%
                </div>
                {oneIn && <div style={{ fontSize: 10, color: 'var(--ss-ink4)' }}>1 in {oneIn.toLocaleString()}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
