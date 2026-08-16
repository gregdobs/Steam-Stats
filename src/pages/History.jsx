import { useEffect, useState } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import {
  formatHours, formatLastPlayed,
  daysSincePlayed, recencyBucket, RECENCY_BUCKETS,
  computeMonthlyUnlocks, computeYearlyUnlocks,
} from '../utils/steam.js';
import { PageHeader, SectionHeading, chartRgba } from '../components/designSystem.jsx';
import { GameHeader } from '../components/GameImage.jsx';

// ── Achievement unlocks over time (month-by-month, click a point to drill) ─
const MONTH_RANGES = [['all', 'All months'], ['12', 'Last 12'], ['6', 'Last 6']];

function monthLabel(key) {
  const [y, m] = key.split('-');
  return new Date(Date.UTC(+y, +m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function fullMonthLabel(key) {
  const [y, m] = key.split('-');
  return new Date(Date.UTC(+y, +m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function MonthlyUnlocksChart({ months, appidToHeader }) {
  const [range, setRange] = useState('all');
  const [selected, setSelected] = useState(null);

  const shown = range === '12' ? months.slice(-12) : range === '6' ? months.slice(-6) : months;

  if (months.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ss-ink3)', fontSize: 13 }}>
        No dated achievement unlocks yet — visit the Achievements page to scan your games.
      </div>
    );
  }

  const max = Math.ceil(Math.max(...shown.map(m => m.count), 1) / 5) * 5 || 5;
  const X0 = 42, X1 = 940, Y0 = 16, Y1 = 220;
  const xs = i => shown.length === 1 ? (X0 + X1) / 2 : X0 + (i / (shown.length - 1)) * (X1 - X0);
  const ys = n => Y1 - (n / max) * (Y1 - Y0);
  const pts = shown.map((m, i) => ({ x: xs(i), y: ys(m.count), m }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = pts.length ? `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${Y1} L ${pts[0].x.toFixed(1)} ${Y1} Z` : '';
  const avg = Math.round(shown.reduce((s, m) => s + m.count, 0) / Math.max(shown.length, 1));
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => ({ y: Y1 - f * (Y1 - Y0), label: Math.round(max * f) }));

  const sel = selected ? shown.find(m => m.month === selected) : null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 14 }}>
        {MONTH_RANGES.map(([id, label]) => (
          <button key={id} onClick={() => setRange(id)} className={`ss-pill${range === id ? ' active' : ''}`}>{label}</button>
        ))}
      </div>
      <svg viewBox={`0 0 960 240`} width="100%" height={240} style={{ display: 'block', overflow: 'visible' }}>
        {gridLines.map((g, i) => (
          <line key={i} x1={X0} y1={g.y} x2={X1} y2={g.y} stroke="var(--ss-line-soft)" strokeWidth={1} />
        ))}
        {gridLines.map((g, i) => (
          <text key={i} x={X0 - 8} y={g.y} textAnchor="end" dominantBaseline="central" fill="var(--ss-ink4)" fontSize={10}>{g.label}</text>
        ))}
        <defs>
          <linearGradient id="unlockFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartRgba(0.4)} />
            <stop offset="100%" stopColor={chartRgba(0)} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#unlockFill)" />
        <path d={linePath} fill="none" stroke="var(--ss-chart-hi)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle
            key={i} cx={p.x} cy={p.y} r={p.m.month === selected ? 7 : 4.5}
            fill={p.m.month === selected ? 'var(--ss-chart-hi)' : 'var(--ss-accent)'}
            stroke="var(--ss-bg)" strokeWidth={2}
            style={{ cursor: 'pointer', transition: 'r 0.15s' }}
            onClick={() => setSelected(prev => prev === p.m.month ? null : p.m.month)}
          />
        ))}
        {pts.map((p, i) => (
          shown.length > 14 && i % 2 === 1 ? null : (
            <text key={i} x={p.x} y={234} textAnchor="middle" fill="var(--ss-ink4)" fontSize={10}>{monthLabel(p.m.month)}</text>
          )
        ))}
      </svg>

      {sel && (
        <div style={{
          marginTop: 20, padding: '18px 20px', borderRadius: 18,
          background: 'linear-gradient(160deg, var(--ss-pill-bg), transparent)',
          border: '1px solid var(--ss-pill-line)', animation: 'ssRise 0.2s ease both',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ss-ink)' }}>{monthLabel(sel.month)}</div>
              <div style={{ fontSize: 12, color: 'var(--ss-ink2)' }}>
                {sel.count} unlocked · {sel.count > avg ? 'above' : 'below'} the {avg}/month average shown here
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="ss-pill" style={{ width: 28, height: 28, padding: 0, justifyContent: 'center' }}>✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sel.games.slice(0, 6).map(g => {
              const header = appidToHeader?.(g.appid);
              const maxCount = sel.games[0]?.count || 1;
              return (
                <div key={g.appid} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <div style={{ width: 48, height: 24, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--ss-inset)' }}>{header}</div>
                  <span style={{ fontSize: 12.5, width: 160, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ss-ink)' }}>{g.name}</span>
                  <div style={{ flex: 1, height: 7, borderRadius: 99, background: 'var(--ss-track)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 99, width: `${(g.count / maxCount) * 100}%`, background: 'var(--ss-chart-grad)' }} />
                  </div>
                  <span style={{ fontSize: 12, width: 24, textAlign: 'right', color: 'var(--ss-ink2)' }}>{g.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── When you last touched each game ─────────────────────────────────────
function RecencyTouch({ ownedGames, appidToHeader }) {
  const [activeBucket, setActiveBucket] = useState(RECENCY_BUCKETS[0].id);

  const played = ownedGames.filter(g => g.playtime_forever > 0);
  const buckets = RECENCY_BUCKETS.map(b => {
    const games = played.filter(g => recencyBucket(daysSincePlayed(g)) === b.id);
    const hours = games.reduce((s, g) => s + (g.playtime_forever || 0), 0) / 60;
    return { ...b, games, count: games.length, hours };
  });

  if (played.length === 0) return null;

  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  const active = buckets.find(b => b.id === activeBucket) || buckets[0];
  const activeGames = [...active.games].sort((a, b) => (daysSincePlayed(a) ?? 0) - (daysSincePlayed(b) ?? 0)).slice(0, 5);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 130 }}>
        {buckets.map(b => {
          const on = b.id === activeBucket;
          const h = Math.max(6, Math.round((b.count / maxCount) * 100));
          return (
            <div key={b.id} onClick={() => setActiveBucket(b.id)} title={`${b.count} games · ${b.hours.toFixed(0)}h lifetime`} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 8, cursor: 'pointer' }}>
              <span style={{ fontSize: 11.5, color: on ? 'var(--ss-accent-txt)' : 'var(--ss-ink3)' }}>{b.count}</span>
              <div style={{ width: '100%', maxWidth: 44, borderRadius: 8, height: h, background: on ? 'var(--ss-chart-band)' : chartRgba(0.32), transition: 'height 0.4s ease, background 0.15s' }} />
              <span style={{ fontSize: 11, color: on ? 'var(--ss-ink)' : 'var(--ss-ink3)', textAlign: 'center', lineHeight: 1.25 }}>{b.label}</span>
            </div>
          );
        })}
      </div>
      {activeGames.length > 0 && (
        <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 14, background: 'var(--ss-inset)', border: '1px solid var(--ss-line-soft)' }}>
          <div style={{ fontSize: 12, color: 'var(--ss-ink2)', marginBottom: 10 }}>{active.count} games · {active.hours.toFixed(0)}h lifetime between them</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeGames.map(g => (
              <div key={g.appid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 44, height: 22, borderRadius: 5, overflow: 'hidden', flexShrink: 0, background: 'var(--ss-panel)' }}>{appidToHeader?.(g.appid)}</div>
                <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ss-ink)' }}>{g.name}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ss-ink3)', flexShrink: 0 }}>{formatLastPlayed(g.rtime_last_played || g.localLastPlayed)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Your Steam years ────────────────────────────────────────────────────
const SEGMENT_COLORS = ['var(--ss-cat-1)', 'var(--ss-cat-2)', 'var(--ss-cat-3)', 'rgba(255,255,255,.22)'];

function SteamYears({ years }) {
  const [isolated, setIsolated] = useState(null);

  if (years.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ss-ink3)', fontSize: 13 }}>
        No dated achievement unlocks yet.
      </div>
    );
  }

  const legendNames = [...new Set(years.flatMap(y => y.segments.map(s => s.name)))];

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {years.map(y => {
          const on = isolated === y.year;
          return (
            <div key={y.year} onClick={() => setIsolated(prev => prev === y.year ? null : y.year)} style={{
              cursor: 'pointer', padding: '7px 9px', borderRadius: 12, transition: 'background 0.15s',
              background: on ? 'var(--ss-btn)' : 'transparent',
              opacity: isolated && !on ? 0.4 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
                <span style={{ fontSize: 13, color: on ? 'var(--ss-accent-txt)' : 'var(--ss-ink)' }}>{y.year}</span>
                <span style={{ fontSize: 12, color: 'var(--ss-ink3)' }}>{y.count} unlocks · {y.gameCount} game{y.gameCount === 1 ? '' : 's'}</span>
              </div>
              <div style={{ display: 'flex', gap: 3, height: 15, borderRadius: 99, overflow: 'hidden', background: 'var(--ss-track)' }}>
                {y.segments.map((s, i) => (
                  <div key={s.name} title={`${s.name} — ${s.count} unlocks in ${y.year}`} style={{ width: `${s.pct * 100}%`, background: SEGMENT_COLORS[legendNames.indexOf(s.name) % SEGMENT_COLORS.length] }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px 16px', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--ss-line-soft)' }}>
        {legendNames.map((name, i) => (
          <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--ss-ink3)' }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />{name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────
export default function History() {
  const { ownedGames, achCache, config, getAchievementsForGames } = useApp();

  const playedGames = ownedGames.filter(g => g.playtime_forever > 0).sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 100);
  useEffect(() => {
    if (!config?.apiKey || !config?.steamId || playedGames.length === 0) return;
    getAchievementsForGames(playedGames.map(g => g.appid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playedGames.length, config?.apiKey, config?.steamId]);

  const monthlyUnlocks = computeMonthlyUnlocks(achCache, ownedGames);
  const yearlyUnlocks = computeYearlyUnlocks(achCache, ownedGames);
  const totalUnlocks = monthlyUnlocks.reduce((s, m) => s + m.count, 0);
  const firstUnlock = monthlyUnlocks[0]?.month;
  const busiest = monthlyUnlocks.reduce((max, m) => (!max || m.count > max.count) ? m : max, null);
  const monthlyAvg = monthlyUnlocks.length ? Math.round(totalUnlocks / monthlyUnlocks.length) : 0;

  const appidToHeader = (appid) => {
    const g = ownedGames.find(og => og.appid === Number(appid) || og.appid === appid);
    return g ? <GameHeader appId={g.appid} name={g.name} /> : null;
  };

  const sectionStyle = { padding: '26px 28px' };

  return (
    <div style={{ padding: '34px 26px 120px', maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 26 }}>
      <PageHeader
        eyebrow="History"
        title={
          totalUnlocks > 0
            ? <><span style={{ fontWeight: 600 }}>{totalUnlocks.toLocaleString()} dated events</span> going back to {fullMonthLabel(firstUnlock)}.</>
            : 'Play History'
        }
        subtitle="Steam timestamps every achievement unlock and the last time you opened each game. That is a real history — no local tracking required."
      />

      {/* Achievement-dated stats */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {[
          { label: 'Dated unlocks', value: totalUnlocks.toLocaleString(), color: 'var(--ss-chart-hi)' },
          { label: 'First on record', value: firstUnlock ? monthLabel(firstUnlock) : '—', color: 'var(--ss-ink)' },
          { label: 'Busiest month', value: busiest ? monthLabel(busiest.month) : '—', color: 'var(--ss-cat-2)' },
          { label: 'Monthly average', value: monthlyUnlocks.length ? `${monthlyAvg}` : '—', color: 'var(--ss-cat-3)' },
        ].map(s => (
          <div key={s.label} className="ss-panel" style={{ flex: 1, minWidth: 160, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ss-ink3)', marginBottom: 8, fontWeight: 500 }}>{s.label}</div>
            <div style={{ fontSize: 26, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Achievement unlocks over time */}
      <section className="ss-panel" style={sectionStyle}>
        <SectionHeading title="Achievement unlocks over time" />
        <p style={{ margin: '-12px 0 18px', fontSize: 12, color: 'var(--ss-ink3)' }}>
          Unlocks per month, dated from every achievement you own. Click a point to see which games they came from.
        </p>
        <MonthlyUnlocksChart months={monthlyUnlocks} appidToHeader={appidToHeader} />
      </section>

      {/* Last touched + Steam years */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gap: 18 }}>
        <section className="ss-panel" style={sectionStyle}>
          <SectionHeading title="When you last touched each game" />
          <p style={{ margin: '-12px 0 18px', fontSize: 12, color: 'var(--ss-ink3)' }}>
            All {playedGames.length < 100 ? playedGames.length : `${ownedGames.filter(g => g.playtime_forever > 0).length}`} played games bucketed by last-played date. Click a bar to expand.
          </p>
          <RecencyTouch ownedGames={ownedGames} appidToHeader={appidToHeader} />
        </section>

        <section className="ss-panel" style={sectionStyle}>
          <SectionHeading title="Your Steam years" />
          <p style={{ margin: '-12px 0 18px', fontSize: 12, color: 'var(--ss-ink3)' }}>
            Unlocks per year, split by your top games overall. Click a year to isolate it.
          </p>
          <SteamYears years={yearlyUnlocks} />
        </section>
      </div>
    </div>
  );
}
