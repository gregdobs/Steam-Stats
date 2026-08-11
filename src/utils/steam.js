const BASE = '/api';

// The Steam API key is sent as a header rather than a ?apiKey= query
// parameter — query strings get written to server access logs and browser
// history by default, which is unnecessary exposure for a secret even on a
// localhost-only server.
function apiKeyHeaders(apiKey) {
  return { 'x-steam-api-key': apiKey };
}

export function extractSteamId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  // Direct 64-bit Steam ID
  if (/^\d{17}$/.test(trimmed)) return trimmed;
  // URL formats
  const profileMatch = trimmed.match(/profiles\/(\d{17})/);
  if (profileMatch) return profileMatch[1];
  // Custom URL — can't resolve without API call, return as-is for vanity
  const idMatch = trimmed.match(/\/id\/([^/]+)/);
  if (idMatch) return idMatch[1]; // vanity URL — needs resolution
  return trimmed;
}

export async function resolveVanityUrl(apiKey, vanityUrl) {
  const res = await fetch(`${BASE}/steam/resolve-vanity?vanity=${vanityUrl}`, { headers: apiKeyHeaders(apiKey) });
  const data = await res.json();
  return data?.response?.steamid || null;
}

export async function fetchPlayerSummary(apiKey, steamId) {
  const res = await fetch(`${BASE}/steam/player-summary?steamId=${steamId}`, { headers: apiKeyHeaders(apiKey) });
  const data = await res.json();
  return data?.response?.players?.[0] || null;
}

export async function fetchOwnedGames(apiKey, steamId) {
  const res = await fetch(`${BASE}/steam/owned-games?steamId=${steamId}`, { headers: apiKeyHeaders(apiKey) });
  const data = await res.json();
  return data?.response?.games || [];
}

export async function fetchRecentGames(apiKey, steamId) {
  const res = await fetch(`${BASE}/steam/recent-games?steamId=${steamId}`, { headers: apiKeyHeaders(apiKey) });
  const data = await res.json();
  return data?.response?.games || [];
}

export async function fetchAchievementsBatch(apiKey, steamId, appIds) {
  if (!appIds || appIds.length === 0) return {};
  const ids = appIds.slice(0, 20).join(',');
  const res = await fetch(`${BASE}/steam/achievements-batch?steamId=${steamId}&appIds=${ids}`, { headers: apiKeyHeaders(apiKey) });
  return await res.json();
}

export async function fetchGenres(appIds) {
  if (!appIds || appIds.length === 0) return { genres: {}, pending: 0, cached: 0 };
  try {
    const res = await fetch(`${BASE}/steam/genres`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appIds }),
    });
    return await res.json();
  } catch {
    return { genres: {}, pending: appIds.length, cached: 0 };
  }
}

export async function fetchGenreStatus() {
  try {
    const res = await fetch(`${BASE}/steam/genres/status`);
    return await res.json();
  } catch {
    return { cachedCount: 0, queueLength: 0, fetchInProgress: false };
  }
}

