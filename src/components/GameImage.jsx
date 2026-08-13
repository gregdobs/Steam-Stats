import { useState, useEffect } from 'react';
import { getGameCapsuleFallbacks, getGameHeaderUrl } from '../utils/steam.js';

// Tries each URL in sequence until one loads, falling back through all known Steam CDN formats
export function GameCapsule({ appId, name, style = {}, onLoaded }) {
  const fallbacks = getGameCapsuleFallbacks(appId);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Reset when appId changes
  useEffect(() => {
    setIndex(0);
    setLoaded(false);
    setFailed(false);
  }, [appId]);

  const handleError = () => {
    if (index < fallbacks.length - 1) {
      setIndex(i => i + 1);
    } else {
      setFailed(true);
    }
  };

  const handleLoad = () => {
    setLoaded(true);
    onLoaded?.();
  };

  if (failed) {
    return (
      <div style={{
        width: '100%', height: '100%',
        background: 'linear-gradient(135deg, var(--bg-tertiary), var(--bg-elevated))',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 6,
        ...style,
      }}>
        <div style={{ fontSize: 28 }}>🎮</div>
        {name && (
          <div style={{
            fontSize: 10, color: 'var(--text-muted)', textAlign: 'center',
            padding: '0 8px', lineHeight: 1.3,
            overflow: 'hidden', maxHeight: 36,
          }}>
            {name}
          </div>
        )}
      </div>
    );
  }

  return (
    <img
      key={fallbacks[index]}
      src={fallbacks[index]}
      alt={name || ''}
      onLoad={handleLoad}
      onError={handleError}
      style={{
        width: '100%', height: '100%', objectFit: 'cover',
        opacity: loaded ? 1 : 0,
        transition: 'opacity 0.3s ease',
        ...style,
      }}
    />
  );
}

// Header image (460x215) — very reliable, almost all games have this
export function GameHeader({ appId, name, style = {} }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [appId]);

  if (failed) {
    return (
      <div style={{
        width: '100%', height: '100%',
        background: 'linear-gradient(135deg, var(--bg-tertiary), var(--border-strong))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...style,
      }}>
        <span style={{ fontSize: 24 }}>🎮</span>
      </div>
    );
  }

  return (
    <img
      src={getGameHeaderUrl(appId)}
      alt={name || ''}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      style={{
        width: '100%', height: '100%', objectFit: 'cover',
        opacity: loaded ? 1 : 0,
        transition: 'opacity 0.3s ease',
        ...style,
      }}
    />
  );
}

// Hero image (1920x620) with header fallback
export function GameHero({ appId, name, style = {} }) {
  const [src, setSrc] = useState(`https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_hero.jpg`);
  const [loaded, setLoaded] = useState(false);
  const [triedFallback, setTriedFallback] = useState(false);

  useEffect(() => {
    setSrc(`https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_hero.jpg`);
    setLoaded(false);
    setTriedFallback(false);
  }, [appId]);

  const handleError = () => {
    if (!triedFallback) {
      setTriedFallback(true);
      setSrc(getGameHeaderUrl(appId));
    }
  };

  return (
    <img
      src={src}
      alt={name || ''}
      onLoad={() => setLoaded(true)}
      onError={handleError}
      style={{
        width: '100%', height: '100%', objectFit: 'cover',
        opacity: loaded ? 1 : 0,
        transition: 'opacity 0.5s ease',
        ...style,
      }}
    />
  );
}
