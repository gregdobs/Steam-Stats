import { useState } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';

export default function SetupScreen() {
  const { loadData, loading, loadingPhase, error } = useApp();
  const [apiKey, setApiKey] = useState('');
  const [steamUrl, setSteamUrl] = useState('');

  const handleSubmit = () => {
    if (!apiKey.trim() || !steamUrl.trim()) return;
    loadData(apiKey.trim(), steamUrl.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--ss-bg)',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'var(--ss-pill-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="30" height="30" viewBox="0 0 20 20" fill="none" stroke="var(--ss-accent)" strokeWidth="1.5" strokeLinecap="round"><circle cx="10" cy="10" r="7.2"></circle><path d="M10 5.4V10l3 2"></path></svg>
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600,
            color: 'var(--ss-ink)', letterSpacing: '-0.5px', marginBottom: 8
          }}>
            Steam Stats
          </h1>
          <p style={{ fontSize: 15, color: 'var(--ss-ink2)', lineHeight: 1.6 }}>
            A best-in-class view of your gaming life.<br />
            Connect your Steam account to get started.
          </p>
        </div>

        {/* Form card */}
        <div className="card" style={{ padding: 32 }}>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block', fontSize: 13, fontWeight: 600,
              color: 'var(--ss-ink2)', marginBottom: 8, letterSpacing: '0.3px',
              textTransform: 'uppercase'
            }}>
              Steam Web API Key
            </label>
            <input
              className="input"
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            />
            <p style={{ fontSize: 12, color: 'var(--ss-ink3)', marginTop: 6 }}>
              Get your free key at{' '}
              <a
                href="https://steamcommunity.com/dev/apikey"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--ss-accent)', textDecoration: 'none' }}
              >
                steamcommunity.com/dev/apikey
              </a>
            </p>
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{
              display: 'block', fontSize: 13, fontWeight: 600,
              color: 'var(--ss-ink2)', marginBottom: 8, letterSpacing: '0.3px',
              textTransform: 'uppercase'
            }}>
              Steam Profile URL or ID
            </label>
            <input
              className="input"
              type="text"
              value={steamUrl}
              onChange={e => setSteamUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://steamcommunity.com/profiles/76561198..."
            />
            <p style={{ fontSize: 12, color: 'var(--ss-ink3)', marginTop: 6 }}>
              Your profile must be set to <strong>Public</strong> in Steam privacy settings
            </p>
          </div>

          {error && (
            <div style={{
              padding: '12px 16px',
              background: 'var(--ss-btn)',
              border: '1px solid var(--ss-cat-5)',
              borderRadius: '14px',
              color: 'var(--ss-cat-5)',
              fontSize: 13,
              marginBottom: 20,
            }}>
              ⚠️ {error}
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 15 }}
            onClick={handleSubmit}
            disabled={loading || !apiKey || !steamUrl}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite', fontSize: 14 }}>⟳</span>
                {loadingPhase || 'Loading...'}
              </span>
            ) : (
              'Connect Steam Account →'
            )}
          </button>
        </div>

        {/* Privacy note */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <p style={{ fontSize: 12, color: 'var(--ss-ink3)', lineHeight: 1.6 }}>
            🔒 Your API key is stored only in your browser's local storage.<br />
            All data is fetched directly from Steam's servers.
          </p>
        </div>
      </div>
    </div>
  );
}
