const BASE = '/api';

// The Steam API key is sent as a header rather than a ?apiKey= query
// parameter — query strings get written to server access logs and browser
// history by default, which is unnecessary exposure for a secret even on a
// localhost-only server.
function apiKeyHeaders(apiKey) {
  return { 'x-steam-api-key': apiKey };
}

// Shared by the four Steam auth endpoints below. Throws on a non-2xx
// response using the server's own message (bad key, unreachable, etc. —
// see forwardSteamError in server.js) instead of silently returning
// null/[] and letting a downstream "profile not found"-style fallback
// mask what actually went wrong.
async function steamApiGet(path, apiKey) {
  const res = await fetch(`${BASE}${path}`, { headers: apiKeyHeaders(apiKey) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Steam API request failed (${res.status})`);
  return data;
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
  const data = await steamApiGet(`/steam/resolve-vanity?vanity=${vanityUrl}`, apiKey);
  return data?.response?.steamid || null;
}

export async function fetchPlayerSummary(apiKey, steamId) {
  const data = await steamApiGet(`/steam/player-summary?steamId=${steamId}`, apiKey);
  return data?.response?.players?.[0] || null;
}

export async function fetchOwnedGames(apiKey, steamId) {
  const data = await steamApiGet(`/steam/owned-games?steamId=${steamId}`, apiKey);
  return data?.response?.games || [];
}

export async function fetchRecentGames(apiKey, steamId) {
  const data = await steamApiGet(`/steam/recent-games?steamId=${steamId}`, apiKey);
  return data?.response?.games || [];
}

export async function fetchAchievementsBatch(apiKey, steamId, appIds) {
  if (!appIds || appIds.length === 0) return {};
  const ids = appIds.slice(0, 20).join(',');
  const res = await fetch(`${BASE}/steam/achievements-batch?steamId=${steamId}&appIds=${ids}`, { headers: apiKeyHeaders(apiKey) });
  return await res.json();
}

export async function fetchAchievementRarity(appIds) {
  if (!appIds || appIds.length === 0) return {};
  try {
    const res = await fetch(`${BASE}/steam/achievement-rarity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appIds }),
    });
    const data = await res.json();
    return data.percentages || {};
  } catch {
    return {};
  }
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

// Last-resort artwork lookup for games whose flat-path CDN images 404
// (some newer titles only have art under Steam's newer hashed asset path).
export async function fetchArtworkFallback(appId) {
  try {
    const res = await fetch(`${BASE}/steam/artwork-fallback?appid=${appId}`);
    return await res.json();
  } catch {
    return { headerImage: null, capsuleImage: null };
  }
}

// ── Game art URLs ─────────────────────────────────────────────
// Steam fronts the same assets from three interchangeable edge providers.
// Ordered current-first: cdn.akamai is the legacy endpoint and is the one most
// likely to be unreachable on a given network, so it's the last resort rather
// than the default it used to be.
//
// Rotating hosts matters more than it looks. The capsule fallback list below
// used to be five paths on cdn.akamai alone — which is path redundancy, not
// host redundancy. If that single host failed to resolve, every fallback
// failed the same way and *every* game in the library rendered the placeholder
// tile at once, which is exactly how this surfaced.
export const STEAM_CDN_HOSTS = [
  'https://cdn.cloudflare.steamstatic.com',
  'https://cdn.fastly.steamstatic.com',
  'https://cdn.akamai.steamstatic.com',
];

const PRIMARY_CDN = STEAM_CDN_HOSTS[0];

export function getGameHeaderUrl(appId) {
  return `${PRIMARY_CDN}/steam/apps/${appId}/header.jpg`;
}

export function getGameCapsuleUrl(appId) {
  // library_600x900 is the tall capsule — many games don't have it.
  // See getGameCapsuleFallbacks for the full try-in-order list.
  return `${PRIMARY_CDN}/steam/apps/${appId}/library_600x900.jpg`;
}

export function getGameCapsuleFallbacks(appId) {
  const path = (p) => `/steam/apps/${appId}/${p}`;
  // Host is varied before shape is: a host outage takes out every asset for
  // every game, whereas a missing library_600x900 only affects one title. So
  // try the preferred portrait capsule on all three hosts first, then degrade
  // to the landscape shapes (which almost every game has) across hosts too.
  return [
    ...STEAM_CDN_HOSTS.map((h) => h + path('library_600x900.jpg')),
    `${PRIMARY_CDN}${path('library_600x900_2x.jpg')}`,
    ...STEAM_CDN_HOSTS.map((h) => h + path('header.jpg')),
    `${PRIMARY_CDN}${path('capsule_616x353.jpg')}`,
    `${PRIMARY_CDN}${path('capsule_467x181.jpg')}`,
  ];
}

export function getGameHeroUrl(appId) {
  return `${PRIMARY_CDN}/steam/apps/${appId}/library_hero.jpg`;
}

