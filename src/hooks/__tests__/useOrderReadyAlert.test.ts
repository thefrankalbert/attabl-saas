import { describe, it, expect } from 'vitest';
import { becameReady, isMyReadyOrder } from '../useOrderReadyAlert';

const ME = 'srv-1';
const mine = new Set(['tb-mine']);

describe('isMyReadyOrder', () => {
  it('order I took becomes ready: mine', () => {
    expect(isMyReadyOrder({ id: 'o', status: 'ready', server_id: ME }, ME, mine)).toBe(true);
  });

  it('customer QR order on a table assigned to me: mine', () => {
    expect(
      isMyReadyOrder({ id: 'o', status: 'ready', server_id: null, table_id: 'tb-mine' }, ME, mine),
    ).toBe(true);
  });

  it('a colleague order on a table that is not mine: not mine', () => {
    expect(
      isMyReadyOrder({ id: 'o', status: 'ready', server_id: 'srv-2', table_id: 'tb-x' }, ME, mine),
    ).toBe(false);
  });

  it('my order but still preparing: no alert', () => {
    expect(isMyReadyOrder({ id: 'o', status: 'preparing', server_id: ME }, ME, mine)).toBe(false);
  });

  it('no table and no taker: not mine', () => {
    expect(isMyReadyOrder({ id: 'o', status: 'ready' }, ME, mine)).toBe(false);
  });
});

describe('becameReady', () => {
  it('first sighting as ready (created after the screen opened): alert', () => {
    expect(becameReady(new Map(), { id: 'o', status: 'ready' })).toBe(true);
  });

  it('preparing then ready: alert once, then a payment edit on the ready order: no alert', () => {
    const seen = new Map<string, string>();
    expect(becameReady(seen, { id: 'o', status: 'preparing' })).toBe(false);
    expect(becameReady(seen, { id: 'o', status: 'ready' })).toBe(true);
    expect(becameReady(seen, { id: 'o', status: 'ready' })).toBe(false);
  });

  it('already ready when the screen opened (seeded): an edit does not ring again', () => {
    const seen = new Map([['o', 'ready']]);
    expect(becameReady(seen, { id: 'o', status: 'ready' })).toBe(false);
  });

  it('sent back to the kitchen and ready again: alert again', () => {
    const seen = new Map([['o', 'ready']]);
    expect(becameReady(seen, { id: 'o', status: 'preparing' })).toBe(false);
    expect(becameReady(seen, { id: 'o', status: 'ready' })).toBe(true);
  });
});
