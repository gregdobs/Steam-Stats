import { useEffect } from 'react';

// Cursor-driven "liquid glass" tilt for card surfaces — .ss-panel,
// .ss-panel-hi, .card, .card-elevated, or the bare opt-in .ss-tilt (for
// bespoke cards that already own their background/border, e.g. Dashboard's
// hero capsules). One delegated listener mounted at the app root instead of
// per-card wiring, so every existing and future card gets the same
// treatment for free — see the matching --ss-tilt-* rules in index.css for
// the actual visual (a 3D rotation plus a light sheen whose brightness
// tracks how far the card is tilted, not the raw cursor position — no
// spotlight-follows-cursor highlight). Skipped entirely on touch/coarse
// pointers and prefers-reduced-motion. Surfaces meant for reading rather
// than admiring opt out entirely (self + descendants) via data-no-tilt —
// e.g. floating detail panels. Large, content-dense surfaces (data tables,
// long lists) opt just themselves out via data-tilt-flat instead: rotating
// a surface that tall/wide swings its far edges through many more pixels
// than the same angle does on a card (the arc scales with size, not just
// the angle), which reads as blur/judder rather than a material response,
// and hurts text legibility while reading rows — but nested cards inside
// still tilt individually, since only the container opts out.
const SELECTOR = '.ss-panel, .ss-panel-hi, .card, .card-elevated, .ss-tilt';
const MAX_DEG = 1.6;
const MAX_SCALE = 1.006;
const MAX_LIT = 0.28;
const FAST = '16ms linear';
const SETTLE = '.4s cubic-bezier(.16,1,.3,1)';

// A fixed rotation angle swings a card's far edge through more pixels the
// bigger that edge is (displacement = angle * half-the-edge, so it scales
// linearly with size) — the same MAX_DEG reads as a subtle tilt on a small
// stat tile but a visible swing on a large panel. Each rotation axis is
// scaled by the reciprocal of the dimension it swings (rotateX, driven by
// vertical cursor position, swings the top/bottom edges — scale it by
// height; rotateY swings the left/right edges — scale it by width). That
// cancels the size term exactly: edge displacement comes out to the same
// constant for every card at or above REF_SIZE, not just closer to it, so
// there's no floor to fall back to — the 1/dimension term never needs one.
// Cards smaller than REF_SIZE keep the full MAX_DEG (uncapped upward) and
// simply swing less in absolute pixels, which reads fine since they're
// already visually small.
const REF_SIZE = 288;

function eligible(el) {
  return el && !el.closest('[data-no-tilt]') && !el.hasAttribute('data-tilt-flat');
}

function apply(el, rect, clientX, clientY) {
  if (rect.width === 0 || rect.height === 0) return;
  const px = (clientX - rect.left) / rect.width;
  const py = (clientY - rect.top) / rect.height;
  const rowDeg = MAX_DEG * Math.min(1, REF_SIZE / rect.height);
  const colDeg = MAX_DEG * Math.min(1, REF_SIZE / rect.width);
  const rxDeg = (0.5 - py) * rowDeg * 2;
  const ryDeg = (px - 0.5) * colDeg * 2;
  // Magnitude (and thus sheen brightness) tracks cursor position within the
  // card, not the scaled-down angle, so the sheen response itself stays
  // consistent across card sizes even though the rotation doesn't.
  const magnitude = Math.min(1, Math.abs(0.5 - py) * 2 + Math.abs(px - 0.5) * 2);
  el.style.setProperty('--ss-tilt-t', FAST);
  el.style.setProperty('--ss-tilt-rx', `${rxDeg.toFixed(2)}deg`);
  el.style.setProperty('--ss-tilt-ry', `${ryDeg.toFixed(2)}deg`);
  el.style.setProperty('--ss-tilt-s', MAX_SCALE.toFixed(3));
  el.style.setProperty('--ss-tilt-lit', (magnitude * MAX_LIT).toFixed(3));
}

function reset(el) {
  el.style.setProperty('--ss-tilt-t', SETTLE);
  el.style.setProperty('--ss-tilt-rx', '0deg');
  el.style.setProperty('--ss-tilt-ry', '0deg');
  el.style.setProperty('--ss-tilt-s', '1');
  el.style.setProperty('--ss-tilt-lit', '0');
}

export default function GlassTilt() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let current = null;
    let currentRect = null;
    let raf = null;
    let pending = null;

    const onMove = (e) => {
      const target = e.target.closest?.(SELECTOR);
      const next = eligible(target) ? target : null;
      if (next !== current) {
        if (current) reset(current);
        current = next;
        currentRect = next ? next.getBoundingClientRect() : null;
      }
      if (!current) return;
      pending = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        if (current && pending) apply(current, currentRect, pending.clientX, pending.clientY);
      });
    };

    // Cached rect goes stale if the page scrolls or resizes under a held
    // hover — cheap to just refresh it on those events rather than
    // re-measuring every frame (the point of caching in the first place).
    const invalidate = () => { if (current) currentRect = current.getBoundingClientRect(); };
    window.addEventListener('scroll', invalidate, { passive: true, capture: true });
    window.addEventListener('resize', invalidate, { passive: true });

    // pointermove alone can't tell us when the cursor leaves the browser
    // window entirely (no element to report a "leave" on) — pointerout with
    // no relatedTarget is the signal for that case.
    const onLeaveWindow = (e) => {
      if (!e.relatedTarget && current) { reset(current); current = null; currentRect = null; }
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerout', onLeaveWindow, { passive: true });

    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onLeaveWindow);
      window.removeEventListener('scroll', invalidate, { capture: true });
      window.removeEventListener('resize', invalidate);
      if (raf) cancelAnimationFrame(raf);
      if (current) reset(current);
    };
  }, []);

  return null;
}
