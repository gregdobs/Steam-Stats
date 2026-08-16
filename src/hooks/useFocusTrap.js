import { useEffect } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Keeps keyboard focus inside a modal/panel while it's open — without this,
// Tab silently walks a keyboard user out into the page content sitting
// behind the overlay. Moves focus in on open, cycles Tab/Shift+Tab at the
// panel's edges, and restores focus to whatever was focused before the
// panel opened.
//
// Both focus() calls pass preventScroll: true — anchor-positioned panels
// like DetailSheet already clamp their own position to stay inside the
// current viewport, so the browser's default focus-scroll-into-view is
// redundant at best. At worst it yanks the page back to wherever the
// pre-open focus target sits (e.g. a nav button up top), which is exactly
// what happened here: opening/closing a game's detail popover from deep in
// a long list was scrolling the whole page back to the top.
export default function useFocusTrap(active, containerRef) {
  useEffect(() => {
    if (!active || !containerRef.current) return;
    const container = containerRef.current;
    const previouslyFocused = document.activeElement;

    const focusables = () => Array.from(container.querySelectorAll(FOCUSABLE));
    const first = focusables()[0];
    (first || container).focus({ preventScroll: true });

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (els.length === 0) return;
      const firstEl = els[0];
      const lastEl = els[els.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus({ preventScroll: true });
    };
  }, [active, containerRef]);
}
