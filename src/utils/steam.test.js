import { describe, it, expect, beforeEach } from 'vitest';
import {
  daysSincePlayed, recencyBucket,
  computeMonthlyUnlocks, computeYearlyUnlocks,
  computeLibraryDerivedStats,
  getUnplayedCountSeries, computeDormantLongest,
  saveSnapshot,
  shouldUseSteamApp, steamStoreUrl,
  getGameCapsuleFallbacks, STEAM_CDN_HOSTS,
  loadSteamLinkPref, saveSteamLinkPref, STEAM_LINK_PREF_KEY,
} from './steam.js';

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
