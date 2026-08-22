import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  daysSincePlayed, recencyBucket,
  computeMonthlyUnlocks, computeYearlyUnlocks,
  computeLibraryDerivedStats,
  getUnplayedCountSeries, computeDormantLongest,
  saveSnapshot,
  shouldUseSteamApp, steamStoreUrl,
  getGameCapsuleFallbacks, STEAM_CDN_HOSTS,
  loadSteamLinkPref, saveSteamLinkPref, STEAM_LINK_PREF_KEY,
  DAY_STATES, computeDailyCoverage, resolveDayState,
  computeDailyUnlocks, computeDayPercentile, computeMonthSummary,
  buildDayRecordsFromSnapshots, coverageFromDayRecords, mergeDayRecords,
  mergeSnapshotLists, loadSnapshots, getSnapshotMeta,
  hydrateSnapshotsFromServer, buildSnapshotBackup, applySnapshotBackup,
  SNAPSHOT_BACKUP_FORMAT,
} from './steam.js';

// saveSnapshot fire-and-forgets a mirror POST; the backup/hydrate suites
// replace this with their own stub. Without a default the node environment's
// real fetch would try to hit a server that isn't running.
const realFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = async () => ({ ok: false, json: async () => ({}) }); });
afterAll(() => { globalThis.fetch = realFetch; });

// The Vitest default (node) environment has no localStorage global, which
// steam.js's snapshot functions depend on — provide a minimal in-memory
// stand-in rather than pulling in a full DOM environment for one API.
function installLocalStorageStub() {
  let store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
}
beforeEach(() => installLocalStorageStub());

// getUnplayedCountSeries/computeBacklogMomentum-style functions read from
// localStorage-backed snapshots via loadSnapshots — seed them the same way
// the app does, through saveSnapshot, rather than poking the storage key
// directly so a schema change to snapshots only needs updating in one place.
function seedSnapshot(steamId, timestamp, games) {
  const realNow = Date.now;
  Date.now = () => timestamp;
  try {
    saveSnapshot(steamId, games, []);
  } finally {
    Date.now = realNow;
  }
}

describe('daysSincePlayed', () => {
  it('returns null when the game has never been played', () => {
    expect(daysSincePlayed({})).toBeNull();
    expect(daysSincePlayed({ rtime_last_played: 0 })).toBeNull();
  });

  it('computes whole days from rtime_last_played (unix seconds)', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const tenDaysAgo = nowSec - 10 * 86400;
    expect(daysSincePlayed({ rtime_last_played: tenDaysAgo })).toBe(10);
  });

  it('falls back to localLastPlayed when rtime_last_played is absent', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const fiveDaysAgo = nowSec - 5 * 86400;
    expect(daysSincePlayed({ localLastPlayed: fiveDaysAgo })).toBe(5);
  });
});

describe('recencyBucket', () => {
  it('returns null for null input (never played)', () => {
    expect(recencyBucket(null)).toBeNull();
  });

  it('buckets boundary days into the correct bucket (inclusive upper bound)', () => {
    expect(recencyBucket(0)).toBe('week');
    expect(recencyBucket(7)).toBe('week');
    expect(recencyBucket(8)).toBe('month');
    expect(recencyBucket(30)).toBe('month');
    expect(recencyBucket(31)).toBe('quarter');
    expect(recencyBucket(90)).toBe('quarter');
    expect(recencyBucket(91)).toBe('year');
    expect(recencyBucket(365)).toBe('year');
    expect(recencyBucket(366)).toBe('stale');
    expect(recencyBucket(3000)).toBe('stale');
  });
});

describe('computeMonthlyUnlocks', () => {
  it('returns an empty array for empty achCache', () => {
    expect(computeMonthlyUnlocks({}, [])).toEqual([]);
  });

  it('ignores achievements with no unlocktime', () => {
    const achCache = { '10': { earnedDetails: [{ apiname: 'a', unlocktime: 0 }, { apiname: 'b' }] } };
    expect(computeMonthlyUnlocks(achCache, [])).toEqual([]);
  });

  it('aggregates by calendar month across games and sorts ascending', () => {
    const jan = Math.floor(new Date('2024-01-15T00:00:00Z').getTime() / 1000);
    const feb = Math.floor(new Date('2024-02-01T00:00:00Z').getTime() / 1000);
    const achCache = {
      '10': { earnedDetails: [{ unlocktime: jan }, { unlocktime: jan }] },
      '20': { earnedDetails: [{ unlocktime: feb }] },
    };
    const ownedGames = [{ appid: 10, name: 'Game A' }, { appid: 20, name: 'Game B' }];
    const result = computeMonthlyUnlocks(achCache, ownedGames);
    expect(result).toEqual([
      { month: '2024-01', count: 2, games: [{ appid: '10', name: 'Game A', count: 2 }] },
      { month: '2024-02', count: 1, games: [{ appid: '20', name: 'Game B', count: 1 }] },
    ]);
  });

  it('falls back to a placeholder name when the game is no longer owned', () => {
    const ts = Math.floor(new Date('2024-03-01T00:00:00Z').getTime() / 1000);
    const achCache = { '99': { earnedDetails: [{ unlocktime: ts }] } };
    const result = computeMonthlyUnlocks(achCache, []);
    expect(result[0].games[0].name).toBe('App 99');
  });
});