export function getGameLogoUrl(appId) {
  return `${PRIMARY_CDN}/steam/apps/${appId}/logo.png`;
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

const COMPLETION_LABEL_TO_STATUS_ID = {
  'Barely Started': 'barely', 'In Progress': 'inprogress', 'Getting There': 'gettingthere',
  'Completed': 'completed', 'Overplayer': 'overplayer',
};

// Classifies a game into exactly one of 7 buckets spanning the whole
// library — the spectrum the Progress page filters on. 'unplayed' is
// playtime-based alone (no HLTB data needed); 'unmatched' covers games with
// playtime but no HLTB estimate yet (still fetching, or genuinely no match).
// Closes the old coverage gap where a game with 1-59 minutes played
// satisfied neither Backlog's `=== 0` check nor Completion's `> 60` check.
export function classifyGameStatus(game, hltbData) {
  const minutes = game.playtime_forever || 0;
  if (minutes === 0) return 'unplayed';
  if (!hltbData || hltbData.error || !hltbData.mainStory) return 'unmatched';
  const status = getCompletionStatus(minutesToHours(minutes), hltbData.mainStory);
  return status ? COMPLETION_LABEL_TO_STATUS_ID[status.label] : 'unmatched';
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

// ── Steam link routing ────────────────────────────────────────
// Steam registers the steam:// protocol handler when it installs, so
// steam://store/<appid> opens a store page in the desktop client instead of
// a browser tab. That's almost always what someone wants from a library
// dashboard — the client is already running, and the store page there can
// actually install the game.
//
// The preference is deliberately tri-state. `undefined` means "auto": follow
// whether a local Steam install was detected, which is the signal the user
// already gave us by connecting one. Storing a plain boolean instead would
// make "never chose" indistinguishable from "explicitly turned it off", so
// enabling detection later couldn't safely start routing to the client.
export const STEAM_LINK_PREF_KEY = 'steam_dashboard_open_links_in_steam';

/** undefined = auto (follow detection), true/false = explicit user choice. */
export function loadSteamLinkPref() {
  try {
    const raw = localStorage.getItem(STEAM_LINK_PREF_KEY);
    if (raw === null) return undefined;
    return JSON.parse(raw) === true;
  } catch {
    return undefined;
  }
}

export function saveSteamLinkPref(value) {
  try {
    localStorage.setItem(STEAM_LINK_PREF_KEY, JSON.stringify(!!value));
  } catch {}
}

/** Resolve the tri-state preference against whether Steam was actually found. */
export function shouldUseSteamApp(pref, localConfigFound) {
  if (typeof pref === 'boolean') return pref;
  return !!localConfigFound;
}

/**
 * Store-page URL for a game, routed to the desktop client or the web.
 * appid is coerced and validated because it lands in a protocol URL — a
 * non-numeric value has no business being handed to the OS's URL handler.
 */
export function steamStoreUrl(appid, useSteamApp) {
  const id = String(appid ?? '');
  if (!/^\d+$/.test(id)) return null;
  return useSteamApp
    ? `steam://store/${id}`
    : `https://store.steampowered.com/app/${id}`;
}

// Snapshot/cache management
const SNAPSHOT_KEY = 'steam_dashboard_snapshots';
const CONFIG_KEY = 'steam_dashboard_config';

export function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  // Mirror to the persistent data folder (see server.js) so config isn't
  // locked inside this one browser profile. Fire-and-forget — this must
  // never block or fail the UI.
  fetch('/api/user-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }).catch(() => {});
}

export function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
  } catch {
    return {};
  }
}

// Pulls config back from the persistent data folder when localStorage is
// empty (e.g. a cleared browser profile) and repopulates localStorage from
// it. Used once at startup as a fallback — the normal path is loadConfig().
export async function hydrateConfigFromServer() {
  try {
    const res = await fetch('/api/user-config');
    if (!res.ok) return null;
    const { appConfig } = await res.json();
    if (appConfig?.apiKey && appConfig?.steamUrl) {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(appConfig));
      return appConfig;
    }
  } catch {}
  return null;
}

// Clears the server-side mirrors alongside a localStorage reset, so a
// "Reset App" doesn't get silently undone by hydrateConfigFromServer() on
// the next launch.
export async function clearServerMirrors(steamId) {
  try { await fetch('/api/user-config', { method: 'DELETE' }); } catch {}
  if (steamId) {
    try { await fetch(`/api/snapshots/${steamId}`, { method: 'DELETE' }); } catch {}
  }
}

// localStorage holds a WORKING SET, not the record. It's capped because it
// shares a ~5MB per-origin quota with the achievement and HLTB caches, and a
// full snapshot runs ~18KB. The durable copy is the server archive, which is
// delta-encoded and keeps everything (see server.js's SNAPSHOT ARCHIVE note).
export const SNAPSHOT_RETENTION_DAYS = 90;

// One snapshot per calendar day, latest wins. Used for every combine in this
// file: today's entry replaces itself as the day goes on, and history pulled
// back from the archive folds into whatever is already local without
// duplicating days. Mirrors dedupeSnapshotsByDay() in server.js.
export function mergeSnapshotLists(...lists) {
  const byDay = new Map();
  for (const list of lists) {
    for (const s of (list || [])) {
      if (!s || typeof s.timestamp !== 'number' || !Array.isArray(s.games)) continue;
      const key = new Date(s.timestamp).toDateString();
      const existing = byDay.get(key);
      if (!existing || s.timestamp >= existing.timestamp) byDay.set(key, s);
    }
  }
  return [...byDay.values()].sort((a, b) => a.timestamp - b.timestamp);
}

const snapshotSignature = (list) => `${list.length}:${list.map(s => s.timestamp).join(',')}`;

function writeSnapshotsToStorage(steamId, snapshots) {
  const all = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '{}');
  all[steamId] = snapshots;
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(all));
}

