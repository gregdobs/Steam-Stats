import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import { formatLastPlayed } from '../utils/steam.js';
import { GameHeader } from '../components/GameImage.jsx';
import GameDetailPanel from '../components/GameDetailPanel.jsx';
import { ProgressRing, PageHeader } from '../components/designSystem.jsx';

function AchievementCard({ game, achData, onClick, isSelected, spotlight }) {
  const earned = achData?.earned ?? 0;
  const total = achData?.total ?? 0;
  const pct = achData?.pct ?? null;
  const lastUnlock = achData?.lastUnlockTime;

  const getRarityLabel = (p) => {
    if (p === null) return null;
    if (p === 100) return { label: 'Perfect', color: 'emerald', hex: 'var(--accent-emerald)', emoji: '💎' };
    if (p >= 75)  return { label: 'Almost',  color: 'amber',   hex: 'var(--accent-amber)', emoji: '🔥' };
    if (p >= 50)  return { label: 'Halfway', color: 'blue',    hex: 'var(--accent-blue)', emoji: '⚡' };
    if (p >= 25)  return { label: 'Started', color: 'blue',    hex: 'var(--accent-blue)', emoji: '🎯' };
    return { label: 'Early', color: 'rose', hex: 'var(--accent-rose)', emoji: '🌱' };
  };
  const rarity = getRarityLabel(pct);

  if (spotlight) {
    return (
      <div
        className="card"
        style={{
          overflow: 'hidden', cursor: 'pointer', position: 'relative',
          border: isSelected ? '1px solid var(--accent-blue)' : undefined,
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onClick={(e) => onClick?.(game, e)}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
      >
        <div style={{ height: 130, position: 'relative', overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
          <GameHeader appId={game.appid} name={game.name} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 55%, transparent 100%)' }} />
          <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.55)', borderRadius: '50%', padding: 2 }}>
            <ProgressRing pct={pct ?? 0} size={48} color={rarity?.hex || 'var(--accent-blue)'} />
          </div>
          <div style={{ position: 'absolute', bottom: 10, left: 12, right: 12 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{game.name}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{earned}/{total} achievements</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="card"
      style={{
        overflow: 'hidden', transition: 'transform 0.2s, box-shadow 0.2s',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
        border: isSelected ? '1px solid var(--accent-blue)' : undefined,
        background: isSelected ? 'var(--accent-blue-dim)' : undefined,
      }}
      onClick={(e) => onClick?.(game, e)}
      onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = 'var(--bg-card-hover)'; } }}
      onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.background = ''; } }}
    >
      <div style={{ width: 46, height: 26, borderRadius: 5, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-tertiary)' }}>
        <GameHeader appId={game.appid} name={game.name} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {game.name}
        </div>
        {total === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No achievements</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, maxWidth: 100 }} className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct ?? 0}%`, background: rarity?.hex }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{earned}/{total}</span>
          </div>
        )}
      </div>
      {rarity && (
        <div style={{ flexShrink: 0, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: rarity.hex, minWidth: 38, textAlign: 'right' }}>
          {pct}%
        </div>
      )}
    </div>
  );
}

export default function Achievements() {
  const { ownedGames, config, achCache, getAchievementsForGames } = useApp();
  const [loading, setLoading]     = useState(false);
  const [filter, setFilter]       = useState('all');
  const [sortBy, setSortBy]       = useState('pct');
  const [selectedGame, setSelectedGame] = useState(null);
  const [anchorRect, setAnchorRect] = useState(null);

  const playedGames = ownedGames
    .filter(g => g.playtime_forever > 0)
    .sort((a, b) => b.playtime_forever - a.playtime_forever)
    .slice(0, 100);

  useEffect(() => {
    if (!config?.apiKey || !config?.steamId || playedGames.length === 0) return;
    let cancelled = false;
    setLoading(true);
    getAchievementsForGames(playedGames.map(g => g.appid)).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [playedGames.length, config?.apiKey, config?.steamId]);

  const achData = achCache;

  const handleSelect = useCallback((game, e) => {
    if (selectedGame?.appid === game.appid) { setSelectedGame(null); setAnchorRect(null); }
    else { setSelectedGame(game); setAnchorRect(e?.currentTarget?.getBoundingClientRect() ?? null); }
  }, [selectedGame]);

  // Scoped to this page's games — see loadedCount comment above for why.
  const gamesWithAch  = playedGames.filter(g => achData[g.appid]?.total > 0);
  const perfect       = gamesWithAch.filter(g => achData[g.appid].pct === 100).length;
  const totalEarned   = gamesWithAch.reduce((s, g) => s + achData[g.appid].earned, 0);
  const totalAvail    = gamesWithAch.reduce((s, g) => s + achData[g.appid].total, 0);
  const loadedCount   = playedGames.filter(g => achData[g.appid] !== undefined).length;

  const getFiltered = () => {
    let games = playedGames.filter(g => achData[g.appid] !== undefined);
    if (filter === 'perfect') games = games.filter(g => achData[g.appid]?.pct === 100);
    else if (filter === 'almost') games = games.filter(g => { const p = achData[g.appid]?.pct; return p !== null && p >= 75 && p < 100; });
    else if (filter === 'none') games = games.filter(g => achData[g.appid]?.total === 0);
    return games.sort((a, b) => {
      if (sortBy === 'pct')     return (achData[b.appid]?.pct ?? -1) - (achData[a.appid]?.pct ?? -1);
      if (sortBy === 'earned')  return (achData[b.appid]?.earned ?? 0) - (achData[a.appid]?.earned ?? 0);
      if (sortBy === 'total')   return (achData[b.appid]?.total ?? 0) - (achData[a.appid]?.total ?? 0);
      if (sortBy === 'recent') {
        const at = achData[a.appid]?.lastUnlockTime ?? 0;
        const bt = achData[b.appid]?.lastUnlockTime ?? 0;
        return bt - at;
      }
      return 0;
    });
  };

  const displayed = getFiltered();

  // Spotlight: the top 4 games by completion % (with achievements) get the
  // bigger visual treatment; everything else uses the compact row layout.
  // This breaks up what would otherwise be 100 near-identical cards.
  const spotlightGames = filter === 'all'
    ? [...displayed].filter(g => achData[g.appid]?.total > 0).sort((a, b) => (achData[b.appid]?.pct ?? -1) - (achData[a.appid]?.pct ?? -1)).slice(0, 4)
    : [];
  const spotlightIds = new Set(spotlightGames.map(g => g.appid));
  const restGames = displayed.filter(g => !spotlightIds.has(g.appid));

  const overallPct = totalAvail > 0 ? Math.round((totalEarned / totalAvail) * 100) : null;

  return (
    <div style={{ padding: '56px 24px 96px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 40 }}>
        <PageHeader
          eyebrow="Achievements"
          title={
            overallPct !== null
              ? <><span style={{ fontWeight: 600 }}>{totalEarned.toLocaleString()} earned</span> of {totalAvail.toLocaleString()} available — {overallPct}% across the games you've opened.</>
              : 'Achievements'
          }
          subtitle={`${loadedCount}/${Math.min(playedGames.length, 100)} games scanned${loading ? ' · Loading…' : ''}`}
        />
        {loading && (
          <div style={{ marginTop: 8 }}>
            <div className="progress-bar" style={{ height: 3, maxWidth: 240 }}>
              <div className="progress-fill" style={{ width: `${(loadedCount / Math.min(playedGames.length, 100)) * 100}%`, background: 'var(--accent-blue)', transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Earned',  value: totalEarned.toLocaleString(), icon: '🏆', color: 'amber'   },
          { label: 'Available',     value: totalAvail.toLocaleString(),  icon: '🎯', color: 'blue'    },
          { label: 'Perfect Games', value: perfect,                       icon: '💎', color: 'emerald' },
          { label: 'Overall %',     value: totalAvail > 0 ? `${Math.round((totalEarned / totalAvail) * 100)}%` : '—', icon: '📊', color: 'violet' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</span>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
            </div>
            <div className="stat-number" style={{ fontSize: 26, color: `var(--accent-${s.color})` }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters + sort */}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[['all','🎮 All'],['perfect','💎 Perfect'],['almost','🔥 Almost'],['none','⬜ No Achievements']].map(([id,label]) => (
            <button key={id} onClick={() => setFilter(id)} className="btn btn-ghost" style={{
              fontSize: 12, padding: '5px 12px',
              background: filter === id ? 'var(--accent-blue-dim)' : undefined,
              color: filter === id ? 'var(--accent-blue)' : undefined,
              borderColor: filter === id ? 'var(--accent-blue)' : undefined,
            }}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['pct','% Complete'],['recent','Most Recent'],['earned','Most Earned'],['total','Most Available']].map(([id,label]) => (
            <button key={id} onClick={() => setSortBy(id)} className="btn btn-ghost" style={{
              fontSize: 12, padding: '5px 12px',
              background: sortBy === id ? 'var(--accent-blue-dim)' : undefined,
              color: sortBy === id ? 'var(--accent-blue)' : undefined,
              borderColor: sortBy === id ? 'var(--accent-blue)' : undefined,
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Spotlight row — top games get bigger visual treatment */}
      {spotlightGames.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 12 }}>
            Closest to complete
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {spotlightGames.map(game => (
              <AchievementCard
                key={game.appid}
                game={game}
                achData={achData[game.appid]}
                onClick={handleSelect}
                isSelected={selectedGame?.appid === game.appid}
                spotlight
              />
            ))}
          </div>
        </div>
      )}

      {/* Compact list rows for the rest — avoids "wall of identical cards" */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8 }}>
        {restGames.map(game => (
          <AchievementCard
            key={game.appid}
            game={game}
            achData={achData[game.appid]}
            onClick={handleSelect}
            isSelected={selectedGame?.appid === game.appid}
          />
        ))}
        {displayed.length === 0 && !loading && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏆</div>
            <p>No games match this filter yet.</p>
          </div>
        )}
      </div>

      {/* Floating detail panel */}
      {selectedGame && (
        <GameDetailPanel
          game={selectedGame}
          achData={achData[selectedGame.appid]}
          anchorRect={anchorRect}
          onClose={() => { setSelectedGame(null); setAnchorRect(null); }}
        />
      )}
    </div>
  );
}
