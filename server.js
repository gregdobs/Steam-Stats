import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────
// PERSISTENT DATA DIRECTORY
// release/ gets deleted and rebuilt from scratch by build-release.js on
// every `npm run build:release`, so anything stored next to server.js
// (as the caches below used to be) is lost the moment a user replaces
// their install folder with a new release. Storing everything in the
// OS-standard per-user data location instead means it survives that —
// and gives the user one real, browsable folder for what this app
// persists (config, snapshot history, API caches) instead of it being
// scattered across dotfiles and browser localStorage.
// ─────────────────────────────────────────────
function getDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'SteamStats');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'SteamStats');
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'SteamStats');
}

const DATA_DIR = getDataDir();
const CACHE_DIR = path.join(DATA_DIR, 'cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

// One-time migration: earlier versions kept these dotfiles next to
// server.js. Move them into the persistent folder the first time this
// runs so upgrading users don't lose their existing caches.
function migrateLegacyFile(oldPath, newPath) {
  if (!fs.existsSync(oldPath) || fs.existsSync(newPath)) return;
  try {
    fs.renameSync(oldPath, newPath);
  } catch {
    try {
      fs.copyFileSync(oldPath, newPath);
      fs.unlinkSync(oldPath);
    } catch {}
  }
}
migrateLegacyFile(path.join(__dirname, '.genre-cache.json'), path.join(CACHE_DIR, 'genre-cache.json'));
migrateLegacyFile(path.join(__dirname, '.rarity-cache.json'), path.join(CACHE_DIR, 'rarity-cache.json'));
migrateLegacyFile(path.join(__dirname, '.hltb-state.json'), path.join(CACHE_DIR, 'hltb-state.json'));

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const SNAPSHOTS_FILE = path.join(DATA_DIR, 'snapshots.json');

function readJsonFile(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {}
  return fallback;
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn(`Failed to write ${filePath}:`, err.message);
  }
}

const app = express();
const PORT = 3001;

// ─────────────────────────────────────────────
// SECURITY MIDDLEWARE
//
// This server only ever binds to localhost and is used by a single local
// user — it's not an internet-facing multi-tenant API, so things like JWT
// auth, Redis-backed rate limiting, and CSRF tokens don't apply here. But a
// few protections are essentially free and worth having regardless:
//   - helmet() for standard security headers (clickjacking, MIME-sniffing,
//     XSS protections) — CSP is relaxed rather than default-strict because
//     this server also serves its own built React frontend AND the browser
//     loads game cover art directly from Steam's CDN, both of which a
//     strict default CSP would silently break.
//   - CORS scoped to the actual dev/prod origins this app uses, instead of
//     wide open to any origin.
// ─────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Vite's built output and React's dev tooling need inline/eval in
      // some cases; keeping this permissive avoids silently breaking the
      // bundled frontend this server serves statically.
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      // Game cover art and hero images load directly from Steam's CDN, and
      // player avatars load from a separate steamstatic subdomain. Steam
      // fronts these with three edge providers (akamai/cloudflare/fastly),
      // and newer titles' art additionally comes from the "shared" per-
      // asset-hash path (see /api/steam/artwork-fallback below) rather than
      // the flat cdn.* path — all of those need to be whitelisted or the
      // browser silently drops the image in the packaged build.
      imgSrc: [
        "'self'", "data:",
        "https://cdn.akamai.steamstatic.com", "https://cdn.cloudflare.steamstatic.com", "https://cdn.fastly.steamstatic.com",
        "https://shared.akamai.steamstatic.com", "https://shared.cloudflare.steamstatic.com", "https://shared.fastly.steamstatic.com",
        "https://avatars.steamstatic.com", "https://avatars.akamai.steamstatic.com", "https://avatars.cloudflare.steamstatic.com", "https://avatars.fastly.steamstatic.com",
      ],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
    },
  },
  // Only relevant for HTTPS deployments; harmless to leave enabled locally.
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  // Scoped to the actual origins this app runs on — the Vite dev server
  // (5173) and the packaged app serving itself (3001), each reachable by
  // plain localhost or by the friendly steamstats.localhost alias (see
  // bootstrap.cjs / README) — rather than allowing any origin to call
  // this API.
  origin: [
    'http://localhost:5173', 'http://localhost:3001', 'http://127.0.0.1:5173', 'http://127.0.0.1:3001',
    'http://steamstats.localhost:5173', 'http://steamstats.localhost:3001',
  ],
}));
app.use(express.json());

// Catches anything that slips past individual route try/catches so the
// server logs clearly and stays up, instead of crashing silently or
// leaving a request hanging forever.
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
});

// ─────────────────────────────────────────────
// API KEY HANDLING
//
// The Steam API key was previously passed as a ?apiKey= query parameter on
// every request. Query strings get written to server access logs and
// browser history by default, which is unnecessary exposure for a secret,
// even on a localhost-only server. This middleware accepts the key via an
// `x-steam-api-key` header instead and copies it onto req.query.apiKey, so
// none of the existing route handlers below need individual changes — they
// keep reading req.query.apiKey exactly as before, they just get it from a
// safer transport now. The query-string fallback is kept temporarily so
// nothing breaks if a stray client request still uses the old shape.
// ─────────────────────────────────────────────
app.use((req, res, next) => {
  const headerKey = req.get('x-steam-api-key');
  if (headerKey && !req.query.apiKey) {
    req.query.apiKey = headerKey;
  }
  next();
});