export function saveSnapshot(steamId, games, recentGames) {
  try {
    const snapshot = {
      timestamp: Date.now(),
      date: new Date().toDateString(),
      games: games.map(g => ({ appid: g.appid, playtime_forever: g.playtime_forever, playtime_2weeks: g.playtime_2weeks || 0 })),
      recentGames: recentGames.map(g => ({ appid: g.appid, playtime_2weeks: g.playtime_2weeks || 0 }))
    };

    const trimmed = mergeSnapshotLists(loadSnapshots(steamId), [snapshot]).slice(-SNAPSHOT_RETENTION_DAYS);
    writeSnapshotsToStorage(steamId, trimmed);

    // Mirror to the persistent data folder. Posting only the retention window
    // is safe because the server MERGES into its archive rather than
    // replacing it — it used to replace, which quietly capped the durable
    // copy at whatever the client happened to be holding.
    // Failures are non-fatal — localStorage already has the data — but they
    // are NOT silent. A swallowed error here once hid the archive rejecting
    // every post as too large, which quietly disabled the only durable copy.
    fetch(`/api/snapshots/${steamId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshots: trimmed }),
    })
      .then(res => {
        if (!res.ok) console.warn(`Snapshot archive rejected the mirror write (HTTP ${res.status}) — history is only in localStorage until this succeeds.`);
      })
      .catch(err => console.warn('Could not reach the snapshot archive:', err?.message || err));
  } catch (e) {
    console.warn('Failed to save snapshot:', e);
  }
}

// The counterpart to hydrateConfigFromServer, and the reason the archive is
// worth keeping at all: without this, snapshots.json was written but never
// read, so a cleared Chromium profile — or a changed port, which is a
// different ORIGIN and therefore different localStorage — lost the entire
// history while a perfectly good copy sat on disk.
export async function hydrateSnapshotsFromServer(steamId) {
  if (!steamId) return null;
  try {
    const res = await fetch(`/api/snapshots/${steamId}?limit=${SNAPSHOT_RETENTION_DAYS}`);
    if (!res.ok) return null;
    const { snapshots, total } = await res.json();
    if (!Array.isArray(snapshots) || snapshots.length === 0) return null;

    const local = loadSnapshots(steamId);
    const merged = mergeSnapshotLists(local, snapshots).slice(-SNAPSHOT_RETENTION_DAYS);
    if (snapshotSignature(merged) !== snapshotSignature(local)) {
      writeSnapshotsToStorage(steamId, merged);
    }
    return {
      restored: Math.max(0, merged.length - local.length),
      local: merged.length,
      archived: typeof total === 'number' ? total : merged.length,
    };
  } catch {
    return null;
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

// Recency for the UI — "when did this last take a reading, and when's the
// next one". Snapshots are written once per app open, deduped to one a day,
// so the next one lands the next day the app is opened.
export function getSnapshotMeta(steamId) {
  const snapshots = loadSnapshots(steamId);
  if (snapshots.length === 0) return { count: 0, first: null, last: null, takenToday: false };
  const last = snapshots[snapshots.length - 1].timestamp;
  return {
    count: snapshots.length,
    first: snapshots[0].timestamp,
    last,
    takenToday: new Date(last).toDateString() === new Date().toDateString(),
  };
}

// ── Backup / restore ────────────────────────────────────────────────────
// Exports the ARCHIVE (not just the local window), so a backup taken after
// years of use carries all of it rather than the last 90 days.
export const SNAPSHOT_BACKUP_FORMAT = 'steam-stats-snapshot-backup';

export async function buildSnapshotBackup(steamId) {
  let snapshots = loadSnapshots(steamId);
  try {
    const res = await fetch(`/api/snapshots/${steamId}`);
    if (res.ok) {
      const { snapshots: archived } = await res.json();
      if (Array.isArray(archived)) snapshots = mergeSnapshotLists(snapshots, archived);
    }
  } catch {}
  return {
    format: SNAPSHOT_BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    steamId,
    snapshotCount: snapshots.length,
    snapshots,
  };
}

// Merges rather than replaces, so importing an old backup can only ever add
// history back — it can't wipe out days the current install already has.
export async function applySnapshotBackup(payload) {
  if (!payload || payload.format !== SNAPSHOT_BACKUP_FORMAT || !Array.isArray(payload.snapshots)) {
    throw new Error('That doesn’t look like a Steam Stats snapshot backup.');
  }
  const steamId = payload.steamId;
  if (!steamId) throw new Error('The backup file has no Steam ID in it.');

  const local = loadSnapshots(steamId);
  const merged = mergeSnapshotLists(local, payload.snapshots);
  writeSnapshotsToStorage(steamId, merged.slice(-SNAPSHOT_RETENTION_DAYS));

  // Push the whole merged set at the archive, not just the trimmed window,
  // so anything older than the retention cap is preserved on disk.
  try {
    await fetch(`/api/snapshots/${steamId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshots: merged }),
    });
  } catch {}

  return { steamId, added: merged.length - local.length, total: merged.length };
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

// Zero-filled trailing daily unplayed-game-count series (today inclusive),
// for the backlog momentum sparkline. Mirrors getDailyPlaytimeSeries's
// day-walking shape but reads each day's nearest-prior snapshot directly
// (a count, not a delta between two snapshots). Follows the "silent until
// meaningful" convention — returns [] below 2 snapshots rather than a
// single-point chart. A day with no snapshot yet at all gets `count: null`
// (no data), distinct from a day where the backlog was genuinely 0.
export function getUnplayedCountSeries(steamId, days) {
  const snapshots = steamId ? loadSnapshots(steamId) : [];
  if (snapshots.length < 2) return [];

  const series = [];
  const cursor = toMidnight(Date.now());
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setDate(d.getDate() - i);
    const dayEnd = d.getTime() + 24 * 60 * 60 * 1000;

    let snap = null;
    for (const s of snapshots) {
      if (s.timestamp <= dayEnd) snap = s;
      else break;
    }
    const count = snap ? (snap.games || []).filter(g => !g.playtime_forever).length : null;
    series.push({ date: d.toDateString(), timestamp: d.getTime(), count });
  }
  return series;
}

// Games that have been played at some point but have gone quiet the
// longest, ranked by days since rtime_last_played (a live Steam API field,
// unbounded — unlike computeBacklogGraveyard below, this needs no local
// snapshot history to produce a result for a brand-new install).
export function computeDormantLongest(ownedGames) {
  const now = Date.now() / 1000;
  return ownedGames
    .filter(g => g.playtime_forever > 0 && g.rtime_last_played)
    .map(g => ({ ...g, daysSinceLastPlayed: Math.floor((now - g.rtime_last_played) / 86400) }))
    .sort((a, b) => b.daysSinceLastPlayed - a.daysSinceLastPlayed);
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

// ─────────────────────────────────────────────
// PERSONAL PERCENTILE  (§5.1 rebuild)
//
// Frames current activity against the user's OWN history rather than other
// players — sidesteps needing other users' data and avoids the competitive-
// leaderboard comparison anxiety that leaderboard-style stats invite.
// "Top 15% of your days" style framing, computed from daily snapshot
// deltas already saved for the History page / heatmap.
//
// computeWindowPercentile generalizes this to an arbitrary trailing window
// (7/14/30 days, to match the Dashboard's period switcher) by bucketing
// tracked days into non-overlapping windows of that length and ranking the
// most recent window against prior ones. Needs >=3 comparable windows;
// returns null below that rather than a misleadingly precise number from a
// tiny sample.
//
// NOTE: this logic was lost in a container reset before it could be
// re-landed (see PROJECT_STATUS.md §5.1/§7) and has been rebuilt here from
// the documented design rather than restored verbatim — re-verify against
// synthetic data if that matters for your use case.
// ─────────────────────────────────────────────

function buildDailyDeltas(snapshots) {
  const days = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const daysDiff = (curr.timestamp - prev.timestamp) / (1000 * 60 * 60 * 24);
    if (daysDiff > 3) continue; // skip big gaps — not a clean single-day delta

    const prevMap = new Map((prev.games || []).map(g => [g.appid, g.playtime_forever]));
    let minutes = 0;
    for (const g of (curr.games || [])) {
      const delta = g.playtime_forever - (prevMap.get(g.appid) || 0);
      if (delta > 0) minutes += delta;
    }
    days.push({ date: curr.date, timestamp: curr.timestamp, minutes });
  }
  return days;
}

