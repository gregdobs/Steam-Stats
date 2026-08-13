// Shared visual-language primitives for the warm cream/rust redesign —
// used across all pages so the header/section/stat patterns and the
// categorical color set stay in one place instead of being redefined
// (with the old cool-toned palette) in every page file.

export const ACCENT_HEX = '#b4623c';

export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Alpha-graded steps of the accent color — brightest for the first item,
// fading out toward the last.
export function tint(i, n) {
  const alpha = 1 - (i / Math.max(n - 1, 1)) * 0.78;
  return hexToRgba(ACCENT_HEX, alpha.toFixed(3));
}

// The five warm categorical accents defined in index.css, for genres/
// buckets/statuses/rarity tiers that need visually distinct (not just
// alpha-graded) colors.
export const CATEGORY_COLORS = [
  'var(--accent-blue)', 'var(--accent-emerald)', 'var(--accent-amber)',
  'var(--accent-rose)', 'var(--accent-violet)',
];

export function categoryColor(i) {
  return CATEGORY_COLORS[i % CATEGORY_COLORS.length];
}

export function SectionHeading({ title, trailing }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 20 }}>
      <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        {title}
      </h2>
      <span style={{ height: 1, flex: 1, background: 'var(--border-subtle)' }} />
      {trailing && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{trailing}</span>}
    </div>
  );
}

export function StatCell({ label, value, first, last }) {
  return (
    <div style={{
      padding: `16px ${last ? 0 : 18}px 16px ${first ? 0 : 18}px`,
      borderLeft: first ? 'none' : '1px solid var(--border-default)',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 9 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 27, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

// The eyebrow-label + divider + big narrative headline + muted subtitle
// block repeated at the top of every page in the redesign.
export function PageHeader({ eyebrow, title, subtitle }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {eyebrow}
        </span>
        <span style={{ height: 1, flex: 1, background: 'var(--border-default)' }} />
      </div>
      <h1 style={{ margin: 0, fontSize: 'clamp(24px, 2.8vw, 36px)', lineHeight: 1.25, fontWeight: 400, letterSpacing: '-0.8px', color: 'var(--text-primary)', maxWidth: '26ch' }}>
        {title}
      </h1>
      {subtitle && (
        <p style={{ margin: '16px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '54ch' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

// Shared progress ring — was duplicated near-identically in Achievements.jsx
// and Completion.jsx, including a dark-theme-only translucent-white track
// and a stale "Space Grotesk" font reference. Track now uses a border token
// that works on both light and dark card backgrounds.
export function ProgressRing({ pct, size = 44, color }) {
  const r = (size - 6) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(pct, 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-default)" strokeWidth={4} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${circumference * (clamped / 100)} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="white" fontSize={size * 0.26} fontWeight={700} fontFamily="'DM Sans', sans-serif">
        {pct > 200 ? '200+' : pct}
      </text>
    </svg>
  );
}
