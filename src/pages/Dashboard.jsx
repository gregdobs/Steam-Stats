import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import {
  formatHours, minutesToHours, formatLastPlayed, getGameHeaderUrl,
  computePlayStreak, computeWindowPercentile, computeDeckSplit,
  getDailyPlaytimeSeries, getDailyPlaytimeSeriesForGame,
} from '../utils/steam.js';
import { GameCapsule, GameHeader } from '../components/GameImage.jsx';
import GameDetailPanel from '../components/GameDetailPanel.jsx';
import TonightPick from '../components/TonightPick.jsx';
import { ALL_TIME_PERIODS, loadFeatureFlags, SourceBadge } from '../components/Navbar.jsx';
import { chartRgba, tint, SectionHeading, StatCell, CrossFilterBanner } from '../components/designSystem.jsx';

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
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height }}>
        {series.map((d, i) => {
          const barHeight = d.minutes === 0 ? 3 : Math.max(6, Math.round((d.minutes / max) * height));
          const fill = d.minutes === 0
            ? 'var(--ss-track)'
            : (highlightRecent && i >= highlightFrom) ? 'var(--ss-chart-hi)' : chartRgba(0.45);
          return (
            <div key={d.date} title={d.minutes === 0 ? 'No play' : formatHours(d.minutes)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%',
            }}>
              <div style={{ width: '100%', borderRadius: 6, background: fill, height: barHeight }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 10.5, color: 'var(--ss-ink3)', letterSpacing: '0.6px' }}>
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
      <div style={{ display: 'flex', gap: 2, padding: 3, background: 'var(--ss-inset)', borderRadius: 99, border: '1px solid var(--ss-line)' }}>
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
                background: isActive ? 'var(--ss-btn-hi)' : 'transparent',
                border: isActive ? '1px solid var(--ss-line)' : '1px solid transparent',
                borderRadius: 99, padding: '4px 11px', cursor: 'pointer',
                color: isActive ? 'var(--ss-ink)' : 'var(--ss-ink3)',
                transition: 'all 0.15s ease',
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
            background: 'var(--ss-sheet)', color: 'var(--ss-ink)',
            border: '1px solid var(--ss-line)',
            padding: '6px 10px', borderRadius: 10,
            fontSize: 11, whiteSpace: 'nowrap', zIndex: 200,
            pointerEvents: 'none', animation: 'ssFade 0.1s ease',
          }}>
            <span style={{ fontWeight: 600 }}>{p?.label}</span>{' — '}
            <span style={{ opacity: 0.8 }}>{p?.tooltip}</span>
          </div>
        );
      })()}
    </div>
  );
}

// Large poster-style capsule for a game in the current period — art fills
// the frame, hours/name/relative-bar are overlaid at the bottom on a
// gradient scrim. Sets the cross-filter shared with the "Recent vs.
// lifetime" panel, the Focus card, and "Where the time went" below.
function HeroCapsule({ game, timePeriod, topMinutes, active, dimmed, onToggle }) {
  const periodMinutes = getPeriodMinutes(game, timePeriod);
  const barPct = topMinutes > 0 ? Math.min(Math.round((periodMinutes / topMinutes) * 100), 100) : 0;
  return (
    <button
      onClick={onToggle}
      title={`${game.name} — ${formatHours(periodMinutes)}`}
      className="ss-tilt"
      style={{
        flex: 1, minWidth: 0, aspectRatio: '2/3', padding: 0,
        borderRadius: 16, overflow: 'hidden', cursor: 'pointer', background: 'var(--ss-inset)',
        border: active ? '1px solid var(--ss-chart-hi)' : '1px solid var(--ss-line)',
        boxShadow: active ? '0 20px 44px -18px var(--ss-chart-glow)' : '0 16px 34px -20px rgba(0,0,0,.9)',
        '--ss-lift': active ? '-6px' : '0px',
        opacity: dimmed ? 0.42 : 1,
      }}
    >
      <GameCapsule appId={game.appid} name={game.name} />
      <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(6,8,12,.94) 0%, rgba(6,8,12,.35) 42%, rgba(6,8,12,0) 72%)' }} />
      <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, padding: '10px 11px', textAlign: 'left' }}>
        <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1, color: 'var(--ss-ink)' }}>{formatHours(periodMinutes)}</span>
        <span style={{ fontSize: 10.5, lineHeight: 1.25, color: 'var(--ss-ink2)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{game.name}</span>
      </span>
      <span style={{ position: 'absolute', left: 9, right: 9, bottom: 44, height: 3, borderRadius: 99, background: 'rgba(255,255,255,.18)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', borderRadius: 99, width: `${barPct}%`, background: 'var(--ss-chart-grad)' }} />
      </span>
    </button>
  );
}

