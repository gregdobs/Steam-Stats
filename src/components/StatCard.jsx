const COLOR_MAP = {
  blue: { bg: 'var(--accent-blue-dim)', color: 'var(--accent-blue)' },
  emerald: { bg: 'var(--accent-emerald-dim)', color: 'var(--accent-emerald)' },
  amber: { bg: 'var(--accent-amber-dim)', color: 'var(--accent-amber)' },
  rose: { bg: 'var(--accent-rose-dim)', color: 'var(--accent-rose)' },
  violet: { bg: 'var(--accent-violet-dim)', color: 'var(--accent-violet)' },
};

export default function StatCard({ label, value, icon, color = 'blue', subtitle }) {
  const { bg, color: textColor } = COLOR_MAP[color] || COLOR_MAP.blue;

  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          {label}
        </div>
        <div style={{
          width: 32, height: 32, borderRadius: 'var(--radius-md)',
          background: bg, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 15,
        }}>
          {icon}
        </div>
      </div>
      <div className="stat-number" style={{ fontSize: 26, color: textColor }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
