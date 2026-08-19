import { useState, useRef, useEffect } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import { formatHours, minutesToHours, getGameHeaderUrl, getGameHeroUrl, loadSnapshots, fetchGenres } from '../utils/steam.js';
import useFocusTrap from '../hooks/useFocusTrap.js';

const PERIODS = [
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'alltime', label: 'All Time' },
];

const GENRE_COLORS = {
  'Action': '#f43f5e', 'Adventure': '#f59e0b', 'RPG': '#8b5cf6', 'Strategy': '#3b82f6',
  'Simulation': '#10b981', 'Sports': '#06b6d4', 'Racing': '#fb923c', 'Indie': '#84cc16',
  'Casual': '#e879f9', 'Massively Multiplayer': '#6366f1', 'Free to Play': '#94a3b8', 'Early Access': '#eab308',
};
const getGenreColor = (g) => GENRE_COLORS[g] || '#64748b';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export default function ShareCard({ onClose }) {
  const { profile, ownedGames, recentGames, gamesPlayed, steamId } = useApp();
  const [period, setPeriod] = useState('week');
  const [generating, setGenerating] = useState(false);
  const [pngUrl, setPngUrl] = useState(null);
  const [genreData, setGenreData] = useState({});
  const canvasRef = useRef(null);
  const panelRef = useRef(null);
  useFocusTrap(true, panelRef);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Pre-fetch genres for the games likely to appear on the card so the
  // "mostly X & Y" chip can render without an extra loading state.
  useEffect(() => {
    const topAppIds = [...recentGames]
      .sort((a, b) => (b.playtime_2weeks || 0) - (a.playtime_2weeks || 0))
      .slice(0, 8)
      .map(g => g.appid);
    if (topAppIds.length === 0) return;
    fetchGenres(topAppIds).then(result => setGenreData(result.genres || {}));
  }, [recentGames.length]);

  const getStatsForPeriod = () => {
    if (period === 'alltime') {
      const sorted = [...ownedGames].filter(g => g.playtime_forever > 0).sort((a, b) => b.playtime_forever - a.playtime_forever);
      return {
        label: 'All Time',
        totalMinutes: ownedGames.reduce((s, g) => s + (g.playtime_forever || 0), 0),
        topGames: sorted.slice(0, 5).map(g => ({ ...g, displayMinutes: g.playtime_forever })),
        gameCount: sorted.length,
      };
    }
    const sorted = [...recentGames].sort((a, b) => (b.playtime_2weeks || 0) - (a.playtime_2weeks || 0));
    const topGames = sorted.slice(0, 5).map(rg => {
      const full = ownedGames.find(g => g.appid === rg.appid) || {};
      return { ...full, ...rg, displayMinutes: rg.playtime_2weeks };
    });
    return {
      label: 'Last 2 Weeks',
      totalMinutes: recentGames.reduce((s, g) => s + (g.playtime_2weeks || 0), 0),
      topGames,
      gameCount: recentGames.length,
    };
  };

  // Genre chip text — top 1-2 genres among the top games shown on the card
  const getGenreSummary = (topGames) => {
    const counts = {};
    for (const g of topGames) {
      const entry = genreData[g.appid];
      if (!entry?.genres?.length) continue;
      for (const genre of entry.genres) counts[genre] = (counts[genre] || 0) + 1;
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 2).map(([g]) => g);
  };

  // Last 7 days of activity from snapshots, for a small heatmap strip
  const getActivityStrip = () => {
    const snapshots = steamId ? loadSnapshots(steamId) : [];
    if (snapshots.length < 2) return [];
    const days = [];
    for (let i = Math.max(1, snapshots.length - 7); i < snapshots.length; i++) {
      const prev = snapshots[i - 1];
      const curr = snapshots[i];
      const prevMap = new Map((prev.games || []).map(g => [g.appid, g.playtime_forever]));
      let delta = 0;
      for (const g of (curr.games || [])) {
        const d = g.playtime_forever - (prevMap.get(g.appid) || 0);
        if (d > 0) delta += d;
      }
      days.push({ date: curr.date, minutes: delta });
    }
    return days;
  };

  const generateImage = async () => {
    setGenerating(true);
    setPngUrl(null);

    const stats = getStatsForPeriod();
    const genres = getGenreSummary(stats.topGames);
    const activityStrip = getActivityStrip();

    const W = 1080, H = 1500; // taller — more content
    const canvas = canvasRef.current;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // ── Background: duotone gradient derived from top game's dominant palette ──
    // (approximated with a fixed premium palette rather than pixel sampling,
    // which would need CORS-safe pixel access we can't guarantee from Steam's CDN)
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#0a0e1a');
    bgGrad.addColorStop(0.5, '#0f1729');
    bgGrad.addColorStop(1, '#0a0e1a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle radial glow behind the header for depth
    const glow = ctx.createRadialGradient(W / 2, 200, 0, W / 2, 200, 600);
    glow.addColorStop(0, 'rgba(59,130,246,0.12)');
    glow.addColorStop(1, 'rgba(59,130,246,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, 700);

    // Hero backdrop from top game, dimmed and faded
    if (stats.topGames[0]) {
      const heroImg = await loadImage(getGameHeroUrl(stats.topGames[0].appid));
      if (heroImg) {
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.drawImage(heroImg, 0, 0, W, H * 0.42);
        ctx.restore();
        const fadeGrad = ctx.createLinearGradient(0, H * 0.1, 0, H * 0.42);
        fadeGrad.addColorStop(0, 'rgba(10,14,26,0)');
        fadeGrad.addColorStop(1, 'rgba(10,14,26,1)');
        ctx.fillStyle = fadeGrad;
        ctx.fillRect(0, 0, W, H * 0.42);
      }
    }

    // ── Header ──
    ctx.fillStyle = '#3b82f6';
    ctx.font = '700 30px "Space Grotesk", sans-serif';
    ctx.fillText('🎮 Steam Stats', 60, 80);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '600 18px Inter, sans-serif';
    ctx.fillText(stats.label.toUpperCase(), 60, 112);

    if (profile) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 40px "Space Grotesk", sans-serif';
      ctx.fillText(profile.personaname, 60, 168);
    }

    // ── Big hours number ──
    const hours = minutesToHours(stats.totalMinutes);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 128px "Space Grotesk", sans-serif';
    ctx.fillText(`${Math.round(hours)}`, 60, 460);
    const bigNumWidth = ctx.measureText(`${Math.round(hours)}`).width;

    ctx.fillStyle = '#3b82f6';
    ctx.font = '700 42px "Space Grotesk", sans-serif';
    ctx.fillText('hours', 60 + bigNumWidth + 16, 460);

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '500 24px Inter, sans-serif';
    ctx.fillText(stats.label === 'All Time' ? 'played across your library' : 'played recently', 60, 500);

    // Genre chips
    if (genres.length > 0) {
      let chipX = 60;
      const chipY = 528;
      ctx.font = '600 16px Inter, sans-serif';
      for (const genre of genres) {
        const label = genre;
        const textW = ctx.measureText(label).width;
        const chipW = textW + 28;
        ctx.fillStyle = `${getGenreColor(genre)}30`;
        roundRect(ctx, chipX, chipY, chipW, 34, 17);
        ctx.fill();
        ctx.fillStyle = getGenreColor(genre);
        ctx.fillText(label, chipX + 14, chipY + 23);
        chipX += chipW + 10;
      }
    }

    // ── Stat cards row ──
    const cardY = 590;
    const cardH = 128;
    const cardGap = 18;
    const cardW = (W - 120 - cardGap * 2) / 3;
    const statCards = [
      { label: 'Games Played', value: stats.gameCount.toLocaleString(), color: '#10b981' },
      { label: 'Library Size', value: ownedGames.length.toLocaleString(), color: '#8b5cf6' },
      { label: 'Completion', value: `${Math.round((gamesPlayed / Math.max(ownedGames.length, 1)) * 100)}%`, color: '#f59e0b' },
    ];

    statCards.forEach((card, i) => {
      const x = 60 + i * (cardW + cardGap);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(ctx, x, cardY, cardW, cardH, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      roundRect(ctx, x, cardY, cardW, cardH, 16);
      ctx.stroke();

      ctx.fillStyle = card.color;
      ctx.font = '700 36px "Space Grotesk", sans-serif';
      ctx.fillText(card.value, x + 18, cardY + 58);

      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '500 15px Inter, sans-serif';
      ctx.fillText(card.label, x + 18, cardY + 92);
    });

    // ── Top games list (up to 5, small header rows) ──
    const gamesSectionY = cardY + cardH + 50;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '600 17px Inter, sans-serif';
    ctx.fillText('TOP GAMES', 60, gamesSectionY);

    const rowH = 82;
    const rowGap = 12;
    for (let i = 0; i < stats.topGames.length; i++) {
      const game = stats.topGames[i];
      const rowY = gamesSectionY + 24 + i * (rowH + rowGap);

      // Row background
      ctx.fillStyle = i === 0 ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.04)';
      roundRect(ctx, 60, rowY, W - 120, rowH, 14);
      ctx.fill();
      if (i === 0) {
        ctx.strokeStyle = 'rgba(59,130,246,0.3)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, 60, rowY, W - 120, rowH, 14);
        ctx.stroke();
      }

      // Cover thumbnail
      const thumbImg = await loadImage(getGameHeaderUrl(game.appid));
      const thumbW = 130, thumbH = rowH - 16;
      if (thumbImg) {
        ctx.save();
        roundRect(ctx, 72, rowY + 8, thumbW, thumbH, 8);
        ctx.clip();
        ctx.drawImage(thumbImg, 72, rowY + 8, thumbW, thumbH);
        ctx.restore();
      }

      // Rank badge
      ctx.fillStyle = i === 0 ? '#3b82f6' : 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(88, rowY + 22, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '700 14px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, 88, rowY + 27);
      ctx.textAlign = 'left';

      // Game name + hours
      const textX = 72 + thumbW + 22;
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 24px "Space Grotesk", sans-serif';
      const displayName = game.name && game.name.length > 26 ? game.name.slice(0, 24) + '…' : (game.name || 'Unknown');
      ctx.fillText(displayName, textX, rowY + 36);

      ctx.fillStyle = i === 0 ? '#60a5fa' : 'rgba(255,255,255,0.55)';
      ctx.font = '700 20px "Space Grotesk", sans-serif';
      ctx.fillText(formatHours(game.displayMinutes), textX, rowY + 64);
    }

    // ── Activity strip (last 7 tracked days) ──
    if (activityStrip.length > 0) {
      const stripY = gamesSectionY + 24 + stats.topGames.length * (rowH + rowGap) + 30;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '600 15px Inter, sans-serif';
      ctx.fillText('RECENT ACTIVITY', 60, stripY);

      const maxMinutes = Math.max(...activityStrip.map(d => d.minutes), 1);
      const barW = 40, barGap = 10, barMaxH = 44;
      const barsY = stripY + 20;
      activityStrip.forEach((day, i) => {
        const x = 60 + i * (barW + barGap);
        const h = Math.max(4, (day.minutes / maxMinutes) * barMaxH);
        ctx.fillStyle = day.minutes > 0 ? 'rgba(59,130,246,0.7)' : 'rgba(255,255,255,0.08)';
        roundRect(ctx, x, barsY + (barMaxH - h), barW, h, 4);
        ctx.fill();
      });
    }

    // ── Footer ──
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '500 16px Inter, sans-serif';
    ctx.fillText(`Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, 60, H - 40);

    const url = canvas.toDataURL('image/png');
    setPngUrl(url);
    setGenerating(false);
  };

  const download = () => {
    if (!pngUrl) return;
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = `steamstats-${period}-${Date.now()}.png`;
    a.click();
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        animation: 'fadeInFast 0.15s ease',
      }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="sharecard-modal-title" tabIndex={-1} style={{
        width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--ss-sheet)', borderRadius: '26px',
        border: '1px solid var(--ss-line)', boxShadow: 'var(--ss-shadow)',
        padding: 24, outline: 'none',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 id="sharecard-modal-title" style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--ss-ink)' }}>
            Share Card
          </h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'var(--ss-inset)', border: '1px solid var(--ss-line)', borderRadius: '14px', width: 30, height: 30, cursor: 'pointer', color: 'var(--ss-ink2)' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => { setPeriod(p.id); setPngUrl(null); }} className="btn btn-ghost" style={{
              fontSize: 12, flex: 1,
              background: period === p.id ? 'var(--ss-pill-bg)' : undefined,
              color: period === p.id ? 'var(--ss-accent)' : undefined,
              borderColor: period === p.id ? 'var(--ss-accent)' : undefined,
            }}>{p.label}</button>
          ))}
        </div>

        <canvas ref={canvasRef} style={{ display: pngUrl ? 'block' : 'none', width: '100%', borderRadius: '20px', marginBottom: 16 }} />

        {!pngUrl && (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <button className="btn btn-primary" onClick={generateImage} disabled={generating} style={{ fontSize: 14 }}>
              {generating ? '⟳ Generating...' : 'Generate Card'}
            </button>
          </div>
        )}

        {pngUrl && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={download} style={{ flex: 1, fontSize: 13, justifyContent: 'center' }}>
              ⬇ Download PNG
            </button>
            <button className="btn btn-ghost" onClick={generateImage} disabled={generating} style={{ fontSize: 13 }}>
              ↺ Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