describe('computeLibraryDerivedStats', () => {
  it('returns zeros and no top game for an empty library', () => {
    expect(computeLibraryDerivedStats([])).toEqual({ medianHours: 0, top10Pct: 0, topGameName: null, topGamePct: 0 });
  });

  it('returns zeros and no top game when nothing has been played', () => {
    const ownedGames = [{ appid: 1, playtime_forever: 0 }, { appid: 2, playtime_forever: 0 }];
    const result = computeLibraryDerivedStats(ownedGames);
    expect(result.medianHours).toBe(0);
    expect(result.top10Pct).toBe(0);
    expect(result.topGameName).toBe(null);
    expect(result.topGamePct).toBe(0);
  });

  it('computes the median for an odd-length list of played games', () => {
    const ownedGames = [
      { appid: 1, playtime_forever: 60 },   // 1h
      { appid: 2, playtime_forever: 600 },  // 10h
      { appid: 3, playtime_forever: 1200 }, // 20h
    ];
    expect(computeLibraryDerivedStats(ownedGames).medianHours).toBe(10);
  });

  it('computes the median for an even-length list as the average of the two middle values', () => {
    const ownedGames = [
      { appid: 1, playtime_forever: 60 },   // 1h
      { appid: 2, playtime_forever: 300 },  // 5h
      { appid: 3, playtime_forever: 600 },  // 10h
      { appid: 4, playtime_forever: 1200 }, // 20h
    ];
    expect(computeLibraryDerivedStats(ownedGames).medianHours).toBe(7.5);
  });

  it('identifies the single most-played game and its share of total hours', () => {
    const ownedGames = [
      { appid: 1, name: 'Big Game', playtime_forever: 600 },   // 10h
      { appid: 2, name: 'Small Game', playtime_forever: 200 }, // ~3.33h
    ];
    const result = computeLibraryDerivedStats(ownedGames);
    expect(result.topGameName).toBe('Big Game');
    expect(result.topGamePct).toBe(75); // 10 / (10 + 3.33)
  });

  it('caps top10Pct concentration correctly with fewer than 10 played games', () => {
    const ownedGames = [{ appid: 1, playtime_forever: 600 }, { appid: 2, playtime_forever: 600 }];
    // Only 2 played games total — top 10 IS all of them, so concentration is 100%.
    expect(computeLibraryDerivedStats(ownedGames).top10Pct).toBe(100);
  });
});

describe('getUnplayedCountSeries', () => {
  it('returns [] with fewer than 2 snapshots (silent until meaningful)', () => {
    expect(getUnplayedCountSeries('u1', 14)).toEqual([]);
    seedSnapshot('u1', Date.now(), [{ appid: 1, playtime_forever: 0 }]);
    expect(getUnplayedCountSeries('u1', 14)).toEqual([]);
  });

  it('reports the nearest-prior snapshot\'s unplayed count for each day, and null before any snapshot exists', () => {
    const day0 = Date.now() - 5 * 86400000;
    const day3 = Date.now() - 2 * 86400000;
    seedSnapshot('u1', day0, [{ appid: 1, playtime_forever: 0 }, { appid: 2, playtime_forever: 0 }, { appid: 3, playtime_forever: 100 }]);
    seedSnapshot('u1', day3, [{ appid: 1, playtime_forever: 50 }, { appid: 2, playtime_forever: 0 }, { appid: 3, playtime_forever: 100 }]);

    const series = getUnplayedCountSeries('u1', 7);
    expect(series).toHaveLength(7);
    // Before day0, no snapshot yet.
    expect(series[0].count).toBeNull();
    // On/after day0 but before day3: 2 unplayed.
    const atDay0 = series.find(s => Math.abs(s.timestamp - day0) < 86400000);
    expect(atDay0.count).toBe(2);
    // Today (after day3): 1 unplayed (game 1 now has playtime).
    expect(series[series.length - 1].count).toBe(1);
  });
});

describe('computeDormantLongest', () => {
  it('returns [] when nothing has both playtime and a last-played timestamp', () => {
    expect(computeDormantLongest([])).toEqual([]);
    expect(computeDormantLongest([{ appid: 1, playtime_forever: 0, rtime_last_played: 12345 }])).toEqual([]);
    expect(computeDormantLongest([{ appid: 1, playtime_forever: 100, rtime_last_played: 0 }])).toEqual([]);
  });

  it('sorts by days since last played, descending (longest-dormant first)', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const ownedGames = [
      { appid: 1, name: 'Recent', playtime_forever: 100, rtime_last_played: nowSec - 5 * 86400 },
      { appid: 2, name: 'Ancient', playtime_forever: 200, rtime_last_played: nowSec - 900 * 86400 },
      { appid: 3, name: 'Never played', playtime_forever: 0 },
    ];
    const result = computeDormantLongest(ownedGames);
    expect(result.map(g => g.name)).toEqual(['Ancient', 'Recent']);
    expect(result[0].daysSinceLastPlayed).toBe(900);
  });
});