// ─────────────────────────────────────────────
// STEAM API PROXY
//
// Steam returns 403 for both a genuinely invalid key and a brand-new key
// that hasn't finished activating yet — that's the single most common
// first-run failure, and until this helper existed every proxy endpoint
// masked it behind a generic 500, so the client fell back to guessing
// (usually landing on "profile not found," which sent people to the wrong
// setting). Forwarding Steam's real status + a targeted message lets the
// client tell an auth problem apart from a lookup problem apart from a
// network problem instead of collapsing all three into one message.
// ─────────────────────────────────────────────
function forwardSteamError(res, err) {
  const status = err.response?.status;
  if (status === 401 || status === 403) {
    return res.status(status).json({
      error: 'Steam rejected this API key. Double-check it at steamcommunity.com/dev/apikey — new keys can take a minute to activate.',
      code: 'invalid_api_key',
    });
  }
  if (!err.response) {
    return res.status(502).json({
      error: "Couldn't reach Steam's servers. Check your internet connection and try again.",
      code: 'steam_unreachable',
    });
  }
  res.status(status).json({ error: err.message, code: 'steam_error' });
}

app.get('/api/steam/resolve-vanity', async (req, res) => {
  const { apiKey, vanity } = req.query;
  try {
    const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${vanity}`;
    const response = await axios.get(url, { timeout: 8000 });
    res.json(response.data);
  } catch (err) {
    forwardSteamError(res, err);
  }
});

app.get('/api/steam/player-summary', async (req, res) => {
  const { apiKey, steamId } = req.query;
  try {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`;
    const response = await axios.get(url, { timeout: 10000 });
    res.json(response.data);
  } catch (err) {
    forwardSteamError(res, err);
  }
});

app.get('/api/steam/owned-games', async (req, res) => {
  const { apiKey, steamId } = req.query;
  try {
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true`;
    const response = await axios.get(url, { timeout: 15000 });
    res.json(response.data);
  } catch (err) {
    forwardSteamError(res, err);
  }
});

app.get('/api/steam/recent-games', async (req, res) => {
  const { apiKey, steamId } = req.query;
  try {
    const url = `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${apiKey}&steamid=${steamId}&count=20`;
    const response = await axios.get(url, { timeout: 10000 });
    res.json(response.data);
  } catch (err) {
    forwardSteamError(res, err);
  }
});

// ─────────────────────────────────────────────
// GENRE DATA — cached forever on disk (genres don't change)
// Steam store API is unauthenticated but rate-limited (~200 req/5min unofficial)
// so we fetch slowly in the background and cache aggressively.
// ─────────────────────────────────────────────

const GENRE_CACHE_FILE = path.join(CACHE_DIR, 'genre-cache.json');
let genreCache = {};
let genreFetchQueue = [];
let genreFetchInProgress = false;

function loadGenreCache() {
  try {
    if (fs.existsSync(GENRE_CACHE_FILE)) {
      genreCache = JSON.parse(fs.readFileSync(GENRE_CACHE_FILE, 'utf8'));
      console.log(`✅ Genre cache loaded: ${Object.keys(genreCache).length} games`);
    }
  } catch (err) {
    console.warn('Genre cache load failed:', err.message);
    genreCache = {};
  }
}

function saveGenreCache() {
  try {
    fs.writeFileSync(GENRE_CACHE_FILE, JSON.stringify(genreCache), 'utf8');
  } catch (err) {
    console.warn('Genre cache save failed:', err.message);
  }
}

// Rate-limited markers expire after this long so the game gets automatically
// retried on a future load rather than being permanently stuck until someone
// manually calls /api/steam/genres/retry-rate-limited.
const RATE_LIMIT_RETRY_AFTER_MS = 10 * 60 * 1000; // 10 minutes

function isRateLimitExpired(entry) {
  return entry.rateLimited && (Date.now() - entry.fetchedAt) > RATE_LIMIT_RETRY_AFTER_MS;
}

async function fetchGenreForApp(appId) {
  try {
    const res = await axios.get('https://store.steampowered.com/api/appdetails', {
      params: { appids: appId, filters: 'genres,categories' },
      timeout: 10000,
    });
    const entry = res.data?.[appId];
    if (entry?.success && entry.data) {
      const genres = (entry.data.genres || []).map(g => g.description);
      const isMultiplayer = (entry.data.categories || []).some(c =>
        /multi-player|co-op|pvp/i.test(c.description || '')
      );
      genreCache[appId] = { genres, isMultiplayer, fetchedAt: Date.now() };
      return { ok: true };
    } else {
      // Mark as attempted-but-failed so we don't retry every session
      genreCache[appId] = { genres: [], isMultiplayer: false, fetchedAt: Date.now(), notFound: true };
      return { ok: true };
    }
  } catch (err) {
    const status = err.response?.status;
    if (status === 429) {
      // Rate limited — cache a marker so we don't immediately retry the same
      // appId every session (it'll expire on its own next time the cache is
      // cleared or the game re-queued). The bigger fix is backing off the
      // WHOLE queue below, since 429 means Steam is throttling us generally,
      // not just for this one appId.
      genreCache[appId] = { genres: [], isMultiplayer: false, fetchedAt: Date.now(), rateLimited: true };
      console.warn(`Genre fetch rate-limited for ${appId} (429) — backing off`);
      return { ok: false, rateLimited: true };
    }
    // Other errors (timeout, network blip) — don't cache, worth retrying later
    console.warn(`Genre fetch failed for ${appId}:`, err.message);
    return { ok: false, rateLimited: false };
  }
}

// Process the genre fetch queue STRICTLY SERIALLY, one request at a time.
// A previous version tried 4-concurrent staggered batches on the theory
// that Steam's store API tolerates short bursts — that was wrong in
// practice: it produced 429s across ~34 games in a single load. Serial
// requests with a real delay is the only version of this that's actually
// been verified not to trip the rate limiter.
const GENRE_DELAY_MS = 1200;
const GENRE_BACKOFF_MS = 15000; // pause the whole queue after hitting a 429

async function processGenreQueue() {
  if (genreFetchInProgress) return;
  genreFetchInProgress = true;

  while (genreFetchQueue.length > 0) {
    const appId = genreFetchQueue.shift();
    // Skip if genuinely cached — but allow retry if it was rate-limited
    // and enough time has passed since.
    if (genreCache[appId] && !isRateLimitExpired(genreCache[appId])) continue;

    const result = await fetchGenreForApp(appId);
    saveGenreCache();

    if (result.rateLimited) {
      console.log(`⏸️  Genre queue backing off ${GENRE_BACKOFF_MS / 1000}s after rate limit...`);
      await new Promise(r => setTimeout(r, GENRE_BACKOFF_MS));
    } else {
      await new Promise(r => setTimeout(r, GENRE_DELAY_MS));
    }
  }

  genreFetchInProgress = false;
}

// Returns cached genres immediately; queues any missing appIds for background fetch
app.post('/api/steam/genres', async (req, res) => {
  const { appIds } = req.body;
  if (!Array.isArray(appIds)) return res.status(400).json({ error: 'appIds array required' });

  const result = {};
  const missing = [];

  for (const appId of appIds) {
    if (genreCache[appId] && !isRateLimitExpired(genreCache[appId])) {
      result[appId] = genreCache[appId];
    } else {
      missing.push(appId);
    }
  }

  // Queue missing ones for background fetch (dedupe)
  for (const appId of missing) {
    if (!genreFetchQueue.includes(appId)) genreFetchQueue.push(appId);
  }
  if (missing.length > 0) processGenreQueue();

  res.json({ genres: result, pending: missing.length, cached: Object.keys(result).length });
});

app.get('/api/steam/genres/status', (req, res) => {
  const entries = Object.values(genreCache);
  res.json({
    cachedCount: entries.length,
    rateLimitedCount: entries.filter(e => e.rateLimited).length,
    notFoundCount: entries.filter(e => e.notFound).length,
    queueLength: genreFetchQueue.length,
    fetchInProgress: genreFetchInProgress,
  });
});

// Clears only rate-limited markers (keeps everything successfully fetched)
// so the next request re-queues just the games that got 429'd, instead of
// losing the whole cache or leaving them permanently stuck.
app.post('/api/steam/genres/retry-rate-limited', (req, res) => {
  let cleared = 0;
  for (const appId of Object.keys(genreCache)) {
    if (genreCache[appId].rateLimited) {
      delete genreCache[appId];
      cleared++;
    }
  }
  saveGenreCache();
  console.log(`🔄 Cleared ${cleared} rate-limited genre entries for retry`);
  res.json({ cleared });
});

// Full manual clear — everything gets re-fetched lazily as the user
// browses (see processGenreQueue), so this is safe: slower next load for
// a big library, no data loss.
app.post('/api/steam/genres/clear-cache', (req, res) => {
  const cleared = Object.keys(genreCache).length;
  genreCache = {};
  saveGenreCache();
  console.log(`🗑️  Genre cache cleared (${cleared} entries)`);
  res.json({ cleared });
});

app.get('/api/steam/achievements', async (req, res) => {
  const { apiKey, steamId, appId } = req.query;
  try {
    const [playerAch, gameSchema] = await Promise.all([
      axios.get(`https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${apiKey}&steamid=${steamId}&appid=${appId}`, { timeout: 8000 }),
      axios.get(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${apiKey}&appid=${appId}`, { timeout: 8000 })
    ]);
    res.json({ player: playerAch.data, schema: gameSchema.data });
  } catch (err) {
    res.json({ player: null, schema: null, error: err.message });
  }
});

