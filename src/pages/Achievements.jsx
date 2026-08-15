import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import { GameHeader } from '../components/GameImage.jsx';
import GameDetailPanel from '../components/GameDetailPanel.jsx';
import AchievementRarity from '../components/AchievementRarity.jsx';
import AchievementDetailPanel from '../components/AchievementDetailPanel.jsx';
import { ProgressRing, PageHeader } from '../components/designSystem.jsx';

const RARITY_COLOR = { emerald: 'var(--ss-cat-3)', amber: 'var(--ss-cat-4)', blue: 'var(--ss-accent)', rose: 'var(--ss-cat-5)' };

function getRarityLabel(p) {
  if (p === null) return null;
  if (p === 100) return { label: 'Perfect', color: RARITY_COLOR.emerald, emoji: '💎' };
  if (p >= 75)  return { label: 'Almost',  color: RARITY_COLOR.amber, emoji: '🔥' };
  if (p >= 50)  return { label: 'Halfway', color: RARITY_COLOR.blue,  emoji: '⚡' };
  if (p >= 25)  return { label: 'Started', color: RARITY_COLOR.blue,  emoji: '🎯' };
  return { label: 'Early', color: RARITY_COLOR.rose, emoji: '🌱' };
}

function AchievementCard({ game, achData, onClick, isSelected, spotlight }) {
  const earned = achData?.earned ?? 0;
  const total = achData?.total ?? 0;
  const pct = achData?.pct ?? null;
  const rarity = getRarityLabel(pct);

  if (spotlight) {
    return (
      <div
        className="ss-panel"
        style={{ padding: 0, overflow: 'hidden', cursor: 'pointer', border: isSelected ? '1px solid var(--ss-accent)' : undefined }}
        onClick={(e) => onClick?.(game, e)}
      >
        <div style={{ height: 130, position: 'relative', overflow: 'hidden', background: 'var(--ss-inset)' }}>
          <GameHeader appId={game.appid} name={game.name} />
          <div style={{ position: 'absolute', inset: 0, background: 'var(--ss-scrim)' }} />
          <div style={{ position: 'absolute', top: 10, left: 10, background: 'var(--ss-inset)', borderRadius: '50%', padding: 2 }}>
            <ProgressRing pct={pct ?? 0} size={48} color={rarity?.color || 'var(--ss-accent)'} textColor="var(--ss-ink)" />
          </div>
          <div style={{ position: 'absolute', bottom: 10, left: 12, right: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ss-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{game.name}</div>
            <div style={{ fontSize: 12, color: 'var(--ss-ink2)' }}>{earned}/{total} achievements</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="ss-panel"
      style={{
        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
        border: isSelected ? '1px solid var(--ss-accent)' : undefined,
        background: isSelected ? 'var(--ss-pill-bg)' : undefined,
      }}
      onClick={(e) => onClick?.(game, e)}
    >
      <div style={{ width: 46, height: 26, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--ss-inset)' }}>
        <GameHeader appId={game.appid} name={game.name} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ss-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {game.name}
        </div>
        {total === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--ss-ink3)', fontStyle: 'italic' }}>No achievements</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, maxWidth: 100, height: 4, borderRadius: 99, background: 'var(--ss-track)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct ?? 0}%`, background: rarity?.color, borderRadius: 99 }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--ss-ink3)' }}>{earned}/{total}</span>
          </div>
        )}
      </div>
      {rarity && (
        <div style={{ flexShrink: 0, fontSize: 15, fontWeight: 600, color: rarity.color, minWidth: 38, textAlign: 'right' }}>
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
  const [selectedAchievement, setSelectedAchievement] = useState(null);

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

  const handleSelect = useCallback((game) => {
    setSelectedGame(prev => prev?.appid === game.appid ? null : game);
  }, []);

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
  const spotlightGames = filter === 'all'
    ? [...displayed].filter(g => achData[g.appid]?.total > 0).sort((a, b) => (achData[b.appid]?.pct ?? -1) - (achData[a.appid]?.pct ?? -1)).slice(0, 4)
    : [];
  const spotlightIds = new Set(spotlightGames.map(g => g.appid));
  const restGames = displayed.filter(g => !spotlightIds.has(g.appid));

  const overallPct = totalAvail > 0 ? Math.round((totalEarned / totalAvail) * 100) : null;

  return (
    <div style={{ padding: '34px 26px 120px', maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
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
          <div style={{ marginTop: 12, height: 3, maxWidth: 240, borderRadius: 99, background: 'var(--ss-track)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(loadedCount / Math.min(playedGames.length, 100)) * 100}%`, background: 'var(--ss-accent)', transition: 'width 0.4s ease' }} />
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Earned',  value: totalEarned.toLocaleString(), color: 'var(--ss-cat-4)' },
          { label: 'Available',     value: totalAvail.toLocaleString(),  color: 'var(--ss-accent)' },
          { label: 'Perfect Games', value: perfect,                       color: 'var(--ss-cat-3)' },
          { label: 'Overall %',     value: totalAvail > 0 ? `${Math.round((totalEarned / totalAvail) * 100)}%` : '—', color: 'var(--ss-cat-2)' },
        ].map(s => (
          <div key={s.label} className="ss-panel" style={{ flex: 1, minWidth: 160, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ss-ink3)', marginBottom: 8, fontWeight: 500 }}>{s.label}</div>
            <div style={{ fontSize: 26, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <AchievementRarity games={playedGames} achCache={achData} onSelect={setSelectedAchievement} />

      {/* Filters + sort */}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[['all','🎮 All'],['perfect','💎 Perfect'],['almost','🔥 Almost'],['none','⬜ No Achievements']].map(([id,label]) => (
            <button key={id} onClick={() => setFilter(id)} className={`ss-pill${filter === id ? ' active' : ''}`}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['pct','% Complete'],['recent','Most Recent'],['earned','Most Earned'],['total','Most Available']].map(([id,label]) => (
            <button key={id} onClick={() => setSortBy(id)} className={`ss-pill${sortBy === id ? ' active' : ''}`}>{label}</button>
          ))}
        </div>
      </div>

      {/* Spotlight row — top games get bigger visual treatment */}
      {spotlightGames.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--ss-ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 12 }}>
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

      {/* Compact list rows for the rest */}
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
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: 'var(--ss-ink3)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏆</div>
            <p>No games match this filter yet.</p>
          </div>
        )}
      </div>

      {selectedGame && (
        <GameDetailPanel
          game={selectedGame}
          achData={achData[selectedGame.appid]}
          onClose={() => setSelectedGame(null)}
        />
      )}

      {selectedAchievement && (
        <AchievementDetailPanel
          achievement={selectedAchievement}
          achData={achData[selectedAchievement.appid]}
          onClose={() => setSelectedAchievement(null)}
        />
      )}
    </div>
  );
}