// "Percentage of the comparison pool this value beats or ties" — the
// standard percentile-rank definition. Ties count as half-beaten so a
// value tied with everything else lands at the 50th percentile, not 0 or 100.
function percentileRank(value, pool) {
  if (!pool || pool.length === 0) return null;
  const below = pool.filter(v => v < value).length;
  const tied = pool.filter(v => v === value).length;
  return Math.round(((below + tied * 0.5) / pool.length) * 100);
}

function percentileLabel(pctile, unit) {
  if (pctile === null) return null;
  if (pctile >= 90) return `Top 10% of your ${unit}`;
  if (pctile >= 75) return `Top 25% of your ${unit}`;
  if (pctile <= 10) return `One of your quietest ${unit}`;
  return null;
}

const WINDOW_UNIT_LABELS = {
  1: 'days',
  7: 'weeks',
  14: 'two-week stretches',
  30: '30-day stretches',
};

// The trailing `windowDays`-length stretch vs. prior non-overlapping
// stretches of the same length — e.g. windowDays=7 reproduces "this week
// vs. prior weeks", windowDays=14 compares trailing fortnights, etc.
export function computeWindowPercentile(steamId, windowDays) {
  const days = buildDailyDeltas(steamId ? loadSnapshots(steamId) : []);
  if (days.length < windowDays * 3) return null;

  const windows = [];
  for (let i = 0; i + windowDays <= days.length; i += windowDays) {
    const chunk = days.slice(i, i + windowDays);
    windows.push({
      minutes: chunk.reduce((s, d) => s + d.minutes, 0),
      start: chunk[0].date,
      end: chunk[chunk.length - 1].date,
    });
  }
  if (windows.length < 3) return null; // need at least a couple stretches of history to compare against

  const current = windows[windows.length - 1];
  const history = windows.slice(0, -1);
  const percentile = percentileRank(current.minutes, history.map(w => w.minutes));

  return {
    minutes: current.minutes,
    percentile,
    sampleSize: history.length,
    label: percentileLabel(percentile, WINDOW_UNIT_LABELS[windowDays] || `${windowDays}-day periods`),
  };
}

// Zero-filled trailing daily playtime series (today inclusive) for the bar
// strip in the Dashboard hero. Days with no snapshot coverage show as 0
// rather than being omitted, so the strip always has exactly `days` bars.
export function getDailyPlaytimeSeries(steamId, days) {
  const snapshots = steamId ? loadSnapshots(steamId) : [];
  if (snapshots.length < 2) return [];

  const byDate = new Map(buildDailyDeltas(snapshots).map(d => [d.date, d.minutes]));

  const series = [];
  const cursor = toMidnight(Date.now());
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setDate(d.getDate() - i);
    const dateKey = d.toDateString();
    series.push({ date: dateKey, timestamp: d.getTime(), minutes: byDate.get(dateKey) || 0 });
  }
  return series;
}

// Same idea as getDailyPlaytimeSeries but scoped to one game's playtime_forever
// delta between consecutive snapshots — powers the "In Focus" card's sparkline.
export function getDailyPlaytimeSeriesForGame(steamId, appid, days) {
  const snapshots = steamId ? loadSnapshots(steamId) : [];
  if (snapshots.length < 2) return [];

  const byDate = new Map();
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const daysDiff = (curr.timestamp - prev.timestamp) / (1000 * 60 * 60 * 24);
    if (daysDiff > 3) continue;

    const currGame = (curr.games || []).find(g => g.appid === appid);
    if (!currGame) continue;
    const prevGame = (prev.games || []).find(g => g.appid === appid);
    const delta = currGame.playtime_forever - (prevGame?.playtime_forever || 0);
    if (delta > 0) byDate.set(curr.date, delta);
  }

  const series = [];
  const cursor = toMidnight(Date.now());
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setDate(d.getDate() - i);
    const dateKey = d.toDateString();
    series.push({ date: dateKey, timestamp: d.getTime(), minutes: byDate.get(dateKey) || 0 });
  }
  return series;
}

// ─────────────────────────────────────────────
// DAY-OF-WEEK PATTERN
//
// Buckets the same daily snapshot deltas used for streak/percentile by
// weekday instead of by trailing window — "do you play more on weekends"
// rather than "how does this week compare to past weeks". Needs ~2 weeks of
// tracked days before every weekday has enough samples for an average to
// mean anything.
// ─────────────────────────────────────────────
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MIN_TRACKED_DAYS_FOR_WEEKDAY_PATTERN = 14;

export function computeDayOfWeekPattern(steamId) {
  const days = buildDailyDeltas(steamId ? loadSnapshots(steamId) : []);
  if (days.length < MIN_TRACKED_DAYS_FOR_WEEKDAY_PATTERN) return null;

  const buckets = Array.from({ length: 7 }, () => ({ totalMinutes: 0, sampleCount: 0 }));
  for (const d of days) {
    const jsDay = new Date(d.timestamp).getDay(); // 0=Sun..6=Sat
    const idx = (jsDay + 6) % 7; // 0=Mon..6=Sun, matching the heatmap's week layout
    buckets[idx].totalMinutes += d.minutes;
    buckets[idx].sampleCount += 1;
  }

  return WEEKDAY_LABELS.map((label, i) => ({
    label,
    avgMinutes: buckets[i].sampleCount > 0 ? buckets[i].totalMinutes / buckets[i].sampleCount : 0,
    sampleCount: buckets[i].sampleCount,
  }));
}