app.get('/api/steam/achievements-batch', async (req, res) => {
  const { apiKey, steamId, appIds } = req.query;
  const ids = appIds.split(',').slice(0, 20);
  try {
    const results = await Promise.allSettled(
      ids.map(appId =>
        Promise.all([
          axios.get(`https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${apiKey}&steamid=${steamId}&appid=${appId}`, { timeout: 6000 }),
          axios.get(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${apiKey}&appid=${appId}`, { timeout: 6000 })
        ])
      )
    );
    const data = {};
    ids.forEach((appId, i) => {
      if (results[i].status === 'fulfilled') {
        const [playerRes, schemaRes] = results[i].value;
        const playerAchs = playerRes.data?.playerstats?.achievements || [];
        const schemaAchs = schemaRes.data?.game?.availableGameStats?.achievements || [];
        const schemaByName = new Map(schemaAchs.map(s => [s.name, s]));
        const earnedAchs = playerAchs.filter(a => a.achieved === 1);
        // Most recent unlock timestamp across all earned achievements
        const lastUnlockTime = earnedAchs
          .filter(a => a.unlocktime > 0)
          .reduce((max, a) => Math.max(max, a.unlocktime), 0) || null;
        // Per-achievement detail for earned-only (name/icon/unlock time) — the
        // schema lookup already happens above for the aggregate count, this
        // just keeps the per-achievement rows instead of discarding them, so
        // the Achievement Rarity widget can cross-reference them against
        // global unlock percentages without a second round of API calls.
        const earnedDetails = earnedAchs.map(a => {
          const schema = schemaByName.get(a.apiname);
          return {
            apiname: a.apiname,
            displayName: schema?.displayName || a.apiname,
            description: schema?.description || null,
            icon: schema?.icon || null,
            unlocktime: a.unlocktime,
          };
        });
        data[appId] = {
          earned: earnedAchs.length,
          total: schemaAchs.length,
          pct: schemaAchs.length > 0 ? Math.round((earnedAchs.length / schemaAchs.length) * 100) : null,
          lastUnlockTime,
          earnedDetails,
        };
      } else {
        data[appId] = { earned: 0, total: 0, pct: null, lastUnlockTime: null, earnedDetails: [] };
      }
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// ACHIEVEMENT RARITY — global unlock % per achievement, cached to disk.
// GetGlobalAchievementPercentagesForApp is unauthenticated (no key needed)
// and defaults to XML output unless format=json is passed explicitly.
// Cached like genres — percentages drift slowly, so a stale re-fetch window
// of a month is plenty fresh for a "rarest achievements you own" widget.
// ─────────────────────────────────────────────
const RARITY_CACHE_FILE = path.join(CACHE_DIR, 'rarity-cache.json');
let rarityCache = {};
const RARITY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function loadRarityCache() {
  try {
    if (fs.existsSync(RARITY_CACHE_FILE)) {
      rarityCache = JSON.parse(fs.readFileSync(RARITY_CACHE_FILE, 'utf8'));
      console.log(`✅ Achievement rarity cache loaded: ${Object.keys(rarityCache).length} games`);
    }
  } catch (err) {
    console.warn('Rarity cache load failed:', err.message);
    rarityCache = {};
  }
}

function saveRarityCache() {
  try {
    fs.writeFileSync(RARITY_CACHE_FILE, JSON.stringify(rarityCache), 'utf8');
  } catch (err) {
    console.warn('Rarity cache save failed:', err.message);
  }
}

app.post('/api/steam/achievement-rarity', async (req, res) => {
  const { appIds } = req.body;
  if (!Array.isArray(appIds)) return res.status(400).json({ error: 'appIds array required' });
  const ids = appIds.slice(0, 40);

  const missing = ids.filter(id => !rarityCache[id] || (Date.now() - rarityCache[id].fetchedAt) > RARITY_TTL_MS);

  if (missing.length > 0) {
    await Promise.allSettled(missing.map(async (appId) => {
      try {
        const r = await axios.get('https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/', {
          params: { gameid: appId, format: 'json' },
          timeout: 8000,
        });
        const achievements = r.data?.achievementpercentages?.achievements || [];
        const percentages = {};
        // Steam returns percent as a numeric string (e.g. "49.9") even with
        // format=json — coerce here so consumers can rely on it being a number.
        for (const a of achievements) percentages[a.name] = parseFloat(a.percent);
        rarityCache[appId] = { percentages, fetchedAt: Date.now() };
      } catch (err) {
        // Leave uncached on failure (network blip, no global stats for this
        // app) so it's retried next time rather than permanently empty.
      }
    }));
    saveRarityCache();
  }

  const result = {};
  for (const id of ids) result[id] = rarityCache[id]?.percentages || {};
  res.json({ percentages: result });
});

// Full manual clear — re-fetched on demand per game (only when its
// achievements are actually viewed), so this is safe: no data loss.
app.post('/api/steam/achievement-rarity/clear-cache', (req, res) => {
  const cleared = Object.keys(rarityCache).length;
  rarityCache = {};
  saveRarityCache();
  console.log(`🗑️  Achievement rarity cache cleared (${cleared} entries)`);
  res.json({ cleared });
});

// ─────────────────────────────────────────────
// ARTWORK FALLBACK
// The flat cdn.akamai.steamstatic.com/steam/apps/{appid}/{file}.jpg paths
// GameImage.jsx tries first 404 for some newer titles (Steam has migrated
// those assets to a per-asset-hash path under shared.akamai.steamstatic.com
// /store_item_assets/...). The store appdetails API returns the current
// hashed URLs directly, so this is a last-resort lookup for when every flat
// CDN guess has already failed — cached in-memory since it's a static
// per-appid result and the store API doesn't send CORS headers, so it can't
// be called directly from the browser.
// ─────────────────────────────────────────────
const artworkFallbackCache = new Map();

app.get('/api/steam/artwork-fallback', async (req, res) => {
  const { appid } = req.query;
  if (!appid) return res.status(400).json({ error: 'appid required' });
  if (artworkFallbackCache.has(appid)) return res.json(artworkFallbackCache.get(appid));

  try {
    const { data } = await axios.get('https://store.steampowered.com/api/appdetails', {
      params: { appids: appid, filters: 'basic' },
      timeout: 6000,
    });
    const entry = data?.[appid];
    const result = entry?.success
      ? { headerImage: entry.data.header_image || null, capsuleImage: entry.data.capsule_image || null }
      : { headerImage: null, capsuleImage: null };
    artworkFallbackCache.set(appid, result);
    res.json(result);
  } catch (err) {
    res.json({ headerImage: null, capsuleImage: null });
  }
});

// ─────────────────────────────────────────────
// HOWLONGTOBEAT
// Auto-fetches auth token from /api/bleed/init on startup and
// refreshes every 5 minutes. No hardcoded tokens required.
// Manual override available via Settings if auto-fetch fails.
// ─────────────────────────────────────────────

const hltbCache        = new Map();
const HLTB_BASE        = 'https://howlongtobeat.com';
const HLTB_SEARCH_URL  = `${HLTB_BASE}/api/bleed`;
const HLTB_INIT_URL    = `${HLTB_BASE}/api/bleed/init`;
const HLTB_TOKEN_TTL   = 4 * 60 * 1000; // refresh every 4 min (token valid ~5 min)
const HLTB_STATE_FILE  = path.join(CACHE_DIR, 'hltb-state.json');

// Runtime state — populated by fetchHltbAuthToken()
let hltb = {
  token:         null,
  hpKey:         null,
  hpVal:         null,
  cookie:        null,
  ua:            null,      // UA used during init — must match on search
  expiry:        0,
  manualToken:   null,      // user-supplied override
  lastError:     null,
  lastFetchAt:   null,
  fetchCount:    0,
};

// User-agents to rotate through on each init attempt
const HLTB_UAS = [
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
];

// Persist/restore state so restarts don't require re-fetching immediately
function saveHltbState() {
  try {
    fs.writeFileSync(HLTB_STATE_FILE, JSON.stringify({
      token:       hltb.token,
      hpKey:       hltb.hpKey,
      hpVal:       hltb.hpVal,
      cookie:      hltb.cookie,
      ua:          hltb.ua,
      expiry:      hltb.expiry,
      manualToken: hltb.manualToken,
      savedAt:     Date.now(),
    }), 'utf8');
  } catch {}
}

function loadHltbState() {
  try {
    if (!fs.existsSync(HLTB_STATE_FILE)) return;
    const saved = JSON.parse(fs.readFileSync(HLTB_STATE_FILE, 'utf8'));
    // Only restore if token is still valid
    if (saved.expiry && saved.expiry > Date.now()) {
      hltb.token       = saved.token;
      hltb.hpKey       = saved.hpKey;
      hltb.hpVal       = saved.hpVal;
      hltb.cookie      = saved.cookie;
      hltb.ua          = saved.ua;
      hltb.expiry      = saved.expiry;
      console.log(`✅ HLTB: restored cached token (expires ${new Date(saved.expiry).toLocaleTimeString()})`);
    }
    if (saved.manualToken) {
      hltb.manualToken = saved.manualToken;
      console.log(`✅ HLTB: restored manual token override`);
    }
  } catch {}
}

async function fetchHltbAuthToken(force = false) {
  // Manual override always wins
  if (hltb.manualToken) return hltb.manualToken;

  // Return cached token if still valid
  if (!force && hltb.token && Date.now() < hltb.expiry) return hltb.token;

  // Rotate UA on each fetch attempt
  const ua = HLTB_UAS[hltb.fetchCount % HLTB_UAS.length];
  hltb.fetchCount++;

  try {
    console.log(`🔑 HLTB: fetching token (attempt ${hltb.fetchCount}, UA: ${ua.slice(0, 40)}...)`);
    const res = await axios.get(`${HLTB_INIT_URL}?t=${Date.now()}`, {
      headers: {
        'User-Agent':      ua,
        'Referer':         `${HLTB_BASE}/`,
        'Origin':          HLTB_BASE,
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'sec-fetch-dest':  'empty',
        'sec-fetch-mode':  'cors',
        'sec-fetch-site':  'same-origin',
      },
      timeout: 12000,
    });

    const token = res.data?.token;
    if (!token) {
      hltb.lastError = `Init returned no token: ${JSON.stringify(res.data).slice(0, 100)}`;
      console.log(`⚠️  HLTB: ${hltb.lastError}`);
      return null;
    }

    hltb.token     = token;
    hltb.hpKey     = res.data?.hpKey || null;
    hltb.hpVal     = res.data?.hpVal || null;
    hltb.ua        = ua;  // store UA used — must match on search requests
    hltb.expiry    = Date.now() + HLTB_TOKEN_TTL;
    hltb.lastError = null;
    hltb.lastFetchAt = new Date().toISOString();

    // Capture session cookie
    const setCookie = res.headers['set-cookie'];
    if (setCookie) {
      const alive = setCookie.find(c => c.startsWith('hltb_alive='));
      if (alive) hltb.cookie = alive.split(';')[0];
    }

    saveHltbState();
    console.log(`✅ HLTB: token fetched, hpKey=${hltb.hpKey}, cookie=${hltb.cookie ? 'yes' : 'no'}`);
    return token;

  } catch (err) {
    hltb.lastError = `${err.response?.status || ''} ${err.message}`;
    console.error(`❌ HLTB: token fetch failed — ${hltb.lastError}`);
    return null;
  }
}

// Schedule automatic token refresh
function scheduleHltbRefresh() {
  setTimeout(async () => {
    if (!hltb.manualToken) {
      await fetchHltbAuthToken(true);
    }
    scheduleHltbRefresh();
  }, HLTB_TOKEN_TTL);
}

async function searchHLTB(gameName) {
  const token = await fetchHltbAuthToken();
  if (!token) throw new Error('HLTB token unavailable — check Settings → HowLongToBeat');

  // Use the UA that was paired with this token
  const ua = hltb.manualToken ? HLTB_UAS[0] : (hltb.ua || HLTB_UAS[0]);

  const searchTerms = gameName.split(' ').filter(t => t.length > 0);

  const payload = {
    searchType: 'games',
    searchTerms,
    searchPage: 1,
    size: 5,
    searchOptions: {
      games: {
        userId: 0,
        platform: '',
        sortCategory: 'popular',
        rangeCategory: 'main',
        rangeTime: { min: null, max: null },
        gameplay: { perspective: '', flow: '', genre: '', difficulty: '' },
        rangeYear: { min: '', max: '' },
        modifier: '',
      },
      users: { sortCategory: 'postcount' },
      lists: { sortCategory: 'follows' },
      filter: '',
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
    // Honeypot field in body (dynamic key name)
    ...(hltb.hpKey && hltb.hpVal ? { [hltb.hpKey]: hltb.hpVal } : {}),
  };

  const res = await axios.post(HLTB_SEARCH_URL, payload, {
    headers: {
      'Content-Type':    'application/json',
      'User-Agent':      ua,
      'Referer':         `${HLTB_BASE}/`,
      'Origin':          HLTB_BASE,
      'Accept':          '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'x-auth-token':    token,
      'sec-fetch-dest':  'empty',
      'sec-fetch-mode':  'cors',
      'sec-fetch-site':  'same-origin',
      ...(hltb.hpKey  ? { 'x-hp-key': hltb.hpKey }  : {}),
      ...(hltb.hpVal  ? { 'x-hp-val': hltb.hpVal }  : {}),
      ...(hltb.cookie ? { 'Cookie':    hltb.cookie } : {}),
    },
    timeout: 15000,
  });

  const games = res.data?.data || [];
  if (games.length === 0) return null;

  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameNorm = normalize(gameName);
  const scored = games.map(g => {
    const gNorm = normalize(g.game_name);
    const score = gNorm === nameNorm ? 100
      : (gNorm.startsWith(nameNorm) || nameNorm.startsWith(gNorm)) ? 80
      : (gNorm.includes(nameNorm)   || nameNorm.includes(gNorm))   ? 60
      : 40;
    return { g, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].g;

  return {
    name:          best.game_name,
    mainStory:     best.comp_main  ? Math.round(best.comp_main  / 3600) : null,
    mainExtra:     best.comp_plus  ? Math.round(best.comp_plus  / 3600) : null,
    completionist: best.comp_100   ? Math.round(best.comp_100   / 3600) : null,
  };
}

// ── HLTB API routes ────────────────────────────────────────

app.get('/api/hltb', async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });
  if (hltbCache.has(name)) return res.json(hltbCache.get(name));
  try {
    const data = await searchHLTB(name);
    hltbCache.set(name, data);
    res.json(data);
  } catch (err) {
    console.error(`HLTB search failed for "${name}":`, err.response?.status, err.message);
    res.json({ error: err.response?.status === 403 ? 'hltb_blocked' : 'hltb_error', message: err.message });
  }
});

app.get('/api/hltb/status', (req, res) => {
  const tokenActive = !!(hltb.manualToken || (hltb.token && Date.now() < hltb.expiry));
  res.json({
    tokenActive,
    mode:         hltb.manualToken ? 'manual' : hltb.token ? 'auto' : 'none',
    hpKey:        hltb.hpKey,
    cacheSize:    hltbCache.size,
    tokenExpiry:  hltb.expiry ? new Date(hltb.expiry).toISOString() : null,
    timeUntilRefresh: hltb.expiry ? Math.max(0, Math.round((hltb.expiry - Date.now()) / 1000)) + 's' : null,
    lastFetchAt:  hltb.lastFetchAt,
    lastError:    hltb.lastError,
    cookie:       hltb.cookie ? 'present' : 'none',
    ua:           hltb.ua ? hltb.ua.slice(0, 50) + '...' : null,
    fetchCount:   hltb.fetchCount,
  });
});

// Force refresh the token immediately
app.post('/api/hltb/refresh-token', async (req, res) => {
  try {
    hltbCache.clear();
    const token = await fetchHltbAuthToken(true);
    res.json({
      success: !!token,
      token: token ? token.slice(0, 12) + '...' : null,
      hpKey: hltb.hpKey,
      error: hltb.lastError,
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Manual token override
app.post('/api/hltb/set-token', (req, res) => {
  const { token, hpKey, hpVal, cookie } = req.body;
  if (!token) {
    hltb.manualToken = null;
    hltbCache.clear();
    saveHltbState();
    console.log('🔄 HLTB: manual token cleared, reverting to auto-fetch');
    return res.json({ cleared: true });
  }
  hltb.manualToken = token.trim();
  if (hpKey) hltb.hpKey = hpKey.trim();
  if (hpVal) hltb.hpVal = hpVal.trim();
  if (cookie) hltb.cookie = cookie.trim();
  hltbCache.clear();
  saveHltbState();
  console.log(`✅ HLTB: manual token set (${token.slice(0, 12)}...)`);
  res.json({ set: true, token: token.slice(0, 12) + '...' });
});

// Clear cache only (keep token)
app.post('/api/hltb/clear-cache', (req, res) => {
  const prev = hltbCache.size;
  hltbCache.clear();
  console.log(`🗑️  HLTB: cache cleared (${prev} entries)`);
  res.json({ cleared: true, previousSize: prev });
});

// LOCAL STEAM VDF READER
// ─────────────────────────────────────────────

// Custom path override — set by user via Settings without editing server.js.
// Persisted to config.json so it survives restarts (previously in-memory
// only, so it silently reset every time the app launched).
let customSteamPath = readJsonFile(CONFIG_FILE, {}).customSteamPath || null;

function findSteamPaths() {
  const platform = os.platform();
  const home = os.homedir();
  const candidates = [];

  // Custom path set at runtime takes priority
  if (customSteamPath) candidates.push(customSteamPath);

  if (platform === 'win32') {
    candidates.push(
      'F:\\Games\\Steam',
      'C:\\Program Files (x86)\\Steam',
      'C:\\Program Files\\Steam',
      'D:\\Steam', 'D:\\Games\\Steam',
      'E:\\Steam', 'E:\\Games\\Steam',
      'G:\\Steam', 'G:\\Games\\Steam',
      path.join(home, 'Steam')
    );
  } else if (platform === 'darwin') {
    candidates.push(path.join(home, 'Library', 'Application Support', 'Steam'));
  } else {
    candidates.push(
      path.join(home, '.steam', 'steam'),
      path.join(home, '.local', 'share', 'Steam')
    );
  }

  return candidates.filter(p => {
    try { return fs.existsSync(p); } catch { return false; }
  });
}

function parseVDF(content) {
  const lines = content.split('\n');
  const stack = [];
  let current = {};
  const root = current;
  let currentKey = null;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('//')) continue;

    if (line === '{') {
      if (currentKey !== null) {
        const child = {};
        current[currentKey] = child;
        stack.push(current);
        current = child;
        currentKey = null;
      }
    } else if (line === '}') {
      if (stack.length > 0) current = stack.pop();
    } else {
      const kvMatch = line.match(/^"([^"]*)"(?:\s+"([^"]*)")?$/);
      if (kvMatch) {
        const key = kvMatch[1];
        const val = kvMatch[2];
        if (val !== undefined) current[key] = val;
        else currentKey = key;
      }
    }
  }
  return root;
}

app.get('/api/local/steam-config', async (req, res) => {
  const steamPaths = findSteamPaths();
  if (steamPaths.length === 0) {
    return res.json({ found: false, message: 'Steam installation not found', searchedPaths: [] });
  }

  const steamPath = steamPaths[0];
  const results = { found: true, steamPath, users: {}, libraryPaths: [] };

  try {
    const userdataPath = path.join(steamPath, 'userdata');
    if (fs.existsSync(userdataPath)) {
      const userDirs = fs.readdirSync(userdataPath).filter(d => /^\d+$/.test(d));
      for (const userId of userDirs) {
        const localConfigPath = path.join(userdataPath, userId, 'config', 'localconfig.vdf');
        if (fs.existsSync(localConfigPath)) {
          try {
            const content = fs.readFileSync(localConfigPath, 'utf8');
            const parsed = parseVDF(content);
            const gamesData = {};
            const software = parsed?.UserLocalConfigStore?.Software?.Valve?.Steam?.apps ||
                            parsed?.UserLocalConfigStore?.apps || {};
            for (const [appId, gameData] of Object.entries(software)) {
              if (gameData && typeof gameData === 'object') {
                gamesData[appId] = {
                  lastPlayed: gameData.LastPlayed ? parseInt(gameData.LastPlayed) : null,
                  launchCount: gameData.LaunchCount ? parseInt(gameData.LaunchCount) : null,
                  playtimeForever: gameData.Playtime ? parseInt(gameData.Playtime) : null,
                };
              }
            }
            results.users[userId] = { userId, gamesData, gameCount: Object.keys(gamesData).length };
          } catch (parseErr) {
            results.users[userId] = { userId, error: parseErr.message };
          }
        }

        const sharedConfigPath = path.join(userdataPath, userId, '7', 'remote', 'sharedconfig.vdf');
        if (fs.existsSync(sharedConfigPath)) {
          try {
            const content = fs.readFileSync(sharedConfigPath, 'utf8');
            const parsed = parseVDF(content);
            const apps = parsed?.UserRoamingConfigStore?.Software?.Valve?.Steam?.apps || {};
            const tags = {};
            for (const [appId, appData] of Object.entries(apps)) {
              if (appData?.tags && typeof appData.tags === 'object') {
                tags[appId] = Object.values(appData.tags);
              }
            }
            if (results.users[userId]) results.users[userId].tags = tags;
          } catch {}
        }
      }
    }

    const libraryFoldersPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
    if (fs.existsSync(libraryFoldersPath)) {
      try {
        const content = fs.readFileSync(libraryFoldersPath, 'utf8');
        const parsed = parseVDF(content);
        const folders = parsed?.libraryfolders || {};
        for (const [key, val] of Object.entries(folders)) {
          if (!isNaN(key) && val?.path) results.libraryPaths.push(val.path);
        }
      } catch {}
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ found: true, steamPath, error: err.message });
  }
});

app.get('/api/local/artwork', async (req, res) => {
  const { appId } = req.query;
  // appId is interpolated directly into a filesystem path below — Steam
  // app IDs are always numeric, so reject anything else before it can be
  // used to construct a path (e.g. "../" segments).
  if (!/^\d+$/.test(appId || '')) return res.status(400).json({ error: 'invalid appId' });
  const steamPaths = findSteamPaths();
  if (steamPaths.length === 0) return res.status(404).json({ error: 'Steam not found' });
  const steamPath = steamPaths[0];
  const cachePath = path.join(steamPath, 'appcache', 'librarycache');
  const suffixes = [`${appId}_library_600x900`, `${appId}_header`, `${appId}_library_hero`];
  for (const suffix of suffixes) {
    for (const ext of ['jpg', 'png']) {
      const filePath = path.join(cachePath, `${suffix}.${ext}`);
      if (fs.existsSync(filePath)) return res.sendFile(filePath);
    }
  }
  res.status(404).json({ error: 'Artwork not found locally' });
});

// ─────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────

app.post('/api/settings/set-steam-path', async (req, res) => {
  const { steamPath } = req.body;
  if (!steamPath) {
    customSteamPath = null;
    writeJsonFile(CONFIG_FILE, { ...readJsonFile(CONFIG_FILE, {}), customSteamPath: null });
    console.log('🔄 Custom Steam path cleared — using auto-detection');
    return res.json({ cleared: true });
  }
  try {
    const exists = fs.existsSync(steamPath);
    const userdataExists = exists && fs.existsSync(path.join(steamPath, 'userdata'));
    if (!userdataExists) {
      return res.json({ valid: false, error: 'Path exists but no userdata folder found — is this your Steam installation folder?' });
    }
    customSteamPath = steamPath;
    writeJsonFile(CONFIG_FILE, { ...readJsonFile(CONFIG_FILE, {}), customSteamPath });
    console.log(`✅ Custom Steam path set: ${steamPath}`);
    res.json({ valid: true, steamPath });
  } catch (err) {
    res.json({ valid: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// PERSISTENT CONFIG & SNAPSHOT MIRROR
// The frontend's source of truth for app config (API key, Steam ID, theme)
// and snapshot history stays localStorage — it's synchronous, and the core
// stats logic in src/utils/steam.js reads it on every render, so switching
// that to an async store is a much bigger change than this app needs. But
// every save also mirrors here, so the data lives in the visible, durable
// data folder instead of being locked inside one browser profile — and on
// a fresh/cleared browser profile, the frontend can pull it back.
// ─────────────────────────────────────────────

app.get('/api/user-config', (req, res) => {
  const { appConfig } = readJsonFile(CONFIG_FILE, {});
  res.json({ appConfig: appConfig || null });
});

app.post('/api/user-config', (req, res) => {
  writeJsonFile(CONFIG_FILE, { ...readJsonFile(CONFIG_FILE, {}), appConfig: req.body });
  res.json({ saved: true });
});

app.delete('/api/user-config', (req, res) => {
  const current = readJsonFile(CONFIG_FILE, {});
  delete current.appConfig;
  writeJsonFile(CONFIG_FILE, current);
  res.json({ cleared: true });
});

app.get('/api/snapshots/:steamId', (req, res) => {
  const all = readJsonFile(SNAPSHOTS_FILE, {});
  res.json({ snapshots: all[req.params.steamId] || [] });
});

app.post('/api/snapshots/:steamId', (req, res) => {
  const { snapshots } = req.body;
  if (!Array.isArray(snapshots)) return res.status(400).json({ error: 'snapshots array required' });
  const all = readJsonFile(SNAPSHOTS_FILE, {});
  all[req.params.steamId] = snapshots;
  writeJsonFile(SNAPSHOTS_FILE, all);
  res.json({ saved: true });
});

app.delete('/api/snapshots/:steamId', (req, res) => {
  const all = readJsonFile(SNAPSHOTS_FILE, {});
  delete all[req.params.steamId];
  writeJsonFile(SNAPSHOTS_FILE, all);
  res.json({ cleared: true });
});

app.get('/api/data-folder', (req, res) => {
  res.json({ path: DATA_DIR });
});

app.post('/api/data-folder/open', (req, res) => {
  const opener = process.platform === 'win32' ? 'explorer'
    : process.platform === 'darwin' ? 'open'
    : 'xdg-open';
  execFile(opener, [DATA_DIR], () => {});
  res.json({ opened: true, path: DATA_DIR });
});

app.post('/api/settings/test-steam-path', async (req, res) => {
  const { steamPath } = req.body;
  if (!steamPath) return res.status(400).json({ error: 'steamPath required' });
  try {
    const exists = fs.existsSync(steamPath);
    const userdataExists = exists && fs.existsSync(path.join(steamPath, 'userdata'));
    const exeExists = exists && (
      fs.existsSync(path.join(steamPath, 'steam.exe')) ||
      fs.existsSync(path.join(steamPath, 'Steam'))
    );
    res.json({ valid: exists && userdataExists, exists, userdataExists, exeExists });
  } catch (err) {
    res.json({ valid: false, error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  const steamPaths = findSteamPaths();
  res.json({
    status: 'ok',
    steamFound: steamPaths.length > 0,
    steamPath: steamPaths[0] || null,
    customSteamPath: customSteamPath || null,
    platform: os.platform(),
    hltbTokenCached: !!(hltb.manualToken || (hltb.token && Date.now() < hltb.expiry)),
    hltbCacheSize: hltbCache.size,
    genreCacheSize: Object.keys(genreCache).length,
    rarityCacheSize: Object.keys(rarityCache).length,
    dataDir: DATA_DIR,
  });
});

// ─────────────────────────────────────────────
// STATIC FRONTEND SERVING (packaged/production mode)
// In normal dev, Vite serves the frontend on :5173 and proxies /api to this
// server. In the packaged .exe there's no separate Vite server — this server
// serves the built dist/ folder directly on the same port as the API.
//
// pkg bundles assets into a virtual filesystem; __dirname correctly resolves
// inside that snapshot, so this path logic works both in dev and packaged.
// ─────────────────────────────────────────────

const DIST_DIR = path.join(__dirname, 'dist');
const distExists = fs.existsSync(DIST_DIR) && fs.existsSync(path.join(DIST_DIR, 'index.html'));

if (distExists) {
  app.use(express.static(DIST_DIR));
  // SPA fallback: any non-API route serves index.html so client-side routing works
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
  console.log(`✅ Serving built frontend from ${DIST_DIR}`);
}

// Bound to loopback only — this is a single-user local app with no reason
// to be reachable from other devices. Without an explicit host, Express
// defaults to 0.0.0.0 (all interfaces), which would expose the local Steam
// data endpoints and settings routes to anyone else on the same network.
app.listen(PORT, '127.0.0.1', () => {
  // steamstats.localhost is a real, working URL, not a placeholder — every
  // modern browser (and this server's own CORS allowlist above) resolves
  // any *.localhost hostname straight to loopback per RFC 6761, no hosts
  // file or DNS setup required. See bootstrap.cjs for why plain "localhost"
  // is deliberately kept for internal/non-browser use instead.
  console.log(`\n🎮 Steam Stats Server running on http://steamstats.localhost:${PORT} (also reachable at http://localhost:${PORT})`);
  console.log(`💾 Data folder: ${DATA_DIR}`);
  const steamPaths = findSteamPaths();
  if (steamPaths.length > 0) {
    console.log(`✅ Steam installation found: ${steamPaths[0]}`);
  } else {
    console.log(`⚠️  Steam installation not found — local data features will be unavailable`);
  }
  // Restore persisted HLTB state from previous run
  loadHltbState();
  // Restore genre cache
  loadGenreCache();
  // Restore achievement rarity cache
  loadRarityCache();
  // Pre-fetch token if not restored from cache
  fetchHltbAuthToken().then(token => {
    if (token) console.log(`✅ HLTB auth token ready`);
    else console.log(`⚠️  HLTB token fetch failed — completion data may be unavailable`);
  });
  // Schedule automatic refresh every 4 minutes
  scheduleHltbRefresh();
});