export async function fetchHLTB(gameName) {
  try {
    const res = await fetch(`${BASE}/hltb?name=${encodeURIComponent(gameName)}`);
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchLocalSteamConfig() {
  try {
    const res = await fetch(`${BASE}/local/steam-config`);
    return await res.json();
  } catch {
    return { found: false };
  }
}

export async function checkServerHealth() {
  try {
    const res = await fetch(`${BASE}/health`);
    return await res.json();
  } catch {
    return { status: 'error' };
  }
}

// Game art URLs — Steam CDN has multiple formats; not all games have all assets
export function getGameHeaderUrl(appId) {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

export function getGameCapsuleUrl(appId) {
  // library_600x900 is the tall capsule — many games don't have it
  // We return an array of fallbacks to try in order
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
}

export function getGameCapsuleFallbacks(appId) {
  return [
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/capsule_616x353.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/capsule_467x181.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
  ];
}

export function getGameHeroUrl(appId) {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_hero.jpg`;
}

export function getGameLogoUrl(appId) {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/logo.png`;
}

// Formatting helpers
export function formatHours(minutes) {
  if (!minutes) return '0h';
  const h = minutes / 60;
  if (h < 1) return `${minutes}m`;
  if (h < 100) return `${h.toFixed(1)}h`;
  return `${Math.round(h).toLocaleString()}h`;
}

export function formatHoursLong(minutes) {
  if (!minutes) return '0 hours';
  const h = Math.round(minutes / 60);
  return `${h.toLocaleString()} ${h === 1 ? 'hour' : 'hours'}`;
}

export function minutesToHours(minutes) {
  return minutes ? parseFloat((minutes / 60).toFixed(1)) : 0;
}

export function formatLastPlayed(unixTimestamp) {
  if (!unixTimestamp) return 'Never';
  const date = new Date(unixTimestamp * 1000);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export function getCompletionStatus(steamHours, hltbHours) {
  if (!hltbHours || hltbHours === 0) return null;
  const ratio = steamHours / hltbHours;
  if (ratio < 0.1) return { label: 'Barely Started', color: 'muted', icon: '💤' };
  if (ratio < 0.5) return { label: 'In Progress', color: 'blue', icon: '🎮' };
  if (ratio < 0.9) return { label: 'Getting There', color: 'amber', icon: '🔥' };
  if (ratio < 1.5) return { label: 'Completed', color: 'emerald', icon: '🏁' };
  return { label: 'Overplayer', color: 'violet', icon: '🐙' };
}

// Local data merging
export function mergeLocalData(apiGames, localConfig) {
  if (!localConfig?.found || !localConfig?.users) return apiGames;

  // Find the user data that has most overlap with API games
  const apiAppIds = new Set(apiGames.map(g => String(g.appid)));
  let bestUser = null;
  let bestOverlap = 0;

  for (const userId of Object.values(localConfig.users)) {
    if (!userId.gamesData) continue;
    const overlap = Object.keys(userId.gamesData).filter(id => apiAppIds.has(id)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestUser = userId;
    }
  }

  if (!bestUser) return apiGames;

  return apiGames.map(game => {
    const local = bestUser.gamesData[String(game.appid)];
    const tags = bestUser.tags?.[String(game.appid)] || [];
    return {
      ...game,
      localLastPlayed: local?.lastPlayed || null,
      launchCount: local?.launchCount || null,
      localPlaytime: local?.playtimeForever || null,
      userTags: tags,
    };
  });
}

// Snapshot/cache management
const SNAPSHOT_KEY = 'steam_dashboard_snapshots';
const CONFIG_KEY = 'steam_dashboard_config';

export function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveSnapshot(steamId, games, recentGames) {
  try {
    const existing = loadSnapshots(steamId);
    const now = Date.now();
    const today = new Date().toDateString();

    // Only one snapshot per day per user
    const filtered = existing.filter(s => new Date(s.timestamp).toDateString() !== today);
    const snapshot = {
      timestamp: now,
      date: today,
      games: games.map(g => ({ appid: g.appid, playtime_forever: g.playtime_forever, playtime_2weeks: g.playtime_2weeks || 0 })),
      recentGames: recentGames.map(g => ({ appid: g.appid, playtime_2weeks: g.playtime_2weeks || 0 }))
    };

    filtered.push(snapshot);
    // Keep last 90 days of snapshots
    const trimmed = filtered.slice(-90);

    const allSnapshots = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '{}');
    allSnapshots[steamId] = trimmed;
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(allSnapshots));
  } catch (e) {
    console.warn('Failed to save snapshot:', e);
  }
}

export function loadSnapshots(steamId) {
  try {
    const all = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '{}');
    return all[steamId] || [];
  } catch {
    return [];
  }
}

export function computeHistoricalTrends(steamId) {
  const snapshots = loadSnapshots(steamId);
  if (snapshots.length < 2) return null;

  // Weekly totals from snapshots
  const weeks = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const daysDiff = (curr.timestamp - prev.timestamp) / (1000 * 60 * 60 * 24);
    if (daysDiff > 14) continue; // Skip big gaps

    const prevMap = new Map(prev.games.map(g => [g.appid, g.playtime_forever]));
    let deltaMinutes = 0;
    for (const game of curr.games) {
      const prevTime = prevMap.get(game.appid) || 0;
      const delta = game.playtime_forever - prevTime;
      if (delta > 0) deltaMinutes += delta;
    }

    weeks.push({
      date: curr.date,
      timestamp: curr.timestamp,
      hoursPlayed: parseFloat((deltaMinutes / 60).toFixed(1)),
      daysDiff: parseFloat(daysDiff.toFixed(1))
    });
  }

  return weeks;
}

// ─────────────────────────────────────────────
// SESSION ESTIMATES (#3)
// True session start/stop times aren't reliably available from Steam —
// Steam's local logs are download/patch logs, not play-session logs.
// Instead we estimate session count and average length from LaunchCount +
// total playtime, which IS reliable data from localconfig.vdf.
// This is clearly labeled as an ESTIMATE in the UI, not exact reconstruction.
// ─────────────────────────────────────────────

export function estimateSessionStats(game) {
  const launches = game.launchCount;
  const totalMinutes = game.playtime_forever || 0;
  if (!launches || launches === 0 || totalMinutes === 0) return null;

  const avgSessionMinutes = totalMinutes / launches;
  return {
    launches,
    avgSessionMinutes: Math.round(avgSessionMinutes),
    avgSessionHours: parseFloat((avgSessionMinutes / 60).toFixed(1)),
    totalMinutes,
  };
}

