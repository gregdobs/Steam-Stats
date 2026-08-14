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

