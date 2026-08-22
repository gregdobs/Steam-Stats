import { describe, it, expect } from 'vitest';
import { buildNotice } from './Calendar.jsx';
import { DAY_STATES } from '../utils/steam.js';

// The banner's correct state is ABSENT. These exist so that stays true:
// a permanent explainer becomes furniture, and furniture is invisible on the
// day it finally has something worth saying.
const NOW = new Date(2026, 7, 21, 12, 0, 0, 0).getTime();

function coverageWith({ covered = 0, uncoveredRecent = 0 }) {
  const byDate = new Map();
  const cursor = new Date(NOW);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < uncoveredRecent; i++) {
    byDate.set(cursor.toDateString(), { state: DAY_STATES.UNCOVERED });
    cursor.setDate(cursor.getDate() - 1);
  }
  for (let i = 0; i < covered; i++) {
    byDate.set(cursor.toDateString(), { state: DAY_STATES.PLAYED, minutes: 60 });
    cursor.setDate(cursor.getDate() - 1);
  }
  return { byDate, coveredDays: covered, uncoveredDays: uncoveredRecent, playedDays: covered };
}

describe('Calendar contextual notice', () => {
  it('is absent once tracking is healthy — the whole point of the slot', () => {
    const notice = buildNotice({
      coverage: coverageWith({ covered: 60 }),
      totalUnlocks: 900,
      todayTs: NOW,
    });
    expect(notice).toBeNull();
  });

  it('tolerates the odd missed day without nagging', () => {
    const notice = buildNotice({
      coverage: coverageWith({ covered: 40, uncoveredRecent: 3 }),
      totalUnlocks: 900,
      todayTs: NOW,
    });
    expect(notice).toBeNull();
  });

  it('explains the warm-up while there is no coverage at all', () => {
    const notice = buildNotice({ coverage: coverageWith({}), totalUnlocks: 0, todayTs: NOW });
    expect(notice.id).toBe('warmup');
    expect(notice.lead).toMatch(/full day/i);
    // Nothing about achievements when there are none to point at.
    expect(notice.body).not.toMatch(/achievement/i);
  });

  it('mentions the unlock layer during warm-up only when it has something', () => {
    const notice = buildNotice({ coverage: coverageWith({}), totalUnlocks: 880, todayTs: NOW });
    expect(notice.body).toMatch(/achievement/i);
  });

  it('flags a run of uncovered days, because that one is actionable', () => {
    const notice = buildNotice({
      coverage: coverageWith({ covered: 10, uncoveredRecent: 9 }),
      totalUnlocks: 900,
      todayTs: NOW,
    });
    expect(notice.id).toBe('gaps');
    expect(notice.lead).toMatch(/9 of the last 30/);
  });

  it('prefers the warm-up notice over the gap notice — never stacks two', () => {
    const notice = buildNotice({
      coverage: coverageWith({ covered: 0, uncoveredRecent: 20 }),
      totalUnlocks: 5,
      todayTs: NOW,
    });
    expect(notice.id).toBe('warmup');
  });
});