describe('computeYearlyUnlocks', () => {
  it('returns an empty array for empty achCache', () => {
    expect(computeYearlyUnlocks({}, [])).toEqual([]);
  });

  it('handles a year boundary correctly (Dec 31 vs Jan 1 land in different UTC years)', () => {
    const dec31 = Math.floor(new Date('2023-12-31T12:00:00Z').getTime() / 1000);
    const jan1 = Math.floor(new Date('2024-01-01T12:00:00Z').getTime() / 1000);
    const achCache = { '10': { earnedDetails: [{ unlocktime: dec31 }, { unlocktime: jan1 }] } };
    const result = computeYearlyUnlocks(achCache, [{ appid: 10, name: 'Game A' }]);
    expect(result.map(r => r.year)).toEqual([2023, 2024]);
    expect(result[0].count).toBe(1);
    expect(result[1].count).toBe(1);
  });

  it('caps top games at 5 and rolls the remainder into "Everything else"', () => {
    const ts = Math.floor(new Date('2024-06-01T00:00:00Z').getTime() / 1000);
    const counts = [10, 8, 6, 4, 3, 2, 1]; // 7 games; top 5 get named segments
    const achCache = Object.fromEntries(
      counts.map((n, i) => [String(i + 1), { earnedDetails: Array(n).fill({ unlocktime: ts }) }])
    );
    const ownedGames = counts.map((_, i) => ({ appid: i + 1, name: `Game ${i + 1}` }));
    const result = computeYearlyUnlocks(achCache, ownedGames);
    expect(result).toHaveLength(1);
    const { count, gameCount, segments } = result[0];
    const total = counts.reduce((s, n) => s + n, 0);
    const remainder = counts.slice(5).reduce((s, n) => s + n, 0);
    expect(count).toBe(total);
    expect(gameCount).toBe(7);
    expect(segments).toHaveLength(6); // top 5 + "Everything else"
    expect(segments[5]).toEqual({ name: 'Everything else', count: remainder, pct: remainder / total });
  });

  it('segments every year against the same globally-top games, not each year\'s own top 3', () => {
    const y2023 = Math.floor(new Date('2023-06-01T00:00:00Z').getTime() / 1000);
    const y2024 = Math.floor(new Date('2024-06-01T00:00:00Z').getTime() / 1000);
    // Game 1 dominates overall (10 total) but only played in 2023;
    // game 2 is 2024-only. The global top list should still include game 1
    // as a (zero-count) segment in 2024, not silently drop it.
    const achCache = {
      '1': { earnedDetails: Array(10).fill({ unlocktime: y2023 }) },
      '2': { earnedDetails: Array(3).fill({ unlocktime: y2024 }) },
    };
    const ownedGames = [{ appid: 1, name: 'Dominant' }, { appid: 2, name: 'NewThisYear' }];
    const result = computeYearlyUnlocks(achCache, ownedGames);
    const year2024 = result.find(r => r.year === 2024);
    const names = year2024.segments.map(s => s.name);
    expect(names).toContain('NewThisYear');
    expect(names).not.toContain('Dominant'); // 0-count segments are filtered out
  });

  it('omits the "Everything else" segment when there are 5 or fewer games', () => {
    const ts = Math.floor(new Date('2024-06-01T00:00:00Z').getTime() / 1000);
    const achCache = { '1': { earnedDetails: [{ unlocktime: ts }] } };
    const result = computeYearlyUnlocks(achCache, [{ appid: 1, name: 'Solo' }]);
    expect(result[0].segments).toHaveLength(1);
    expect(result[0].segments[0].name).toBe('Solo');
  });
});

describe('Steam link routing', () => {
  beforeEach(() => {
    localStorage.removeItem(STEAM_LINK_PREF_KEY);
  });

  describe('shouldUseSteamApp', () => {
    it('follows detection when no explicit preference is stored', () => {
      expect(shouldUseSteamApp(undefined, true)).toBe(true);
      expect(shouldUseSteamApp(undefined, false)).toBe(false);
    });

    it('lets an explicit preference override detection in both directions', () => {
      // Opted out despite Steam being installed.
      expect(shouldUseSteamApp(false, true)).toBe(false);
      // Opted in even though detection failed — Steam registers the protocol
      // handler at install time, so this can legitimately still work.
      expect(shouldUseSteamApp(true, false)).toBe(true);
    });

    it('treats a missing localConfig as not found rather than throwing', () => {
      expect(shouldUseSteamApp(undefined, undefined)).toBe(false);
      expect(shouldUseSteamApp(undefined, null)).toBe(false);
    });
  });

  describe('steamStoreUrl', () => {
    it('builds a steam:// protocol URL when routing to the desktop client', () => {
      expect(steamStoreUrl(570, true)).toBe('steam://store/570');
    });

    it('builds a web store URL otherwise', () => {
      expect(steamStoreUrl(570, false)).toBe('https://store.steampowered.com/app/570');
    });

    it('accepts numeric strings, since appids arrive as object keys', () => {
      expect(steamStoreUrl('440', true)).toBe('steam://store/440');
    });

    it('returns null for non-numeric appids instead of building a protocol URL', () => {
      // This value would otherwise be handed to the OS URL handler.
      expect(steamStoreUrl('570/../../evil', true)).toBeNull();
      expect(steamStoreUrl(undefined, true)).toBeNull();
      expect(steamStoreUrl(null, false)).toBeNull();
      expect(steamStoreUrl('', true)).toBeNull();
    });
  });

  describe('preference persistence', () => {
    it('reports undefined (auto) when nothing has been saved', () => {
      expect(loadSteamLinkPref()).toBeUndefined();
    });

    it('round-trips an explicit choice, keeping false distinct from unset', () => {
      saveSteamLinkPref(false);
      expect(loadSteamLinkPref()).toBe(false);
      saveSteamLinkPref(true);
      expect(loadSteamLinkPref()).toBe(true);
    });

    it('falls back to auto when the stored value is corrupt', () => {
      localStorage.setItem(STEAM_LINK_PREF_KEY, 'not json');
      expect(loadSteamLinkPref()).toBeUndefined();
    });
  });
});

