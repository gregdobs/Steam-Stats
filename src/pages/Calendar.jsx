import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import {
  formatHours, minutesToHours, formatLastPlayed,
  DAY_STATES, computeDailyCoverage, computeArchiveCoverage, resolveDayState,
  computeDailyUnlocks, computeDayPercentile, computeMonthSummary,
  getSnapshotMeta, SNAPSHOT_RETENTION_DAYS, fetchAchievementRarity,
} from '../utils/steam.js';
import {
  PageHeader, chartRgba, FilterPill, CrossFilterBanner,
} from '../components/designSystem.jsx';
import { GameHeader } from '../components/GameImage.jsx';
import AchievementHoverCard from '../components/AchievementHoverCard.jsx';

// ── Day-cell visual language ────────────────────────────────────────────
//
// Every state a day can be in has to be distinguishable at a glance, because
// the whole point of this grid is that "you didn't play" and "we weren't
// watching" are different facts. Playtime reads as a fill in the chart
// accent; a gap reads as a hatch; anything before tracking began reads as an
// empty outline. Fills stay at low alpha on purpose — var(--ss-ink) has to
// stay legible on top of them in all four themes, so intensity beyond that
// point is carried by the bar along the bottom of the cell rather than by
// pushing the background darker.

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const INTENSITY_STEPS = [
  { max: 30, alpha: 0.12, label: 'under 30m' },
  { max: 60, alpha: 0.20, label: '30m–1h' },
  { max: 120, alpha: 0.28, label: '1–2h' },
  { max: 240, alpha: 0.36, label: '2–4h' },
  { max: Infinity, alpha: 0.44, label: '4h+' },
];

function intensityAlpha(minutes) {
  return INTENSITY_STEPS.find(s => minutes <= s.max).alpha;
}

const HATCH = 'repeating-linear-gradient(135deg, var(--ss-line) 0 1px, transparent 1px 7px)';

function dayFill(state, minutes) {
  switch (state) {
    case DAY_STATES.PLAYED: return chartRgba(intensityAlpha(minutes));
    case DAY_STATES.IDLE: return 'var(--ss-track)';
    case DAY_STATES.UNCOVERED: return HATCH;
    default: return 'transparent';
  }
}

const STATE_WORDS = {
  [DAY_STATES.PLAYED]: 'played',
  [DAY_STATES.IDLE]: 'tracked, no playtime',
  [DAY_STATES.UNCOVERED]: 'no coverage',
  [DAY_STATES.UNTRACKED]: 'before tracking started',
  [DAY_STATES.FUTURE]: 'upcoming',
};

// ── Date helpers ────────────────────────────────────────────────────────
const monthTitle = (y, m) =>
  new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const shortMonth = (y, m) =>
  new Date(y, m, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
const dayTitle = (ts) =>
  new Date(ts).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

function startOfMonthGrid(year, month) {
  // Monday-first, matching the weekday ordering computeDayOfWeekPattern uses.
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

// ── One day ─────────────────────────────────────────────────────────────
function DayCell({ cell, selected, isToday, monthMax, onSelect }) {
  const { day, key, state, minutes, unlockCount, timestamp } = cell;
  const played = state === DAY_STATES.PLAYED;
  const inert = state === DAY_STATES.FUTURE || (state === DAY_STATES.UNTRACKED && !unlockCount);

  const label = `${dayTitle(timestamp)} — ${played ? formatHours(minutes) : STATE_WORDS[state]}` +
    (unlockCount ? `, ${unlockCount} achievement${unlockCount === 1 ? '' : 's'}` : '');

  const ring = selected
    ? 'inset 0 0 0 2px var(--ss-chart-hi)'
    : isToday ? 'inset 0 0 0 1.5px var(--ss-accent)' : 'none';

  return (
    <button
      type="button"
      disabled={inert}
      onClick={() => onSelect(inert ? null : key)}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      style={{
        position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        minHeight: 62, padding: '6px 7px',
        borderRadius: 11, textAlign: 'left',
        background: dayFill(state, minutes),
        border: `1px ${state === DAY_STATES.UNTRACKED ? 'dashed' : 'solid'} var(--ss-line-soft)`,
        boxShadow: ring,
        opacity: state === DAY_STATES.FUTURE ? 0.25 : state === DAY_STATES.UNTRACKED ? 0.5 : 1,
        cursor: inert ? 'default' : 'pointer',
        transition: 'background 0.2s, box-shadow 0.15s, transform 0.15s',
        transform: selected ? 'translateY(-1px)' : 'none',
      }}
      onMouseEnter={e => { if (!inert && !selected) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.transform = 'none'; }}
    >
      <span style={{
        fontSize: 11, lineHeight: 1,
        color: selected || isToday ? 'var(--ss-ink)' : 'var(--ss-ink3)',
        fontWeight: isToday ? 600 : 400,
      }}>
        {day}
      </span>

      {played && (
        <span style={{
          marginTop: 'auto', fontSize: 11.5, fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums', color: 'var(--ss-ink)',
        }}>
          {formatHours(minutes)}
        </span>
      )}

      {unlockCount > 0 && (
        <span style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 2 }}>
          {Array.from({ length: Math.min(unlockCount, 3) }).map((_, i) => (
            <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--ss-cat-2)' }} />
          ))}
        </span>
      )}

      {played && monthMax > 0 && (
        <span style={{
          position: 'absolute', left: 0, bottom: 0, height: 3,
          width: `${Math.max(6, (minutes / monthMax) * 100)}%`,
          backgroundImage: 'var(--ss-chart-grad)',
        }} />
      )}
    </button>
  );
}

