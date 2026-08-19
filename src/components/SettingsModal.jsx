import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp, HLTB_CACHE_KEY, ACH_CACHE_KEY } from '../hooks/useAppContext.jsx';
import { saveConfig, formatHours, formatLastPlayed, clearServerMirrors,
  loadSteamLinkPref, saveSteamLinkPref, shouldUseSteamApp } from '../utils/steam.js';
import useFocusTrap from '../hooks/useFocusTrap.js';
import { GameHeader } from './GameImage.jsx';
import GameDetailPanel from './GameDetailPanel.jsx';
import { loadFeatureFlags, saveFeatureFlags } from './Navbar.jsx';
import { THEMES, BLUR_STEPS } from '../utils/themes.js';

// ── Toggle switch ──────────────────────────────────────────
function ToggleSwitch({ on, onChange, disabled }) {
  return (
    <button
      onClick={onChange}
      aria-checked={on}
      role="switch"
      disabled={disabled}
      style={{
        width: 40, height: 22, borderRadius: 99, padding: 2,
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background 0.2s',
        background: on ? 'var(--ss-accent)' : 'var(--ss-hi)',
        position: 'relative', flexShrink: 0,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: 'white',
        position: 'absolute', top: 2,
        left: on ? 20 : 2,
        transition: 'left 0.2s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

const SECTIONS = [
  { id: 'connection', label: 'Steam Connection', icon: '🔗' },
  { id: 'local',      label: 'Local Steam Path', icon: '📁' },
  { id: 'hltb',       label: 'HowLongToBeat',    icon: '🎯' },
  { id: 'display',    label: 'Display',           icon: '🎨' },
  { id: 'data',       label: 'Data & Cache',      icon: '🗄️' },
  { id: 'debug',      label: 'Debug Info',        icon: '🔧' },
];

// ── Shared primitives ──────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--ss-ink3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
        {title}
      </h3>
      <div style={{ background: 'var(--ss-inset)', borderRadius: '20px', border: '1px solid var(--ss-line-soft)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, description, children, last, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 16,
        padding: '16px 20px',
        borderBottom: last ? 'none' : '1px solid var(--ss-line-soft)',
        cursor: onClick ? 'pointer' : undefined,
        transition: onClick ? 'background 0.12s' : undefined,
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'var(--ss-btn-hi)'; }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.background = ''; }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ss-ink)', marginBottom: description ? 3 : 0 }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: 'var(--ss-ink3)', lineHeight: 1.5 }}>{description}</div>}
      </div>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {children}
      </div>
    </div>
  );
}

function StatusDot({ ok, warn, label }) {
  const color = ok ? 'var(--ss-cat-3)' : warn ? 'var(--ss-cat-4)' : 'var(--ss-cat-5)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
      <span style={{ fontSize: 13, color, fontWeight: 500 }}>{label}</span>
    </div>
  );
}

