import { formatLastPlayed } from '../utils/steam.js';
import DetailSheet from './DetailSheet.jsx';

// Per-achievement detail — hero icon, description, how rare it is among
// everyone who owns the game, and the user's overall completion in that
// game. Renders inside the shared DetailSheet slide-in shell.
export default function AchievementDetailPanel({ achievement, achData, anchorRect, onClose }) {
  if (!achievement) return null;

  const oneIn = achievement.percent > 0 ? Math.round(100 / achievement.percent) : null;
  const gamePct = achData?.pct ?? null;

  return (
    <DetailSheet open={!!achievement} onClose={onClose} anchorRect={anchorRect}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 150, background: 'var(--ss-inset)', position: 'relative', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {achievement.icon ? (
            <img src={achievement.icon} alt="" width={96} height={96} style={{ borderRadius: 16 }} onError={e => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <div style={{ fontSize: 48 }}>🏆</div>
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'var(--ss-scrim)' }} />
          <button
            onClick={onClose} aria-label="Close"
            style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%', background: 'var(--ss-btn)', border: '1px solid var(--ss-line)', color: 'var(--ss-ink)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}
          >✕</button>
          <div style={{ position: 'absolute', bottom: 12, left: 16, fontSize: 11, fontWeight: 500, color: 'var(--ss-ink2)' }}>{achievement.gameName}</div>
        </div>

        <div style={{ padding: '18px 22px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ss-ink)', lineHeight: 1.3 }}>{achievement.displayName}</div>
            {achievement.description && (
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ss-ink2)', lineHeight: 1.5 }}>{achievement.description}</p>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Unlocked', value: achievement.unlocktime ? formatLastPlayed(achievement.unlocktime) : '—', color: 'var(--ss-ink2)' },
              { label: 'Rarity', value: achievement.percent < 1 ? `${achievement.percent.toFixed(1)}%` : `${Math.round(achievement.percent)}%`, color: 'var(--ss-cat-2)' },
              oneIn && { label: '1 in', value: oneIn.toLocaleString(), color: 'var(--ss-cat-4)' },
              gamePct != null && { label: 'Game completion', value: `${gamePct}%`, color: 'var(--ss-accent)' },
            ].filter(Boolean).map(s => (
              <div key={s.label} style={{ padding: '9px 11px', background: 'var(--ss-inset)', borderRadius: 14, border: '1px solid var(--ss-line-soft)' }}>
                <div style={{ fontSize: 10, color: 'var(--ss-ink3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: 'var(--ss-ink3)' }}>How rare among all owners</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ss-cat-2)' }}>{achievement.percent < 1 ? achievement.percent.toFixed(1) : Math.round(achievement.percent)}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'var(--ss-track)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(achievement.percent, 100)}%`, background: 'var(--ss-cat-2)' }} />
            </div>
            {oneIn && (
              <div style={{ fontSize: 10.5, color: 'var(--ss-ink4)', marginTop: 4 }}>
                About 1 in {oneIn.toLocaleString()} of everyone who owns {achievement.gameName} has this.
              </div>
            )}
          </div>

          {gamePct != null && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: 'var(--ss-ink3)' }}>Your completion in {achievement.gameName}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ss-accent)' }}>{gamePct}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: 'var(--ss-track)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(gamePct, 100)}%`, background: 'var(--ss-chart-grad)' }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </DetailSheet>
  );
}
