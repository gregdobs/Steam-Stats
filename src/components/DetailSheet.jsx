import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const MARGIN = 12; // gap between the clicked card and the floating panel

// Anchor-positioned floating popover — appears next to whatever was
// clicked (matches the card's DOMRect) rather than sliding in from the
// screen edge. Prefers the right of the anchor, falls back to the left,
// then clamps into the viewport if neither fits.
export default function DetailSheet({ open, onClose, anchorRect, width = 380, maxHeight = 560, children }) {
  const [pos, setPos] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    if (!anchorRect) { setPos({ top: 88, left: Math.max(MARGIN, window.innerWidth - width - MARGIN) }); return; }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clampedMaxHeight = Math.min(maxHeight, vh - MARGIN * 2);

    let left;
    if (anchorRect.right + MARGIN + width <= vw - MARGIN) {
      left = anchorRect.right + MARGIN;
    } else if (anchorRect.left - MARGIN - width >= MARGIN) {
      left = anchorRect.left - MARGIN - width;
    } else {
      left = Math.max(MARGIN, Math.min(anchorRect.left, vw - width - MARGIN));
    }

    const top = Math.min(
      Math.max(MARGIN, anchorRect.top + window.scrollY),
      window.scrollY + vh - clampedMaxHeight - MARGIN
    );

    setPos({ top, left });
  }, [open, anchorRect, width, maxHeight]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, zIndex: 399 }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="ss-panel"
        data-no-tilt
        style={{
          position: 'absolute',
          top: pos?.top ?? 0, left: pos?.left ?? 0,
          zIndex: 400, width, maxHeight: `min(${maxHeight}px, 85vh)`,
          padding: 0, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          outline: 'none',
          opacity: pos ? 1 : 0, pointerEvents: pos ? 'auto' : 'none',
          transition: 'opacity 0.12s ease',
          animation: 'ssRise 0.18s cubic-bezier(.22,1,.36,1) both',
        }}
      >
        <div style={{ overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </>,
    document.body
  );
}
