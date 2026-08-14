import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import {
  formatHours, minutesToHours, formatLastPlayed, loadSnapshots,
  computePlayStreak, computeWindowPercentile, computeDeckSplit,
  getDailyPlaytimeSeries, getDailyPlaytimeSeriesForGame,
} from '../utils/steam.js';
import { GameCapsule } from '../components/GameImage.jsx';
import GameDetailPanel from '../components/GameDetailPanel.jsx';
import TonightPick from '../components/TonightPick.jsx';
import { ALL_TIME_PERIODS, loadFeatureFlags, SourceBadge } from '../components/Navbar.jsx';
import { ACCENT_HEX, hexToRgba, tint, SectionHeading, StatCell } from '../components/designSystem.jsx';

const PERIOD_META = {
  '7days':   { days: 7,    phrase: 'in the last 7 days',      shortLabel: '7 days',   shareLabel: 'the last 7 days' },
  '2weeks':  { days: 14,   phrase: 'over the last two weeks', shortLabel: '2 weeks',  shareLabel: 'the last two weeks' },
  '30days':  { days: 30,   phrase: 'over the last 30 days',   shortLabel: '30 days',  shareLabel: 'the last 30 days' },
  'alltime': { days: null, phrase: 'across your library',     shortLabel: 'All time', shareLabel: null },
};
const PERIOD_EYEBROW = { '7days': 'Last 7 days', '2weeks': 'Last 14 days', '30days': 'Last 30 days', 'alltime': 'All time' };

function getPeriodMinutes(game, timePeriod) {
  return timePeriod === 'alltime' ? (game.playtime_forever || 0) : (game.playtime_2weeks || 0);
}

function lowerFirst(s) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function formatDayLabel(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }).toUpperCase();
}

// Day-by-day bar strip — used both for the hero's whole-library window and
// (smaller, single-tone) for a single game's sparkline in the Focus card.
function BarStrip({ series, height = 96, highlightRecent = false, leftLabel, rightLabel }) {
  if (!series.length) return null;
  const max = Math.max(...series.map(d => d.minutes), 1);
  const highlightFrom = series.length - 4;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height }}>
        {series.map((d, i) => {
          const barHeight = d.minutes === 0 ? 3 : Math.max(6, Math.round((d.minutes / max) * height));
          const fill = d.minutes === 0
            ? 'var(--border-default)'
            : (highlightRecent && i >= highlightFrom) ? 'var(--accent-blue)' : hexToRgba(ACCENT_HEX, 0.45);
          return (
            <div key={d.date} title={d.minutes === 0 ? 'No play' : formatHours(d.minutes)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%',
            }}>
              <div style={{ width: '100%', borderRadius: 6, background: fill, height: barHeight }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-muted)', letterSpacing: '0.6px' }}>
        <span>{leftLabel ?? formatDayLabel(series[0].timestamp)}</span>
        <span>{rightLabel ?? 'TODAY'}</span>
      </div>
    </div>
  );
}

// The 7 Days/2 Weeks/30 Days/All Time control — only Dashboard reads
// timePeriod/getGamesForPeriod, so it lives in this page's own header
// instead of the global Navbar, where it used to sit fully interactive but
// inert on every other page.
function PeriodToggle({ enabledPeriods, timePeriod, setTimePeriod, hoveredPeriod, setHoveredPeriod }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        display: 'flex', gap: 2, padding: 3,
        background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)',
        border: '1px solid var(--border-subtle)',
      }}>
        {enabledPeriods.map(p => {
          const isActive = timePeriod === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setTimePeriod(p.id)}
              onMouseEnter={() => setHoveredPeriod(p.id)}
              onMouseLeave={() => setHoveredPeriod(null)}
              title={p.tooltip}
              style={{
                background: isActive ? 'var(--bg-secondary)' : 'transparent',
                border: isActive ? '1px solid var(--border-default)' : '1px solid transparent',
                borderRadius: 'var(--radius-full)',
                padding: '4px 11px',
                cursor: 'pointer',
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)', transition: 'all 0.15s ease',
                boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}
            >
              <span style={{ fontSize: 11.5, fontWeight: isActive ? 500 : 400, lineHeight: 1 }}>{p.label}</span>
              <SourceBadge source={p.source} active={isActive} />
            </button>
          );
        })}
      </div>

      {hoveredPeriod && (() => {
        const p = ALL_TIME_PERIODS.find(p => p.id === hoveredPeriod);
        return (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            background: 'var(--text-primary)', color: 'var(--text-inverse)',
            padding: '6px 10px', borderRadius: 'var(--radius-sm)',
            fontSize: 11, whiteSpace: 'nowrap', zIndex: 200,
            pointerEvents: 'none', animation: 'fadeInFast 0.1s ease',
          }}>
            <span style={{ fontWeight: 700 }}>{p?.label}</span>{' — '}
            <span style={{ opacity: 0.8 }}>{p?.tooltip}</span>
          </div>
        );
      })()}
    </div>
  );
}