// ─────────────────────────────────────────────
// RECENCY BUCKETING
//
// Shared by History's "last touched each game" chart and Library's
// "recency lanes" — both group games by how long since they were last
// played. Reads rtime_last_played (Steam API, unbounded — not limited by
// local snapshot retention) with a fallback to the local-install last-played
// timestamp. Returns null for games that have never been played.
// ─────────────────────────────────────────────
export function daysSincePlayed(game) {
  const ts = game.rtime_last_played || game.localLastPlayed;
  if (!ts) return null;
  return Math.floor((Date.now() / 1000 - ts) / 86400);
}

export const RECENCY_BUCKETS = [
  { id: 'week',    label: 'This week',   maxDays: 7 },
  { id: 'month',   label: 'This month',  maxDays: 30 },
  { id: 'quarter', label: '3 months',    maxDays: 90 },
  { id: 'year',    label: 'This year',   maxDays: 365 },
  { id: 'stale',   label: 'Over a year', maxDays: Infinity },
];

export function recencyBucket(days) {
  if (days == null) return null;
  return RECENCY_BUCKETS.find(b => days <= b.maxDays)?.id ?? 'stale';
}

// ─────────────────────────────────────────────
// ACHIEVEMENT UNLOCK TIMELINE
//
// Steam timestamps every achievement unlock (unlocktime, from
// GetPlayerAchievements) — a real history independent of local snapshot
// retention, unlike playtime deltas which only cover the last 90 days this
// app has been running. Both functions read achCache's earnedDetails
// (populated by getAchievementsForGames) rather than re-fetching anything.
// ─────────────────────────────────────────────
export function computeMonthlyUnlocks(achCache, ownedGames) {
  const nameByAppId = new Map(ownedGames.map(g => [String(g.appid), g.name]));
  const byMonth = new Map(); // 'YYYY-MM' -> Map<appid, count>

  for (const [appid, data] of Object.entries(achCache || {})) {
    for (const a of (data?.earnedDetails || [])) {
      if (!a.unlocktime) continue;
      const key = new Date(a.unlocktime * 1000).toISOString().slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, new Map());
      const gameMap = byMonth.get(key);
      gameMap.set(appid, (gameMap.get(appid) || 0) + 1);
    }
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, gameMap]) => ({
      month,
      count: [...gameMap.values()].reduce((s, n) => s + n, 0),
      games: [...gameMap.entries()]
        .map(([appid, count]) => ({ appid, name: nameByAppId.get(appid) || `App ${appid}`, count }))
        .sort((a, b) => b.count - a.count),
    }));
}

// Segments are relative to the same top games globally (not each year's own
// top games) so the legend stays consistent across the whole chart instead
// of relabeling itself year to year.
export function computeYearlyUnlocks(achCache, ownedGames) {
  const nameByAppId = new Map(ownedGames.map(g => [String(g.appid), g.name]));
  const byYear = new Map(); // year (number) -> Map<appid, count>
  const globalTotals = new Map(); // appid -> count across all years

  for (const [appid, data] of Object.entries(achCache || {})) {
    for (const a of (data?.earnedDetails || [])) {
      if (!a.unlocktime) continue;
      const year = new Date(a.unlocktime * 1000).getUTCFullYear();
      if (!byYear.has(year)) byYear.set(year, new Map());
      byYear.get(year).set(appid, (byYear.get(year).get(appid) || 0) + 1);
      globalTotals.set(appid, (globalTotals.get(appid) || 0) + 1);
    }
  }

  const topAppIds = [...globalTotals.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([appid]) => appid);

  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, gameMap]) => {
      const total = [...gameMap.values()].reduce((s, n) => s + n, 0);
      const topSegments = topAppIds.map(appid => {
        const count = gameMap.get(appid) || 0;
        return { appid, name: nameByAppId.get(appid) || `App ${appid}`, count, pct: total > 0 ? count / total : 0 };
      });
      const otherCount = total - topSegments.reduce((s, t) => s + t.count, 0);
      const segments = [...topSegments, { name: 'Everything else', count: otherCount, pct: total > 0 ? otherCount / total : 0 }]
        .filter(s => s.count > 0);
      return { year, count: total, gameCount: gameMap.size, segments };
    });
}

// ─────────────────────────────────────────────
// LIBRARY DERIVED STATS
//
// Three small facts about the shape of a library that aren't derivable at a
// glance from the raw game list: how concentrated the hours are overall,
// and which single game that concentration actually points to.
// ─────────────────────────────────────────────
export function computeLibraryDerivedStats(ownedGames) {
  const played = ownedGames.filter(g => g.playtime_forever > 0);
  const hours = played.map(g => g.playtime_forever / 60).sort((a, b) => a - b);
  const medianHours = hours.length === 0 ? 0
    : hours.length % 2 === 1 ? hours[(hours.length - 1) / 2]
    : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2;

  const totalHours = played.reduce((s, g) => s + g.playtime_forever, 0) / 60;
  const byHoursDesc = [...played].sort((a, b) => b.playtime_forever - a.playtime_forever);
  const top10Hours = byHoursDesc.slice(0, 10).reduce((s, g) => s + g.playtime_forever, 0) / 60;
  const top10Pct = totalHours > 0 ? Math.round((top10Hours / totalHours) * 100) : 0;

  // The single most-played game and its share of all played hours — turns
  // the abstract "concentration" above into one concrete, personal fact.
  const topGame = byHoursDesc[0] ?? null;
  const topGameName = topGame?.name ?? null;
  const topGamePct = topGame && totalHours > 0 ? Math.round((topGame.playtime_forever / 60 / totalHours) * 100) : 0;

  return { medianHours, top10Pct, topGameName, topGamePct };
}