// Ghost bar = lifetime hours (scaled to the widest lifetime shown), bright
// bar overlaid = the last two weeks on the same scale. Deliberately
// period-independent (always 2 weeks vs. lifetime, regardless of the hero's
// own period toggle) — it's answering "what's hot right now", not "what's
// in the selected window". Shares the activeFilter state set by the hero
// capsules and "Where the time went" below.
function RecentVsLifetime({ ownedGames, activeFilter, onToggleFilter }) {
  const shown = [...ownedGames]
    .filter(g => (g.playtime_2weeks || 0) > 0)
    .sort((a, b) => (b.playtime_2weeks || 0) - (a.playtime_2weeks || 0))
    .slice(0, 8);
  if (shown.length < 2) return null;

  const maxLifetime = Math.max(...shown.map(g => g.playtime_forever || 0), 1);
  const recentTotal = shown.reduce((s, g) => s + (g.playtime_2weeks || 0), 0);
  const lifeTotal = shown.reduce((s, g) => s + (g.playtime_forever || 0), 0);
  const intensityNote = lifeTotal > 0 ? `${Math.round((recentTotal / lifeTotal) * 100)}% recent` : null;

  return (
    <div className="ss-panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <SectionHeading title="Recent vs. lifetime" trailing={intensityNote} />
      <p style={{ margin: '-12px 0 18px', fontSize: 12, color: 'var(--ss-ink4)' }}>
        Full bar is lifetime hours; the bright part is the last two weeks.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {shown.map(g => {
          const periodMinutes = g.playtime_2weeks || 0;
          const allTimeMinutes = g.playtime_forever || 0;
          const active = activeFilter === g.appid;
          const dimmed = activeFilter != null && !active;
          return (
            <div key={g.appid} onClick={() => onToggleFilter(g.appid)} style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 12, background: active ? 'var(--ss-btn)' : 'transparent', opacity: dimmed ? 0.4 : 1, transition: 'opacity 0.15s, background 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 12.5, color: active ? 'var(--ss-accent-txt)' : 'var(--ss-ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                <span style={{ fontSize: 12, color: 'var(--ss-accent-txt)', flexShrink: 0 }}>{formatHours(periodMinutes)} of {formatHours(allTimeMinutes)}</span>
              </div>
              <div style={{ position: 'relative', height: 10, borderRadius: 99, background: 'var(--ss-track)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: '0 auto 0 0', borderRadius: 99, width: `${Math.min((allTimeMinutes / maxLifetime) * 100, 100)}%`, background: 'var(--ss-chart-ghost)' }} />
                <div style={{ position: 'absolute', inset: '0 auto 0 0', borderRadius: 99, width: `${Math.min((periodMinutes / maxLifetime) * 100, 100)}%`, background: 'var(--ss-chart-grad)', boxShadow: active ? '0 0 16px var(--ss-chart-glow)' : 'none', transition: 'width 0.6s cubic-bezier(.4,0,.2,1)' }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 16, fontSize: 11, color: 'var(--ss-ink4)' }}>
        <span>LIFETIME</span><span>TOP {formatHours(maxLifetime)}</span>
      </div>
    </div>
  );
}

function HeroSection({ periodGames, totalPeriodMinutes, timePeriod, steamId, periodToggleProps, activeFilter, onToggleFilter, ownedGames, gamesPlayed }) {
  const meta = PERIOD_META[timePeriod];
  const streak = steamId ? computePlayStreak(steamId) : null;
  const windowPct = (steamId && meta.days) ? computeWindowPercentile(steamId, meta.days) : null;
  // The day-by-day bar strip is a bonus view for the opt-in snapshot-only
  // periods (7/30 days) — 2 Weeks and All Time (the two periods this design
  // actually covers) always pair with "Recent vs. lifetime" instead, even
  // once enough snapshot history exists to draw a daily series for them too.
  const isSnapshotPeriod = timePeriod === '7days' || timePeriod === '30days';
  const series = (steamId && isSnapshotPeriod) ? getDailyPlaytimeSeries(steamId, meta.days) : [];

  const hours = minutesToHours(totalPeriodMinutes);
  const hoursLabel = hours >= 10 ? Math.round(hours).toLocaleString() : hours.toFixed(1);
  const gameCount = periodGames.length;
  const topGame = periodGames[0];
  const topShare = topGame && totalPeriodMinutes > 0
    ? Math.round((getPeriodMinutes(topGame, timePeriod) / totalPeriodMinutes) * 100)
    : 0;
  const hasSubtext = windowPct?.percentile != null || (streak && streak.currentStreak > 0);
  const topMinutes = Math.max(...periodGames.map(g => getPeriodMinutes(g, timePeriod)), 1);
  const lastPlayed = topGame ? (topGame.localLastPlayed || topGame.rtime_last_played) : null;
  const scopeLabel = timePeriod === 'alltime'
    ? `${gamesPlayed.toLocaleString()} of ${ownedGames.length.toLocaleString()} games have recorded playtime`
    : `${gameCount} game${gameCount === 1 ? '' : 's'} saw time ${meta.phrase}`;

  const showRecentPanel = !isSnapshotPeriod && ownedGames.filter(g => (g.playtime_2weeks || 0) > 0).length >= 2;
  const showRightPanel = series.length > 0 || showRecentPanel;

  return (
    <section style={{
      display: 'grid',
      gridTemplateColumns: showRightPanel ? 'minmax(0,1.35fr) minmax(0,1fr)' : '1fr',
      gap: 34, alignItems: 'stretch',
    }}>
      <div className="ss-panel-hi" style={{ padding: '30px 32px 28px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <span style={{ fontSize: 12, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ss-ink3)', fontWeight: 500 }}>
            {PERIOD_EYEBROW[timePeriod]}
          </span>
          <span style={{ height: 1, flex: 1, background: 'var(--ss-line)' }} />
          <PeriodToggle {...periodToggleProps} timePeriod={timePeriod} />
        </div>
        <h1 style={{ margin: 0, fontSize: 'clamp(26px, 3vw, 40px)', lineHeight: 1.2, fontWeight: 300, letterSpacing: '-1px', color: 'var(--ss-ink)' }}>
          <span style={{ fontWeight: 600 }}>{hoursLabel} hours</span>
          {` across ${gameCount} game${gameCount === 1 ? '' : 's'} ${meta.phrase}`}
          {windowPct?.percentile >= 75 && ' — a heavier stretch than usual'}
          {windowPct?.percentile != null && windowPct.percentile <= 10 && ' — a quieter stretch than usual'}
          {gameCount > 1 && topShare >= 40 && ', and mostly one game'}
          {'.'}
        </h1>
        {hasSubtext && (
          <p style={{ margin: '20px 0 0', fontSize: 15, lineHeight: 1.65, color: 'var(--ss-ink2)', maxWidth: '52ch' }}>
            {windowPct?.percentile >= 75 && <>That puts this stretch in the <span style={{ color: 'var(--ss-accent)' }}>{lowerFirst(windowPct.label)}</span>. </>}
            {windowPct?.percentile != null && windowPct.percentile <= 10 && <>{windowPct.label}. </>}
            {streak && streak.currentStreak > 0 && `${streak.currentStreak} day${streak.currentStreak === 1 ? '' : 's'} running, with today still open.`}
          </p>
        )}
        {(lastPlayed || scopeLabel) && (
          <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
            {lastPlayed && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 13px', borderRadius: 99, background: 'var(--ss-pill-bg)', border: '1px solid var(--ss-pill-line)', fontSize: 12.5, color: 'var(--ss-pill-ink)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ss-accent)', boxShadow: '0 0 8px var(--ss-accent)' }} />
                Last played {formatLastPlayed(lastPlayed)}
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 13px', borderRadius: 99, background: 'var(--ss-pill2-bg)', border: '1px solid var(--ss-pill2-line)', fontSize: 12.5, color: 'var(--ss-pill2-ink)' }}>
              {scopeLabel}
            </span>
          </div>
        )}
        {gameCount > 1 && (
          <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
            {periodGames.slice(0, 6).map(g => (
              <HeroCapsule
                key={g.appid} game={g} timePeriod={timePeriod} topMinutes={topMinutes}
                active={activeFilter === g.appid}
                dimmed={activeFilter != null && activeFilter !== g.appid}
                onToggle={() => onToggleFilter(g.appid)}
              />
            ))}
          </div>
        )}
      </div>
      {series.length > 0 ? (
        <div className="ss-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <SectionHeading title="Day by day" trailing={meta.shortLabel} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <BarStrip series={series} highlightRecent />
          </div>
        </div>
      ) : showRecentPanel ? (
        <RecentVsLifetime ownedGames={ownedGames} activeFilter={activeFilter} onToggleFilter={onToggleFilter} />
      ) : null}
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

  const winMin = game.playtime_windows_forever || 0;
  const deckMin = game.playtime_deck_forever || 0;
  const platTotal = winMin + deckMin;
  const platforms = [
    winMin > 0 && { label: 'Windows', minutes: winMin, color: 'var(--ss-chart-grad)' },
    deckMin > 0 && { label: 'Steam Deck', minutes: deckMin, color: 'var(--ss-chart-alt)' },
  ].filter(Boolean);
  const bottomIsPlatforms = platforms.length > 0;

  return (
    <article className="ss-panel" onClick={onClick} style={{ position: 'relative', padding: 26, display: 'flex', gap: 26, cursor: 'pointer', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 'var(--ss-art-opacity)', backgroundImage: `url(${getGameHeaderUrl(game.appid)})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(28px) saturate(140%)', pointerEvents: 'none' }} />
      {/* Softened relative to the shared --ss-scrim token (used at full
          strength on hero cards elsewhere) — at full strength this card
          read noticeably darker than the plain-panel cards beside it in
          the "In focus" row. */}
      <div style={{ position: 'absolute', inset: 0, background: 'var(--ss-scrim)', opacity: 0.55, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', width: 132, height: 198, flexShrink: 0, alignSelf: 'flex-start', borderRadius: 18, overflow: 'hidden', background: 'var(--ss-inset)', boxShadow: '0 18px 40px -14px rgba(0,0,0,.9)' }}>
        <GameCapsule appId={game.appid} name={game.name} />
      </div>
      <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h3 style={{ margin: '0 0 6px', fontSize: 25, fontWeight: 600, letterSpacing: '-0.5px', lineHeight: 1.2, color: 'var(--ss-ink)' }}>
            {game.name}
          </h3>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ss-ink2)' }}>
            {lastPlayed && `Played ${formatLastPlayed(lastPlayed)}`}
            {game.launchCount ? `${lastPlayed ? ' · ' : ''}${game.launchCount} session${game.launchCount === 1 ? '' : 's'} all time` : ''}
          </p>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${columns},minmax(0,1fr))`,
          borderTop: '1px solid var(--ss-line)', borderBottom: '1px solid var(--ss-line)',
        }}>
          {timePeriod !== 'alltime' && <StatCell label={meta.shortLabel} value={formatHours(periodMinutes)} first />}
          <StatCell label="All time" value={formatHours(allTimeMinutes)} first={timePeriod === 'alltime'} />
          {avgSessionHours != null && <StatCell label="Session" value={`${avgSessionHours.toFixed(1)}h`} last />}
        </div>

        {meta.shareLabel && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ss-ink2)', marginBottom: 8 }}>
              <span>Share of {meta.shareLabel}</span>
              <span style={{ color: 'var(--ss-accent)' }}>{sharePct}%</span>
            </div>
            <div style={{ height: 7, borderRadius: 99, background: 'var(--ss-track)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(sharePct, 100)}%`, background: 'var(--ss-chart-grad)', transition: 'width 0.6s ease' }} />
            </div>
          </div>
        )}

        {hasSparkline && (
          <div style={bottomIsPlatforms ? undefined : { marginTop: 'auto' }}>
            <BarStrip series={sparkline} height={44} leftLabel="THIS GAME, DAY BY DAY" rightLabel={`PEAK ${peakHours}H`} />
          </div>
        )}

        {bottomIsPlatforms && (
          <div style={{ marginTop: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ss-ink3)', marginBottom: 9, fontWeight: 500 }}>
              <span>Where you played it</span>
              <span>{deckMin > 0 ? `${Math.round((deckMin / platTotal) * 100)}% on Deck` : 'Desktop only'}</span>
            </div>
            <div style={{ display: 'flex', gap: 3, height: 12, borderRadius: 99, overflow: 'hidden', background: 'rgba(255,255,255,.07)' }}>
              {platforms.map(p => (
                <div key={p.label} title={`${p.label} — ${formatHours(p.minutes)}`} style={{ width: `${(p.minutes / platTotal) * 100}%`, background: p.color }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              {platforms.map(p => (
                <span key={p.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--ss-ink2)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: p.color }} />{p.label} · {formatHours(p.minutes)}
                </span>
              ))}
            </div>
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
      className="ss-panel" onClick={onClick}
      style={{ padding: 14, display: 'flex', gap: 14, alignItems: 'center', flex: 1, cursor: 'pointer' }}
    >
      <div style={{ width: 46, height: 69, flexShrink: 0, borderRadius: 12, overflow: 'hidden', background: 'var(--ss-inset)' }}>
        <GameCapsule appId={game.appid} name={game.name} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--ss-ink)' }}>
          {game.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ss-ink3)', marginTop: 3 }}>
          {lastPlayed ? `Played ${formatLastPlayed(lastPlayed)}` : 'Recently active'}
          {allTimeMinutes > 0 ? ` · ${formatHours(allTimeMinutes)} all time` : ''}
        </div>
      </div>
      <div style={{ fontSize: 17, color: 'var(--ss-ink)', flexShrink: 0 }}>
        {formatHours(periodMinutes)}
      </div>
    </article>
  );
}

// The drill panel shown above the slice list when a game is selected —
// shares the same activeFilter/focusId that drives the hero capsules,
// Recent-vs-lifetime rows, and the Focus card above.
function TimeBreakdownDrill({ game, timePeriod, totalPeriodMinutes, onOpen, onClear }) {
  const periodMinutes = getPeriodMinutes(game, timePeriod);
  const allTimeMinutes = game.playtime_forever || 0;
  const pct = totalPeriodMinutes > 0 ? Math.round((periodMinutes / totalPeriodMinutes) * 100) : 0;
  const deckMin = game.playtime_deck_forever || 0;
  const deckPct = allTimeMinutes > 0 && deckMin > 0 ? Math.round((deckMin / allTimeMinutes) * 100) : null;
  const lastPlayed = game.localLastPlayed || game.rtime_last_played;

  const stats = [
    { label: PERIOD_META[timePeriod].shortLabel, value: formatHours(periodMinutes) },
    { label: 'Lifetime', value: formatHours(allTimeMinutes) },
    { label: 'Share', value: `${pct}%` },
    deckPct != null && { label: 'On Deck', value: `${deckPct}%` },
    lastPlayed && { label: 'Last played', value: formatLastPlayed(lastPlayed) },
  ].filter(Boolean);

  return (
    <div style={{
      marginBottom: 20, padding: '20px 22px', borderRadius: 20,
      background: 'linear-gradient(160deg, var(--ss-pill-bg), transparent)',
      border: '1px solid var(--ss-pill-line)', boxShadow: 'inset 0 1px 0 var(--ss-hi)',
      animation: 'ssRise 0.22s ease both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div style={{ width: 74, height: 35, borderRadius: 9, overflow: 'hidden', flexShrink: 0, background: 'var(--ss-inset)' }}>
          <GameHeader appId={game.appid} name={game.name} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{game.name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ss-ink2)' }}>
            {pct}% of this period · {formatHours(allTimeMinutes)} lifetime{lastPlayed ? ` · last played ${formatLastPlayed(lastPlayed)}` : ''}
          </div>
        </div>
        <button onClick={onOpen} style={{ padding: '9px 15px', borderRadius: 14, background: 'var(--ss-btn)', border: '1px solid var(--ss-line)', color: 'var(--ss-ink)', fontSize: 12.5, cursor: 'pointer', flexShrink: 0 }}>
          Full detail
        </button>
        <button onClick={onClear} aria-label="Clear selection" style={{ width: 32, height: 32, borderRadius: 11, background: 'var(--ss-btn)', border: '1px solid var(--ss-line)', color: 'var(--ss-ink2)', fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, minmax(0,1fr))`, gap: 12 }}>
        {stats.map(s => (
          <div key={s.label} style={{ padding: '13px 15px', borderRadius: 15, background: 'var(--ss-inset)', border: '1px solid var(--ss-line-soft)' }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--ss-ink3)', marginBottom: 6, fontWeight: 500 }}>{s.label}</div>
            <div style={{ fontSize: 19, lineHeight: 1, color: 'var(--ss-ink)' }}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimeBreakdown({ periodGames, timePeriod, totalPeriodMinutes, activeFilter, onToggleFilter, onOpenGame }) {
  if (periodGames.length < 2) return null;

  const MAX = 9;
  const top = periodGames.slice(0, MAX);
  const rest = periodGames.slice(MAX);
  const restTotal = rest.reduce((s, g) => s + getPeriodMinutes(g, timePeriod), 0);
  const sliceCount = top.length + (restTotal > 0 ? 1 : 0);
  const topSliceMinutes = getPeriodMinutes(top[0], timePeriod);

  const slices = top.map((g, i) => {
    const minutes = getPeriodMinutes(g, timePeriod);
    const active = activeFilter === g.appid;
    return {
      id: g.appid, appid: g.appid, name: g.name, minutes, active,
      color: active ? 'var(--ss-chart-band)' : tint(i, sliceCount),
      barPct: topSliceMinutes > 0 ? (minutes / topSliceMinutes) * 100 : 0,
    };
  });
  if (restTotal > 0) {
    slices.push({
      id: 'other', appid: null, name: `${rest.length} other game${rest.length === 1 ? '' : 's'}`, minutes: restTotal,
      color: 'var(--ss-track)', barPct: topSliceMinutes > 0 ? (restTotal / topSliceMinutes) * 100 : 0, active: false,
    });
  }

  const topCount = Math.min(2, top.length);
  const topShareMinutes = top.slice(0, topCount).reduce((s, g) => s + getPeriodMinutes(g, timePeriod), 0);
  const topSharePct = totalPeriodMinutes > 0 ? Math.round((topShareMinutes / totalPeriodMinutes) * 100) : 0;
  const restMinutes = Math.max(totalPeriodMinutes - topShareMinutes, 0);
  const restGamesCount = periodGames.length - topCount;

  const drillGame = activeFilter != null ? periodGames.find(g => g.appid === activeFilter) : null;

  return (
    <section>
      <SectionHeading title="Where the time went" trailing={`${formatHours(totalPeriodMinutes)} total · click a row to drill in`} />
      <div className="ss-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 2px 18px', marginBottom: 4, borderBottom: '1px solid var(--ss-line-soft)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, color: 'var(--ss-ink2)', flexShrink: 0 }}>
            Top {topCount} game{topCount === 1 ? '' : 's'} account{topCount === 1 ? 's' : ''} for {topSharePct}% of usage
          </span>
          <div style={{ flex: 1, minWidth: 120, display: 'flex', gap: 3, height: 8, borderRadius: 99, overflow: 'hidden', background: 'var(--ss-track)' }}>
            <div style={{ width: `${topSharePct}%`, background: 'var(--ss-chart-band)' }} />
            <div style={{ width: `${100 - topSharePct}%`, background: 'var(--ss-chart-ghost)' }} />
          </div>
          {restGamesCount > 0 && (
            <span style={{ fontSize: 12.5, color: 'var(--ss-ink4)', flexShrink: 0 }}>the other {restGamesCount} split {formatHours(restMinutes)}</span>
          )}
        </div>

        {drillGame && (
          <TimeBreakdownDrill
            game={drillGame} timePeriod={timePeriod} totalPeriodMinutes={totalPeriodMinutes}
            onOpen={(e) => onOpenGame(drillGame, e)}
            onClear={() => onToggleFilter(drillGame.appid)}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {slices.map(s => (
            <div
              key={s.id}
              onClick={() => s.appid != null && onToggleFilter(s.appid)}
              title={`${s.name} — ${formatHours(s.minutes)}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '11px 10px', borderRadius: 14,
                cursor: s.appid != null ? 'pointer' : 'default',
                borderBottom: '1px solid var(--ss-line-soft)',
                opacity: activeFilter != null && !s.active ? 0.45 : 1,
                background: s.active ? 'var(--ss-btn)' : 'transparent',
                transition: 'background 0.15s, opacity 0.15s',
              }}
            >
              <div style={{ width: 58, height: 28, borderRadius: 7, overflow: 'hidden', flexShrink: 0, background: 'var(--ss-inset)' }}>
                {s.appid != null && <GameHeader appId={s.appid} name={s.name} />}
              </div>
              <span style={{ width: 158, flexShrink: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: s.active ? 'var(--ss-accent-txt)' : 'var(--ss-ink)' }}>
                {s.name}
              </span>
              <div style={{ flex: 1, minWidth: 60, height: 12, borderRadius: 99, background: 'var(--ss-track)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, width: `${s.barPct}%`, background: s.color, transition: 'width 0.6s cubic-bezier(.4,0,.2,1)' }} />
              </div>
              <span style={{ fontSize: 14, width: 58, textAlign: 'right', flexShrink: 0, color: s.active ? 'var(--ss-accent-txt)' : 'var(--ss-ink)' }}>{formatHours(s.minutes)}</span>
              <span style={{ fontSize: 12.5, width: 42, textAlign: 'right', flexShrink: 0, color: 'var(--ss-ink3)' }}>
                {totalPeriodMinutes > 0 ? Math.round((s.minutes / totalPeriodMinutes) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// "5 minutes ago"-style relative time — coarser formatters elsewhere
// (formatLastPlayed) start at whole days, too blunt for a sync timestamp
// that's typically minutes old.
function formatSyncedAgo(timestamp) {
  if (!timestamp) return null;
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function FooterStats({ ownedGames, gamesPlayed, lastLoaded }) {
  // Desktop-vs-Deck folded in as one more chip here rather than its own
  // section — it's a static, all-time fact with nothing to do with it, so
  // it's sized to match (a stat, not a headline).
  const deckSplit = computeDeckSplit(ownedGames);
  const totalLifetimeMinutes = ownedGames.reduce((s, g) => s + (g.playtime_forever || 0), 0);
  const recentMinutes = ownedGames.reduce((s, g) => s + (g.playtime_2weeks || 0), 0);
  const items = [
    { value: ownedGames.length.toLocaleString(), label: 'games owned' },
    { value: gamesPlayed.toLocaleString(), label: `with playtime · ${Math.round((gamesPlayed / Math.max(ownedGames.length, 1)) * 100)}%` },
    { value: formatHours(totalLifetimeMinutes), label: 'lifetime, all games' },
    deckSplit && { value: `${deckSplit.deckPct}%`, label: 'of lifetime on Steam Deck' },
    { value: formatHours(recentMinutes), label: 'in the last two weeks' },
  ].filter(Boolean);
  const syncedAgo = formatSyncedAgo(lastLoaded);

  return (
    <section>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 14 }}>
        {items.map(it => (
          <div key={it.label} className="ss-panel" style={{ flex: '1 1 150px', minWidth: 150, padding: '18px 20px' }}>
            <div style={{ fontSize: 26, fontWeight: 600, color: 'var(--ss-ink)' }}>{it.value}</div>
            <div style={{ fontSize: 12, color: 'var(--ss-ink3)', marginTop: 6 }}>{it.label}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ss-ink4)' }}>
        Steam Web API · Playtime + Achievements{syncedAgo ? ` · Synced ${syncedAgo}` : ''}
      </div>
    </section>
  );
}

function EmptyState({ timePeriod }) {
  const meta = PERIOD_META[timePeriod];
  return (
    <div style={{ textAlign: 'center', padding: '96px 40px', color: 'var(--ss-ink3)' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🎮</div>
      <h3 style={{ fontSize: 19, marginBottom: 8, color: 'var(--ss-ink2)' }}>No playtime data for this period</h3>
      <p style={{ fontSize: 14 }}>
        {timePeriod === 'alltime' ? 'No games with recorded playtime yet.' : `No games played ${meta.phrase}.`}
      </p>
    </div>
  );
}

// Distinct from EmptyState above: this fires when Steam returned ZERO owned
// games at all, not just zero for the selected period. That combination
// (connection succeeded, library is empty) is almost always the "Game
// details" privacy toggle — a separate, easy-to-miss setting from overall
// profile visibility — so it gets its own actionable message instead of
// silently rendering like a quiet week.
function EmptyLibraryState({ onRetry }) {
  return (
    <div style={{ textAlign: 'center', padding: '96px 40px', color: 'var(--ss-ink3)' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
      <h3 style={{ fontSize: 19, marginBottom: 8, color: 'var(--ss-ink2)' }}>Steam connected, but your library came back empty</h3>
      <p style={{ fontSize: 14, maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>
        This almost always means <strong>Game details</strong> is still set to Private —
        a separate setting from your overall profile visibility. In Steam, go to{' '}
        <strong>Profile → Edit Profile → Privacy Settings → Game details → Public</strong>, then retry.
      </p>
      <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export default function Dashboard() {
  const {
    ownedGames, getGamesForPeriod, gamesPlayed, timePeriod, setTimePeriod,
    achCache, steamId, config, loadData,
  } = useApp();
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedGameRect, setSelectedGameRect] = useState(null);
  const [activeFilter, setActiveFilter] = useState(null);

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
  useEffect(() => { setSelectedGame(null); setActiveFilter(null); }, [timePeriod]);

  const handleSelectGame = useCallback((game, e) => {
    setSelectedGame(prev => prev?.appid === game.appid ? null : game);
    setSelectedGameRect(e ? e.currentTarget.getBoundingClientRect() : null);
  }, []);

  const toggleFilter = useCallback((appid) => {
    setActiveFilter(prev => prev === appid ? null : appid);
  }, []);

  const periodGames = [...getGamesForPeriod()]
    .filter(g => getPeriodMinutes(g, timePeriod) > 0)
    .sort((a, b) => getPeriodMinutes(b, timePeriod) - getPeriodMinutes(a, timePeriod));

  const totalPeriodMinutes = periodGames.reduce((s, g) => s + getPeriodMinutes(g, timePeriod), 0);
  const filteredGame = activeFilter != null ? periodGames.find(g => g.appid === activeFilter) : null;

  const heroGame = periodGames[0];
  // Selecting a game anywhere (hero capsule, Recent-vs-lifetime row, a
  // "Where the time went" row) promotes it to be the Focus card's subject —
  // one shared selection drives every section, matching the design's single
  // focusId model instead of Focus always pinning to the #1 game.
  const focusGame = filteredGame || heroGame;
  const alsoActive = focusGame ? periodGames.filter(g => g.appid !== focusGame.appid).slice(0, 3) : [];

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '34px 24px 96px', display: 'flex', flexDirection: 'column', gap: 40 }}>
      {ownedGames.length === 0 ? (
        <EmptyLibraryState onRetry={() => loadData(config.apiKey, config.steamUrl)} />
      ) : periodGames.length === 0 ? (
        <EmptyState timePeriod={timePeriod} />
      ) : (
        <>
          <HeroSection
            periodGames={periodGames} totalPeriodMinutes={totalPeriodMinutes} timePeriod={timePeriod} steamId={steamId}
            periodToggleProps={{ enabledPeriods, setTimePeriod, hoveredPeriod, setHoveredPeriod }}
            activeFilter={activeFilter} onToggleFilter={toggleFilter}
            ownedGames={ownedGames} gamesPlayed={gamesPlayed}
          />

          {filteredGame && (
            <CrossFilterBanner
              label={filteredGame.name}
              onClear={() => setActiveFilter(null)}
            />
          )}

          <TonightPick />

          <section>
            <SectionHeading title="In focus" />
            <div style={{
              display: 'grid',
              gridTemplateColumns: alsoActive.length ? 'minmax(0,1.7fr) minmax(0,1fr)' : '1fr',
              gap: 20, alignItems: 'stretch',
            }}>
              <FocusCard
                game={focusGame} timePeriod={timePeriod}
                periodMinutes={getPeriodMinutes(focusGame, timePeriod)}
                totalPeriodMinutes={totalPeriodMinutes} steamId={steamId}
                onClick={(e) => handleSelectGame(focusGame, e)}
              />
              {alsoActive.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {alsoActive.map(g => (
                    <ActiveRow key={g.appid} game={g} timePeriod={timePeriod} onClick={(e) => handleSelectGame(g, e)} />
                  ))}
                </div>
              )}
            </div>
          </section>

          <TimeBreakdown
            periodGames={periodGames} timePeriod={timePeriod} totalPeriodMinutes={totalPeriodMinutes}
            activeFilter={activeFilter} onToggleFilter={toggleFilter} onOpenGame={handleSelectGame}
          />

          <FooterStats
            ownedGames={ownedGames} gamesPlayed={gamesPlayed}
            lastLoaded={config?.lastLoaded}
          />

          {selectedGame && (
            <GameDetailPanel
              game={selectedGame}
              achData={achCache[selectedGame.appid]}
              anchorRect={selectedGameRect}
              onClose={() => setSelectedGame(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
