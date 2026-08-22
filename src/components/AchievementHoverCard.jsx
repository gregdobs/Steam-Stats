import { useState, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const MARGIN = 12;

// Slimmed-down sibling of AchievementDetailPanel: the same facts about an
// achievement, minus the hero image, the completion breakdown and the close
// button, because this appears on hover rather than on click. Two questions
// only — what was it for, and how rare is it — which is all the Calendar's
// day rail has room to answer without becoming a second page.
//
// pointerEvents:none so it can never intercept a click meant for the icon
// underneath, matching GameHoverCard's behaviour. (The anchoring maths below
// is deliberately the same as GameHoverCard's and DetailSheet's; if a fourth
// popover shows up it's worth extracting rather than copying again.)
export default function AchievementHoverCard({ achievement, gameName, percent, anchorRect, width = 280 }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!anchorRect || !ref.current) { setPos(null); return; }
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Right first, matching GameHoverCard — reading order puts the card after
    // the thing it describes — then left when the right edge won't take it,
    // then clamped into view as a last resort for a viewport too narrow for
    // either side.
    let left;
    if (anchorRect.right + MARGIN + width <= vw - MARGIN) {
      left = anchorRect.right + MARGIN;
    } else if (anchorRect.left - MARGIN - width >= MARGIN) {
      left = anchorRect.left - MARGIN - width;
    } else {
      left = Math.max(MARGIN, Math.min(anchorRect.left, vw - width - MARGIN));
    }

    // Measured rather than estimated: this card's height swings with the
    // length of the description and with whether rarity has arrived yet, so a
    // fixed guess would either clip the bottom on a long one or float a short
    // one away from its icon.
    const height = ref.current.offsetHeight;
    const top = Math.min(
      Math.max(MARGIN, anchorRect.top + window.scrollY - 8),
      window.scrollY + vh - height - MARGIN
    );

    setPos({ top, left });
    // `percent` is a dependency because rarity loading in changes the height
    // after the first measurement.
  }, [anchorRect, width, achievement, percent]);

  if (!achievement) return null;

  const oneIn = percent > 0 ? Math.round(100 / percent) : null;
  const pctLabel = percent == null ? null : percent < 1 ? `${percent.toFixed(1)}%` : `${Math.round(percent)}%`;

  return createPortal(
    <div
      ref={ref}
      className="ss-panel"
      data-no-tilt
      style={{
        position: 'absolute',
        // Rendered before it's placed so its height can be measured, but kept
        // invisible for that frame rather than flashing at the origin.
        top: pos?.top ?? 0, left: pos?.left ?? 0, zIndex: 400,
        width, padding: '14px 16px',
        opacity: pos ? 1 : 0,
        pointerEvents: 'none', animation: 'ssFade 0.12s ease',
      }}
    >
      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <span style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
          background: 'var(--ss-inset)', border: '1px solid var(--ss-line-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {achievement.icon
            ? <img src={achievement.icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
            : <span style={{ fontSize: 18 }}>🏆</span>}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ss-ink)', lineHeight: 1.3 }}>
            {achievement.displayName || achievement.apiname}
          </div>
          {gameName && (
            <div style={{ fontSize: 11, color: 'var(--ss-ink3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {gameName}
            </div>
          )}
        </div>
      </div>

      {achievement.description && (
        <p style={{ margin: '11px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--ss-ink2)' }}>
          {achievement.description}
        </p>
      )}

      {/* Rarity is fetched lazily, so it simply isn't drawn until it arrives —
          no spinner, no placeholder number that might be wrong. */}
      {percent != null && (
        <div style={{ marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--ss-line-soft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
            <span style={{ fontSize: 10.5, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--ss-ink3)' }}>
              Owners who have it
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ss-cat-2)' }}>{pctLabel}</span>
          </div>
          <div style={{ height: 5, borderRadius: 99, background: 'var(--ss-track)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 99, width: `${Math.max(1, Math.min(percent, 100))}%`, background: 'var(--ss-cat-2)' }} />
          </div>
          {oneIn > 1 && (
            <div style={{ fontSize: 10.5, color: 'var(--ss-ink4)', marginTop: 5 }}>
              About 1 in {oneIn.toLocaleString()} of everyone who owns it.
            </div>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