// ─────────────────────────────────────────────
// DESKTOP VS. DECK SPLIT
//
// GetOwnedGames already returns a per-platform forever-playtime breakdown
// on every game (windows/mac/linux/deck) — playtime_deck_forever specifically
// was fetched but never read anywhere in the app. Framed as a simple ratio
// against playtime_forever rather than a full platform pie: Deck hours
// aren't guaranteed to be a clean subtraction from the windows/linux
// buckets (Proton titles on Deck can report under either), so a "Deck vs.
// everything else" ratio is the honest claim to make from this data.
// ─────────────────────────────────────────────
export function computeDeckSplit(ownedGames) {
  let deckMinutes = 0;
  let totalMinutes = 0;
  for (const g of ownedGames) {
    deckMinutes += g.playtime_deck_forever || 0;
    totalMinutes += g.playtime_forever || 0;
  }
  if (deckMinutes === 0 || totalMinutes === 0) return null;
  return {
    deckMinutes,
    otherMinutes: totalMinutes - deckMinutes,
    totalMinutes,
    deckPct: Math.round((deckMinutes / totalMinutes) * 100),
  };
}

// ─────────────────────────────────────────────
// BACKLOG GRAVEYARD
//
// Ranks unplayed games by how long they've shown playtime_forever === 0
// across snapshot history — the earliest snapshot that already contains a
// game is the best available signal for "how long has this sat untouched",
// since Steam's API doesn't expose a purchase date. This is TRACKED time,
// not owned time: a game bought years ago but only seen since Steam Stats
// started tracking will show however long that's been, not its true age.
// ─────────────────────────────────────────────
export function computeBacklogGraveyard(unplayedGames, steamId) {
  const snapshots = steamId ? loadSnapshots(steamId) : [];
  if (snapshots.length === 0) return [];

  const unplayedIds = new Set(unplayedGames.map(g => g.appid));
  const firstSeen = new Map();

  for (const snap of snapshots) {
    for (const g of (snap.games || [])) {
      if (!unplayedIds.has(g.appid)) continue;
      const existing = firstSeen.get(g.appid);
      if (existing === undefined || snap.timestamp < existing) {
        firstSeen.set(g.appid, snap.timestamp);
      }
    }
  }

  return unplayedGames
    .filter(g => firstSeen.has(g.appid))
    .map(g => {
      const timestamp = firstSeen.get(g.appid);
      return { ...g, firstSeenTimestamp: timestamp, daysTracked: Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24)) };
    })
    .sort((a, b) => b.daysTracked - a.daysTracked);
}

// ─────────────────────────────────────────────
// PLAY STREAK WITH FORGIVENESS  (§5.2 rebuild)
//
// Built with a Duolingo-style "streak freeze" from day one rather than a
// raw every-day-or-reset counter — GitHub's public contribution streak was
// removed after backlash that it encouraged unhealthy daily grinding, which
// this project's own earlier research flagged as a trap to avoid.
//
// A small number of "grace days" absorb missed days without resetting the
// streak or fabricating playtime for that day — a grace day pauses the
// streak, it does not extend it. This matches the semantics validated in
// the bug-fix note in PROJECT_STATUS.md §4: a bridged gap should NOT count
// as additional streak days.
//
// Also carries forward the off-by-one fix from that same session: the
// walk-backward cursor and the earliest-tracked boundary are both
// normalized to midnight before comparison. Comparing a midnight cursor
// against a raw snapshot timestamp (which retains whatever time-of-day it
// was saved at) caused the loop to exit one full day early whenever the
// earliest snapshot happened to be saved after midnight — which is most of
// the time.
//
// NOTE: rebuilt from the documented design after a container reset (see
// PROJECT_STATUS.md §5.2/§7), not restored verbatim. The grace-day pool
// here is a flat allowance rather than a "per rolling window" allowance —
// the original session's exact windowing rule wasn't preserved in the
// status doc in enough detail to reconstruct with confidence, so this is a
// simpler, defensible stand-in. Revisit if you want grace days to refill
// periodically rather than being a one-time budget.
// ─────────────────────────────────────────────

const STREAK_GRACE_DAYS = 2;

function toMidnight(input) {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function computePlayStreak(steamId) {
  const snapshots = steamId ? loadSnapshots(steamId) : [];
  if (snapshots.length < 2) return null;

  const days = buildDailyDeltas(snapshots);
  if (days.length === 0) return null;

  const playedByDate = new Map(days.map(d => [d.date, d.minutes > 0]));

  // FIX (carried from the original bug fix, extended after synthetic
  // testing surfaced a related edge case): use the first day that actually
  // HAS a computed delta as the walk boundary — not the raw first
  // snapshot. buildDailyDeltas() can't produce a delta for the very first
  // snapshot (there's no earlier snapshot to diff it against), so that day
  // never appears in playedByDate. Using snapshots[0]'s timestamp as the
  // boundary caused the walk to reach that untrackable day, find no entry,
  // and spend a grace day on it — even on a perfectly clean streak with
  // nothing actually missed. Verified via synthetic test: a clean 5-day
  // streak was incorrectly reporting 1 grace day spent before this fix.
  const earliestTracked = toMidnight(days[0].timestamp);

  let cursor = toMidnight(Date.now());
  let currentStreak = 0;
  let graceDaysUsed = 0;

  while (cursor >= earliestTracked) {
    const played = !!playedByDate.get(cursor.toDateString());

    if (played) {
      currentStreak++;
    } else if (graceDaysUsed < STREAK_GRACE_DAYS) {
      // Spends a grace day: the streak survives the gap but this day does
      // NOT count toward currentStreak — no playtime is invented for it.
      graceDaysUsed++;
    } else {
      break;
    }

    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    currentStreak,
    graceDaysUsed,
    graceDaysAvailable: STREAK_GRACE_DAYS,
    graceDaysRemaining: STREAK_GRACE_DAYS - graceDaysUsed,
  };
}


// ─────────────────────────────────────────────
// CALENDAR
//
// The day-by-day view needs two things every other snapshot helper here
// throws away: the per-game breakdown behind each daily total, and an
// explicit record of which days we actually have coverage for.
//
// That second part matters more than it sounds. The other snapshot-derived
// charts treat a missing day as zero (getDailyPlaytimeSeries does
// `byDate.get(key) || 0`), which is harmless on a 30px sparkline and a lie
// on a calendar — a blank week reads as "I didn't play" when it really
// means "I didn't open Steam Stats". So days are tri-stated: `played`,
// `idle` (covered by a clean pair and genuinely zero), and `uncovered`
// (no clean pair — we don't know, and we say so).
//
// Attribution is per snapshot pair, not per session. A delta is only
// pinned to a single date when consecutive snapshots are exactly one
// calendar day apart. Wider gaps hold a real total that can't be split
// across the days inside them, so those days stay `uncovered` and carry
// the span total for context rather than having an invented daily figure
// painted on them — which is also what stops "days I happened to open the
// app" from masquerading as "days I played a lot".
// ─────────────────────────────────────────────

export const DAY_STATES = {
  PLAYED: 'played',       // clean 1-day delta, > 0 minutes
  IDLE: 'idle',           // clean 1-day delta, exactly 0 minutes
  UNCOVERED: 'uncovered', // inside tracking range but no clean delta
  UNTRACKED: 'untracked', // before this install started taking snapshots
  FUTURE: 'future',       // hasn't happened yet
};

// Matches the 7-day floor the other daily percentile uses in this file.
const MIN_DAYS_FOR_DAY_PERCENTILE = 7;

// A DAY RECORD is the normalised result of diffing one consecutive snapshot
// pair: `{ from, to, minutes, games: [{ appid, minutes, isFirstPlay }] }`.
//
// Two sources produce these — localStorage's 90-day working set (below) and
// the server's /daily endpoint, which walks the full archive. Both feed
// coverageFromDayRecords, so the rules about what a day MEANS exist exactly
// once no matter how deep the history goes.
export function buildDayRecordsFromSnapshots(snapshots) {
  const records = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const prevMap = new Map((prev.games || []).map(g => [g.appid, g.playtime_forever || 0]));
    const games = [];
    let minutes = 0;
    for (const g of (curr.games || [])) {
      const before = prevMap.get(g.appid);
      const delta = (g.playtime_forever || 0) - (before || 0);
      if (delta <= 0) continue;
      games.push({
        appid: g.appid,
        minutes: delta,
        // Only claimed when the game was already in the previous snapshot
        // sitting at zero. A game that simply wasn't in the last snapshot
        // might be newly bought, or might have been missed — "the first
        // time you played it" is only honest for the case we watched.
        isFirstPlay: before === 0,
      });
      minutes += delta;
    }
    games.sort((a, b) => b.minutes - a.minutes);
    records.push({ from: prev.timestamp, to: curr.timestamp, minutes, games });
  }
  return records;
}

