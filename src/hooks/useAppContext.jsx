import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchPlayerSummary, fetchOwnedGames, fetchRecentGames,
  fetchLocalSteamConfig, extractSteamId, resolveVanityUrl, saveConfig, loadConfig,
  saveSnapshot, loadSnapshots, mergeLocalData, computeHistoricalTrends, fetchHLTB,
  fetchAchievementsBatch
} from '../utils/steam.js';

const AppContext = createContext(null);

const HLTB_CACHE_KEY = 'steam_dashboard_hltb_cache';
// v2: cached entries now also carry earnedDetails (per-achievement name/icon/
// unlock time), used by the Achievement Rarity widget — bumped so older
// cached entries that predate that field get refetched instead of being
// treated as already-complete and silently missing rarity data forever.
const ACH_CACHE_KEY = 'steam_dashboard_achievement_cache_v2';

function loadHltbCacheFromStorage() {
  try { return JSON.parse(localStorage.getItem(HLTB_CACHE_KEY) || '{}'); }
  catch { return {}; }
}

function saveHltbCacheToStorage(cache) {
  try { localStorage.setItem(HLTB_CACHE_KEY, JSON.stringify(cache)); }
  catch {} // storage full or unavailable — cache just won't persist, non-fatal
}

function loadAchCacheFromStorage() {
  try { return JSON.parse(localStorage.getItem(ACH_CACHE_KEY) || '{}'); }
  catch { return {}; }
}

function saveAchCacheToStorage(cache) {
  try { localStorage.setItem(ACH_CACHE_KEY, JSON.stringify(cache)); }
  catch {}
}

