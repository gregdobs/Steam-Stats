import { useState, useEffect } from 'react';
import { getGameCapsuleFallbacks, getGameHeaderUrl, getGameHeroUrl, fetchArtworkFallback } from '../utils/steam.js';

// Tries each URL in sequence until one loads, falling back through all known
// Steam CDN formats. Some newer titles' assets have moved to a per-asset-hash
// CDN path that none of the flat guesses above can construct — as a last
// resort (after every flat-path guess 404s), ask the server to look up the
// real current URL via the Steam store API before giving up entirely.
export function GameCapsule({ appId, name, style = {}, onLoaded }) {
  const fallbacks = getGameCapsuleFallbacks(appId);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [extraSrc, setExtraSrc] = useState(null);
  const [triedExtra, setTriedExtra] = useState(false);

  // Reset when appId changes
  useEffect(() => {
    setIndex(0);
    setLoaded(false);
    setFailed(false);
    setExtraSrc(null);
    setTriedExtra(false);
  }, [appId]);

  const handleError = () => {
    if (index < fallbacks.length - 1) {
      setIndex(i => i + 1);
    } else if (!triedExtra) {
      setTriedExtra(true);
      fetchArtworkFallback(appId).then(({ capsuleImage, headerImage }) => {
        const url = capsuleImage || headerImage;
        if (url) setExtraSrc(url); else setFailed(true);
      });
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
        background: 'linear-gradient(135deg, var(--ss-inset), var(--ss-panel))',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 6,
        ...style,
      }}>
        <div style={{ fontSize: 28 }}>🎮</div>
        {name && (
          <div style={{
            fontSize: 10, color: 'var(--ss-ink3)', textAlign: 'center',
            padding: '0 8px', lineHeight: 1.3,
            overflow: 'hidden', maxHeight: 36,
          }}>
            {name}
          </div>
        )}
      </div>
    );
  }

  const src = extraSrc || fallbacks[index];
  // fallbacks[0]/[1] are the tall library capsule (matches this component's
  // portrait frame) — everything past that (capsule_616x353, capsule_467x181,
  // header.jpg) and every artwork-fallback result are landscape store-page
  // art. Cropping a landscape image to fill a portrait frame (object-fit:
  // cover) hides most of it and can cut off logos/text, so those cases get
  // letterboxed (object-fit: contain) instead — shows the whole image with
  // padding rather than a random crop.
  const isLandscape = !!extraSrc || index >= 2;
  return (
    <img
      key={src}
      src={src}
      alt={name || ''}
      onLoad={handleLoad}
      onError={handleError}
      style={{
        width: '100%', height: '100%',
        objectFit: isLandscape ? 'contain' : 'cover',
        background: isLandscape ? 'var(--ss-inset)' : undefined,
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
  const [extraSrc, setExtraSrc] = useState(null);
  const [triedExtra, setTriedExtra] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    setExtraSrc(null);
    setTriedExtra(false);
  }, [appId]);

  const handleError = () => {
    if (!triedExtra) {
      setTriedExtra(true);
      fetchArtworkFallback(appId).then(({ headerImage }) => {
        if (headerImage) setExtraSrc(headerImage); else setFailed(true);
      });
    } else {
      setFailed(true);
    }
  };

  if (failed) {
    return (
      <div style={{
        width: '100%', height: '100%',
        background: 'linear-gradient(135deg, var(--ss-inset), var(--ss-line))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...style,
      }}>
        <span style={{ fontSize: 24 }}>🎮</span>
      </div>
    );
  }

  return (
    <img
      key={extraSrc || 'default'}
      src={extraSrc || getGameHeaderUrl(appId)}
      alt={name || ''}
      onLoad={() => setLoaded(true)}
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

// Hero image (1920x620) with header fallback
export function GameHero({ appId, name, style = {} }) {
  const [src, setSrc] = useState(getGameHeroUrl(appId));
  const [loaded, setLoaded] = useState(false);
  const [triedFallback, setTriedFallback] = useState(false);
  const [triedExtra, setTriedExtra] = useState(false);

  useEffect(() => {
    setSrc(getGameHeroUrl(appId));
    setLoaded(false);
    setTriedFallback(false);
    setTriedExtra(false);
  }, [appId]);

  const handleError = () => {
    if (!triedFallback) {
      setTriedFallback(true);
      setSrc(getGameHeaderUrl(appId));
    } else if (!triedExtra) {
      setTriedExtra(true);
      fetchArtworkFallback(appId).then(({ headerImage }) => {
        if (headerImage) setSrc(headerImage);
      });
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
