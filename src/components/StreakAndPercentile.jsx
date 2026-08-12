import { useApp } from '../hooks/useAppContext.jsx';
import { computePlayStreak, computeTodayPercentile, computeWeeklyPercentile } from '../utils/steam.js';

// Small, low-key card — deliberately NOT a big celebratory streak counter.
// The forgiveness mechanic (grace days) and the "vs. your own history"
// framing (not vs. other players) are both there specifically to avoid the
// unhealthy-daily-grinding pattern that GitHub's public streak counter drew
// criticism for (see PROJECT_STATUS.md §5.2).
export default function StreakAndPercentile() {
  const { steamId } = useApp();

  const streak = steamId ? computePlayStreak(steamId) : null;
  const todayPct = steamId ? computeTodayPercentile(steamId) : null;
  const weekPct = steamId ? computeWeeklyPercentile(steamId) : null;

  // Nothing worth showing yet — don't take up space with an empty state
  // for a feature that just needs more days of use to become interesting.
  if (!streak && !todayPct && !weekPct) return null;

  return (
    <div className="card" style={{ padding: '18px 20px', marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
      {streak && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>{streak.currentStreak > 0 ? '🔥' : '💤'}</span>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
              {streak.currentStreak} day{streak.currentStreak === 1 ? '' : 's'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              current streak
              {streak.graceDaysRemaining > 0 && ` · ${streak.graceDaysRemaining} grace day${streak.graceDaysRemaining === 1 ? '' : 's'} left`}
            </div>
          </div>
        </div>
      )}

      {(todayPct?.label || weekPct?.label) && (
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-subtle)' }} />
      )}

      {todayPct?.label && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-blue)' }}>{todayPct.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>vs. your last {todayPct.sampleSize} tracked days</div>
        </div>
      )}

      {weekPct?.label && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-violet)' }}>{weekPct.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>vs. your last {weekPct.sampleSize} weeks</div>
        </div>
      )}
    </div>
  );
}