export function AppProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('steam_theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [config, setConfig] = useState(() => loadConfig());
  const [activePage, setActivePage] = useState('dashboard');
  const [timePeriod, setTimePeriod] = useState('2weeks');

  // Data state
  const [profile, setProfile] = useState(null);
  const [ownedGames, setOwnedGames] = useState([]);
  const [recentGames, setRecentGames] = useState([]);
  const [localConfig, setLocalConfig] = useState(null);
  const [historicalTrends, setHistoricalTrends] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState('');
  const [error, setError] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Shared HLTB cache — every page (Completion, Backlog, GameDetailPanel)
  // reads/writes through this instead of maintaining separate fetch state,
  // so a game looked up on one page is instantly available everywhere else.
  const [hltbCache, setHltbCache] = useState(() => loadHltbCacheFromStorage());
  const hltbInFlight = useRef(new Set()); // dedupe concurrent requests for the same game name

  const getHltbForGame = useCallback(async (gameName) => {
    if (!gameName) return null;
    if (hltbCache[gameName] !== undefined) return hltbCache[gameName];
    if (hltbInFlight.current.has(gameName)) return undefined; // already being fetched elsewhere
    hltbInFlight.current.add(gameName);
    try {
      const data = await fetchHLTB(gameName);
      setHltbCache(prev => {
        const next = { ...prev, [gameName]: data };
        saveHltbCacheToStorage(next);
        return next;
      });
      return data;
    } finally {
      hltbInFlight.current.delete(gameName);
    }
  }, [hltbCache]);

  // Shared achievement cache — Achievements page, GameDetailPanel, and any
  // future "recently unlocked" widget all read/write through this instead
  // of each maintaining independent fetch state. Keyed by appid (not name,
  // since achievements are Steam-API-specific per app).
  const [achCache, setAchCache] = useState(() => loadAchCacheFromStorage());
  const achInFlight = useRef(new Set());
  // Mirrors achCache but updated synchronously inside the setAchCache
  // updater itself, not via a separate effect. React state updates aren't
  // reflected in the closure that scheduled them, so a caller doing
  // `const data = await getAchievementsForGames(...)` would previously get
  // back the *stale* achCache captured when the function was created,
  // missing everything fetched during that same call. This ref always
  // reflects the latest merged cache the moment it's computed.
  const achCacheRef = useRef(achCache);

  // Fetches achievement data for a list of appIds, using the shared cache
  // and only hitting the API for whatever isn't already cached. Handles the
  // API's 20-appId-per-request batching internally.
  const getAchievementsForGames = useCallback(async (appIds, onProgress) => {
    if (!config?.apiKey || !config?.steamId || !appIds || appIds.length === 0) return achCacheRef.current;

    const toFetch = appIds.filter(id => achCache[id] === undefined && !achInFlight.current.has(id));
    if (toFetch.length === 0) return achCacheRef.current;

    toFetch.forEach(id => achInFlight.current.add(id));

    try {
      for (let i = 0; i < toFetch.length; i += 20) {
        const batch = toFetch.slice(i, i + 20);
        const result = await fetchAchievementsBatch(config.apiKey, config.steamId, batch);
        setAchCache(prev => {
          const next = { ...prev, ...result };
          saveAchCacheToStorage(next);
          achCacheRef.current = next; // keep the ref current before this batch's await
          return next;
        });
        batch.forEach(id => achInFlight.current.delete(id));
        onProgress?.(Math.min(i + 20, toFetch.length), toFetch.length);
        if (i + 20 < toFetch.length) await new Promise(r => setTimeout(r, 400));
      }
    } finally {
      toFetch.forEach(id => achInFlight.current.delete(id));
    }

    return achCacheRef.current;
  }, [config?.apiKey, config?.steamId, achCache]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('steam_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const loadData = useCallback(async (apiKey, steamUrl) => {
    setLoading(true);
    setError(null);
    setDataLoaded(false);

    try {
      let steamId = extractSteamId(steamUrl);
      if (!steamId) throw new Error('Invalid Steam profile URL or ID');

      // If it's a vanity URL (not a 17-digit ID), resolve it first
      if (!/^\d{17}$/.test(steamId)) {
        setLoadingPhase('Resolving Steam profile...');
        const resolved = await resolveVanityUrl(apiKey, steamId);
        if (!resolved) throw new Error(`Could not resolve Steam vanity URL "${steamId}". Try using your full profile URL instead.`);
        steamId = resolved;
      }

      setLoadingPhase('Connecting to Steam...');
      const playerData = await fetchPlayerSummary(apiKey, steamId);
      if (!playerData) throw new Error('Profile not found. Make sure your profile is set to Public.');
      setProfile(playerData);

      setLoadingPhase('Loading your library...');
      const [owned, recent, localSteam] = await Promise.all([
        fetchOwnedGames(apiKey, steamId),
        fetchRecentGames(apiKey, steamId),
        fetchLocalSteamConfig()
      ]);

      setLocalConfig(localSteam);

      setLoadingPhase('Merging local Steam data...');
      const mergedGames = mergeLocalData(owned, localSteam);

      setOwnedGames(mergedGames);
      setRecentGames(recent);

      // Save snapshot for historical tracking
      saveSnapshot(steamId, owned, recent);

      // Compute historical trends from cached snapshots
      const trends = computeHistoricalTrends(steamId);
      setHistoricalTrends(trends);

      // Persist config
      const newConfig = { apiKey, steamUrl, steamId, lastLoaded: Date.now() };
      setConfig(newConfig);
      saveConfig(newConfig);

      setDataLoaded(true);
      setActivePage('dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingPhase('');
    }
  }, []);

  // Auto-load if config exists
  useEffect(() => {
    const saved = loadConfig();
    if (saved.apiKey && saved.steamUrl && !dataLoaded) {
      loadData(saved.apiKey, saved.steamUrl);
    }
  }, []);

  // Compute per-game playtime deltas for a given lookback window (days)
  // Uses daily snapshots to approximate time played in that window
  const getDeltaGames = useCallback((days) => {
    if (!config?.steamId) return [];
    const snapshots = loadSnapshots(config.steamId);
    if (snapshots.length < 2) {
      // Fall back to 2-week API data if no snapshots
      return recentGames.map(rg => {
        const full = ownedGames.find(og => og.appid === rg.appid) || {};
        return { ...full, ...rg, playtime_2weeks: rg.playtime_2weeks };
      });
    }

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    // Find the snapshot closest to (but before) the cutoff
    const baseline = [...snapshots]
      .filter(s => s.timestamp <= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    const latest = snapshots[snapshots.length - 1];

    if (!baseline) {
      // All snapshots are newer than cutoff — use earliest as baseline
      const earliest = snapshots[0];
      const earliestMap = new Map((earliest.games || []).map(g => [g.appid, g.playtime_forever || 0]));
      const deltas = {};
      for (const g of (latest.games || [])) {
        const prev = earliestMap.get(g.appid) || 0;
        const delta = (g.playtime_forever || 0) - prev;
        if (delta > 0) deltas[g.appid] = delta;
      }
      return Object.entries(deltas).map(([appid, delta]) => {
        const full = ownedGames.find(g => g.appid === parseInt(appid)) || {};
        return { ...full, appid: parseInt(appid), playtime_2weeks: delta };
      }).sort((a, b) => b.playtime_2weeks - a.playtime_2weeks);
    }

    const baseMap = new Map((baseline.games || []).map(g => [g.appid, g.playtime_forever || 0]));
    const deltas = {};
    for (const g of (latest.games || [])) {
      const prev = baseMap.get(g.appid) || 0;
      const delta = (g.playtime_forever || 0) - prev;
      if (delta > 0) deltas[g.appid] = delta;
    }

    return Object.entries(deltas).map(([appid, delta]) => {
      const full = ownedGames.find(g => g.appid === parseInt(appid)) || {};
      return { ...full, appid: parseInt(appid), playtime_2weeks: delta };
    }).sort((a, b) => b.playtime_2weeks - a.playtime_2weeks);
  }, [config?.steamId, ownedGames, recentGames]);

  // Derived data for current time period
  const getGamesForPeriod = useCallback(() => {
    if (timePeriod === '7days') return getDeltaGames(7);
    if (timePeriod === '30days') return getDeltaGames(30);
    if (timePeriod === '2weeks') {
      return recentGames.map(rg => {
        const full = ownedGames.find(og => og.appid === rg.appid);
        return { ...full, ...rg };
      });
    }
    if (timePeriod === 'alltime') {
      return [...ownedGames]
        .filter(g => g.playtime_forever > 0)
        .sort((a, b) => b.playtime_forever - a.playtime_forever);
    }
    return recentGames.map(rg => {
      const full = ownedGames.find(og => og.appid === rg.appid);
      return { ...full, ...rg };
    });
  }, [timePeriod, recentGames, ownedGames, getDeltaGames]);

  const totalHoursAllTime = ownedGames.reduce((sum, g) => sum + (g.playtime_forever || 0), 0) / 60;
  const totalHoursRecent = recentGames.reduce((sum, g) => sum + (g.playtime_2weeks || 0), 0) / 60;
  const gamesPlayed = ownedGames.filter(g => g.playtime_forever > 0).length;

  return (
    <AppContext.Provider value={{
      theme, toggleTheme,
      config, setConfig,
      activePage, setActivePage,
      timePeriod, setTimePeriod,
      profile, ownedGames, recentGames, localConfig, historicalTrends,
      loading, loadingPhase, error, dataLoaded,
      loadData,
      getGamesForPeriod,
      totalHoursAllTime, totalHoursRecent, gamesPlayed,
      steamId: config?.steamId,
      hltbCache, getHltbForGame,
      achCache, getAchievementsForGames,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
