import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import { getGameHeaderUrl, formatHours, formatLastPlayed, minutesToHours } from '../utils/steam.js';
import { GameCapsule, GameHero } from '../components/GameImage.jsx';
import StatCard from '../components/StatCard.jsx';
import PlaytimeDonut from '../components/PlaytimeDonut.jsx';
import GameDetailPanel from '../components/GameDetailPanel.jsx';

function HeroGameCard({ game }) {
  const hours = minutesToHours(game.playtime_2weeks || game.playtime_forever || 0);
  const allTimeHours = minutesToHours(game.playtime_forever || 0);

  return (
    <div style={{
      position: 'relative',
      borderRadius: 'var(--radius-xl)',
      overflow: 'hidden',
      minHeight: 380,
      border: '1px solid var(--border-subtle)',
      boxShadow: 'var(--shadow-xl)',
      background: 'var(--bg-tertiary)',
    }}>
      {/* Hero background */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <GameHero appId={game.appid} name={game.name} style={{ objectPosition: 'center top' }} />
      </div>

      {/* Gradient overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.75) 50%, rgba(0,0,0,0.3) 100%)',
      }} />

      {/* Content */}
      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', alignItems: 'flex-end', gap: 28,
        padding: 36, minHeight: 380,
      }}>
        {/* Capsule art */}
        <div style={{
          flexShrink: 0, width: 140,
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          border: '2px solid rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.05)',
          aspectRatio: '2/3',
        }}>
          <GameCapsule appId={game.appid} name={game.name} />
        </div>

        {/* Info */}
        <div style={{ flex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 'var(--radius-full)',
            background: 'rgba(59, 130, 246, 0.25)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            color: '#93c5fd',
            fontSize: 11, fontWeight: 600, letterSpacing: '0.5px',
            textTransform: 'uppercase', marginBottom: 12
          }}>
            🔥 Most Played This Period
          </div>

          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(24px, 3vw, 38px)',
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '-0.5px',
            lineHeight: 1.15,
            marginBottom: 20,
            textShadow: '0 2px 12px rgba(0,0,0,0.5)',
          }}>
            {game.name}
          </h2>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 2 }}>
                This Period
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                {formatHours(game.playtime_2weeks || game.playtime_forever)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 2 }}>
                All Time
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, color: 'rgba(255,255,255,0.7)', lineHeight: 1 }}>
                {formatHours(game.playtime_forever)}
              </div>
            </div>
            {game.launchCount && (
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 2 }}>
                  Launches
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, color: 'rgba(255,255,255,0.7)', lineHeight: 1 }}>
                  {game.launchCount}×
                </div>
              </div>
            )}
          </div>

          {/* Last played */}
          {(game.localLastPlayed || game.rtime_last_played) && (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
              Last played {formatLastPlayed(game.localLastPlayed || game.rtime_last_played)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GameCard({ game, rank, style = {}, onClick, isSelected }) {
  const hoursThisPeriod = game.playtime_2weeks || 0;
  const hoursTotal = game.playtime_forever || 0;
  const pct = hoursTotal > 0 ? Math.round((hoursThisPeriod / hoursTotal) * 100) : 0;

  return (
    <div className="card" style={{
      display: 'flex', gap: 0, overflow: 'hidden',
      transition: 'all 0.2s ease', cursor: 'pointer',
      border: isSelected ? '1px solid var(--accent-blue)' : undefined,
      background: isSelected ? 'var(--accent-blue-dim)' : undefined,
      ...style,
    }}
      onClick={(e) => onClick?.(game, e)}
      onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; } }}
      onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; } }}
    >
      {/* Capsule */}
      <div style={{ width: 90, flexShrink: 0, background: 'var(--bg-tertiary)', overflow: 'hidden', position: 'relative', minHeight: 120 }}>
        {rank && (
          <div style={{
            position: 'absolute', top: 6, left: 6, zIndex: 2,
            width: 22, height: 22, borderRadius: '50%',
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#fff',
          }}>{rank}</div>
        )}
        <GameCapsule appId={game.appid} name={game.name} />
      </div>

      {/* Content */}
      <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
          fontFamily: 'var(--font-display)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {game.name}
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Period</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--accent-blue)' }}>
              {formatHours(hoursThisPeriod)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>All Time</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>
              {formatHours(hoursTotal)}
            </div>
          </div>
          {game.launchCount && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Launches</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>
                {game.launchCount}
              </div>
            </div>
          )}
        </div>

        {/* Progress bar showing period vs all time */}
        {hoursThisPeriod > 0 && hoursTotal > 0 && (
          <div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${Math.min(pct, 100)}%`, background: 'var(--accent-blue)' }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
              {pct}% of total hours this period
            </div>
          </div>
        )}

        {game.userTags && game.userTags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {game.userTags.slice(0, 3).map(tag => (
              <span key={tag} style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 'var(--radius-full)',
                background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
                border: '1px solid var(--border-subtle)',
              }}>{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { profile, ownedGames, recentGames, totalHoursAllTime, totalHoursRecent, gamesPlayed, timePeriod, localConfig, achCache } = useApp();
  const [selectedGame, setSelectedGame] = useState(null);
  const [anchorRect, setAnchorRect] = useState(null);

  // Clear selection when period changes
  useEffect(() => { setSelectedGame(null); setAnchorRect(null); }, [timePeriod]);

  const handleSelectGame = useCallback((game, e) => {
    if (selectedGame?.appid === game.appid) {
      setSelectedGame(null); setAnchorRect(null);
    } else {
      setSelectedGame(game);
      setAnchorRect(e?.currentTarget?.getBoundingClientRect() ?? null);
    }
  }, [selectedGame]);

  const periodGames = timePeriod === 'alltime'
    ? [...ownedGames].filter(g => g.playtime_forever > 0).sort((a, b) => b.playtime_forever - a.playtime_forever)
    : [...recentGames].map(rg => {
        const full = ownedGames.find(og => og.appid === rg.appid) || {};
        return { ...full, ...rg };
      }).sort((a, b) => (b.playtime_2weeks || 0) - (a.playtime_2weeks || 0));

  const heroGame = periodGames[0];
  const otherGames = periodGames.slice(1);

  const totalPeriodHours = timePeriod === 'alltime'
    ? totalHoursAllTime
    : totalHoursRecent;

  const avgSessionHours = ownedGames.reduce((sum, g) => {
    if (g.launchCount && g.playtime_forever) {
      return sum + (g.playtime_forever / 60 / g.launchCount);
    }
    return sum;
  }, 0) / Math.max(ownedGames.filter(g => g.launchCount).length, 1);

  const totalLaunches = ownedGames.reduce((sum, g) => sum + (g.launchCount || 0), 0);

  return (
    <div style={{ padding: '28px 24px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Summary stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard
          label={timePeriod === 'alltime' ? 'Total Hours' : 'Hours (2 Weeks)'}
          value={`${Math.round(timePeriod === 'alltime' ? totalHoursAllTime : totalHoursRecent).toLocaleString()}h`}
          icon="⏱"
          color="blue"
        />
        <StatCard
          label="Games Owned"
          value={ownedGames.length.toLocaleString()}
          icon="📦"
          color="violet"
        />
        <StatCard
          label="Games Played"
          value={gamesPlayed.toLocaleString()}
          icon="🎮"
          color="emerald"
          subtitle={`${Math.round((gamesPlayed / Math.max(ownedGames.length, 1)) * 100)}% of library`}
        />
        {localConfig?.found && totalLaunches > 0 && (
          <StatCard
            label="Total Launches"
            value={totalLaunches.toLocaleString()}
            icon="🚀"
            color="amber"
          />
        )}
        {localConfig?.found && avgSessionHours > 0 && (
          <StatCard
            label="Avg Session"
            value={`${avgSessionHours.toFixed(1)}h`}
            icon="📊"
            color="rose"
          />
        )}
        {timePeriod === '2weeks' && recentGames.length > 0 && (
          <StatCard
            label="Active Games"
            value={recentGames.length}
            icon="🔥"
            color="amber"
            subtitle="in last 2 weeks"
          />
        )}
      </div>

      {/* No data state */}
      {periodGames.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '80px 40px',
          color: 'var(--text-muted)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 8, color: 'var(--text-secondary)' }}>
            No playtime data for this period
          </h3>
          <p style={{ fontSize: 14 }}>
            {timePeriod === '2weeks' ? 'No games played in the last 2 weeks.' : 'No games with recorded playtime.'}
          </p>
        </div>
      )}

      {/* Hero + grid layout */}
      {heroGame && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>

          {/* Time breakdown donut — additive, sits above hero */}
          {periodGames.length > 1 && (
            <PlaytimeDonut
              games={periodGames}
              totalPeriodMinutes={timePeriod === 'alltime' ? ownedGames.reduce((s, g) => s + (g.playtime_forever || 0), 0) : recentGames.reduce((s, g) => s + (g.playtime_2weeks || 0), 0)}
              totalAllTimeMinutes={ownedGames.reduce((s, g) => s + (g.playtime_forever || 0), 0)}
              timePeriod={timePeriod}
              ownedGames={ownedGames}
            />
          )}

          {/* Hero card */}
          <div onClick={(e) => handleSelectGame(heroGame, e)} style={{ cursor: 'pointer' }}>
            <HeroGameCard game={heroGame} />
          </div>

          {/* Game grid — no layout shift, panel floats over */}
          {otherGames.length > 0 && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, letterSpacing: '-0.2px' }}>
                {timePeriod === 'alltime' ? 'All Played Games' : 'Also Played'}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {otherGames.map((game, i) => (
                  <GameCard
                    key={game.appid}
                    game={game}
                    rank={i + 2}
                    onClick={handleSelectGame}
                    isSelected={selectedGame?.appid === game.appid}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Floating detail panel */}
          {selectedGame && (
            <GameDetailPanel
              game={selectedGame}
              achData={achCache[selectedGame.appid]}
              anchorRect={anchorRect}
              onClose={() => { setSelectedGame(null); setAnchorRect(null); }}
            />
          )}
        </div>
      )}
    </div>
  );
}