describe('Steam CDN art fallbacks', () => {
  it('spreads the preferred capsule across every CDN host before changing shape', () => {
    const urls = getGameCapsuleFallbacks(1245620);
    const first3 = urls.slice(0, 3);
    // A host outage kills every asset for every game, so host is varied first.
    expect(first3.every((u) => u.endsWith('/library_600x900.jpg'))).toBe(true);
    expect(new Set(first3.map((u) => new URL(u).host)).size).toBe(3);
  });

  it('does not put every fallback on a single host', () => {
    // The original bug: five paths on cdn.akamai alone, so one unreachable
    // host made every game in the library render the placeholder tile.
    const urls = getGameCapsuleFallbacks(570);
    const hosts = new Set(urls.map((u) => new URL(u).host));
    expect(hosts.size).toBeGreaterThan(1);
  });

  it('prefers a current CDN host over the legacy akamai endpoint', () => {
    const urls = getGameCapsuleFallbacks(570);
    expect(new URL(urls[0]).host).not.toBe('cdn.akamai.steamstatic.com');
    expect(STEAM_CDN_HOSTS[0]).toBe('https://cdn.cloudflare.steamstatic.com');
  });

  it('includes the widely-available header.jpg as a shape fallback', () => {
    const urls = getGameCapsuleFallbacks(570);
    expect(urls.some((u) => u.endsWith('/header.jpg'))).toBe(true);
  });

  it('builds every URL against the requested appid', () => {
    const urls = getGameCapsuleFallbacks(99999);
    expect(urls.every((u) => u.includes('/steam/apps/99999/'))).toBe(true);
  });
});

// ─────────────────────────────────────────────
// CALENDAR
//
// The behaviour worth pinning down here is the tri-state: the calendar's
// whole claim is that "you played nothing" and "we weren't watching" are
// told apart, so the tests below care less about the arithmetic (that's the
// same delta logic the other snapshot helpers use) and more about a gap
// never being allowed to render as a zero — or as a spike on the day the
// app happened to be reopened.
// ─────────────────────────────────────────────

const DAY = 86400000;

// Midnight-anchored so a seeded "day" lines up with the local date key
// computeDailyCoverage derives, regardless of what time the suite runs at.
function dayTs(offsetDays) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.getTime();
}
const keyFor = (offsetDays) => new Date(dayTs(offsetDays)).toDateString();

