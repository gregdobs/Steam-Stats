// Shared visual-language primitives for the glass redesign — used across all
// pages so the header/section/stat/pill/cross-filter patterns and the
// categorical color set stay in one place instead of being redefined per page.

// Alpha-graded steps of the chart accent color — brightest for the first
// item, fading out toward the last. CSS-native so it's theme-reactive without
// recomputation: each theme ships its own --ss-chart-rgb "R,G,B" triple.
// NOTE: only valid inside DOM inline styles/stylesheets — Canvas/Chart.js
// contexts can't resolve var(), see History.jsx's chart color handling.
export function chartRgba(alpha) {
  return `rgba(var(--ss-chart-rgb), ${alpha})`;
}

// Legacy warm-palette helpers — still imported by pages not yet migrated to
// the glass redesign (Dashboard/Library/History). Deleted once those pages'
// own phases land; new code should use chartRgba/tint above instead.
export const ACCENT_HEX = '#b4623c';
export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function tint(i, n) {
  const alpha = 1 - (i / Math.max(n - 1, 1)) * 0.78;
  return chartRgba(alpha.toFixed(3));
}

// 5 distinct categorical hues (genres/buckets/statuses that need visually
// distinct, not just alpha-graded, colors), one set per theme via --ss-cat-*.
export const CATEGORY_COLORS = [
  'var(--ss-cat-1)', 'var(--ss-cat-2)', 'var(--ss-cat-3)',
  'var(--ss-cat-4)', 'var(--ss-cat-5)',
];

export function categoryColor(i) {
  return CATEGORY_COLORS[i % CATEGORY_COLORS.length];
}

export function SectionHeading({ title, trailing }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 20 }}>
      <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--ss-ink3)' }}>
        {title}
      </h2>
      <span style={{ height: 1, flex: 1, background: 'var(--ss-line-soft)' }} />
      {trailing && <span style={{ fontSize: 12.5, color: 'var(--ss-ink3)' }}>{trailing}</span>}
    </div>
  );
}

export function StatCell({ label, value, first, last }) {
  return (
    <div style={{
      padding: `16px ${last ? 0 : 18}px 16px ${first ? 0 : 18}px`,
      borderLeft: first ? 'none' : '1px solid var(--ss-line)',
    }}>
      <div style={{ fontSize: 10.5, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--ss-ink3)', marginBottom: 9 }}>
        {label}
      </div>
      <div style={{ fontSize: 27, fontWeight: 500, color: 'var(--ss-ink)', lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

// The eyebrow-label + divider + big narrative headline + muted subtitle
// block repeated at the top of every page.
export function PageHeader({ eyebrow, title, subtitle }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span style={{ fontSize: 11, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ss-ink3)' }}>
          {eyebrow}
        </span>
        <span style={{ height: 1, flex: 1, background: 'var(--ss-line)' }} />
      </div>
      <h1 style={{ margin: 0, fontSize: 'clamp(24px, 2.8vw, 36px)', lineHeight: 1.25, fontWeight: 300, letterSpacing: '-0.8px', color: 'var(--ss-ink)', maxWidth: '26ch' }}>
        {title}
      </h1>
      {subtitle && (
        <p style={{ margin: '16px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--ss-ink2)', maxWidth: '54ch' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

// Shared progress ring — SVG arc over a track, used for completion/rarity/
// backlog-burndown percentages across every page.
export function ProgressRing({ pct, size = 44, color, textColor = 'var(--ss-ink)' }) {
  const r = (size - 6) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(pct, 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ss-track)" strokeWidth={4} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${circumference * (clamped / 100)} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill={textColor} fontSize={size * 0.26} fontWeight={700}>
        {pct > 200 ? '200+' : pct}
      </text>
    </svg>
  );
}

// Filter/cross-filter pills — a small pool of games/genres/buckets is
// selected and everything else on the page dims. Library/Dashboard/Progress
// all share this instead of three near-duplicate implementations.
export function FilterPill({ label, active, onClick, onClear }) {
  return (
    <button
      onClick={onClick}
      className="ss-pill"
      style={active ? { background: 'var(--ss-pill-bg)', borderColor: 'var(--ss-pill-line)', color: 'var(--ss-pill-ink)' } : undefined}
    >
      {label}
      {active && onClear && (
        <span
          onClick={e => { e.stopPropagation(); onClear(); }}
          style={{ marginLeft: 2, opacity: 0.7 }}
        >✕</span>
      )}
    </button>
  );
}

export function CrossFilterBanner({ label, hint = 'click again to clear', onClear }) {
  if (!label) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '10px 16px', borderRadius: 16,
      background: 'linear-gradient(160deg, var(--ss-pill-bg), transparent)',
      border: '1px solid var(--ss-pill-line)',
      animation: 'ssFade 0.2s ease',
      fontSize: 12.5, color: 'var(--ss-pill-ink)',
    }}>
      <span style={{ fontWeight: 500 }}>Cross-filter: {label}</span>
      <span style={{ color: 'var(--ss-ink3)' }}>{hint}</span>
      <button onClick={onClear} className="ss-pill" style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 11.5 }}>Clear</button>
    </div>
  );
}
