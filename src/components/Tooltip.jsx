import { useState, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const MARGIN = 8;

// Small themed hover tooltip — stands in for the browser's native `title`
// attribute (OS-styled, unthemed) with something that matches the glass
// design language. Anchored above the hovered element's rect, centered on
// it; pointer-events:none so it never blocks the element's own click.
//
// Renders off-screen first so its real width can be measured, then clamps
// against the actual viewport edge rather than just the anchor's center —
// a naive center-on-anchor placement clips off-screen for anchors near the
// left/right edge once the tooltip is wider than the remaining margin.
export default function Tooltip({ text, anchorRect, offset = 10 }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!anchorRect || !text || !ref.current) { setPos(null); return; }
    const vw = window.innerWidth;
    const { width, height } = ref.current.getBoundingClientRect();
    const cx = anchorRect.left + anchorRect.width / 2;
    const left = Math.min(Math.max(cx - width / 2, MARGIN), vw - width - MARGIN);
    const top = anchorRect.top + window.scrollY - offset - height;
    setPos({ top, left });
  }, [anchorRect, text, offset]);

  if (!text) return null;

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{
        position: 'absolute', top: pos?.top ?? -9999, left: pos?.left ?? -9999,
        zIndex: 500, pointerEvents: 'none',
        padding: '6px 11px', borderRadius: 10, maxWidth: 240,
        background: 'var(--ss-sheet)', border: '1px solid var(--ss-line)',
        boxShadow: 'var(--ss-shadow)',
        backdropFilter: 'blur(var(--ss-blur))', WebkitBackdropFilter: 'blur(var(--ss-blur))',
        fontSize: 12, color: 'var(--ss-ink)', lineHeight: 1.4,
        whiteSpace: 'nowrap',
        opacity: pos ? 1 : 0,
        transition: 'opacity 0.08s ease',
      }}
    >
      {text}
    </div>,
    document.body
  );
}