describe('computeDailyCoverage', () => {
  it('reports nothing at all below two snapshots', () => {
    const c0 = computeDailyCoverage('u1');
    expect(c0.byDate.size).toBe(0);
    expect(c0.firstTracked).toBeNull();

    seedSnapshot('u1', dayTs(-1), [{ appid: 1, playtime_forever: 60 }]);
    const c1 = computeDailyCoverage('u1');
    expect(c1.byDate.size).toBe(0);
    expect(c1.coveredDays).toBe(0);
  });

  it('marks a clean one-day pair as played and keeps the per-game breakdown', () => {
    seedSnapshot('u1', dayTs(-2), [
      { appid: 1, playtime_forever: 100 },
      { appid: 2, playtime_forever: 500 },
    ]);
    seedSnapshot('u1', dayTs(-1), [
      { appid: 1, playtime_forever: 160 },
      { appid: 2, playtime_forever: 530 },
    ]);

    const cov = computeDailyCoverage('u1');
    const day = cov.byDate.get(keyFor(-1));
    expect(day.state).toBe(DAY_STATES.PLAYED);
    expect(day.minutes).toBe(90);
    // Sorted heaviest-first, and only games that actually moved.
    expect(day.games.map(g => [g.appid, g.minutes])).toEqual([[1, 60], [2, 30]]);
    expect(cov.coveredDays).toBe(1);
    expect(cov.playedDays).toBe(1);
  });

  it('distinguishes a covered day with zero playtime from a gap', () => {
    seedSnapshot('u2', dayTs(-2), [{ appid: 1, playtime_forever: 100 }]);
    seedSnapshot('u2', dayTs(-1), [{ appid: 1, playtime_forever: 100 }]);

    const cov = computeDailyCoverage('u2');
    const day = cov.byDate.get(keyFor(-1));
    expect(day.state).toBe(DAY_STATES.IDLE);
    expect(day.minutes).toBe(0);
    expect(cov.coveredDays).toBe(1);
    expect(cov.playedDays).toBe(0);
  });

  it('never attributes a multi-day delta to a single day', () => {
    seedSnapshot('u3', dayTs(-5), [{ appid: 1, playtime_forever: 100 }]);
    seedSnapshot('u3', dayTs(-1), [{ appid: 1, playtime_forever: 400 }]);

    const cov = computeDailyCoverage('u3');
    // Every day the gap spans is uncovered — including the day the app was
    // finally reopened, which is the one that would otherwise show a 5h spike.
    for (const off of [-4, -3, -2, -1]) {
      const day = cov.byDate.get(keyFor(off));
      expect(day.state).toBe(DAY_STATES.UNCOVERED);
      expect(day.minutes).toBe(0);
      expect(day.spanMinutes).toBe(300);
      expect(day.spanDays).toBe(4);
    }
    expect(cov.coveredDays).toBe(0);
    expect(cov.uncoveredDays).toBe(4);
    // The total is still recoverable, just not per-day.
    expect(cov.byDate.get(keyFor(-1)).spanGames).toEqual([{ appid: 1, minutes: 300, isFirstPlay: false }]);
  });

  it('flags a first play only when the game was watched sitting at zero', () => {
    seedSnapshot('u4', dayTs(-2), [
      { appid: 1, playtime_forever: 0 },   // owned, untouched — a real first play
      { appid: 2, playtime_forever: 200 }, // already played before
    ]);
    seedSnapshot('u4', dayTs(-1), [
      { appid: 1, playtime_forever: 45 },
      { appid: 2, playtime_forever: 260 },
      { appid: 3, playtime_forever: 30 },  // absent last time — can't claim it
    ]);

    const games = computeDailyCoverage('u4').byDate.get(keyFor(-1)).games;
    const byId = Object.fromEntries(games.map(g => [g.appid, g.isFirstPlay]));
    expect(byId[1]).toBe(true);
    expect(byId[2]).toBe(false);
    expect(byId[3]).toBe(false);
  });
});

describe('resolveDayState', () => {
  it('separates before-tracking, in-range gaps and the future', () => {
    seedSnapshot('u5', dayTs(-3), [{ appid: 1, playtime_forever: 10 }]);
    seedSnapshot('u5', dayTs(-2), [{ appid: 1, playtime_forever: 70 }]);
    const cov = computeDailyCoverage('u5');
    const today = dayTs(0);

    expect(resolveDayState(keyFor(-30), dayTs(-30), cov, today).state).toBe(DAY_STATES.UNTRACKED);
    expect(resolveDayState(keyFor(-2), dayTs(-2), cov, today).state).toBe(DAY_STATES.PLAYED);
    // Inside the tracked range but with no pair covering it — not a zero.
    expect(resolveDayState(keyFor(-1), dayTs(-1), cov, today).state).toBe(DAY_STATES.UNCOVERED);
    expect(resolveDayState(keyFor(5), dayTs(5), cov, today).state).toBe(DAY_STATES.FUTURE);
  });

  it('treats the first snapshot day as uncovered — there is nothing to diff it against', () => {
    seedSnapshot('u6', dayTs(-3), [{ appid: 1, playtime_forever: 10 }]);
    seedSnapshot('u6', dayTs(-2), [{ appid: 1, playtime_forever: 70 }]);
    const cov = computeDailyCoverage('u6');
    expect(resolveDayState(keyFor(-3), dayTs(-3), cov, dayTs(0)).state).toBe(DAY_STATES.UNCOVERED);
  });
});