// ── The month grid ──────────────────────────────────────────────────────
function MonthGrid({ cells, selectedKey, todayKey, monthMax, onSelect }) {
  const lead = cells.lead;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 6, marginBottom: 8 }}>
        {WEEKDAYS.map(w => (
          <div key={w} style={{
            fontSize: 10, letterSpacing: '0.8px', textTransform: 'uppercase',
            color: 'var(--ss-ink4)', textAlign: 'center',
          }}>{w}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 6 }}>
        {Array.from({ length: lead }).map((_, i) => <div key={`pad-${i}`} />)}
        {cells.days.map(cell => (
          <DayCell
            key={cell.key}
            cell={cell}
            selected={cell.key === selectedKey}
            isToday={cell.key === todayKey}
            monthMax={monthMax}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

// Keyed off the states actually present in the month on screen rather than a
// blanket "does this install have coverage" flag — a legend that explains
// swatches the grid isn't showing is noise, and one that omits a swatch the
// grid IS showing (hatching, especially) defeats the whole point.
function Legend({ states, hasUnlocks }) {
  const items = [
    states.has(DAY_STATES.PLAYED) && { fill: chartRgba(0.30), label: 'Playtime' },
    states.has(DAY_STATES.IDLE) && { fill: 'var(--ss-track)', label: 'Tracked, nothing played' },
    states.has(DAY_STATES.UNCOVERED) && { fill: HATCH, label: 'No coverage — app wasn’t open' },
    states.has(DAY_STATES.UNTRACKED) && { fill: 'transparent', dashed: true, label: 'Before tracking started' },
    hasUnlocks && { dot: true, label: 'Achievement unlocked' },
  ].filter(Boolean);

  if (items.length === 0) return null;
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '9px 18px',
      marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--ss-line-soft)',
    }}>
      {items.map(it => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--ss-ink3)' }}>
          {it.dot ? (
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ss-cat-2)', margin: '0 5px' }} />
          ) : (
            <span style={{
              width: 15, height: 15, borderRadius: 5, background: it.fill,
              border: `1px ${it.dashed ? 'dashed' : 'solid'} var(--ss-line-soft)`,
            }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ── Shared rail pieces ──────────────────────────────────────────────────
function RailStat({ label, value, tone = 'var(--ss-ink)' }) {
  return (
    <div style={{ flex: 1, minWidth: 76 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ss-ink3)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 19, color: tone, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function GameBars({ games, max, nameFor, unit = 'time' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {games.map(g => (
        <div key={g.appid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 22, borderRadius: 5, overflow: 'hidden', flexShrink: 0, background: 'var(--ss-inset)' }}>
            <GameHeader appId={g.appid} name={nameFor(g.appid)} />
          </div>
          <span style={{
            flex: 1, fontSize: 12.5, color: 'var(--ss-ink)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {nameFor(g.appid)}
          </span>
          <div style={{ width: 54, height: 6, borderRadius: 99, background: 'var(--ss-track)', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ height: '100%', borderRadius: 99, width: `${max > 0 ? (g.minutes / max) * 100 : 0}%`, backgroundImage: 'var(--ss-chart-grad)' }} />
          </div>
          <span style={{
            fontSize: 11.5, color: 'var(--ss-ink2)', width: 42, textAlign: 'right', flexShrink: 0,
            fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
          }}>
            {unit === 'time' ? formatHours(g.minutes) : g.minutes}
          </span>
        </div>
      ))}
    </div>
  );
}

function UnlockList({ unlocks, nameFor, rarity }) {
  // Hover target state lives here rather than on each icon so only one card
  // is ever mounted, and so leaving one icon for another swaps cleanly
  // instead of briefly showing two.
  const [hovered, setHovered] = useState(null);

  if (!unlocks?.count) return null;

  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--ss-ink3)', marginBottom: 10 }}>
        {unlocks.count} achievement{unlocks.count === 1 ? '' : 's'} unlocked
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {unlocks.games.slice(0, 4).map(g => (
          <div key={g.appid}>
            <div style={{ fontSize: 12, color: 'var(--ss-ink2)', marginBottom: 6 }}>{nameFor(g.appid)}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {g.achievements.slice(0, 8).map(a => {
                const on = hovered?.appid === g.appid && hovered?.apiname === a.apiname;
                return (
                  <span
                    key={a.apiname}
                    onMouseEnter={e => setHovered({ appid: g.appid, apiname: a.apiname, ach: a, rect: e.currentTarget.getBoundingClientRect() })}
                    onMouseLeave={() => setHovered(prev => (prev?.apiname === a.apiname ? null : prev))}
                    style={{
                      width: 26, height: 26, borderRadius: 7, overflow: 'hidden',
                      background: 'var(--ss-inset)', flexShrink: 0,
                      border: `1px solid ${on ? 'var(--ss-cat-2)' : 'var(--ss-line-soft)'}`,
                      transform: on ? 'translateY(-1px)' : 'none',
                      transition: 'border-color 0.15s, transform 0.15s',
                    }}
                  >
                    {a.icon
                      ? <img src={a.icon} alt={a.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
                      : null}
                  </span>
                );
              })}
              {g.achievements.length > 8 && (
                <span style={{ fontSize: 11, color: 'var(--ss-ink3)', alignSelf: 'center' }}>+{g.achievements.length - 8}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {hovered && (
        <AchievementHoverCard
          achievement={hovered.ach}
          gameName={nameFor(hovered.appid)}
          percent={rarity?.[hovered.appid]?.[hovered.apiname] ?? null}
          anchorRect={hovered.rect}
        />
      )}
    </div>
  );
}

function RailNote({ children }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 14,
      background: 'var(--ss-inset)', border: '1px solid var(--ss-line-soft)',
      fontSize: 12.5, lineHeight: 1.6, color: 'var(--ss-ink2)',
    }}>
      {children}
    </div>
  );
}

// ── Rail: one day ───────────────────────────────────────────────────────
function DayDetail({ cell, entry, unlocks, percentile, nameFor, gameFilter, rarity, onClose }) {
  const games = gameFilter
    ? (entry.games || []).filter(g => g.appid === gameFilter)
    : (entry.games || []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'ssRise 0.18s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ss-ink)', lineHeight: 1.3 }}>
            {dayTitle(cell.timestamp)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ss-ink3)', marginTop: 3 }}>
            {new Date(cell.timestamp).getFullYear()} · {STATE_WORDS[entry.state]}
          </div>
        </div>
        <button onClick={onClose} className="ss-pill" aria-label="Close day detail"
          style={{ width: 28, height: 28, padding: 0, justifyContent: 'center', flexShrink: 0 }}>✕</button>
      </div>

      {entry.state === DAY_STATES.PLAYED && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 34, fontWeight: 300, letterSpacing: '-1px', color: 'var(--ss-ink)' }}>
              {minutesToHours(games.reduce((s, g) => s + g.minutes, 0)).toFixed(1)}
            </span>
            <span style={{ fontSize: 13, color: 'var(--ss-ink3)' }}>
              hours across {games.length} game{games.length === 1 ? '' : 's'}
            </span>
          </div>
          {percentile?.percentile != null && !gameFilter && (
            <div style={{ fontSize: 12.5, color: 'var(--ss-ink2)', marginTop: -8 }}>
              Busier than <span style={{ color: 'var(--ss-accent)' }}>{percentile.percentile}%</span> of your {percentile.sampleSize} tracked days.
            </div>
          )}
          {games.length > 0 && (
            <GameBars games={games.slice(0, 8)} max={games[0]?.minutes || 1} nameFor={nameFor} />
          )}
          {games.length === 0 && (
            <RailNote>No recorded time for the filtered game on this day.</RailNote>
          )}
        </>
      )}

      {entry.state === DAY_STATES.IDLE && (
        <RailNote>
          Steam Stats had this day covered and no playtime came through — a genuine day off,
          not a gap in the record.
        </RailNote>
      )}

      {entry.state === DAY_STATES.UNCOVERED && (
        <RailNote>
          No snapshot pair lands on this day, so there is nothing to attribute to it.
          {entry.spanMinutes > 0 ? (
            <>
              {' '}Steam recorded <strong style={{ color: 'var(--ss-ink)' }}>{formatHours(entry.spanMinutes)}</strong> across
              the {entry.spanDays} days from {entry.spanFrom.slice(4, 10)} to {entry.spanTo.slice(4, 10)},
              but that total can&rsquo;t be split between them honestly.
            </>
          ) : ' No playtime accumulated over the surrounding gap either.'}
        </RailNote>
      )}

      {entry.state === DAY_STATES.UNTRACKED && (
        <RailNote>
          This predates your snapshot history, so there is no day-level playtime for it.
          {unlocks?.count ? ' Achievement unlocks are dated by Steam itself, so those still show below.' : ''}
        </RailNote>
      )}

      {entry.state === DAY_STATES.UNCOVERED && entry.spanGames?.length > 0 && !gameFilter && (
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--ss-ink3)', marginBottom: 10 }}>
            Played somewhere in that gap
          </div>
          <GameBars games={entry.spanGames.slice(0, 5)} max={entry.spanGames[0]?.minutes || 1} nameFor={nameFor} />
        </div>
      )}

      <UnlockList unlocks={unlocks} nameFor={nameFor} rarity={rarity} />

      {entry.state !== DAY_STATES.PLAYED && !unlocks?.count && entry.state !== DAY_STATES.UNCOVERED && (
        <div style={{ fontSize: 12, color: 'var(--ss-ink4)' }}>Nothing else recorded on this date.</div>
      )}
    </div>
  );
}

// ── Rail: the month ─────────────────────────────────────────────────────
function MonthSummary({ year, month, summary, lastYear, daysElapsed, nameFor, gameFilter, onJump, jumpLabel }) {
  const { totalMinutes, playedDays, coveredDays, uncoveredDays, unlockCount, busiestDay, longestStreak, topGames, firstPlays } = summary;
  const untrackedDays = Math.max(0, daysElapsed - coveredDays - uncoveredDays);
  const hasAnything = coveredDays > 0 || unlockCount > 0;

  const seenFirstPlays = [];
  const seen = new Set();
  for (const fp of firstPlays) {
    if (seen.has(fp.appid)) continue;
    seen.add(fp.appid);
    seenFirstPlays.push(fp);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--ss-ink3)', marginBottom: 8 }}>
          Month summary
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ss-ink)' }}>{monthTitle(year, month)}</div>
      </div>

      {!hasAnything ? (
        <>
          <RailNote>
            Nothing on record for this month — it falls outside both your snapshot history
            and your dated achievement unlocks.
          </RailNote>
          {onJump && (
            <button onClick={onJump} className="ss-pill" style={{ alignSelf: 'flex-start' }}>
              Jump to {jumpLabel}
            </button>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            <RailStat label="Hours" value={coveredDays > 0 ? minutesToHours(totalMinutes).toFixed(1) : '—'} tone="var(--ss-chart-hi)" />
            <RailStat label="Days played" value={coveredDays > 0 ? playedDays : '—'} />
            <RailStat label="Longest run" value={coveredDays > 0 ? `${longestStreak}d` : '—'} tone="var(--ss-cat-3)" />
            <RailStat label="Unlocks" value={unlockCount || '—'} tone="var(--ss-cat-2)" />
          </div>

          {/* Coverage bar — how much of this month the app can actually speak to */}
          <div>
            <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: 99, overflow: 'hidden', background: 'var(--ss-track)' }}>
              {coveredDays > 0 && <div style={{ width: `${(coveredDays / daysElapsed) * 100}%`, background: 'var(--ss-accent)' }} />}
              {uncoveredDays > 0 && <div style={{ width: `${(uncoveredDays / daysElapsed) * 100}%`, background: 'var(--ss-line)' }} />}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ss-ink3)', marginTop: 7, lineHeight: 1.5 }}>
              {coveredDays} of {daysElapsed} days covered
              {uncoveredDays > 0 && ` · ${uncoveredDays} with the app closed`}
              {untrackedDays > 0 && ` · ${untrackedDays} before tracking`}
            </div>
          </div>

          {busiestDay && !gameFilter && (
            <RailNote>
              Busiest day was <strong style={{ color: 'var(--ss-ink)' }}>{busiestDay.date.slice(0, 10)}</strong> at {formatHours(busiestDay.minutes)}.
            </RailNote>
          )}

          {/* Only drawn once the archive actually reaches back a year — the
              whole reason the archive stopped being capped at 90 days. */}
          {lastYear?.coveredDays > 0 && coveredDays > 0 && (
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--ss-ink3)', marginBottom: 10 }}>
                vs. {monthTitle(year - 1, month)}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 22, color: 'var(--ss-ink)' }}>{minutesToHours(lastYear.totalMinutes).toFixed(1)}h</span>
                <span style={{ fontSize: 12, color: 'var(--ss-ink3)' }}>
                  over {lastYear.playedDays} day{lastYear.playedDays === 1 ? '' : 's'}
                </span>
                {lastYear.totalMinutes > 0 && (() => {
                  const pct = Math.round(((totalMinutes - lastYear.totalMinutes) / lastYear.totalMinutes) * 100);
                  const up = pct >= 0;
                  return (
                    <span style={{ marginLeft: 'auto', fontSize: 12.5, color: up ? 'var(--ss-cat-3)' : 'var(--ss-cat-4)' }}>
                      {up ? '↑' : '↓'} {Math.abs(pct)}% this year
                    </span>
                  );
                })()}
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {[{ v: totalMinutes, on: true }, { v: lastYear.totalMinutes, on: false }].map((bar, i) => (
                  <div key={i} style={{ flex: 1 }}>
                    <div style={{ height: 6, borderRadius: 99, background: 'var(--ss-track)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 99,
                        width: `${Math.min(100, (bar.v / Math.max(totalMinutes, lastYear.totalMinutes, 1)) * 100)}%`,
                        backgroundImage: bar.on ? 'var(--ss-chart-grad)' : 'none',
                        background: bar.on ? undefined : chartRgba(0.3),
                      }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ss-ink4)', marginTop: 4 }}>{bar.on ? year : year - 1}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {topGames.length > 0 && (
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--ss-ink3)', marginBottom: 10 }}>
                Most played this month
              </div>
              <GameBars games={topGames.slice(0, 6)} max={topGames[0].minutes} nameFor={nameFor} />
            </div>
          )}

          {seenFirstPlays.length > 0 && (
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--ss-ink3)', marginBottom: 10 }}>
                Started this month
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {seenFirstPlays.slice(0, 5).map(fp => (
                  <div key={fp.appid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 44, height: 22, borderRadius: 5, overflow: 'hidden', flexShrink: 0, background: 'var(--ss-inset)' }}>
                      <GameHeader appId={fp.appid} name={nameFor(fp.appid)} />
                    </div>
                    <span style={{ flex: 1, fontSize: 12.5, color: 'var(--ss-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {nameFor(fp.appid)}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--ss-ink3)', flexShrink: 0 }}>{fp.date.slice(4, 10)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {coveredDays === 0 && unlockCount > 0 && (
            <RailNote>
              No day-level playtime for this month — it predates your snapshot history.
              The unlock counts above come from Steam&rsquo;s own timestamps.
            </RailNote>
          )}
        </>
      )}
    </div>
  );
}

// ── Month picker ────────────────────────────────────────────────────────
//
// Hangs off the month title rather than sitting in its own panel at the
// bottom of the page: jumping to a month is navigation, so it belongs on the
// control you'd already reach for. Laid out as a year-per-row grid instead of
// the horizontal scroller it replaces — twelve fixed columns make the shape
// of a year readable at a glance, which a scroll strip never managed.
//
// Cell fill is achievement-unlock volume, the one signal that reaches back
// through every month whether or not playtime tracking covers it.
const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function MonthPicker({ months, activeKey, onPick, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    window.addEventListener('keydown', onKey);
    // Deferred: the click that opened this would otherwise close it again.
    const t = setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      clearTimeout(t);
    };
  }, [onClose]);

  const max = Math.max(...months.map(m => m.unlockCount), 1);
  const byYear = new Map();
  for (const m of months) {
    if (!byYear.has(m.year)) byYear.set(m.year, new Map());
    byYear.get(m.year).set(m.month, m);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Jump to month"
      className="ss-panel"
      data-no-tilt
      style={{
        position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 40,
        width: 340, padding: '16px 18px',
        maxHeight: 340, overflowY: 'auto',
        animation: 'ssRise 0.16s ease both',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 10.5, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ss-ink3)' }}>
          Months on record
        </span>
        <span style={{ height: 1, flex: 1, background: 'var(--ss-line-soft)' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {years.map(year => (
          <div key={year} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--ss-ink3)', width: 30, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
              {String(year).slice(2)}
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 3, flex: 1 }}>
              {Array.from({ length: 12 }).map((_, month) => {
                const m = byYear.get(year).get(month);
                const on = m && m.key === activeKey;
                if (!m) return <span key={month} style={{ height: 26, borderRadius: 5, background: 'var(--ss-track)', opacity: 0.35 }} />;
                const intensity = m.unlockCount > 0 ? 0.18 + (m.unlockCount / max) * 0.62 : 0;
                return (
                  <button
                    key={month}
                    onClick={() => { onPick(m.year, m.month); onClose(); }}
                    title={`${monthTitle(m.year, m.month)} — ${m.unlockCount} unlock${m.unlockCount === 1 ? '' : 's'}${m.coveredDays ? `, ${m.coveredDays} day${m.coveredDays === 1 ? '' : 's'} tracked` : ''}`}
                    style={{
                      position: 'relative', height: 26, borderRadius: 5, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, lineHeight: 1,
                      background: intensity > 0 ? `rgba(var(--ss-cat-2-rgb), ${intensity})` : 'var(--ss-track)',
                      border: `1px solid ${on ? 'var(--ss-chart-hi)' : 'transparent'}`,
                      color: intensity > 0.5 ? 'var(--ss-ink)' : 'var(--ss-ink3)',
                      transition: 'border-color 0.15s, transform 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                  >
                    {MONTH_INITIALS[month]}
                    {m.coveredDays > 0 && (
                      <span style={{
                        position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
                        width: 3, height: 3, borderRadius: '50%', background: 'var(--ss-accent)',
                      }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--ss-line-soft)', fontSize: 10.5, color: 'var(--ss-ink3)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'flex', gap: 2 }}>
            {[0.2, 0.45, 0.8].map(a => (
              <span key={a} style={{ width: 9, height: 9, borderRadius: 2, background: `rgba(var(--ss-cat-2-rgb), ${a})` }} />
            ))}
          </span>
          Achievement volume
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--ss-accent)' }} />
          Has playtime coverage
        </span>
      </div>
    </div>
  );
}

// ── Contextual notice ───────────────────────────────────────────────────
//
// The banner above the grid is a slot, not a fixture. Its correct state is
// ABSENT: once tracking is healthy there is nothing to say, and a permanent
// explainer would just be furniture the eye learns to skip — which is also
// what makes it useless on the day it finally matters.
//
// buildNotice returns null whenever the page can speak for itself. New
// conditions go here in priority order rather than as extra banners, so the
// page can never stack three of them.
const RECENT_WINDOW_DAYS = 30;
const GAP_NOTICE_THRESHOLD = 7;

export function buildNotice({ coverage, totalUnlocks, todayTs }) {
  // 1. Nothing to draw from yet — the only state that needs the long form.
  if (coverage.coveredDays === 0) {
    return {
      id: 'warmup',
      icon: '🌱',
      lead: 'Playtime tracking hasn’t got a full day yet.',
      body: 'Steam reports lifetime totals, not sessions, so a day has to be worked out from two readings taken a day apart — open the app tomorrow and the first one fills in.'
        + (totalUnlocks > 0 ? ' Your achievement unlocks are dated by Steam, so they’re already on the grid below.' : ''),
    };
  }

  // 2. Tracking works, but the app is being opened too rarely for the grid to
  //    be trustworthy. Actionable, so worth saying; self-clearing, so it goes
  //    away on its own once the habit is there.
  let uncoveredRecently = 0;
  const cursor = new Date(todayTs);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < RECENT_WINDOW_DAYS; i++) {
    const entry = coverage.byDate.get(cursor.toDateString());
    if (entry?.state === DAY_STATES.UNCOVERED) uncoveredRecently++;
    cursor.setDate(cursor.getDate() - 1);
  }
  if (uncoveredRecently >= GAP_NOTICE_THRESHOLD) {
    return {
      id: 'gaps',
      icon: '🕳️',
      lead: `${uncoveredRecently} of the last ${RECENT_WINDOW_DAYS} days have no coverage.`,
      body: 'Those are days Steam Stats wasn’t open, so their playtime can’t be pinned to a date — they’re marked rather than counted as zero. Opening the app daily closes the gaps from here on; it can’t fill in the ones already past.',
    };
  }

  return null;
}

// ── Snapshot recency ────────────────────────────────────────
//
// Everything on this page is downstream of "when did the app last take a
// reading", and until now the only place that was visible was a log behind a
// toggle in Settings. The Dashboard's "Synced" line is a different fact (the
// last API fetch), so it can't stand in for this.
function SnapshotStatus({ meta, archive }) {
  if (meta.count === 0 && !archive) return null;

  const lastLabel = meta.last
    ? (meta.takenToday
        ? `today at ${new Date(meta.last).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
        : formatLastPlayed(Math.floor(meta.last / 1000)).toLowerCase())
    : null;

  // The archive can legitimately hold more than the local working set, and
  // that difference is the whole point of it — so show both numbers.
  const deeper = archive && archive.total > meta.count;

  return (
    <div className="ss-panel" style={{
      padding: '12px 18px', display: 'flex', alignItems: 'center',
      gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--ss-ink2)',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: meta.takenToday ? 'var(--ss-cat-3)' : 'var(--ss-cat-4)',
        boxShadow: `0 0 8px ${meta.takenToday ? 'var(--ss-cat-3)' : 'var(--ss-cat-4)'}`,
      }} />
      {lastLabel
        ? <span>Last reading <strong style={{ color: 'var(--ss-ink)', fontWeight: 500 }}>{lastLabel}</strong></span>
        : <span>No reading taken yet</span>}
      <span style={{ color: 'var(--ss-ink4)' }}>·</span>
      <span>{meta.takenToday ? 'next one tomorrow' : 'a new one is taken each day you open the app'}</span>
      <span style={{ height: 1, flex: 1, minWidth: 20, background: 'var(--ss-line-soft)' }} />
      <span style={{ color: 'var(--ss-ink3)' }}>
        {meta.count} kept locally{deeper ? ` · ${archive.total} in the archive` : ''}
        {meta.count >= SNAPSHOT_RETENTION_DAYS ? ` (${SNAPSHOT_RETENTION_DAYS}-day working set)` : ''}
      </span>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────
export default function Calendar() {
  const { ownedGames, achCache, config, steamId, getAchievementsForGames } = useApp();

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [cursor, setCursor] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }));
  const [selectedKey, setSelectedKey] = useState(null);
  const [gameFilter, setGameFilter] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Same warm-up History does — the unlock layer is what gives this page
  // anything to show for dates before snapshot tracking began.
  const playedGames = useMemo(
    () => ownedGames.filter(g => g.playtime_forever > 0).sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 100),
    [ownedGames]
  );
  useEffect(() => {
    if (!config?.apiKey || !config?.steamId || playedGames.length === 0) return;
    getAchievementsForGames(playedGames.map(g => g.appid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playedGames.length, config?.apiKey, config?.steamId]);

  // Two-stage: the local 90-day working set renders instantly, then the full
  // archive replaces it when it answers. Without the deep pass, any month
  // older than the working set would resolve as "before tracking started" —
  // which stops being true the moment the archive outgrows 90 days.
  const localCoverage = useMemo(() => computeDailyCoverage(steamId), [steamId, ownedGames]);
  const [archiveCoverage, setArchiveCoverage] = useState(null);
  useEffect(() => {
    if (!steamId) return;
    let cancelled = false;
    computeArchiveCoverage(steamId).then(c => { if (!cancelled && c) setArchiveCoverage(c); });
    return () => { cancelled = true; };
  }, [steamId, ownedGames]);
  const coverage = archiveCoverage || localCoverage;

  const unlocksByDate = useMemo(() => computeDailyUnlocks(achCache), [achCache]);
  const snapshotMeta = useMemo(() => getSnapshotMeta(steamId), [steamId, ownedGames]);

  // How much the durable archive holds, which can exceed the local working
  // set. Best-effort: the page is fully usable without it.
  const [archiveStats, setArchiveStats] = useState(null);
  useEffect(() => {
    if (!steamId) return;
    let cancelled = false;
    fetch(`/api/snapshots/${steamId}/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setArchiveStats(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [steamId]);

  const nameByAppId = useMemo(() => {
    const m = new Map();
    for (const g of ownedGames) m.set(String(g.appid), g.name);
    return m;
  }, [ownedGames]);
  const nameFor = (appid) => nameByAppId.get(String(appid)) || `App ${appid}`;

  const todayKey = today.toDateString();
  const todayTs = today.getTime();

  // Which games are worth offering as filters — only ones with tracked time.
  const filterGames = useMemo(() => {
    const totals = new Map();
    for (const d of coverage.byDate.values()) {
      for (const g of (d.games || [])) totals.set(g.appid, (totals.get(g.appid) || 0) + g.minutes);
    }
    return [...totals.entries()].sort(([, a], [, b]) => b - a).slice(0, 6).map(([appid]) => appid);
  }, [coverage]);

  useEffect(() => { if (gameFilter && !filterGames.includes(gameFilter)) setGameFilter(null); }, [filterGames, gameFilter]);

  // ── Cells for the month on screen ───────────────────────────────────
  const cells = useMemo(() => {
    const { year, month } = cursor;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const key = d.toDateString();
      const entry = resolveDayState(key, d.getTime(), coverage, todayTs);
      let state = entry.state;
      let minutes = entry.minutes;
      if (gameFilter) {
        const hit = (entry.games || []).find(g => g.appid === gameFilter);
        minutes = hit?.minutes || 0;
        if (state === DAY_STATES.PLAYED && minutes === 0) state = DAY_STATES.IDLE;
      }
      days.push({
        day, key, state, minutes,
        timestamp: d.getTime(),
        unlockCount: gameFilter
          ? (unlocksByDate.get(key)?.games.find(g => String(g.appid) === String(gameFilter))?.achievements.length || 0)
          : (unlocksByDate.get(key)?.count || 0),
      });
    }
    return { lead: startOfMonthGrid(year, month), days };
  }, [cursor, coverage, unlocksByDate, todayTs, gameFilter]);

  const monthMax = useMemo(() => Math.max(...cells.days.map(c => c.minutes), 1), [cells]);
  const visibleStates = useMemo(() => new Set(cells.days.map(c => c.state)), [cells]);

  const summary = useMemo(
    () => computeMonthSummary(cursor.year, cursor.month, coverage, unlocksByDate, todayTs),
    [cursor, coverage, unlocksByDate, todayTs]
  );

  // The comparison a 90-day window can never make. Only meaningful once the
  // archive actually reaches back a year, so it stays silent until then.
  const lastYear = useMemo(
    () => computeMonthSummary(cursor.year - 1, cursor.month, coverage, unlocksByDate, todayTs),
    [cursor, coverage, unlocksByDate, todayTs]
  );

  const daysElapsed = useMemo(() => {
    const { year, month } = cursor;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    if (year === today.getFullYear() && month === today.getMonth()) return today.getDate();
    if (new Date(year, month, 1).getTime() > todayTs) return 0;
    return daysInMonth;
  }, [cursor, today, todayTs]);

  // ── Month strip range: everything either data source can speak to ────
  const months = useMemo(() => {
    const stamps = [];
    if (coverage.firstTracked) stamps.push(coverage.firstTracked);
    for (const key of unlocksByDate.keys()) stamps.push(new Date(key).getTime());
    if (stamps.length === 0) return [];
    const earliest = new Date(Math.min(...stamps));
    const out = [];
    const c = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 1);
    while (c <= end) {
      const year = c.getFullYear();
      const month = c.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      let unlockCount = 0;
      let coveredDays = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const key = new Date(year, month, day).toDateString();
        unlockCount += unlocksByDate.get(key)?.count || 0;
        const st = coverage.byDate.get(key)?.state;
        if (st === DAY_STATES.PLAYED || st === DAY_STATES.IDLE) coveredDays++;
      }
      out.push({ key: `${year}-${month}`, year, month, unlockCount, coveredDays });
      c.setMonth(c.getMonth() + 1);
    }
    return out.slice(-36);
  }, [coverage, unlocksByDate, today]);

  // Rarity only for the games on the selected day, fetched when that day is
  // opened rather than up front — the whole library's percentages would be a
  // large fan-out for a tooltip most days never show. Accumulates across
  // selections so revisiting a day is instant.
  const [rarity, setRarity] = useState({});
  const selectedUnlocks = selectedKey ? unlocksByDate.get(selectedKey) : null;
  const rarityWanted = useMemo(
    () => (selectedUnlocks?.games || []).map(g => g.appid).filter(id => !(id in rarity)),
    [selectedUnlocks, rarity]
  );
  useEffect(() => {
    if (rarityWanted.length === 0) return;
    let cancelled = false;
    fetchAchievementRarity(rarityWanted).then(res => {
      if (cancelled) return;
      // Seed every requested appid, even ones Steam had nothing for, so a
      // miss isn't re-requested on every hover.
      const next = {};
      for (const id of rarityWanted) next[id] = res[id] || {};
      setRarity(prev => ({ ...prev, ...next }));
    });
    return () => { cancelled = true; };
  }, [rarityWanted]);

  const selectedCell = selectedKey ? cells.days.find(c => c.key === selectedKey) : null;
  const selectedEntry = selectedKey ? resolveDayState(selectedKey, selectedCell?.timestamp ?? 0, coverage, todayTs) : null;

  const totalTrackedMinutes = useMemo(() => {
    let sum = 0;
    for (const d of coverage.byDate.values()) if (d.state === DAY_STATES.PLAYED) sum += d.minutes;
    return sum;
  }, [coverage]);
  const totalUnlocks = useMemo(() => {
    let sum = 0;
    for (const u of unlocksByDate.values()) sum += u.count;
    return sum;
  }, [unlocksByDate]);

  const latestDataMonth = [...months].reverse().find(m => m.coveredDays > 0 || m.unlockCount > 0);
  const atCurrentMonth = cursor.year === today.getFullYear() && cursor.month === today.getMonth();

  const shift = (delta) => {
    setSelectedKey(null);
    setPickerOpen(false);
    setCursor(c => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };
  const jumpTo = (year, month) => { setSelectedKey(null); setPickerOpen(false); setCursor({ year, month }); };

  // ── Header narrative, scaled to how much there actually is ──────────
  const hasCoverage = coverage.coveredDays > 0;
  const notice = useMemo(
    () => buildNotice({ coverage, totalUnlocks, todayTs }),
    [coverage, totalUnlocks, todayTs]
  );
  const title = hasCoverage
    ? <><span style={{ fontWeight: 600 }}>{coverage.coveredDays} day{coverage.coveredDays === 1 ? '' : 's'} tracked</span>, {coverage.playedDays} of them with playtime.</>
    : totalUnlocks > 0
      ? <><span style={{ fontWeight: 600 }}>{totalUnlocks.toLocaleString()} dated unlocks</span> to browse while playtime tracking warms up.</>
      : 'Your calendar starts today.';

  const subtitle = hasCoverage
    ? 'Day-level playtime is worked out by comparing daily readings, so it only covers days this app was open — days it can’t speak to are marked rather than drawn as zero. Every day ever recorded is kept, so this goes back as far as you’ve used the app; achievement unlocks are dated by Steam and reach back to your very first one.'
    : 'Day-level playtime needs two daily snapshots before it can show anything, so it begins once you’ve opened Steam Stats on two separate days. Achievement unlocks are dated by Steam itself and are available immediately.';

  return (
    <div style={{ padding: '34px 26px 120px', maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 26 }}>
      <PageHeader eyebrow="Calendar" title={title} subtitle={subtitle} />

      {/* Single row rather than a heading over a paragraph: whatever is being
          said here is temporary, so it shouldn't cost more vertical space
          than the grid it's explaining. Absent entirely when nothing needs
          saying — see buildNotice. */}
      {notice && (
        <div className="ss-panel" style={{
          padding: '14px 20px', display: 'flex', gap: 14,
          alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{notice.icon}</span>
          <p style={{ margin: 0, flex: 1, minWidth: 280, fontSize: 13, lineHeight: 1.55, color: 'var(--ss-ink2)' }}>
            <strong style={{ color: 'var(--ss-ink)', fontWeight: 600 }}>{notice.lead}</strong>{' '}
            {notice.body}
          </p>
        </div>
      )}

      {gameFilter && (
        <CrossFilterBanner
          label={nameFor(gameFilter)}
          hint="calendar shows only this game’s days"
          onClear={() => setGameFilter(null)}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
        {/* Grid */}
        <section className="ss-panel" style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <button onClick={() => shift(-1)} className="ss-pill" aria-label="Previous month"
              style={{ width: 30, height: 30, padding: 0, justifyContent: 'center' }}>‹</button>

            {/* The month name is the jump control — navigation lives on the
                thing you'd already click to change months. */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setPickerOpen(o => !o)}
                disabled={months.length < 2}
                aria-expanded={pickerOpen}
                aria-haspopup="dialog"
                title={months.length < 2 ? undefined : 'Jump to another month'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '4px 10px 4px 8px', borderRadius: 10,
                  fontSize: 15, fontWeight: 600, color: 'var(--ss-ink)',
                  background: pickerOpen ? 'var(--ss-btn)' : 'transparent',
                  border: '1px solid ' + (pickerOpen ? 'var(--ss-line)' : 'transparent'),
                  cursor: months.length < 2 ? 'default' : 'pointer', transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (months.length >= 2 && !pickerOpen) e.currentTarget.style.background = 'var(--ss-btn)'; }}
                onMouseLeave={e => { if (!pickerOpen) e.currentTarget.style.background = 'transparent'; }}
              >
                {monthTitle(cursor.year, cursor.month)}
                {months.length >= 2 && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="var(--ss-ink3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: pickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                    <path d="M2.5 4.5L6 8l3.5-3.5" />
                  </svg>
                )}
              </button>
              {pickerOpen && (
                <MonthPicker
                  months={months}
                  activeKey={`${cursor.year}-${cursor.month}`}
                  onPick={jumpTo}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>

            <button onClick={() => shift(1)} disabled={atCurrentMonth} className="ss-pill" aria-label="Next month"
              style={{ width: 30, height: 30, padding: 0, justifyContent: 'center', opacity: atCurrentMonth ? 0.35 : 1, cursor: atCurrentMonth ? 'default' : 'pointer' }}>›</button>
            <span style={{ height: 1, flex: 1, background: 'var(--ss-line-soft)' }} />
            {!atCurrentMonth && (
              <button onClick={() => jumpTo(today.getFullYear(), today.getMonth())} className="ss-pill">Today</button>
            )}
          </div>

          {filterGames.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
              <FilterPill label="All games" active={!gameFilter} onClick={() => setGameFilter(null)} />
              {filterGames.map(appid => (
                <FilterPill
                  key={appid}
                  label={nameFor(appid)}
                  active={gameFilter === appid}
                  onClick={() => setGameFilter(prev => prev === appid ? null : appid)}
                  onClear={() => setGameFilter(null)}
                />
              ))}
            </div>
          )}

          <MonthGrid
            cells={cells}
            selectedKey={selectedKey}
            todayKey={todayKey}
            monthMax={monthMax}
            onSelect={key => setSelectedKey(prev => prev === key ? null : key)}
          />
          <Legend states={visibleStates} hasUnlocks={cells.days.some(c => c.unlockCount > 0)} />
        </section>

        {/* Rail — the month by default, one day when a cell is picked. Never
            empty, so low-data months still land on something to read. */}
        <aside className="ss-panel" style={{
          padding: '22px 24px',
          position: 'sticky', top: 88,
          maxHeight: 'calc(100vh - 118px)', overflowY: 'auto',
        }}>
          {selectedCell && selectedEntry ? (
            <DayDetail
              cell={selectedCell}
              entry={selectedEntry}
              unlocks={unlocksByDate.get(selectedKey)}
              percentile={computeDayPercentile(selectedKey, coverage)}
              nameFor={nameFor}
              gameFilter={gameFilter}
              rarity={rarity}
              onClose={() => setSelectedKey(null)}
            />
          ) : (
            <MonthSummary
              year={cursor.year}
              month={cursor.month}
              summary={summary}
              lastYear={lastYear}
              daysElapsed={Math.max(daysElapsed, 1)}
              nameFor={nameFor}
              gameFilter={gameFilter}
              onJump={latestDataMonth ? () => jumpTo(latestDataMonth.year, latestDataMonth.month) : null}
              jumpLabel={latestDataMonth ? shortMonth(latestDataMonth.year, latestDataMonth.month) : ''}
            />
          )}
        </aside>
      </div>

      {/* Lifetime totals, below the thing they summarise. Deliberately kept
          apart from the month-scoped numbers in the rail so the two scopes
          never get read as the same figure. */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {[
          { label: 'Days tracked', value: hasCoverage ? coverage.coveredDays : '—', color: 'var(--ss-chart-hi)' },
          { label: 'Days played', value: hasCoverage ? coverage.playedDays : '—', color: 'var(--ss-ink)' },
          { label: 'Tracked hours', value: hasCoverage ? minutesToHours(totalTrackedMinutes).toFixed(0) : '—', color: 'var(--ss-cat-3)' },
          { label: 'Dated unlocks', value: totalUnlocks > 0 ? totalUnlocks.toLocaleString() : '—', color: 'var(--ss-cat-2)' },
        ].map(s => (
          <div key={s.label} className="ss-panel" style={{ flex: 1, minWidth: 160, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ss-ink3)', marginBottom: 8, fontWeight: 500 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 26, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Provenance, last — it's the footnote for everything above it. */}
      <SnapshotStatus meta={snapshotMeta} archive={archiveStats} />
    </div>
  );
}
