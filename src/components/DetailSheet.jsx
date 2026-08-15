import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Generic slide-in right-side detail sheet — scrim + fixed panel, replaces
// the old anchor-positioned floating popover. Callers no longer need to
// capture a click's DOMRect; `open` alone drives visibility.
export default function DetailSheet({ open, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 399,
          background: 'var(--ss-scrim)',
          animation: 'ssFade 0.2s ease',
        }}
      />
      <div
        ref={ref}
        tabIndex={-1}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 400,
          width: 'min(440px, 100vw)',
          overflowY: 'auto',
          background: 'var(--ss-sheet)',
          borderLeft: '1px solid var(--ss-line)',
          boxShadow: 'var(--ss-shadow)',
          backdropFilter: 'blur(var(--ss-blur)) saturate(var(--ss-sat))',
          WebkitBackdropFilter: 'blur(var(--ss-blur)) saturate(var(--ss-sat))',
          animation: 'ssRise 0.24s cubic-bezier(.22,1,.36,1) both',
          outline: 'none',
        }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}