describe('computeDailyUnlocks', () => {
  const at = (offsetDays, hour) => {
    const d = new Date(dayTs(offsetDays));
    d.setHours(hour, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  };

  it('groups by local day and orders games by how many unlocked', () => {
    const cache = {
      '10': { earnedDetails: [
        { apiname: 'a', unlocktime: at(-1, 10) },
        { apiname: 'b', unlocktime: at(-1, 14) },
        { apiname: 'c', unlocktime: at(-3, 9) },
      ] },
      '20': { earnedDetails: [{ apiname: 'd', unlocktime: at(-1, 11) }] },
    };
    const byDate = computeDailyUnlocks(cache);
    const day = byDate.get(keyFor(-1));
    expect(day.count).toBe(3);
    expect(day.games[0].appid).toBe('10');
    expect(day.games[0].achievements.map(a => a.apiname)).toEqual(['a', 'b']);
    expect(byDate.get(keyFor(-3)).count).toBe(1);
  });

  it('keeps a late-evening unlock on that evening rather than rolling it over', () => {
    const byDate = computeDailyUnlocks({ '10': { earnedDetails: [{ apiname: 'x', unlocktime: at(-1, 23) }] } });
    expect(byDate.has(keyFor(-1))).toBe(true);
    expect(byDate.has(keyFor(0))).toBe(false);
  });

  it('ignores unlocks Steam never dated', () => {
    const byDate = computeDailyUnlocks({ '10': { earnedDetails: [{ apiname: 'x', unlocktime: 0 }] } });
    expect(byDate.size).toBe(0);
  });
});

describe('computeDayPercentile', () => {
  it('stays silent below a week of tracked days', () => {
    for (let i = 5; i >= 0; i--) {
      seedSnapshot('u7', dayTs(-i - 1), [{ appid: 1, playtime_forever: 60 * (6 - i) }]);
    }
    const cov = computeDailyCoverage('u7');
    expect(computeDayPercentile(keyFor(-1), cov)).toBeNull();
  });

  it('ranks a day against every tracked day, quiet ones included', () => {
    // 10 consecutive days: nine at an hour each, the last at ten hours.
    let total = 0;
    for (let i = 10; i >= 0; i--) {
      seedSnapshot('u8', dayTs(-i), [{ appid: 1, playtime_forever: total }]);
      total += i === 1 ? 600 : 60;
    }
    const cov = computeDailyCoverage('u8');
    const busiest = computeDayPercentile(keyFor(0), cov);
    expect(busiest.sampleSize).toBeGreaterThanOrEqual(7);
    expect(busiest.percentile).toBeGreaterThan(80);
  });
});

describe('computeMonthSummary', () => {
  it('totals only the days it can actually speak to, and breaks runs on gaps', () => {
    const anchor = new Date();
    anchor.setHours(12, 0, 0, 0);
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const dayOf = (n) => new Date(year, month, n, 12).getTime();

    // Days 1-3 covered and played, then a gap, then day 8 covered.
    const seed = (n, minutes) => seedSnapshot('u9', dayOf(n), [{ appid: 1, playtime_forever: minutes }]);
    seed(1, 0); seed(2, 60); seed(3, 120); seed(4, 180);
    seed(7, 400); seed(8, 460);

    const cov = computeDailyCoverage('u9');
    const summary = computeMonthSummary(year, month, cov, new Map(), dayOf(28));

    // Days 2,3,4 and 8 are clean pairs; 5,6,7 are a gap and contribute nothing.
    expect(summary.playedDays).toBe(4);
    expect(summary.totalMinutes).toBe(60 + 60 + 60 + 60);
    expect(summary.uncoveredDays).toBeGreaterThan(0);
    expect(summary.longestStreak).toBe(3);
    expect(summary.busiestDay).not.toBeNull();
    expect(summary.topGames[0]).toEqual({ appid: 1, minutes: 240 });
  });

  it('counts unlocks for a month with no playtime coverage at all', () => {
    const anchor = new Date();
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const unlockDay = new Date(year, month, 2, 10).toDateString();
    const unlocks = new Map([[unlockDay, { count: 4, games: [] }]]);

    const cov = computeDailyCoverage('nobody');
    const summary = computeMonthSummary(year, month, cov, unlocks, new Date(year, month, 28, 12).getTime());
    expect(summary.unlockCount).toBe(4);
    expect(summary.coveredDays).toBe(0);
    expect(summary.totalMinutes).toBe(0);
  });
});

// ─────────────────────────────────────────────
// SNAPSHOT DURABILITY
//
// Playtime history is the one thing in this app that can't be re-fetched —
// Steam reports lifetime totals, not sessions, so a day nobody recorded is
// gone permanently. These cover the pieces that keep it: merging without
// duplicating days, restoring from the archive, and a backup round-trip that
// can only ever add days back.
// ─────────────────────────────────────────────

function snap(offsetDays, games, atHour = 12) {
  const d = new Date();
  d.setHours(atHour, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return {
    timestamp: d.getTime(),
    date: d.toDateString(),
    games: games.map(([appid, playtime_forever]) => ({ appid, playtime_forever, playtime_2weeks: 0 })),
    recentGames: [],
  };
}

describe('mergeSnapshotLists', () => {
  it('keeps one snapshot per calendar day, preferring the later reading', () => {
    const morning = snap(-1, [[1, 100]], 9);
    const evening = snap(-1, [[1, 260]], 21);
    const merged = mergeSnapshotLists([morning], [evening]);
    expect(merged).toHaveLength(1);
    expect(merged[0].games[0].playtime_forever).toBe(260);
  });

  it('orders by timestamp regardless of which list a day came from', () => {
    const merged = mergeSnapshotLists([snap(-1, [[1, 300]])], [snap(-3, [[1, 100]]), snap(-2, [[1, 200]])]);
    expect(merged.map(s => s.games[0].playtime_forever)).toEqual([100, 200, 300]);
  });

  it('drops malformed entries instead of poisoning the history', () => {
    const merged = mergeSnapshotLists(
      [snap(-1, [[1, 100]])],
      [null, undefined, { timestamp: 'nope', games: [] }, { games: [] }, { timestamp: Date.now() }],
    );
    expect(merged).toHaveLength(1);
  });
});

describe('snapshot backup round-trip', () => {
  const STEAM_ID = '765611980000';

  // buildSnapshotBackup/applySnapshotBackup both reach for the server archive.
  // Stub it so these test the merge semantics, not the transport.
  function stubFetch({ archived = [], onPost } = {}) {
    globalThis.fetch = async (url, opts) => {
      if (opts?.method === 'POST') {
        onPost?.(JSON.parse(opts.body).snapshots);
        return { ok: true, json: async () => ({ saved: true }) };
      }
      return { ok: true, json: async () => ({ snapshots: archived, total: archived.length }) };
    };
  }

  it('exports the archive, not just the local working set', async () => {
    saveSnapshot(STEAM_ID, [{ appid: 1, playtime_forever: 500 }], []);
    // The archive holds an older day that localStorage no longer does.
    stubFetch({ archived: [snap(-40, [[1, 10]])] });

    const backup = await buildSnapshotBackup(STEAM_ID);
    expect(backup.format).toBe(SNAPSHOT_BACKUP_FORMAT);
    expect(backup.steamId).toBe(STEAM_ID);
    expect(backup.snapshotCount).toBe(2);
    expect(backup.snapshots.map(s => s.games[0].playtime_forever)).toEqual([10, 500]);
  });

  it('restores days the current install has lost', async () => {
    let posted = null;
    stubFetch({ onPost: s => { posted = s; } });

    const backup = {
      format: SNAPSHOT_BACKUP_FORMAT,
      version: 1,
      steamId: STEAM_ID,
      snapshots: [snap(-3, [[1, 100]]), snap(-2, [[1, 200]])],
    };
    // Local has only today.
    saveSnapshot(STEAM_ID, [{ appid: 1, playtime_forever: 300 }], []);
    expect(loadSnapshots(STEAM_ID)).toHaveLength(1);

    const result = await applySnapshotBackup(backup);
    expect(result.added).toBe(2);
    expect(result.total).toBe(3);
    expect(loadSnapshots(STEAM_ID)).toHaveLength(3);
    // The whole merged set goes at the archive, so nothing older than the
    // local retention cap is dropped on the way through.
    expect(posted).toHaveLength(3);
  });

  it('never removes days the backup happens to lack', async () => {
    stubFetch({});
    saveSnapshot(STEAM_ID, [{ appid: 1, playtime_forever: 900 }], []);
    const before = loadSnapshots(STEAM_ID).length;

    await applySnapshotBackup({
      format: SNAPSHOT_BACKUP_FORMAT, version: 1, steamId: STEAM_ID,
      snapshots: [snap(-9, [[1, 5]])],
    });

    const after = loadSnapshots(STEAM_ID);
    expect(after.length).toBe(before + 1);
    expect(after.some(s => s.games[0].playtime_forever === 900)).toBe(true);
  });

  it('rejects a file that is not one of ours rather than corrupting history', async () => {
    stubFetch({});
    saveSnapshot(STEAM_ID, [{ appid: 1, playtime_forever: 42 }], []);
    await expect(applySnapshotBackup({ some: 'other json' })).rejects.toThrow(/Steam Stats snapshot backup/);
    await expect(applySnapshotBackup({ format: SNAPSHOT_BACKUP_FORMAT, snapshots: [] })).rejects.toThrow(/Steam ID/);
    expect(loadSnapshots(STEAM_ID)).toHaveLength(1);
  });
});

describe('hydrateSnapshotsFromServer', () => {
  const STEAM_ID = '765611980001';

  it('pulls history back into a profile that has none', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ snapshots: [snap(-2, [[1, 10]]), snap(-1, [[1, 70]])], total: 2 }),
    });
    expect(loadSnapshots(STEAM_ID)).toHaveLength(0);

    const result = await hydrateSnapshotsFromServer(STEAM_ID);
    expect(result.restored).toBe(2);
    expect(loadSnapshots(STEAM_ID)).toHaveLength(2);
  });

  it('reports the archive depth even when nothing needed restoring', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ snapshots: [snap(-1, [[1, 70]])], total: 400 }),
    });
    await hydrateSnapshotsFromServer(STEAM_ID);
    const again = await hydrateSnapshotsFromServer(STEAM_ID);
    expect(again.restored).toBe(0);
    expect(again.archived).toBe(400);
  });

  it('leaves local history alone when the archive is unreachable', async () => {
    saveSnapshot(STEAM_ID, [{ appid: 1, playtime_forever: 123 }], []);
    globalThis.fetch = async () => { throw new Error('offline'); };
    expect(await hydrateSnapshotsFromServer(STEAM_ID)).toBeNull();
    expect(loadSnapshots(STEAM_ID)).toHaveLength(1);
  });
});

