import { useEffect, useRef, useState } from 'react';
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, BarElement, BarController, LineController } from 'chart.js';
import { useApp } from '../hooks/useAppContext.jsx';
import { loadSnapshots, formatHours, computeDayOfWeekPattern } from '../utils/steam.js';
import { ACCENT_HEX, hexToRgba, PageHeader } from '../components/designSystem.jsx';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, BarElement, BarController, LineController);

// Chart.js can't consume CSS var() strings directly, so read the theme's
// resolved values at draw time instead of hardcoding a second light/dark
// palette here.
function readThemeColor(varName, fallback) {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}

function TrendChart({ trends, theme }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !trends || trends.length < 2) return;
    if (chartRef.current) chartRef.current.destroy();

    const textColor = readThemeColor('--text-muted', '#9a9084');
    const gridColor = readThemeColor('--border-subtle', 'rgba(42,38,33,0.07)');

    const labels = trends.map(t => {
      const d = new Date(t.timestamp);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Hours played',
          data: trends.map(t => t.hoursPlayed),
          borderColor: ACCENT_HEX,
          backgroundColor: hexToRgba(ACCENT_HEX, 0.1),
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: ACCENT_HEX,
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.parsed.y.toFixed(1)} hours played`,
              title: ctx => ctx[0].label,
            }
          }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor, maxTicksLimit: 10 } },
          y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => `${v}h` }, beginAtZero: true },
        }
      }
    });

    return () => chartRef.current?.destroy();
  }, [trends, theme]);

  if (!trends || trends.length < 2) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: 200, gap: 12, color: 'var(--text-muted)',
      }}>
        <div style={{ fontSize: 36 }}>📈</div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Building your history</p>
          <p style={{ fontSize: 13 }}>Each time you open the app, a snapshot is saved.</p>
          <p style={{ fontSize: 13 }}>Come back tomorrow for your first trend line.</p>
        </div>
      </div>
    );
  }

  return <div style={{ position: 'relative', width: '100%', height: 280 }}><canvas ref={canvasRef} /></div>;
}

function WeekdayPattern({ pattern }) {
  if (!pattern) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        Needs about two weeks of tracked days before a weekday pattern means anything.
      </div>
    );
  }

  const max = Math.max(...pattern.map(d => d.avgMinutes), 1);
  const peak = pattern.reduce((a, b) => (b.avgMinutes > a.avgMinutes ? b : a), pattern[0]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 140 }}>
        {pattern.map(d => {
          const barHeight = d.avgMinutes === 0 ? 3 : Math.max(6, Math.round((d.avgMinutes / max) * 140));
          const isPeak = d.label === peak.label && d.avgMinutes > 0;
          return (
            <div
              key={d.label}
              title={`${d.label}: ${formatHours(Math.round(d.avgMinutes))} avg over ${d.sampleCount} day${d.sampleCount === 1 ? '' : 's'} tracked`}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 8 }}
            >
              <div style={{
                width: '100%', maxWidth: 34, borderRadius: 6, height: barHeight,
                background: isPeak ? 'var(--accent-blue)' : hexToRgba(ACCENT_HEX, d.avgMinutes === 0 ? 0.12 : 0.45),
                transition: 'height 0.5s ease',
              }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{d.label}</span>
            </div>
          );
        })}
      </div>
      {peak.avgMinutes > 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
          <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{peak.label}</span> is your heaviest day on average — {formatHours(Math.round(peak.avgMinutes))}.
        </p>
      )}
    </div>
  );
}

function PlayHeatmap({ snapshots, ownedGames }) {
  // Build a map of appid -> game for name lookups
  const gameMap = new Map(ownedGames.map(g => [g.appid, g]));

  // Compute per-day deltas from sequential snapshots
  const dayData = {};

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const daysDiff = (curr.timestamp - prev.timestamp) / (1000 * 60 * 60 * 24);
    if (daysDiff > 5) continue;

    const prevMap = new Map((prev.games || []).map(g => [g.appid, g.playtime_forever]));
    let deltaMinutes = 0;

    for (const game of (curr.games || [])) {
      const prevTime = prevMap.get(game.appid) || 0;
      const delta = game.playtime_forever - prevTime;
      if (delta > 0) deltaMinutes += delta;
    }

    const dateKey = new Date(curr.timestamp).toDateString();
    dayData[dateKey] = (dayData[dateKey] || 0) + deltaMinutes;
  }

  // Build last 52 weeks grid
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 364);

  // Align to Monday
  while (startDate.getDay() !== 1) startDate.setDate(startDate.getDate() - 1);

  const weeks = [];
  let current = new Date(startDate);

  while (current <= today) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const dateKey = current.toDateString();
      const minutes = dayData[dateKey] || 0;
      week.push({ date: new Date(current), minutes });
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
  }

  const maxMinutes = Math.max(...Object.values(dayData), 60);

  const getColor = (minutes) => {
    if (minutes === 0) return 'var(--bg-tertiary)';
    const intensity = Math.min(minutes / maxMinutes, 1);
    if (intensity < 0.25) return hexToRgba(ACCENT_HEX, 0.25);
    if (intensity < 0.5) return hexToRgba(ACCENT_HEX, 0.5);
    if (intensity < 0.75) return hexToRgba(ACCENT_HEX, 0.75);
    return hexToRgba(ACCENT_HEX, 1);
  };

  const monthLabels = [];
  weeks.forEach((week, wi) => {
    const firstDay = week[0];
    if (firstDay.date.getDate() <= 7 || wi === 0) {
      monthLabels.push({
        label: firstDay.date.toLocaleDateString('en-US', { month: 'short' }),
        weekIndex: wi
      });
    }
  });

  const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const cellSize = 13;
  const gap = 2;

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Month labels */}
      <div style={{ display: 'flex', paddingLeft: 28, marginBottom: 4 }}>
        {weeks.map((_, wi) => {
          const ml = monthLabels.find(m => m.weekIndex === wi);
          return (
            <div key={wi} style={{ width: cellSize + gap, flexShrink: 0, fontSize: 10, color: 'var(--text-muted)' }}>
              {ml ? ml.label : ''}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        {/* Day labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap, paddingTop: 0 }}>
          {DAYS.map((d, i) => (
            <div key={i} style={{ height: cellSize, width: 16, fontSize: 9, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              {i % 2 === 0 ? d : ''}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div style={{ display: 'flex', gap }}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap }}>
              {week.map((day, di) => (
                <div
                  key={di}
                  title={`${day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}: ${day.minutes > 0 ? (day.minutes / 60).toFixed(1) + 'h played' : 'No data'}`}
                  style={{
                    width: cellSize, height: cellSize,
                    borderRadius: 2,
                    background: getColor(day.minutes),
                    border: day.minutes > 0 ? `1px solid ${hexToRgba(ACCENT_HEX, 0.2)}` : '1px solid var(--border-subtle)',
                    cursor: day.minutes > 0 ? 'default' : 'default',
                    transition: 'transform 0.1s',
                  }}
                  onMouseEnter={e => { if (day.minutes > 0) e.currentTarget.style.transform = 'scale(1.3)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, paddingLeft: 28 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map(i => (
          <div key={i} style={{
            width: cellSize, height: cellSize, borderRadius: 2,
            background: i === 0 ? 'var(--bg-tertiary)' : hexToRgba(ACCENT_HEX, i),
            border: '1px solid var(--border-subtle)',
          }} />
        ))}
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>More</span>
      </div>
    </div>
  );
}

export default function History() {
  const { historicalTrends, ownedGames, steamId, theme } = useApp();
  const snapshots = steamId ? loadSnapshots(steamId) : [];

  const totalSessions = snapshots.length;
  const totalDaysTracked = snapshots.length > 1
    ? Math.round((snapshots[snapshots.length - 1].timestamp - snapshots[0].timestamp) / (1000 * 60 * 60 * 24))
    : 0;

  const trendHours = historicalTrends || [];
  const avgWeeklyHours = trendHours.length > 0
    ? (trendHours.reduce((s, t) => s + t.hoursPlayed, 0) / trendHours.length).toFixed(1)
    : null;

  const peakWeek = trendHours.length > 0
    ? trendHours.reduce((max, t) => t.hoursPlayed > max.hoursPlayed ? t : max, trendHours[0])
    : null;

  const weekdayPattern = computeDayOfWeekPattern(steamId);

  return (
    <div style={{ padding: '56px 24px 96px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 40 }}>
        <PageHeader
          eyebrow="History"
          title={
            totalDaysTracked > 0
              ? <><span style={{ fontWeight: 600 }}>{totalDaysTracked} days</span> tracked, across {totalSessions} snapshot{totalSessions !== 1 ? 's' : ''}.</>
              : 'Play History'
          }
          subtitle="Accumulates the longer you use the app — trends, heatmap, and streaks all build from these daily snapshots."
        />
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Snapshots', value: totalSessions, icon: '📸', color: 'blue' },
          { label: 'Days Tracked', value: totalDaysTracked || '—', icon: '📅', color: 'violet' },
          { label: 'Avg / Period', value: avgWeeklyHours ? `${avgWeeklyHours}h` : '—', icon: '📊', color: 'emerald' },
          { label: 'Peak Period', value: peakWeek ? `${peakWeek.hoursPlayed}h` : '—', icon: '🔥', color: 'amber' },
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

      {/* Trend chart */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
          Playtime over time
        </h3>
        <TrendChart trends={historicalTrends} theme={theme} />
      </div>

      {/* Day-of-week pattern */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>
          Day-of-week pattern
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Average hours played, by weekday, from your daily snapshot history.
        </p>
        <WeekdayPattern pattern={weekdayPattern} />
      </div>

      {/* Heatmap */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>
          Play activity heatmap
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Based on daily snapshot deltas. Darker = more hours played that day.
        </p>
        <PlayHeatmap snapshots={snapshots} ownedGames={ownedGames} />
      </div>
    </div>
  );
}
