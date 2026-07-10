import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDateRange } from '../useReportData';

/**
 * Characterization + regression tests for getDateRange, the report period math.
 * It had already shipped an off-by-a-day bug (same-day orders dropped, PR #247)
 * and a timezone bug (offset-less strings read as UTC, shifting every window by
 * the local offset). These lock the corrected contract:
 *  - boundaries are absolute UTC instants (ISO with Z),
 *  - anchored to the browser's LOCAL calendar day,
 *  - the previous window is contiguous with the current one (prevEnd = start-1ms).
 *
 * Assertions are timezone-independent (they check local-midnight/instant math),
 * so they pass under any CI timezone.
 */
describe('getDateRange', () => {
  // A fixed mid-afternoon instant so "now" is unambiguously inside the day.
  const FIXED_NOW = new Date('2026-03-15T13:45:30.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const ISO_WITH_Z = /Z$/;

  it('emits absolute UTC instants (ISO with Z), never offset-less strings', () => {
    for (const p of ['today', '7d', '30d', '90d', 'thisMonth', 'lastMonth', 'thisYear'] as const) {
      const r = getDateRange(p);
      expect(r.startDate).toMatch(ISO_WITH_Z);
      expect(r.endDate).toMatch(ISO_WITH_Z);
      expect(r.prevStartDate).toMatch(ISO_WITH_Z);
      expect(r.prevEndDate).toMatch(ISO_WITH_Z);
      // Regression guard: the old bug emitted 'yyyy-MM-ddT00:00:00' with no zone.
      expect(r.startDate).not.toMatch(/T00:00:00$/);
    }
  });

  it("today: start is local midnight, end is 'now'", () => {
    const r = getDateRange('today');
    const start = new Date(r.startDate);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    // End is the current instant (up to now), so same-day orders are included.
    expect(r.endDate).toBe(FIXED_NOW.toISOString());
    expect(new Date(r.endDate).getTime()).toBeGreaterThan(start.getTime());
  });

  it('the previous window is contiguous: prevEnd is exactly 1ms before start', () => {
    for (const p of ['today', '7d', '30d', 'thisMonth', 'lastMonth', 'thisYear'] as const) {
      const r = getDateRange(p);
      expect(new Date(r.prevEndDate).getTime()).toBe(new Date(r.startDate).getTime() - 1);
      expect(new Date(r.startDate).getTime()).toBeLessThanOrEqual(new Date(r.endDate).getTime());
      expect(new Date(r.prevStartDate).getTime()).toBeLessThanOrEqual(
        new Date(r.prevEndDate).getTime(),
      );
    }
  });

  it('7d spans 7 local days: start is local midnight 6 days before today', () => {
    const r = getDateRange('7d');
    const start = new Date(r.startDate);
    expect(start.getHours()).toBe(0);
    const todayMidnight = new Date(FIXED_NOW);
    todayMidnight.setHours(0, 0, 0, 0);
    const days = Math.round((todayMidnight.getTime() - start.getTime()) / 86_400_000);
    expect(days).toBe(6);
  });

  it('lastMonth end covers the whole last day (end-of-day, not midnight)', () => {
    const r = getDateRange('lastMonth');
    const end = new Date(r.endDate);
    // endOfDay -> 23:59:59.999 local
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
  });
});