describe('getSnapshotMeta', () => {
  it('reports nothing for an install with no history', () => {
    expect(getSnapshotMeta('765611980002')).toEqual({ count: 0, first: null, last: null, takenToday: false });
  });

  it('flags whether today already has a reading', () => {
    const id = '765611980003';
    saveSnapshot(id, [{ appid: 1, playtime_forever: 10 }], []);
    const meta = getSnapshotMeta(id);
    expect(meta.count).toBe(1);
    expect(meta.takenToday).toBe(true);
    expect(meta.last).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// DEEP HISTORY
//
// The Calendar reads coverage from two places — localStorage's 90-day working
// set and the archive's /daily records, which can span years. These pin down
// that both paths mean the same thing, because the whole tri-state guarantee
// falls over if they diverge.
// ─────────────────────────────────────────────

function recDay(offsetDays) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.getTime();
}

describe('day records', () => {
  it('produce identical coverage whether built locally or handed over as records', () => {
    const snaps = [
      { timestamp: recDay(-4), date: '', games: [{ appid: 1, playtime_forever: 0 }, { appid: 2, playtime_forever: 100 }] },
      { timestamp: recDay(-3), date: '', games: [{ appid: 1, playtime_forever: 45 }, { appid: 2, playtime_forever: 100 }] },
      { timestamp: recDay(-2), date: '', games: [{ appid: 1, playtime_forever: 45 }, { appid: 2, playtime_forever: 100 }] },
    ];
    const records = buildDayRecordsFromSnapshots(snaps);
    const fromRecords = coverageFromDayRecords(records, {
      firstTracked: snaps[0].timestamp,
      lastTracked: snaps[snaps.length - 1].timestamp,
    });

    // Same input via the localStorage path.
    for (const s of snaps) {
      seedSnapshot('deep-parity', s.timestamp, s.games);
    }
    const fromStorage = computeDailyCoverage('deep-parity');

    const shape = c => JSON.stringify({
      covered: c.coveredDays, uncovered: c.uncoveredDays, played: c.playedDays,
      days: [...c.byDate.entries()].map(([k, v]) => [k, v.state, v.minutes]).sort(),
    });
    expect(shape(fromRecords)).toBe(shape(fromStorage));
  });

  it('marks a first play the same way the local path does', () => {
    const records = buildDayRecordsFromSnapshots([
      { timestamp: recDay(-2), games: [{ appid: 1, playtime_forever: 0 }, { appid: 2, playtime_forever: 10 }] },
      { timestamp: recDay(-1), games: [{ appid: 1, playtime_forever: 30 }, { appid: 2, playtime_forever: 40 }, { appid: 3, playtime_forever: 5 }] },
    ]);
    const byId = Object.fromEntries(records[0].games.map(g => [g.appid, g.isFirstPlay]));
    expect(byId[1]).toBe(true);   // watched at zero
    expect(byId[2]).toBe(false);  // already had time
    expect(byId[3]).toBe(false);  // wasn't in the previous snapshot at all
  });
});

describe('coverageFromDayRecords', () => {
  it('keeps a gap uncovered instead of dropping the whole delta on the return day', () => {
    const cov = coverageFromDayRecords(
      [{ from: recDay(-6), to: recDay(-1), minutes: 400, games: [{ appid: 1, minutes: 400 }] }],
      { firstTracked: recDay(-6), lastTracked: recDay(-1) },
    );
    expect(cov.coveredDays).toBe(0);
    expect(cov.uncoveredDays).toBe(5);
    for (const day of cov.byDate.values()) {
      expect(day.state).toBe(DAY_STATES.UNCOVERED);
      expect(day.minutes).toBe(0);
      expect(day.spanMinutes).toBe(400);
    }
  });

  it('takes firstTracked from the archive so old months are not called untracked', () => {
    const archiveStart = recDay(-800);
    const cov = coverageFromDayRecords(
      [{ from: recDay(-3), to: recDay(-2), minutes: 60, games: [] }],
      { firstTracked: archiveStart, lastTracked: recDay(-2) },
    );
    // A day a year back sits INSIDE the tracked range, so it must resolve as
    // "no coverage" — not "before tracking started", which would be a lie
    // once the archive reaches further back than the local working set.
    const oldDay = recDay(-400);
    const state = resolveDayState(new Date(oldDay).toDateString(), oldDay, cov, Date.now()).state;
    expect(state).toBe(DAY_STATES.UNCOVERED);
    // Genuinely before the archive begins, though, is still untracked.
    const ancient = recDay(-900);
    expect(resolveDayState(new Date(ancient).toDateString(), ancient, cov, Date.now()).state)
      .toBe(DAY_STATES.UNTRACKED);
  });
});

describe('mergeDayRecords', () => {
  it('prefers the fresher record when the archive and local set overlap', () => {
    const stale = { from: recDay(-2), to: recDay(-1) - 3600000, minutes: 30, games: [] };
    const fresh = { from: recDay(-2), to: recDay(-1), minutes: 95, games: [] };
    const merged = mergeDayRecords([stale], [fresh]);
    expect(merged).toHaveLength(1);
    expect(merged[0].minutes).toBe(95);
  });

  it('keeps deep archive days alongside recent local ones, in order', () => {
    const merged = mergeDayRecords(
      [{ from: recDay(-400), to: recDay(-399), minutes: 10, games: [] }],
      [{ from: recDay(-2), to: recDay(-1), minutes: 20, games: [] }],
    );
    expect(merged.map(r => r.minutes)).toEqual([10, 20]);
  });

  it('ignores malformed records rather than letting them become phantom days', () => {
    const merged = mergeDayRecords(
      [{ from: recDay(-2), to: recDay(-1), minutes: 20, games: [] }],
      [null, { to: recDay(-1) }, { from: 'x', to: 'y' }],
    );
    expect(merged).toHaveLength(1);
  });
});
