import { useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import GameDetailPanel from './GameDetailPanel.jsx';

const MARGIN = 12;

// Read-only preview popover — renders the same GameDetailPanel content shown
// when a game is clicked elsewhere, but anchored to a hover target and
// dismissed on mouse-leave rather than click-away. pointerEvents:none so it
// never steals the click the caller uses for its own action (e.g. filtering).
export default function GameHoverCard({ game, achData, hltbData, anchorRect, width = 340, maxHeight = 480 }) {
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!anchorRect) { setPos(null); return; }
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
  }, [anchorRect, width, maxHeight]);

  if (!game || !pos) return null;

  return createPortal(
    <div
      className="ss-panel"
      style={{
        position: 'absolute', top: pos.top, left: pos.left, zIndex: 400,
        width, maxHeight: `min(${maxHeight}px, 85vh)`, padding: 0, overflow: 'hidden',
        pointerEvents: 'none', animation: 'ssFade 0.12s ease',
      }}
    >
      <div style={{ overflowY: 'auto', maxHeight: '100%' }}>
        <GameDetailPanel game={game} achData={achData} hltbData={hltbData} inline />
      </div>
    </div>,
    document.body
  );
}