// Aggregate session estimates across the whole library — used for a
// "typical session length" stat and a launches-vs-hours distribution.
export function estimateLibrarySessionStats(ownedGames) {
  const withLaunches = ownedGames.filter(g => g.launchCount > 0 && g.playtime_forever > 0);
  if (withLaunches.length === 0) return null;

  const totalLaunches = withLaunches.reduce((s, g) => s + g.launchCount, 0);
  const totalMinutes = withLaunches.reduce((s, g) => s + g.playtime_forever, 0);
  const avgSessionMinutes = totalMinutes / totalLaunches;

  // Bucket games by their average session length
  const buckets = { 'Quick (<30m)': 0, 'Short (30-90m)': 0, 'Medium (1.5-3h)': 0, 'Long (3h+)': 0 };
  for (const g of withLaunches) {
    const avg = g.playtime_forever / g.launchCount;
    if (avg < 30) buckets['Quick (<30m)']++;
    else if (avg < 90) buckets['Short (30-90m)']++;
    else if (avg < 180) buckets['Medium (1.5-3h)']++;
    else buckets['Long (3h+)']++;
  }

  return {
    totalLaunches,
    avgSessionMinutes: Math.round(avgSessionMinutes),
    avgSessionHours: parseFloat((avgSessionMinutes / 60).toFixed(1)),
    gamesWithData: withLaunches.length,
    buckets,
  };
}

// ─────────────────────────────────────────────
// BACKLOG BURN-DOWN (#6)
// Projects how long it would take to clear the unplayed library
// at the user's current pace, derived from snapshot history.
// ─────────────────────────────────────────────

export function computeBacklogProjection(ownedGames, steamId, hltbCache = {}) {
  const unplayed = ownedGames.filter(g => !g.playtime_forever || g.playtime_forever === 0);
  const played = ownedGames.filter(g => g.playtime_forever > 0);

  if (unplayed.length === 0) {
    return { unplayedCount: 0, message: 'No backlog — every game has been played at least once.' };
  }

  const trends = computeHistoricalTrends(steamId);
  let avgWeeklyHours = null;

  if (trends && trends.length > 0) {
    const recent = trends.slice(-8);
    avgWeeklyHours = recent.reduce((s, w) => s + w.hoursPlayed, 0) / recent.length;
  }

  // Use real HLTB "Main Story" hours per unplayed game where we have them
  // cached; fall back to a flat conservative estimate for the rest. This
  // makes the projection meaningfully more accurate as the HLTB cache fills
  // in from Completion/Backlog page usage over time.
  const ASSUMED_HOURS_PER_GAME = 8; // fallback for games with no HLTB data yet
  let totalHoursNeeded = 0;
  let gamesWithRealEstimate = 0;

  for (const game of unplayed) {
    const hltb = hltbCache[game.name];
    if (hltb && !hltb.error && hltb.mainStory) {
      totalHoursNeeded += hltb.mainStory;
      gamesWithRealEstimate++;
    } else {
      totalHoursNeeded += ASSUMED_HOURS_PER_GAME;
    }
  }
  totalHoursNeeded = Math.round(totalHoursNeeded);

  if (!avgWeeklyHours || avgWeeklyHours <= 0) {
    return {
      unplayedCount: unplayed.length,
      totalHoursNeeded,
      avgWeeklyHours: null,
      gamesWithRealEstimate,
      unplayedGames: unplayed,
      message: 'Not enough play history yet to project a pace. Check back after a few days of use.',
    };
  }

  const weeksNeeded = totalHoursNeeded / avgWeeklyHours;
  const yearsNeeded = weeksNeeded / 52;

  return {
    unplayedCount: unplayed.length,
    playedCount: played.length,
    totalHoursNeeded,
    avgWeeklyHours: parseFloat(avgWeeklyHours.toFixed(1)),
    weeksNeeded: Math.round(weeksNeeded),
    yearsNeeded: parseFloat(yearsNeeded.toFixed(1)),
    assumedHoursPerGame: ASSUMED_HOURS_PER_GAME,
    gamesWithRealEstimate,
    unplayedGames: unplayed,
  };
}

// Detects backlog "momentum" — is the unplayed count growing or shrinking
// week over week? Compares unplayed count across the earliest and latest
// snapshot within the last ~14 days.
export function computeBacklogMomentum(ownedGames, steamId) {
  const snapshots = steamId ? loadSnapshots(steamId) : [];
  if (snapshots.length < 2) return null;

  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const recentSnapshots = snapshots.filter(s => s.timestamp >= twoWeeksAgo);
  if (recentSnapshots.length < 2) return null;

  const countUnplayed = (snap) =>
    (snap.games || []).filter(g => !g.playtime_forever || g.playtime_forever === 0).length;

  const oldest = recentSnapshots[0];
  const newest = recentSnapshots[recentSnapshots.length - 1];
  const delta = countUnplayed(newest) - countUnplayed(oldest);

  return { delta, days: Math.round((newest.timestamp - oldest.timestamp) / (1000 * 60 * 60 * 24)) };
}

// Breaks down the unplayed backlog by genre, using the same genre cache
// GenreAllocation uses. Returns sorted [genre, count] pairs.
export function computeBacklogByGenre(unplayedGames, genreData) {
  const counts = {};
  for (const game of unplayedGames) {
    const entry = genreData[game.appid];
    if (!entry || entry.notFound || !entry.genres?.length) continue;
    for (const genre of entry.genres) {
      counts[genre] = (counts[genre] || 0) + 1;
    }
  }
  return Object.entries(counts).sort(([, a], [, b]) => b - a);
}