// One record per target day, preferring the freshest. The archive can lag
// localStorage by a moment (the mirror POST is fire-and-forget), so the local
// copy wins for any day both cover.
export function mergeDayRecords(...lists) {
  const byDay = new Map();
  for (const list of lists) {
    for (const r of (list || [])) {
      if (!r || typeof r.from !== 'number' || typeof r.to !== 'number') continue;
      const key = toMidnight(r.to).toDateString();
      const existing = byDay.get(key);
      if (!existing || r.to >= existing.to) byDay.set(key, r);
    }
  }
  return [...byDay.values()].sort((a, b) => a.to - b.to);
}

// THE tri-state rules. Everything the calendar believes about a day is
// decided here and nowhere else — see the section header above for why the
// distinction between "played nothing" and "wasn't watching" is load-bearing.
export function coverageFromDayRecords(records, { firstTracked = null, lastTracked = null } = {}) {
  const byDate = new Map();
  let coveredDays = 0;
  let uncoveredDays = 0;
  let playedDays = 0;

  for (const r of records) {
    const prevMid = toMidnight(r.from);
    const currMid = toMidnight(r.to);
    const dayGap = Math.round((currMid - prevMid) / 86400000);
    if (dayGap < 1) continue; // same-day pair — saveSnapshot dedupes, but don't assume

    const minutes = r.minutes || 0;
    const games = r.games || [];

    if (dayGap === 1) {
      // Keyed off the timestamp rather than any stored `date` string so the
      // two can never disagree — the gap branch below derives its keys the
      // same way, and one source of truth beats two that ought to match.
      byDate.set(currMid.toDateString(), {
        state: minutes > 0 ? DAY_STATES.PLAYED : DAY_STATES.IDLE,
        timestamp: currMid.getTime(),
        minutes,
        games,
      });
      coveredDays++;
      if (minutes > 0) playedDays++;
    } else {
      // The delta is real but belongs to the whole span. Every day in the
      // gap gets the span for context and nothing attributed to it alone.
      const spanFrom = new Date(prevMid);
      spanFrom.setDate(spanFrom.getDate() + 1);
      const span = {
        spanMinutes: minutes,
        spanDays: dayGap,
        spanFrom: spanFrom.toDateString(),
        spanTo: currMid.toDateString(),
        spanGames: games,
      };
      const cursor = new Date(spanFrom);
      while (cursor <= currMid) {
        byDate.set(cursor.toDateString(), {
          state: DAY_STATES.UNCOVERED,
          timestamp: toMidnight(cursor).getTime(),
          minutes: 0,
          games: [],
          ...span,
        });
        uncoveredDays++;
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }

  return {
    byDate,
    // The earliest snapshot's own day has nothing to diff against, so it
    // falls inside the range but resolves as `uncovered` — which is the
    // truth. Sourcing this from the ARCHIVE rather than localStorage is what
    // stops months older than the 90-day working set from being labelled
    // "before tracking started" once real history accumulates behind them.
    firstTracked: firstTracked == null ? null : toMidnight(firstTracked).getTime(),
    lastTracked: lastTracked == null ? null : toMidnight(lastTracked).getTime(),
    coveredDays,
    uncoveredDays,
    playedDays,
  };
}

// The synchronous, local-only path. Reads the 90-day working set, so it's
// instant and works offline — the Calendar renders from this immediately and
// then deepens once the archive answers.
export function computeDailyCoverage(steamId) {
  const snapshots = steamId ? loadSnapshots(steamId) : [];
  if (snapshots.length < 2) {
    return { byDate: new Map(), firstTracked: null, lastTracked: null, coveredDays: 0, uncoveredDays: 0, playedDays: 0 };
  }
  return coverageFromDayRecords(buildDayRecordsFromSnapshots(snapshots), {
    firstTracked: snapshots[0].timestamp,
    lastTracked: snapshots[snapshots.length - 1].timestamp,
  });
}

// The deep path: every day the archive holds, however far back. Merges the
// local working set over the top so today's reading is never stale, then runs
// the same coverage rules over the combined records.
export async function computeArchiveCoverage(steamId) {
  if (!steamId) return null;
  try {
    const res = await fetch(`/api/snapshots/${steamId}/daily`);
    if (!res.ok) return null;
    const { records, firstTracked, lastTracked } = await res.json();
    if (!Array.isArray(records) || records.length === 0) return null;

    const snapshots = loadSnapshots(steamId);
    const localRecords = snapshots.length >= 2 ? buildDayRecordsFromSnapshots(snapshots) : [];
    const merged = mergeDayRecords(records, localRecords);

    const localFirst = snapshots[0]?.timestamp ?? null;
    const localLast = snapshots[snapshots.length - 1]?.timestamp ?? null;
    return coverageFromDayRecords(merged, {
      firstTracked: Math.min(firstTracked ?? Infinity, localFirst ?? Infinity),
      lastTracked: Math.max(lastTracked ?? -Infinity, localLast ?? -Infinity),
    });
  } catch {
    return null;
  }
}

// Resolves one calendar date against the coverage map. Kept next to the map
// itself so the "no entry means uncovered, unless it predates tracking"
// rule lives in one place rather than being re-derived per view.
export function resolveDayState(dateKey, timestamp, coverage, todayTs) {
  if (timestamp > todayTs) return { state: DAY_STATES.FUTURE, minutes: 0, games: [] };
  const entry = coverage.byDate.get(dateKey);
  if (entry) return entry;
  if (coverage.firstTracked == null || timestamp < coverage.firstTracked) {
    return { state: DAY_STATES.UNTRACKED, minutes: 0, games: [] };
  }
  return { state: DAY_STATES.UNCOVERED, minutes: 0, games: [] };
}

// Achievement unlocks bucketed by day. Unlike the snapshot layer this reaches
// back as far as the account does (see the unlock-timeline section above),
// which is what keeps the calendar from being blank for every month that
// predates this app being installed.
//
// Keyed on the LOCAL date, not UTC like computeMonthlyUnlocks: these keys sit
// alongside snapshot dates (which are local toDateString()), and a 9pm unlock
// belongs to that evening rather than to the next UTC day.
export function computeDailyUnlocks(achCache) {
  const grouped = new Map(); // dateString -> Map<appid, achievement[]>

  for (const [appid, data] of Object.entries(achCache || {})) {
    for (const a of (data?.earnedDetails || [])) {
      if (!a.unlocktime) continue;
      const key = new Date(a.unlocktime * 1000).toDateString();
      if (!grouped.has(key)) grouped.set(key, new Map());
      const games = grouped.get(key);
      if (!games.has(appid)) games.set(appid, []);
      games.get(appid).push(a);
    }
  }

  const byDate = new Map();
  for (const [date, games] of grouped) {
    const list = [...games.entries()]
      .map(([appid, achievements]) => ({
        appid,
        achievements: [...achievements].sort((a, b) => a.unlocktime - b.unlocktime),
      }))
      .sort((a, b) => b.achievements.length - a.achievements.length);
    byDate.set(date, {
      count: list.reduce((s, g) => s + g.achievements.length, 0),
      games: list,
    });
  }
  return byDate;
}

// Where one day sits against every other day this install has covered.
// Zero-minute days stay in the pool on purpose — "a top 10% day" should be
// measured against the quiet days too, not only against days you played.
export function computeDayPercentile(dateKey, coverage) {
  const day = coverage.byDate.get(dateKey);
  if (!day || (day.state !== DAY_STATES.PLAYED && day.state !== DAY_STATES.IDLE)) return null;
  const pool = [...coverage.byDate.values()]
    .filter(d => d.state === DAY_STATES.PLAYED || d.state === DAY_STATES.IDLE)
    .map(d => d.minutes);
  if (pool.length < MIN_DAYS_FOR_DAY_PERCENTILE) return null;
  return { percentile: percentileRank(day.minutes, pool), sampleSize: pool.length };
}

// Everything the month rail reports, in one pass over the month's days.
// Returns appids rather than names — the caller already holds ownedGames and
// can resolve them without this needing the whole library passed in.
export function computeMonthSummary(year, month, coverage, unlocksByDate, todayTs = Date.now()) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = toMidnight(todayTs).getTime();

  let totalMinutes = 0;
  let playedDays = 0;
  let coveredDays = 0;
  let uncoveredDays = 0;
  let unlockCount = 0;
  let busiestDay = null;
  let longestStreak = 0;
  let runningStreak = 0;
  const gameMinutes = new Map();
  const firstPlays = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const key = d.toDateString();
    const ts = d.getTime();
    if (ts > today) break;

    unlockCount += unlocksByDate.get(key)?.count || 0;

    const entry = resolveDayState(key, ts, coverage, today);
    if (entry.state === DAY_STATES.UNCOVERED) uncoveredDays++;
    if (entry.state !== DAY_STATES.PLAYED && entry.state !== DAY_STATES.IDLE) {
      // A gap can't extend a run and shouldn't be scored as a break either —
      // the run simply stops being measurable here.
      runningStreak = 0;
      continue;
    }

    coveredDays++;
    totalMinutes += entry.minutes;

    if (entry.minutes > 0) {
      playedDays++;
      runningStreak++;
      longestStreak = Math.max(longestStreak, runningStreak);
      if (!busiestDay || entry.minutes > busiestDay.minutes) {
        busiestDay = { date: key, timestamp: ts, minutes: entry.minutes };
      }
      for (const g of entry.games) {
        gameMinutes.set(g.appid, (gameMinutes.get(g.appid) || 0) + g.minutes);
        if (g.isFirstPlay) firstPlays.push({ appid: g.appid, date: key, timestamp: ts });
      }
    } else {
      runningStreak = 0;
    }
  }

  return {
    totalMinutes,
    playedDays,
    coveredDays,
    uncoveredDays,
    unlockCount,
    busiestDay,
    longestStreak,
    topGames: [...gameMinutes.entries()]
      .map(([appid, minutes]) => ({ appid, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
    firstPlays,
  };
}
