import { describe, it, expect, beforeEach } from 'vitest';
import {
  daysSincePlayed, recencyBucket,
  computeMonthlyUnlocks, computeYearlyUnlocks,
  computeLibraryDerivedStats,
  getUnplayedCountSeries, computeDormantLongest,
  saveSnapshot,
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
  it('returns zeros for an empty library', () => {
    expect(computeLibraryDerivedStats([])).toEqual({ medianHours: 0, top10Pct: 0, gamesToHit50PctPlayed: 0 });
  });

  it('returns zeros when nothing has been played, and needs half the library launched', () => {
    const ownedGames = [{ appid: 1, playtime_forever: 0 }, { appid: 2, playtime_forever: 0 }];
    const result = computeLibraryDerivedStats(ownedGames);
    expect(result.medianHours).toBe(0);
    expect(result.top10Pct).toBe(0);
    expect(result.gamesToHit50PctPlayed).toBe(1); // ceil(2*0.5) - 0
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

  it('reports 0 games needed once half the library is already played', () => {
    const ownedGames = [
      { appid: 1, playtime_forever: 60 }, { appid: 2, playtime_forever: 60 },
      { appid: 3, playtime_forever: 0 }, { appid: 4, playtime_forever: 0 },
    ];
    expect(computeLibraryDerivedStats(ownedGames).gamesToHit50PctPlayed).toBe(0);
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

  it('caps top games at 3 and rolls the remainder into "Everything else"', () => {
    const ts = Math.floor(new Date('2024-06-01T00:00:00Z').getTime() / 1000);
    const achCache = {
      '1': { earnedDetails: Array(10).fill({ unlocktime: ts }) },
      '2': { earnedDetails: Array(8).fill({ unlocktime: ts }) },
      '3': { earnedDetails: Array(6).fill({ unlocktime: ts }) },
      '4': { earnedDetails: Array(4).fill({ unlocktime: ts }) },
      '5': { earnedDetails: Array(2).fill({ unlocktime: ts }) },
    };
    const ownedGames = [1, 2, 3, 4, 5].map(id => ({ appid: id, name: `Game ${id}` }));
    const result = computeYearlyUnlocks(achCache, ownedGames);
    expect(result).toHaveLength(1);
    const { count, gameCount, segments } = result[0];
    expect(count).toBe(30);
    expect(gameCount).toBe(5);
    expect(segments).toHaveLength(4); // top 3 + "Everything else"
    expect(segments[3]).toEqual({ name: 'Everything else', count: 6, pct: 0.2 });
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

  it('omits the "Everything else" segment when there are 3 or fewer games', () => {
    const ts = Math.floor(new Date('2024-06-01T00:00:00Z').getTime() / 1000);
    const achCache = { '1': { earnedDetails: [{ unlocktime: ts }] } };
    const result = computeYearlyUnlocks(achCache, [{ appid: 1, name: 'Solo' }]);
    expect(result[0].segments).toHaveLength(1);
    expect(result[0].segments[0].name).toBe('Solo');
  });
});