// ── Sub-modal shell ────────────────────────────────────────
function SubModal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      ref={ref}
      onClick={e => { if (e.target === ref.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'fadeInFast 0.15s ease',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 760, maxHeight: '85vh',
        background: 'var(--ss-sheet)', borderRadius: '26px',
        border: '1px solid var(--ss-line)', boxShadow: 'var(--ss-shadow)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'fadeIn 0.2s ease',
      }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--ss-line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--ss-ink)' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'var(--ss-inset)', border: '1px solid var(--ss-line)', borderRadius: '14px', width: 30, height: 30, cursor: 'pointer', fontSize: 14, color: 'var(--ss-ink2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Games modal ────────────────────────────────────────────
function GamesModal({ userData, ownedGames, onClose }) {
  const [selectedGame, setSelectedGame] = useState(null);
  const [search, setSearch] = useState('');

  // Build enriched game list from local data
  const localGames = Object.entries(userData.gamesData || {})
    .map(([appId, local]) => {
      const api = ownedGames.find(g => String(g.appid) === appId) || {};
      return {
        appid: parseInt(appId),
        name: api.name || `App ${appId}`,
        playtime_forever: api.playtime_forever || local.playtimeForever || 0,
        launchCount: local.launchCount,
        localLastPlayed: local.lastPlayed,
        rtime_last_played: api.rtime_last_played,
        playtime_2weeks: api.playtime_2weeks || 0,
        userTags: userData.tags?.[appId] || [],
        ...api,
      };
    })
    .filter(g => g.name && g.name !== `App ${g.appid}`)
    .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0));

  const filtered = search
    ? localGames.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
    : localGames;

  return (
    <SubModal title={`Local Game Data — ${localGames.length} games`} onClose={onClose}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--ss-line-soft)', flexShrink: 0 }}>
        <input
          className="input"
          type="text"
          placeholder="Search games..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: selectedGame ? '1fr 280px' : '1fr', gap: 0, height: '100%' }}>
        {/* Game list */}
        <div style={{ overflowY: 'auto', padding: '12px 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, padding: '0 12px' }}>
            {filtered.map(game => (
              <button
                key={game.appid}
                onClick={() => setSelectedGame(prev => prev?.appid === game.appid ? null : game)}
                style={{
                  background: selectedGame?.appid === game.appid ? 'var(--ss-pill-bg)' : 'var(--ss-inset)',
                  border: selectedGame?.appid === game.appid ? '1px solid var(--ss-accent)' : '1px solid var(--ss-line-soft)',
                  borderRadius: '14px', overflow: 'hidden',
                  cursor: 'pointer', textAlign: 'left', padding: 0,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (selectedGame?.appid !== game.appid) e.currentTarget.style.borderColor = 'var(--ss-hi)'; }}
                onMouseLeave={e => { if (selectedGame?.appid !== game.appid) e.currentTarget.style.borderColor = 'var(--ss-line-soft)'; }}
              >
                <div style={{ height: 52, background: 'var(--ss-btn-hi)', overflow: 'hidden' }}>
                  <GameHeader appId={game.appid} name={game.name} />
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ss-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
                    {game.name}
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                    <span style={{ color: 'var(--ss-accent)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                      {formatHours(game.playtime_forever)}
                    </span>
                    {game.launchCount && (
                      <span style={{ color: 'var(--ss-ink3)' }}>{game.launchCount}× launched</span>
                    )}
                  </div>
                  {game.localLastPlayed && (
                    <div style={{ fontSize: 10, color: 'var(--ss-ink3)', marginTop: 2 }}>
                      {formatLastPlayed(game.localLastPlayed)}
                    </div>
                  )}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center', color: 'var(--ss-ink3)', fontSize: 13 }}>
                No games found
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selectedGame && (
          <div style={{ borderLeft: '1px solid var(--ss-line-soft)', overflowY: 'auto' }}>
            <GameDetailPanel
              game={selectedGame}
              onClose={() => setSelectedGame(null)}
              inline
            />
          </div>
        )}
      </div>
    </SubModal>
  );
}

// ── Users modal ────────────────────────────────────────────
function UsersModal({ localConfig, ownedGames, onClose }) {
  const [selectedUser, setSelectedUser] = useState(null);

  const users = Object.values(localConfig?.users || {});

  return (
    <SubModal title={`Steam Users — ${users.length} found`} onClose={onClose}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {users.map(user => {
          const isSel = selectedUser?.userId === user.userId;
          const gameCount = user.gameCount || 0;
          const withLaunches = Object.values(user.gamesData || {}).filter(g => g.launchCount > 0).length;
          const totalLaunches = Object.values(user.gamesData || {}).reduce((s, g) => s + (g.launchCount || 0), 0);

          return (
            <div key={user.userId}>
              <button
                onClick={() => setSelectedUser(isSel ? null : user)}
                style={{
                  width: '100%', textAlign: 'left',
                  background: isSel ? 'var(--ss-pill-bg)' : 'var(--ss-inset)',
                  border: isSel ? '1px solid var(--ss-accent)' : '1px solid var(--ss-line-soft)',
                  borderRadius: '20px', padding: '16px 20px',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.borderColor = 'var(--ss-hi)'; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.borderColor = 'var(--ss-line-soft)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: `hsl(${(parseInt(user.userId) % 360)}, 60%, 50%)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, color: 'white', fontWeight: 700,
                      fontFamily: 'var(--font-display)',
                    }}>
                      {user.userId.slice(-2)}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ss-ink)', fontFamily: 'var(--font-display)' }}>
                        User ID: {user.userId}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ss-ink3)' }}>
                        Local Steam account
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: isSel ? 'var(--ss-accent)' : 'var(--ss-ink3)' }}>
                    {isSel ? '▲ Collapse' : '▼ Expand'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    { label: 'Games tracked', value: gameCount.toLocaleString(), color: 'var(--ss-accent)' },
                    { label: 'With launches', value: withLaunches.toLocaleString(), color: 'var(--ss-cat-3)' },
                    { label: 'Total launches', value: totalLaunches.toLocaleString(), color: 'var(--ss-cat-4)' },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '8px 10px', background: 'var(--ss-sheet)', borderRadius: '14px' }}>
                      <div style={{ fontSize: 10, color: 'var(--ss-ink3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 2 }}>{s.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </button>

              {/* Expanded: top games by launch count */}
              {isSel && (
                <div style={{ marginTop: 8, padding: '14px 16px', background: 'var(--ss-inset)', borderRadius: '20px', border: '1px solid var(--ss-line-soft)', animation: 'fadeIn 0.2s ease' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ss-ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 12 }}>
                    Top games by launch count
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(user.gamesData || {})
                      .filter(([, g]) => g.launchCount > 0)
                      .sort(([, a], [, b]) => (b.launchCount || 0) - (a.launchCount || 0))
                      .slice(0, 8)
                      .map(([appId, g]) => {
                        const apiGame = ownedGames.find(og => String(og.appid) === appId);
                        const name = apiGame?.name || `App ${appId}`;
                        const maxLaunches = Math.max(...Object.values(user.gamesData).map(g => g.launchCount || 0));
                        return (
                          <div key={appId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 20, borderRadius: 3, overflow: 'hidden', flexShrink: 0, background: 'var(--ss-btn-hi)' }}>
                              {apiGame && <GameHeader appId={apiGame.appid} name={name} />}
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--ss-ink2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                            <div style={{ flex: 1, height: 6, background: 'var(--ss-line)', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${(g.launchCount / maxLaunches) * 100}%`, background: 'var(--ss-accent)', borderRadius: 99 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--ss-accent)', width: 32, textAlign: 'right', flexShrink: 0 }}>{g.launchCount}×</span>
                          </div>
                        );
                      })}
                  </div>
                  {user.tags && Object.keys(user.tags).length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--ss-line-soft)' }}>
                      <div style={{ fontSize: 11, color: 'var(--ss-ink3)', marginBottom: 6 }}>Custom tags found: {Object.keys(user.tags).length} games tagged</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {users.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ss-ink3)', fontSize: 13 }}>
            No local Steam users found. Make sure Steam is installed and has been run at least once.
          </div>
        )}
      </div>
    </SubModal>
  );
}

// ── Connection Section ─────────────────────────────────────
function ConnectionSettings() {
  const { config, loadData, profile, dataLoaded } = useApp();
  const [apiKey, setApiKey]   = useState(config?.apiKey || '');
  const [steamUrl, setSteamUrl] = useState(config?.steamUrl || '');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  const handleSave = async () => {
    if (!apiKey || !steamUrl) return;
    setSaving(true);
    await loadData(apiKey, steamUrl);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const apiStatus = config?.apiKey && dataLoaded ? 'connected' : config?.apiKey ? 'key-set' : 'none';

  return (
    <Section title="Steam Connection">
      <Row label="API Status" description="Your Steam Web API key. Stored locally in your browser only.">
        {apiStatus === 'connected'
          ? <StatusDot ok label="Connected" />
          : apiStatus === 'key-set'
          ? <StatusDot warn label="Key set, not loaded" />
          : <StatusDot label="Not connected" />}
      </Row>
      <div style={{ padding: '0 20px 16px' }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ss-ink3)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>API Key</label>
        <input className="input" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Your Steam API key" style={{ marginBottom: 10 }} />
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ss-ink3)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>Profile URL or Steam ID</label>
        <input className="input" type="text" value={steamUrl} onChange={e => setSteamUrl(e.target.value)} placeholder="https://steamcommunity.com/profiles/..." style={{ marginBottom: 10 }} />
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !apiKey || !steamUrl} style={{ fontSize: 13 }}>
          {saving ? '⟳ Reconnecting...' : saved ? '✓ Saved & Reconnected' : 'Save & Reconnect'}
        </button>
      </div>
      {profile && (
        <Row label="Connected Profile" last>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={profile.avatarmedium} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ss-ink)' }}>{profile.personaname}</div>
              <div style={{ fontSize: 11, color: 'var(--ss-ink3)' }}>SteamID: {config?.steamId}</div>
            </div>
          </div>
        </Row>
      )}
    </Section>
  );
}

// ── Local Steam Path Section ───────────────────────────────
function LocalSteamSettings() {
  const { localConfig, ownedGames } = useApp();
  const [customPath, setCustomPath]   = useState('');
  const [testResult, setTestResult]   = useState(null);
  // Seeded from the resolved tri-state so the switch shows what links will
  // actually do today, not a raw stored value that may still be "auto".
  const [openLinksInSteam, setOpenLinksInSteam] = useState(
    () => shouldUseSteamApp(loadSteamLinkPref(), localConfig?.found)
  );

  // localConfig arrives asynchronously, so this modal can mount before
  // detection has answered. Re-resolve when it lands — but only while the
  // preference is still "auto", so an explicit choice is never clobbered.
  useEffect(() => {
    if (loadSteamLinkPref() === undefined) {
      setOpenLinksInSteam(!!localConfig?.found);
    }
  }, [localConfig?.found]);
  const [testing, setTesting]         = useState(false);
  const [applying, setApplying]       = useState(false);
  const [applied, setApplied]         = useState(false);
  const [showGames, setShowGames]     = useState(false);
  const [showUsers, setShowUsers]     = useState(false);

  // Pick the user with most game data
  const bestUser = localConfig?.users
    ? Object.values(localConfig.users).sort((a, b) => (b.gameCount || 0) - (a.gameCount || 0))[0]
    : null;

  const userCount  = localConfig?.users ? Object.keys(localConfig.users).length : 0;
  const totalGames = bestUser?.gameCount || 0;

  const handleTest = async () => {
    if (!customPath) return;
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch('/api/settings/test-steam-path', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamPath: customPath }),
      });
      setTestResult(await res.json());
    } catch (e) { setTestResult({ valid: false, error: e.message }); }
    setTesting(false);
  };

  const handleApply = async () => {
    if (!testResult?.valid || !customPath) return;
    setApplying(true);
    try {
      await fetch('/api/settings/set-steam-path', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamPath: customPath }),
      });
      setApplied(true);
      setTimeout(() => setApplied(false), 3000);
    } catch {}
    setApplying(false);
  };

  const handleClearPath = async () => {
    await fetch('/api/settings/set-steam-path', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steamPath: null }),
    });
    setCustomPath(''); setTestResult(null);
  };

  return (
    <>
      <Section title="Local Steam Installation">
        <Row label="Detection Status" description="Automatically detects common Steam installation paths.">
          <StatusDot ok={localConfig?.found} label={localConfig?.found ? 'Found' : 'Not Found'} />
        </Row>

        <Row
          label="Open Steam Links in the Steam App"
          description={localConfig?.found
            ? 'Store links open in the Steam desktop client instead of your browser. Turn off to use the web store.'
            : "Steam wasn't detected on this PC, so store links open in your browser. Set a Steam path above to enable this."}
        >
          <ToggleSwitch
            on={openLinksInSteam}
            disabled={!localConfig?.found}
            onChange={() => {
              const next = !openLinksInSteam;
              setOpenLinksInSteam(next);
              saveSteamLinkPref(next);
            }}
          />
        </Row>

        {/* Steam Path — always shown, editable */}
        <Row label="Steam Path" description="Where Steam is installed on your PC.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', minWidth: 260 }}>
            {localConfig?.found && (
              <span style={{ fontSize: 11, color: 'var(--ss-ink3)', fontFamily: 'monospace' }}>
                {localConfig.steamPath}
              </span>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="input"
                type="text"
                value={customPath}
                onChange={e => { setCustomPath(e.target.value); setTestResult(null); }}
                placeholder={localConfig?.steamPath || 'e.g. F:\\Games\\Steam'}
                style={{ fontSize: 12, width: 200 }}
              />
              <button className="btn btn-ghost" onClick={handleTest} disabled={testing || !customPath} style={{ fontSize: 12, padding: '6px 10px' }}>
                {testing ? '⟳' : '📁 Test'}
              </button>
            </div>
            {testResult && (
              <div style={{ fontSize: 12, padding: '6px 10px', borderRadius: '14px', background: testResult.valid ? 'var(--ss-btn)' : 'var(--ss-btn)', color: testResult.valid ? 'var(--ss-cat-3)' : 'var(--ss-cat-5)', maxWidth: 280, textAlign: 'right' }}>
                {testResult.valid
                  ? '✅ Valid — click Apply to use this path'
                  : `❌ ${testResult.error || 'Not a valid Steam folder'}`}
              </div>
            )}
            {testResult?.valid && (
              <button className="btn btn-primary" onClick={handleApply} disabled={applying} style={{ fontSize: 12 }}>
                {applying ? '⟳ Applying...' : applied ? '✓ Applied! Reload to refresh data.' : 'Apply Path'}
              </button>
            )}
            {localConfig?.found && (
              <button className="btn btn-ghost" onClick={handleClearPath} style={{ fontSize: 11, padding: '3px 8px', color: 'var(--ss-ink3)' }}>
                Reset to auto-detect
              </button>
            )}
          </div>
        </Row>

        {/* Clickable Local Data row */}
        {localConfig?.found && bestUser && (
          <Row
            label="Local Data"
            description="Click to browse games and user accounts found in your local Steam install."
            onClick={() => {}}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={e => { e.stopPropagation(); setShowGames(true); }}
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                🎮 <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--ss-accent)' }}>{totalGames.toLocaleString()}</span> games
              </button>
              <button
                onClick={e => { e.stopPropagation(); setShowUsers(true); }}
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                👤 <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--ss-cat-3)' }}>{userCount}</span> user{userCount !== 1 ? 's' : ''}
              </button>
            </div>
          </Row>
        )}

        {/* Library Folders */}
        {localConfig?.libraryPaths?.length > 0 && (
          <Row label="Library Folders" description="Game library locations across all drives." last>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              {localConfig.libraryPaths.map((p, i) => (
                <span key={i} style={{ fontSize: 11, color: 'var(--ss-ink3)', fontFamily: 'monospace' }}>{p}</span>
              ))}
            </div>
          </Row>
        )}

        {!localConfig?.found && (
          <Row label="Not detected" last description="Enter your Steam path above and click Test, then Apply.">
            <span style={{ fontSize: 12, color: 'var(--ss-ink3)' }}>—</span>
          </Row>
        )}
      </Section>

      {/* Sub-modals */}
      {showGames && bestUser && (
        <GamesModal
          userData={bestUser}
          ownedGames={ownedGames}
          onClose={() => setShowGames(false)}
        />
      )}
      {showUsers && (
        <UsersModal
          localConfig={localConfig}
          ownedGames={ownedGames}
          onClose={() => setShowUsers(false)}
        />
      )}
    </>
  );
}

// ── HLTB Section ───────────────────────────────────────────
// ── HLTB Section ───────────────────────────────────────────
function HLTBSettings() {
  const [status, setStatus]             = useState(null);
  const [loading, setLoading]           = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [testResult, setTestResult]     = useState(null);
  const [manualToken, setManualToken]   = useState('');
  const [manualHpKey, setManualHpKey]   = useState('');
  const [manualHpVal, setManualHpVal]   = useState('');
  const [manualCookie, setManualCookie] = useState('');
  const [tokenSaved, setTokenSaved]     = useState(false);
  const [showManual, setShowManual]     = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try { setStatus(await (await fetch('/api/hltb/status')).json()); }
    catch (e) { setStatus({ error: e.message }); }
    setLoading(false);
  };

  useEffect(() => { fetchStatus(); }, []);

  // Poll status every 30s so the countdown updates
  useEffect(() => {
    const t = setInterval(fetchStatus, 30000);
    return () => clearInterval(t);
  }, []);

  const refreshToken = async () => {
    setRefreshing(true);
    setTestResult(null);
    try {
      const data = await (await fetch('/api/hltb/refresh-token', { method: 'POST' })).json();
      setTestResult({ type: data.success ? 'success' : 'error', message: data.success ? `Token refreshed: ${data.token}` : data.error });
      await fetchStatus();
    } catch (e) { setTestResult({ type: 'error', message: e.message }); }
    setRefreshing(false);
  };

  const testSearch = async () => {
    setLoading(true);
    setTestResult(null);
    try {
      const data = await (await fetch('/api/hltb?name=Elden+Ring')).json();
      if (data.mainStory) {
        setTestResult({ type: 'success', message: `✅ Working — Elden Ring: Main ${data.mainStory}h · Completionist ${data.completionist}h` });
      } else if (data.error) {
        setTestResult({ type: 'error', message: `❌ ${data.message || data.error}` });
      } else {
        setTestResult({ type: 'warn', message: '⚠️ No results returned' });
      }
    } catch (e) { setTestResult({ type: 'error', message: e.message }); }
    setLoading(false);
  };

  const clearCache = async () => {
    await fetch('/api/hltb/clear-cache', { method: 'POST' });
    await fetchStatus();
  };

  const saveManualToken = async () => {
    if (!manualToken.trim()) return;
    try {
      await fetch('/api/hltb/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: manualToken, hpKey: manualHpKey || undefined, hpVal: manualHpVal || undefined, cookie: manualCookie || undefined }),
      });
      setTokenSaved(true);
      setTimeout(() => setTokenSaved(false), 2000);
      await fetchStatus();
    } catch {}
  };

  const clearManualToken = async () => {
    await fetch('/api/hltb/set-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: null }) });
    setManualToken(''); setManualHpKey(''); setManualHpVal(''); setManualCookie('');
    await fetchStatus();
  };

  const modeColor = status?.mode === 'auto' ? 'var(--ss-cat-3)' : status?.mode === 'manual' ? 'var(--ss-cat-4)' : 'var(--ss-cat-5)';
  const modeLabel = status?.mode === 'auto' ? '✅ Auto (working)' : status?.mode === 'manual' ? '🔧 Manual override' : '❌ Not connected';

  return (
    <Section title="HowLongToBeat Integration">

      {/* Status overview */}
      <Row label="Connection" description="Token refreshes automatically every 4 minutes.">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: modeColor, boxShadow: `0 0 6px ${modeColor}` }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: modeColor }}>{modeLabel}</span>
          </div>
          {status?.timeUntilRefresh && (
            <span style={{ fontSize: 11, color: 'var(--ss-ink3)' }}>Refreshes in {status.timeUntilRefresh}</span>
          )}
        </div>
      </Row>

      {status?.hpKey && (
        <Row label="Anti-bot key" description="Honeypot key captured from HLTB.">
          <span style={{ fontSize: 12, color: 'var(--ss-ink3)', fontFamily: 'monospace' }}>{status.hpKey}</span>
        </Row>
      )}

      <Row label="Cache" description="Cached game lookups — cleared on token refresh.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ss-ink)' }}>{status?.cacheSize ?? '—'} games</span>
          <button className="btn btn-ghost" onClick={clearCache} style={{ fontSize: 11, padding: '3px 8px' }}>Clear</button>
        </div>
      </Row>

      {/* Action buttons */}
      <div style={{ padding: '12px 20px 4px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={refreshToken} disabled={refreshing} style={{ fontSize: 13 }}>
          {refreshing ? '⟳ Refreshing...' : '🔄 Refresh Token Now'}
        </button>
        <button className="btn btn-ghost" onClick={testSearch} disabled={loading} style={{ fontSize: 13 }}>
          🧪 Test (Elden Ring)
        </button>
        <button className="btn btn-ghost" onClick={fetchStatus} disabled={loading} style={{ fontSize: 13 }}>
          ↺ Reload Status
        </button>
      </div>

      {/* Test result */}
      {testResult && (
        <div style={{ margin: '8px 20px 12px', padding: '10px 14px', borderRadius: '14px', fontSize: 13, background: testResult.type === 'success' ? 'var(--ss-btn)' : testResult.type === 'warn' ? 'var(--ss-btn)' : 'var(--ss-btn)', color: testResult.type === 'success' ? 'var(--ss-cat-3)' : testResult.type === 'warn' ? 'var(--ss-cat-4)' : 'var(--ss-cat-5)' }}>
          {testResult.message}
        </div>
      )}

      {/* Last error */}
      {status?.lastError && (
        <div style={{ margin: '0 20px 12px', padding: '10px 14px', borderRadius: '14px', fontSize: 12, background: 'var(--ss-btn)', color: 'var(--ss-cat-5)' }}>
          Last error: {status.lastError}
        </div>
      )}

      {/* Manual override toggle */}
      <div style={{ borderTop: '1px solid var(--ss-line-soft)', margin: '4px 0 0' }}>
        <button
          onClick={() => setShowManual(v => !v)}
          style={{
            width: '100%', textAlign: 'left', padding: '14px 20px',
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            color: 'var(--ss-ink2)', fontSize: 13, fontFamily: 'var(--font-body)',
          }}
        >
          <span>🔧 Manual token override {status?.mode === 'manual' && <span style={{ color: 'var(--ss-cat-4)', fontWeight: 600 }}>(active)</span>}</span>
          <span style={{ fontSize: 11, color: 'var(--ss-ink3)' }}>{showManual ? '▲ Hide' : '▼ Show'}</span>
        </button>

        {showManual && (
          <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--ss-ink3)', lineHeight: 1.6, padding: '8px 12px', background: 'var(--ss-btn-hi)', borderRadius: '14px', border: '1px solid var(--ss-line-soft)' }}>
              Use if auto-fetch fails. To find values: open <strong>howlongtobeat.com</strong> → F12 → Network → search any game → click the POST request to <code style={{ background: 'var(--ss-inset)', padding: '1px 4px', borderRadius: 3 }}>/api/bleed</code> → copy the <code style={{ background: 'var(--ss-inset)', padding: '1px 4px', borderRadius: 3 }}>x-auth-token</code>, <code style={{ background: 'var(--ss-inset)', padding: '1px 4px', borderRadius: 3 }}>x-hp-key</code>, and <code style={{ background: 'var(--ss-inset)', padding: '1px 4px', borderRadius: 3 }}>x-hp-val</code> headers.
            </div>

            {[
              ['x-auth-token *', manualToken, setManualToken, 'Required'],
              ['x-hp-key', manualHpKey, setManualHpKey, 'e.g. ign_abc123'],
              ['x-hp-val', manualHpVal, setManualHpVal, 'e.g. def456'],
              ['hltb_alive cookie', manualCookie, setManualCookie, 'Optional'],
            ].map(([label, val, setter, placeholder]) => (
              <div key={label}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ss-ink3)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>{label}</label>
                <input className="input" type={label.includes('token') ? 'password' : 'text'} value={val} onChange={e => setter(e.target.value)} placeholder={placeholder} style={{ fontSize: 12 }} />
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn btn-primary" onClick={saveManualToken} disabled={!manualToken.trim()} style={{ fontSize: 13 }}>
                {tokenSaved ? '✓ Saved' : 'Apply Manual Token'}
              </button>
              {status?.mode === 'manual' && (
                <button className="btn btn-ghost" onClick={clearManualToken} style={{ fontSize: 13, color: 'var(--ss-cat-5)', borderColor: 'var(--ss-cat-5)' }}>
                  Clear & Use Auto
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Display Section ────────────────────────────────────────
function DisplaySettings() {
  const { theme, setTheme, blurIntensity, setBlurIntensity } = useApp();
  const [flags, setFlags] = useState(loadFeatureFlags);

  const toggleFlag = (key) => {
    const next = { ...flags, [key]: !flags[key] };
    setFlags(next);
    saveFeatureFlags(next);
  };

  return (
    <>
      <Section title="Appearance">
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {THEMES.map(t => {
            const on = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                  padding: '9px 11px', borderRadius: 14, cursor: 'pointer', transition: 'background 0.15s',
                  background: on ? 'var(--ss-pill-bg)' : 'var(--ss-inset)',
                  border: on ? '1px solid var(--ss-accent)' : '1px solid var(--ss-line-soft)',
                }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.borderColor = 'var(--ss-hi)'; }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.borderColor = 'var(--ss-line-soft)'; }}
              >
                <span style={{ position: 'relative', flexShrink: 0, width: 34, height: 34, borderRadius: 11, overflow: 'hidden', background: t.swatchBg, border: '1px solid rgba(255,255,255,.14)' }}>
                  <span style={{ position: 'absolute', left: 5, right: 5, top: 7, height: 8, borderRadius: 4, background: 'rgba(255,255,255,.22)' }} />
                  <span style={{ position: 'absolute', left: 5, bottom: 6, width: 13, height: 6, borderRadius: 3, background: t.swatchAccent }} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: on ? 'var(--ss-accent)' : 'var(--ss-ink)' }}>{t.label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--ss-ink3)', lineHeight: 1.35 }}>{t.note}</span>
                </span>
                {on && <span style={{ fontSize: 12, color: 'var(--ss-accent)', flexShrink: 0 }}>●</span>}
              </button>
            );
          })}
        </div>
        <Row label="Glass blur" description="Intensity of the frosted-glass blur behind every panel." last>
          <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--ss-sheet)', borderRadius: '14px', border: '1px solid var(--ss-line)' }}>
            {BLUR_STEPS.map(b => (
              <button key={b.id} onClick={() => setBlurIntensity(b.id)} style={{
                background: blurIntensity === b.id ? 'var(--ss-accent)' : 'transparent',
                color: blurIntensity === b.id ? 'white' : 'var(--ss-ink3)',
                border: 'none', borderRadius: 'calc(14px - 2px)',
                padding: '6px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 500,
                fontFamily: 'var(--font-body)', transition: 'all 0.15s',
              }}>{b.label}</button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="Feature Flags">
        <Row
          label="7-Day Period"
          description="Show a '7 Days' toggle on the dashboard. Uses snapshot data — less accurate until more daily snapshots accumulate."
        >
          <ToggleSwitch
            on={!!flags['period_7days']}
            onChange={() => toggleFlag('period_7days')}
          />
        </Row>
        <Row
          label="30-Day Period"
          description="Show a '30 Days' toggle on the dashboard. Uses snapshot data — becomes more accurate over time."
          last
        >
          <ToggleSwitch
            on={!!flags['period_30days']}
            onChange={() => toggleFlag('period_30days')}
          />
        </Row>
      </Section>
    </>
  );
}

// Raw log of saved snapshots — moved here from the History page, which was
// the only section there that wasn't a visualization. Belongs next to the
// snapshot count a debugging/data-management context wants, not in the
// user-facing analytics flow.
function SnapshotTimeline({ snapshots }) {
  if (!snapshots || snapshots.length === 0) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ss-ink3)', fontSize: 13 }}>
        No snapshots yet. Snapshots are saved each time you open the app.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 280, overflowY: 'auto' }}>
      {[...snapshots].reverse().slice(0, 30).map((snap, i) => {
        const date = new Date(snap.timestamp);
        const totalMinutes = (snap.games || []).reduce((s, g) => s + (g.playtime_forever || 0), 0);

        return (
          <div key={i} style={{
            display: 'flex', gap: 16, padding: '10px 0',
            borderBottom: '1px solid var(--ss-line-soft)',
            alignItems: 'center',
          }}>
            <div style={{ width: 110, flexShrink: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ss-ink)' }}>
                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--ss-ink3)' }}>
                {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: 'var(--ss-ink3)' }}>
                {(snap.games || []).length} games · {Math.round(totalMinutes / 60).toLocaleString()}h total
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--ss-ink3)', marginTop: 2 }}>
                {(snap.recentGames || []).slice(0, 3).map(g => g.appid).join(', ') || '—'}
              </div>
            </div>
            <div style={{ flexShrink: 0 }}>
              <span className="badge badge-blue">Snapshot</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Data & Cache Section ───────────────────────────────────
function DataSettings() {
  const { steamId } = useApp();
  const [snapshots, setSnapshots] = useState([]);
  const [cleared, setCleared] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [dataFolder, setDataFolder] = useState('');
  const [cacheCounts, setCacheCounts] = useState(null);
  const [clearingCache, setClearingCache] = useState(false);

  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem('steam_dashboard_snapshots') || '{}');
      setSnapshots(all[steamId] || []);
    } catch {}
  }, [steamId]);

  useEffect(() => {
    fetch('/api/data-folder').then(r => r.json()).then(d => setDataFolder(d.path || '')).catch(() => {});
  }, []);

  const refreshCacheCounts = useCallback(() => {
    fetch('/api/health').then(r => r.json()).then(h => {
      let achCount = 0, hltbLocalCount = 0;
      try { achCount = Object.keys(JSON.parse(localStorage.getItem(ACH_CACHE_KEY) || '{}')).length; } catch {}
      try { hltbLocalCount = Object.keys(JSON.parse(localStorage.getItem(HLTB_CACHE_KEY) || '{}')).length; } catch {}
      setCacheCounts({
        genres: h.genreCacheSize ?? 0,
        rarity: h.rarityCacheSize ?? 0,
        hltb: (h.hltbCacheSize ?? 0) + hltbLocalCount,
        achievements: achCount,
      });
    }).catch(() => {});
  }, []);

  useEffect(() => { refreshCacheCounts(); }, [refreshCacheCounts]);

  const openDataFolder = () => {
    fetch('/api/data-folder/open', { method: 'POST' }).catch(() => {});
  };

  // Clears only re-fetchable lookup caches (genres, achievement rarity %,
  // HowLongToBeat results). Safe by design: none of this is data the app
  // can't regenerate on its own, so nothing here is destructive the way
  // clearing snapshots or resetting the app is — it just means the next
  // load re-fetches from Steam/HowLongToBeat instead of reading a cache,
  // which can take a few minutes for a large library.
  const clearCaches = async () => {
    setClearingCache(true);
    try {
      await Promise.all([
        fetch('/api/steam/genres/clear-cache', { method: 'POST' }),
        fetch('/api/steam/achievement-rarity/clear-cache', { method: 'POST' }),
        fetch('/api/hltb/clear-cache', { method: 'POST' }),
      ]);
    } catch {}
    localStorage.removeItem(HLTB_CACHE_KEY);
    localStorage.removeItem(ACH_CACHE_KEY);
    setClearingCache(false);
    setCleared('cache');
    refreshCacheCounts();
  };

  const clearSnapshots = async () => {
    try {
      const all = JSON.parse(localStorage.getItem('steam_dashboard_snapshots') || '{}');
      delete all[steamId];
      localStorage.setItem('steam_dashboard_snapshots', JSON.stringify(all));
      setSnapshots([]); setCleared('snapshots');
    } catch {}
    await clearServerMirrors(steamId);
  };

  const clearAll = async () => {
    ['steam_dashboard_snapshots','steam_dashboard_config','steam_theme',HLTB_CACHE_KEY,ACH_CACHE_KEY].forEach(k => localStorage.removeItem(k));
    await Promise.all([
      clearServerMirrors(steamId),
      fetch('/api/steam/genres/clear-cache', { method: 'POST' }).catch(() => {}),
      fetch('/api/steam/achievement-rarity/clear-cache', { method: 'POST' }).catch(() => {}),
      fetch('/api/hltb/clear-cache', { method: 'POST' }).catch(() => {}),
    ]);
    setCleared('all');
    setTimeout(() => window.location.reload(), 800);
  };

  return (
    <Section title="Data & Cache">
      <Row label="Data Folder" description="Config, snapshot history, and caches are kept here — survives app updates.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--ss-ink3)', fontFamily: 'monospace', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={dataFolder}>{dataFolder || '—'}</span>
          <button className="btn btn-ghost" onClick={openDataFolder} style={{ fontSize: 12, padding: '4px 10px' }} disabled={!dataFolder}>Open Folder</button>
        </div>
      </Row>
      <Row label="Saved Snapshots" description="Daily snapshots power the History trend charts.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ss-ink)' }}>{snapshots.length} snapshots</span>
          <button className="btn btn-ghost" onClick={() => setShowLog(s => !s)} style={{ fontSize: 12, padding: '4px 10px' }}>
            {showLog ? 'Hide log' : 'View log'}
          </button>
          <button className="btn btn-ghost" onClick={clearSnapshots} style={{ fontSize: 12, padding: '4px 10px', color: 'var(--ss-cat-5)', borderColor: 'var(--ss-cat-5)' }}>Clear</button>
        </div>
      </Row>
      {showLog && (
        <div style={{ padding: '4px 20px 12px', borderBottom: '1px solid var(--ss-line-soft)' }}>
          <SnapshotTimeline snapshots={snapshots} />
        </div>
      )}
      <Row label="Regenerable Caches" description="Genre tags, achievement rarity %, and HowLongToBeat lookups. Safe to clear — just re-fetched as needed, which can take a few minutes for a large library.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--ss-ink3)' }}>
            {cacheCounts ? `${cacheCounts.genres} genres · ${cacheCounts.rarity} rarity · ${cacheCounts.hltb} HLTB · ${cacheCounts.achievements} achievements` : '—'}
          </span>
          <button className="btn btn-ghost" onClick={clearCaches} disabled={clearingCache} style={{ fontSize: 12, padding: '4px 10px' }}>
            {clearingCache ? 'Clearing...' : 'Clear Cache'}
          </button>
        </div>
      </Row>
      <Row label="Reset Everything" description="Clears all saved data, config, and reloads the page." last>
        <button className="btn btn-ghost" onClick={clearAll} style={{ fontSize: 12, padding: '4px 10px', color: 'var(--ss-cat-5)', borderColor: 'var(--ss-cat-5)' }}>
          {cleared === 'all' ? '✓ Reloading...' : 'Reset App'}
        </button>
      </Row>
      {cleared === 'snapshots' && <div style={{ padding: '8px 20px 12px', fontSize: 12, color: 'var(--ss-cat-3)' }}>✓ Snapshots cleared</div>}
      {cleared === 'cache' && <div style={{ padding: '8px 20px 12px', fontSize: 12, color: 'var(--ss-cat-3)' }}>✓ Caches cleared</div>}
    </Section>
  );
}

// ── Debug Section ──────────────────────────────────────────
function DebugSettings() {
  const { profile, ownedGames, recentGames, localConfig, config } = useApp();
  const [health, setHealth] = useState(null);

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {});
  }, []);

  const rows = [
    ['Server',       health?.status === 'ok' ? '✅ Running' : '❌ Not responding'],
    ['Steam API',    profile ? '✅ Connected' : '❌ Not connected'],
    ['Local Steam',  localConfig?.found ? `✅ ${localConfig.steamPath}` : '❌ Not found'],
    ['HLTB Token',   health?.hltbTokenCached ? '✅ Cached' : '⚠️ Not cached'],
    ['Library',      `${ownedGames.length} games`],
    ['Recent games', `${recentGames.length} games (last 2 weeks)`],
    ['HLTB cache',   `${health?.hltbCacheSize ?? '—'} entries`],
    ['Steam ID',     config?.steamId || '—'],
    ['Platform',     health?.platform || '—'],
  ];

  return (
    <Section title="Debug Info">
      {rows.map(([label, value], i) => (
        <Row key={label} label={label} last={i === rows.length - 1}>
          <span style={{ fontSize: 12, color: 'var(--ss-ink2)', fontFamily: 'monospace', maxWidth: 280, textAlign: 'right' }}>{value}</span>
        </Row>
      ))}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--ss-line-soft)' }}>
        <div style={{ fontSize: 12, color: 'var(--ss-ink3)', marginBottom: 6 }}>Share with developer when reporting issues:</div>
        <textarea readOnly value={JSON.stringify({ health, steamId: config?.steamId, platform: health?.platform, ownedGames: ownedGames.length, recentGames: recentGames.length, localFound: localConfig?.found }, null, 2)}
          style={{ width: '100%', height: 120, resize: 'vertical', background: 'var(--ss-sheet)', border: '1px solid var(--ss-line)', borderRadius: '14px', padding: '8px 10px', color: 'var(--ss-ink2)', fontFamily: 'monospace', fontSize: 11, outline: 'none' }}
        />
      </div>
    </Section>
  );
}

// ── Main Settings Modal ────────────────────────────────────
export default function SettingsModal({ onClose }) {
  const [activeSection, setActiveSection] = useState('connection');
  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  useFocusTrap(true, panelRef);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleOverlayClick = (e) => { if (e.target === overlayRef.current) onClose(); };

  const renderSection = () => {
    switch (activeSection) {
      case 'connection': return <ConnectionSettings />;
      case 'local':      return <LocalSteamSettings />;
      case 'hltb':       return <HLTBSettings />;
      case 'display':    return <DisplaySettings />;
      case 'data':       return <DataSettings />;
      case 'debug':      return <DebugSettings />;
      default:           return null;
    }
  };

  return (
    <div ref={overlayRef} onClick={handleOverlayClick} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeInFast 0.15s ease' }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" tabIndex={-1} style={{ width: '100%', maxWidth: 780, maxHeight: '90vh', background: 'var(--ss-sheet)', borderRadius: '26px', border: '1px solid var(--ss-line)', boxShadow: 'var(--ss-shadow)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeIn 0.2s ease', outline: 'none' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--ss-line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 id="settings-modal-title" style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--ss-ink)', marginBottom: 2 }}>Settings</h2>
            <p style={{ fontSize: 13, color: 'var(--ss-ink3)' }}>Configure your Steam Dashboard</p>
          </div>
          <button onClick={onClose} aria-label="Close settings" style={{ background: 'var(--ss-inset)', border: '1px solid var(--ss-line)', borderRadius: '14px', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: 'var(--ss-ink2)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--ss-btn-hi)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--ss-inset)'}
          >✕</button>
        </div>
        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar */}
          <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--ss-line-soft)', padding: '12px 8px', overflowY: 'auto' }}>
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
                width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                background: activeSection === s.id ? 'var(--ss-pill-bg)' : 'transparent',
                color: activeSection === s.id ? 'var(--ss-accent)' : 'var(--ss-ink2)',
                fontSize: 13, fontWeight: activeSection === s.id ? 600 : 400,
                fontFamily: 'var(--font-body)', transition: 'all 0.12s', marginBottom: 2,
              }}
                onMouseEnter={e => { if (activeSection !== s.id) e.currentTarget.style.background = 'var(--ss-inset)'; }}
                onMouseLeave={e => { if (activeSection !== s.id) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 15 }}>{s.icon}</span>{s.label}
              </button>
            ))}
          </div>
          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {renderSection()}
          </div>
        </div>
      </div>
    </div>
  );
}
