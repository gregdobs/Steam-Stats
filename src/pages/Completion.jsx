import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import { formatHours, getCompletionStatus, minutesToHours } from '../utils/steam.js';
import { GameHeader } from '../components/GameImage.jsx';
import GameDetailPanel from '../components/GameDetailPanel.jsx';
import { ProgressRing, PageHeader } from '../components/designSystem.jsx';

const STATUS_HEX = {
  'Barely Started': 'var(--accent-rose)', 'In Progress': 'var(--accent-blue)', 'Getting There': 'var(--accent-amber)',
  'Completed': 'var(--accent-emerald)', 'Overplayer': 'var(--accent-violet)',
};

function HLTBCard({ game, hltbData, loading, onClick, isSelected, spotlight }) {
  const steamHours = minutesToHours(game.playtime_forever);
  const isError = hltbData?.error;
  const hltbMain = (!isError && hltbData?.mainStory) ? hltbData.mainStory : null;
  const status = hltbMain ? getCompletionStatus(steamHours, hltbMain) : null;
  const pct = hltbMain ? Math.min(Math.round((steamHours / hltbMain) * 100), 200) : null;

  if (spotlight && status) {
    return (
      <div
        className="card"
        style={{ overflow: 'hidden', cursor: 'pointer', border: isSelected ? '1px solid var(--accent-blue)' : undefined, transition: 'transform 0.2s, box-shadow 0.2s' }}
        onClick={(e) => onClick?.(game, e)}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
      >
        <div style={{ height: 130, position: 'relative', overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
          <GameHeader appId={game.appid} name={game.name} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 55%, transparent 100%)' }} />
          <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.55)', borderRadius: '50%', padding: 2 }}>
            <ProgressRing pct={pct ?? 0} size={48} color={STATUS_HEX[status.label] || 'var(--accent-blue)'} />
          </div>
          <div style={{ position: 'absolute', bottom: 10, left: 12, right: 12 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{game.name}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{status.icon} {status.label} · {formatHours(game.playtime_forever)}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="card"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', overflow: 'hidden',
        transition: 'background 0.15s', cursor: 'pointer',
        border: isSelected ? '1px solid var(--accent-blue)' : undefined,
        background: isSelected ? 'var(--accent-blue-dim)' : undefined,
      }}
      onClick={(e) => onClick?.(game, e)}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = ''; }}
    >
      <div style={{ width: 46, height: 26, borderRadius: 5, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-tertiary)' }}>
        <GameHeader appId={game.appid} name={game.name} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {game.name}
        </div>
        {loading ? (
          <div className="skeleton" style={{ height: 10, width: '60%', marginTop: 4 }} />
        ) : isError ? (
          <div style={{ fontSize: 11, color: 'var(--accent-rose)' }}>⚠️ {hltbData.error === 'hltb_blocked' ? 'HLTB blocked' : 'HLTB unavailable'}</div>
        ) : hltbData && pct !== null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, maxWidth: 100 }} className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.min(pct, 100)}%`, background: status ? STATUS_HEX[status.label] : 'var(--accent-blue)' }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatHours(game.playtime_forever)} / {hltbData.mainStory}h</span>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No HLTB match</div>
        )}
      </div>
      {status && pct !== null && (
        <div style={{ flexShrink: 0, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: STATUS_HEX[status.label], minWidth: 42, textAlign: 'right' }}>
          {pct > 200 ? '200%+' : `${pct}%`}
        </div>
      )}
    </div>
  );
}

const BATCH_SIZE = 60; // games loaded per "page" — keeps first paint fast on large libraries

export default function Completion() {
  const { ownedGames, hltbCache, getHltbForGame } = useApp();
  const [loadingIds, setLoadingIds] = useState(new Set());
  const [filter, setFilter]       = useState('all');
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [fetchedUpTo, setFetchedUpTo]   = useState(0);
  const [selectedGame, setSelectedGame] = useState(null);
  const [anchorRect, setAnchorRect] = useState(null);

  const allEligibleGames = ownedGames
    .filter(g => g.playtime_forever > 60)
    .sort((a, b) => b.playtime_forever - a.playtime_forever);

  const playedGames = allEligibleGames.slice(0, visibleCount);
  const hasMore = visibleCount < allEligibleGames.length;

  // Fetch HLTB data (via shared context cache) for any newly-visible games
  useEffect(() => {
    const toFetch = allEligibleGames.slice(fetchedUpTo, visibleCount).filter(g => hltbCache[g.name] === undefined);
    if (toFetch.length === 0) { setFetchedUpTo(visibleCount); return; }

    let cancelled = false;
    const fetchBatch = async () => {
      setFetchedUpTo(visibleCount);
      for (let i = 0; i < toFetch.length; i += 5) {
        if (cancelled) return;
        const batch = toFetch.slice(i, i + 5);
        setLoadingIds(prev => new Set([...prev, ...batch.map(g => g.appid)]));
        await Promise.all(batch.map(async (game) => {
          await getHltbForGame(game.name);
          setLoadingIds(prev => { const n = new Set(prev); n.delete(game.appid); return n; });
        }));
        if (i + 5 < toFetch.length) await new Promise(r => setTimeout(r, 400));
      }
    };
    fetchBatch();
    return () => { cancelled = true; };
  }, [visibleCount]);

  const handleLoadMore = () => setVisibleCount(c => c + BATCH_SIZE);
  const handleLoadAll  = () => setVisibleCount(allEligibleGames.length);

  const handleSelect = useCallback((game, e) => {
    if (selectedGame?.appid === game.appid) { setSelectedGame(null); setAnchorRect(null); }
    else { setSelectedGame(game); setAnchorRect(e?.currentTarget?.getBoundingClientRect() ?? null); }
  }, [selectedGame]);

  const getStatusFor = (game) => {
    const hltb = hltbCache[game.name];
    if (!hltb || hltb.error || !hltb.mainStory) return null;
    return getCompletionStatus(minutesToHours(game.playtime_forever), hltb.mainStory);
  };

  const getFiltered = () => {
    const withData = playedGames.filter(g => hltbCache[g.name] !== undefined);
    switch (filter) {
      case 'completed':  return withData.filter(g => { const s = getStatusFor(g); return s?.label === 'Completed' || s?.label === 'Overplayer'; });
      case 'almost':     return withData.filter(g => getStatusFor(g)?.label === 'Getting There');
      case 'inprogress': return withData.filter(g => getStatusFor(g)?.label === 'In Progress');
      case 'overplayer': return withData.filter(g => getStatusFor(g)?.label === 'Overplayer');
      default: return playedGames;
    }
  };

  const displayGames = getFiltered();
  const loadedCount = playedGames.filter(g => hltbCache[g.name] !== undefined).length;

  // Summary stats across everything loaded so far
  const gamesWithData = allEligibleGames.filter(g => {
    const h = hltbCache[g.name];
    return h && !h.error && h.mainStory;
  });
  const completedCount = gamesWithData.filter(g => getStatusFor(g)?.label === 'Completed' || getStatusFor(g)?.label === 'Overplayer').length;
  const avgCompletionPct = gamesWithData.length > 0
    ? Math.round(gamesWithData.reduce((s, g) => {
        const h = hltbCache[g.name];
        return s + Math.min((minutesToHours(g.playtime_forever) / h.mainStory) * 100, 200);
      }, 0) / gamesWithData.length)
    : null;

  // Spotlight: games closest to 100% (but not yet complete) get the bigger treatment
  const spotlightGames = filter === 'all'
    ? [...displayGames]
        .filter(g => { const s = getStatusFor(g); return s && s.label !== 'Barely Started'; })
        .sort((a, b) => {
          const ah = hltbCache[a.name], bh = hltbCache[b.name];
          const apct = Math.min((minutesToHours(a.playtime_forever) / ah.mainStory) * 100, 200);
          const bpct = Math.min((minutesToHours(b.playtime_forever) / bh.mainStory) * 100, 200);
          return bpct - apct;
        })
        .slice(0, 4)
    : [];
  const spotlightIds = new Set(spotlightGames.map(g => g.appid));
  const restGames = displayGames.filter(g => !spotlightIds.has(g.appid));

  return (
    <div style={{ padding: '56px 24px 96px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 40 }}>
        <PageHeader
          eyebrow="Completion"
          title={
            gamesWithData.length > 0
              ? <>Your hours against <span style={{ fontWeight: 600 }}>HowLongToBeat</span> — {completedCount} of {gamesWithData.length} matched games sit at or past the main story.</>
              : <>Your hours against <span style={{ fontWeight: 600 }}>HowLongToBeat</span> estimates.</>
          }
          subtitle={
            <>
              {loadedCount}/{playedGames.length} loaded
              {allEligibleGames.length > playedGames.length && ` of ${allEligibleGames.length} eligible`}
              {' '}· Click a game for details
            </>
          }
        />
        {loadedCount < playedGames.length && (
          <div style={{ marginTop: 8 }}>
            <div className="progress-bar" style={{ height: 3, maxWidth: 240 }}>
              <div className="progress-fill" style={{ width: `${(loadedCount / playedGames.length) * 100}%`, background: 'var(--accent-blue)' }} />
            </div>
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'HLTB Matches', value: gamesWithData.length.toLocaleString(), icon: '🎯', color: 'blue' },
          { label: 'Completed',    value: completedCount.toLocaleString(),        icon: '🏁', color: 'emerald' },
          { label: 'Avg. Completion', value: avgCompletionPct !== null ? `${avgCompletionPct}%` : '—', icon: '📊', color: 'amber' },
          { label: 'In Backlog',   value: ownedGames.filter(g => !g.playtime_forever).length.toLocaleString(), icon: '📥', color: 'violet' },
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

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          ['all',        '🎮 All',          null],
          ['completed',  '🏁 Completed',    'emerald'],
          ['almost',     '🔥 Almost There', 'amber'],
          ['inprogress', '🎮 In Progress',  'blue'],
          ['overplayer', '🐙 Overplayer',   'violet'],
        ].map(([id, label, color]) => (
          <button key={id} onClick={() => setFilter(id)} className="btn btn-ghost" style={{
            fontFamily: 'var(--font-body)', fontSize: 13, padding: '6px 14px',
            background: filter === id ? (color ? `var(--accent-${color}-dim)` : 'var(--accent-blue-dim)') : undefined,
            color:      filter === id ? (color ? `var(--accent-${color})` : 'var(--accent-blue)') : undefined,
            borderColor:filter === id ? (color ? `var(--accent-${color})` : 'var(--accent-blue)') : undefined,
          }}>{label}</button>
        ))}
      </div>

      {/* Spotlight row */}
      {spotlightGames.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 12 }}>
            Furthest along
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {spotlightGames.map(game => (
              <HLTBCard
                key={game.appid}
                game={game}
                hltbData={hltbCache[game.name]}
                loading={loadingIds.has(game.appid)}
                onClick={handleSelect}
                isSelected={selectedGame?.appid === game.appid}
                spotlight
              />
            ))}
          </div>
        </div>
      )}

      {/* Compact rows for the rest */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8 }}>
        {restGames.map(game => (
          <HLTBCard
            key={game.appid}
            game={game}
            hltbData={hltbCache[game.name]}
            loading={loadingIds.has(game.appid)}
            onClick={handleSelect}
            isSelected={selectedGame?.appid === game.appid}
          />
        ))}
      </div>

      {/* Load more control */}
      {hasMore && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 28, padding: '20px 0' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Showing {playedGames.length} of {allEligibleGames.length} games with 1+ hour played
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleLoadMore} style={{ fontSize: 13 }}>
              Load {Math.min(BATCH_SIZE, allEligibleGames.length - visibleCount)} More
            </button>
            <button className="btn btn-ghost" onClick={handleLoadAll} style={{ fontSize: 13 }}>
              Load All ({allEligibleGames.length - visibleCount} remaining)
            </button>
          </div>
        </div>
      )}

      {/* Floating detail panel */}
      {selectedGame && (
        <GameDetailPanel
          game={selectedGame}
          hltbData={hltbCache[selectedGame.name]}
          anchorRect={anchorRect}
          onClose={() => { setSelectedGame(null); setAnchorRect(null); }}
        />
      )}
    </div>
  );
}