function HeroSection({ periodGames, totalPeriodMinutes, timePeriod, steamId, periodToggleProps }) {
  const meta = PERIOD_META[timePeriod];
  const streak = steamId ? computePlayStreak(steamId) : null;
  const windowPct = (steamId && meta.days) ? computeWindowPercentile(steamId, meta.days) : null;
  const series = (steamId && meta.days) ? getDailyPlaytimeSeries(steamId, meta.days) : [];

  const hours = minutesToHours(totalPeriodMinutes);
  const hoursLabel = hours >= 10 ? Math.round(hours).toLocaleString() : hours.toFixed(1);
  const gameCount = periodGames.length;
  const topGame = periodGames[0];
  const topShare = topGame && totalPeriodMinutes > 0
    ? Math.round((getPeriodMinutes(topGame, timePeriod) / totalPeriodMinutes) * 100)
    : 0;
  const hasSubtext = windowPct?.percentile != null || (streak && streak.currentStreak > 0);

  return (
    <section style={{
      display: 'grid',
      gridTemplateColumns: series.length ? 'minmax(0,1.45fr) minmax(0,1fr)' : '1fr',
      gap: 56, alignItems: 'end',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {PERIOD_EYEBROW[timePeriod]}
          </span>
          <span style={{ height: 1, flex: 1, background: 'var(--border-default)' }} />
          <PeriodToggle {...periodToggleProps} timePeriod={timePeriod} />
        </div>
        <h1 style={{ margin: 0, fontSize: 'clamp(26px, 3.2vw, 40px)', lineHeight: 1.22, fontWeight: 400, letterSpacing: '-0.9px', color: 'var(--text-primary)' }}>
          <span style={{ fontWeight: 600 }}>{hoursLabel} hours</span>
          {` across ${gameCount} game${gameCount === 1 ? '' : 's'} ${meta.phrase}`}
          {windowPct?.percentile >= 75 && ' — a heavier stretch than usual'}
          {windowPct?.percentile != null && windowPct.percentile <= 10 && ' — a quieter stretch than usual'}
          {gameCount > 1 && topShare >= 40 && ', and mostly one game'}
          {'.'}
        </h1>
        {hasSubtext && (
          <p style={{ margin: '20px 0 0', fontSize: 15, lineHeight: 1.65, color: 'var(--text-secondary)', maxWidth: '52ch' }}>
            {windowPct?.percentile >= 75 && <>That puts this stretch in the <span style={{ color: 'var(--accent-blue)' }}>{lowerFirst(windowPct.label)}</span>. </>}
            {windowPct?.percentile != null && windowPct.percentile <= 10 && <>{windowPct.label}. </>}
            {streak && streak.currentStreak > 0 && `${streak.currentStreak} day${streak.currentStreak === 1 ? '' : 's'} running, with today still open.`}
          </p>
        )}
      </div>
      {series.length > 0 && <BarStrip series={series} highlightRecent />}
    </section>
  );
}

function FocusCard({ game, timePeriod, periodMinutes, totalPeriodMinutes, steamId, onClick }) {
  const meta = PERIOD_META[timePeriod];
  const allTimeMinutes = game.playtime_forever || 0;
  const avgSessionHours = game.launchCount && allTimeMinutes ? (allTimeMinutes / 60 / game.launchCount) : null;
  const sharePct = totalPeriodMinutes > 0 ? Math.round((periodMinutes / totalPeriodMinutes) * 100) : 0;
  const sparkline = (steamId && meta.days) ? getDailyPlaytimeSeriesForGame(steamId, game.appid, meta.days) : [];
  const hasSparkline = sparkline.some(d => d.minutes > 0);
  const peakHours = hasSparkline ? minutesToHours(Math.max(...sparkline.map(d => d.minutes))) : 0;
  const lastPlayed = game.localLastPlayed || game.rtime_last_played;
  const columns = (timePeriod === 'alltime' ? 1 : 2) + (avgSessionHours != null ? 1 : 0);

  return (
    <article className="card" onClick={onClick} style={{ padding: 26, display: 'flex', gap: 26, cursor: 'pointer' }}>
      <div style={{ width: 132, height: 198, flexShrink: 0, alignSelf: 'flex-start', borderRadius: 18, overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
        <GameCapsule appId={game.appid} name={game.name} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h3 style={{ margin: '0 0 6px', fontSize: 25, fontWeight: 600, letterSpacing: '-0.5px', lineHeight: 1.2 }}>
            {game.name}
          </h3>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>
            {lastPlayed && `Played ${formatLastPlayed(lastPlayed)}`}
            {game.launchCount ? `${lastPlayed ? ' · ' : ''}${game.launchCount} session${game.launchCount === 1 ? '' : 's'} all time` : ''}
          </p>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${columns},minmax(0,1fr))`,
          borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)',
        }}>
          {timePeriod !== 'alltime' && <StatCell label={meta.shortLabel} value={formatHours(periodMinutes)} first />}
          <StatCell label="All time" value={formatHours(allTimeMinutes)} first={timePeriod === 'alltime'} />
          {avgSessionHours != null && <StatCell label="Session" value={`${avgSessionHours.toFixed(1)}h`} last />}
        </div>

        {meta.shareLabel && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              <span>Share of {meta.shareLabel}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>{sharePct}%</span>
            </div>
            <div className="progress-bar" style={{ height: 7 }}>
              <div className="progress-fill" style={{ width: `${Math.min(sharePct, 100)}%`, background: 'var(--accent-blue)' }} />
            </div>
          </div>
        )}

        {hasSparkline && (
          <div style={{ marginTop: 'auto' }}>
            <BarStrip series={sparkline} height={44} leftLabel="THIS GAME, DAY BY DAY" rightLabel={`PEAK ${peakHours}H`} />
          </div>
        )}
      </div>
    </article>
  );
}

function ActiveRow({ game, timePeriod, onClick }) {
  const periodMinutes = getPeriodMinutes(game, timePeriod);
  const allTimeMinutes = game.playtime_forever || 0;
  const lastPlayed = game.localLastPlayed || game.rtime_last_played;

  return (
    <article
      className="card" onClick={onClick}
      style={{ padding: 14, display: 'flex', gap: 14, alignItems: 'center', flex: 1, cursor: 'pointer' }}
    >
      <div style={{ width: 46, height: 69, flexShrink: 0, borderRadius: 12, overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
        <GameCapsule appId={game.appid} name={game.name} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {game.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
          {lastPlayed ? `Played ${formatLastPlayed(lastPlayed)}` : 'Recently active'}
          {allTimeMinutes > 0 ? ` · ${formatHours(allTimeMinutes)} all time` : ''}
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, color: 'var(--text-primary)', flexShrink: 0 }}>
        {formatHours(periodMinutes)}
      </div>
    </article>
  );
}

function TimeBreakdown({ periodGames, timePeriod, totalPeriodMinutes }) {
  if (periodGames.length < 2) return null;

  const MAX = 9;
  const top = periodGames.slice(0, MAX);
  const rest = periodGames.slice(MAX);
  const restTotal = rest.reduce((s, g) => s + getPeriodMinutes(g, timePeriod), 0);
  const sliceCount = top.length + (restTotal > 0 ? 1 : 0);

  const slices = top.map((g, i) => ({
    id: g.appid, name: g.name, minutes: getPeriodMinutes(g, timePeriod),
    color: tint(i, sliceCount), ink: i < 2 ? '#fffdfa' : 'var(--text-secondary)',
  }));
  if (restTotal > 0) {
    slices.push({ id: 'other', name: `${rest.length} other game${rest.length === 1 ? '' : 's'}`, minutes: restTotal, color: 'rgba(42,38,33,0.12)', ink: 'var(--text-secondary)' });
  }

  return (
    <section>
      <SectionHeading title="Where the time went" trailing={`${formatHours(totalPeriodMinutes)} total`} />
      <div style={{ display: 'flex', gap: 3, height: 52, marginBottom: 24 }}>
        {slices.map(s => {
          const pct = totalPeriodMinutes > 0 ? (s.minutes / totalPeriodMinutes) * 100 : 0;
          return (
            <div key={s.id} title={`${s.name} — ${formatHours(s.minutes)}`} style={{
              width: `${pct}%`, background: s.color, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}>
              {pct > 5.5 && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: s.ink, whiteSpace: 'nowrap' }}>
                  {Math.round(pct)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '0 48px' }}>
        {slices.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, flexShrink: 0, background: s.color }} />
            <span style={{ flex: 1, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.name}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>
              {totalPeriodMinutes > 0 ? Math.round((s.minutes / totalPeriodMinutes) * 100) : 0}%
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-primary)', width: 52, textAlign: 'right', flexShrink: 0 }}>
              {formatHours(s.minutes)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function FooterStats({ ownedGames, gamesPlayed, totalLaunches, avgSessionHours, localConfig, sinceDate }) {
  // Desktop-vs-Deck folded in as one more chip here rather than its own
  // section — it's a static, all-time fact with nothing to do with it, so
  // it's sized to match (a stat, not a headline).
  const deckSplit = computeDeckSplit(ownedGames);
  const items = [
    { value: ownedGames.length.toLocaleString(), label: 'games owned' },
    { value: gamesPlayed.toLocaleString(), label: `ever played · ${Math.round((gamesPlayed / Math.max(ownedGames.length, 1)) * 100)}%` },
    localConfig?.found && totalLaunches > 0 && { value: totalLaunches.toLocaleString(), label: 'launches' },
    localConfig?.found && avgSessionHours > 0 && { value: `${avgSessionHours.toFixed(1)}h`, label: 'average session' },
    deckSplit && { value: `${deckSplit.deckPct}%`, label: 'of hours on Steam Deck' },
  ].filter(Boolean);

  return (
    <section style={{ borderTop: '1px solid var(--border-default)', paddingTop: 24, display: 'flex', flexWrap: 'wrap', gap: 44 }}>
      {items.map(it => (
        <div key={it.label}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 19, color: 'var(--text-primary)' }}>{it.value}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>{it.label}</div>
        </div>
      ))}
      <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', alignSelf: 'flex-end' }}>
        Steam API{sinceDate ? ` · local snapshots since ${sinceDate}` : ''}
      </div>
    </section>
  );
}

function EmptyState({ timePeriod }) {
  const meta = PERIOD_META[timePeriod];
  return (
    <div style={{ textAlign: 'center', padding: '96px 40px', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🎮</div>
      <h3 style={{ fontSize: 19, marginBottom: 8, color: 'var(--text-secondary)' }}>No playtime data for this period</h3>
      <p style={{ fontSize: 14 }}>
        {timePeriod === 'alltime' ? 'No games with recorded playtime yet.' : `No games played ${meta.phrase}.`}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const {
    ownedGames, getGamesForPeriod, gamesPlayed, timePeriod, setTimePeriod,
    localConfig, achCache, steamId,
  } = useApp();
  const [selectedGame, setSelectedGame] = useState(null);
  const [anchorRect, setAnchorRect] = useState(null);

  // Period-toggle state — moved here from Navbar, since this is the only
  // page that reads timePeriod/getGamesForPeriod.
  const [hoveredPeriod, setHoveredPeriod] = useState(null);
  const [featureFlags, setFeatureFlags] = useState(loadFeatureFlags);

  useEffect(() => {
    const onStorage = () => setFeatureFlags(loadFeatureFlags());
    window.addEventListener('storage', onStorage);
    // Also poll for changes made in the same tab (Settings modal)
    const interval = setInterval(() => setFeatureFlags(loadFeatureFlags()), 500);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(interval); };
  }, []);

  // Filter to only enabled periods; if the current one is now disabled, reset to 2weeks
  const enabledPeriods = ALL_TIME_PERIODS.filter(p => !p.experimental || featureFlags[`period_${p.id}`]);
  useEffect(() => {
    if (!enabledPeriods.find(p => p.id === timePeriod)) {
      setTimePeriod('2weeks');
    }
  }, [featureFlags]);

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

  const periodGames = [...getGamesForPeriod()]
    .filter(g => getPeriodMinutes(g, timePeriod) > 0)
    .sort((a, b) => getPeriodMinutes(b, timePeriod) - getPeriodMinutes(a, timePeriod));

  const totalPeriodMinutes = periodGames.reduce((s, g) => s + getPeriodMinutes(g, timePeriod), 0);

  const avgSessionHours = ownedGames.reduce((sum, g) => {
    if (g.launchCount && g.playtime_forever) return sum + (g.playtime_forever / 60 / g.launchCount);
    return sum;
  }, 0) / Math.max(ownedGames.filter(g => g.launchCount).length, 1);
  const totalLaunches = ownedGames.reduce((sum, g) => sum + (g.launchCount || 0), 0);

  const firstSnapshotDate = steamId ? loadSnapshots(steamId)[0]?.date : null;
  const sinceDate = firstSnapshotDate
    ? new Date(firstSnapshotDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const heroGame = periodGames[0];
  const alsoActive = periodGames.slice(1, 4);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 24px 96px', display: 'flex', flexDirection: 'column', gap: 56 }}>
      {periodGames.length === 0 ? (
        <EmptyState timePeriod={timePeriod} />
      ) : (
        <>
          <HeroSection
            periodGames={periodGames} totalPeriodMinutes={totalPeriodMinutes} timePeriod={timePeriod} steamId={steamId}
            periodToggleProps={{ enabledPeriods, setTimePeriod, hoveredPeriod, setHoveredPeriod }}
          />

          <TonightPick />

          <section>
            <SectionHeading title="In focus" />
            <div style={{
              display: 'grid',
              gridTemplateColumns: alsoActive.length ? 'minmax(0,1.7fr) minmax(0,1fr)' : '1fr',
              gap: 20, alignItems: 'stretch',
            }}>
              <FocusCard
                game={heroGame} timePeriod={timePeriod}
                periodMinutes={getPeriodMinutes(heroGame, timePeriod)}
                totalPeriodMinutes={totalPeriodMinutes} steamId={steamId}
                onClick={e => handleSelectGame(heroGame, e)}
              />
              {alsoActive.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {alsoActive.map(g => (
                    <ActiveRow key={g.appid} game={g} timePeriod={timePeriod} onClick={e => handleSelectGame(g, e)} />
                  ))}
                </div>
              )}
            </div>
          </section>

          <TimeBreakdown periodGames={periodGames} timePeriod={timePeriod} totalPeriodMinutes={totalPeriodMinutes} />

          <FooterStats
            ownedGames={ownedGames} gamesPlayed={gamesPlayed}
            totalLaunches={totalLaunches} avgSessionHours={avgSessionHours}
            localConfig={localConfig} sinceDate={sinceDate}
          />

          {selectedGame && (
            <GameDetailPanel
              game={selectedGame}
              achData={achCache[selectedGame.appid]}
              anchorRect={anchorRect}
              onClose={() => { setSelectedGame(null); setAnchorRect(null); }}
            />
          )}
        </>
      )}
    </div>
  );
}
