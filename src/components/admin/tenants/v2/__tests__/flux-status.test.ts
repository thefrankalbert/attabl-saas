import { describe, expect, it } from 'vitest';
import { mapFluxStatus } from '../flux-status';

describe('mapFluxStatus', () => {
  it.each([
    ['pending', 'pending'],
    ['confirmed', 'confirmed'],
    ['preparing', 'prep'],
    ['in_progress', 'prep'],
    ['accepted', 'prep'],
    ['ready', 'ready'],
    ['served', 'delivered'],
    ['delivered', 'delivered'],
    ['cancelled', 'cancelled'],
    ['canceled', 'cancelled'],
    ['CANCELLED', 'cancelled'],
  ] as const)('maps %s to %s', (raw, expected) => {
    expect(mapFluxStatus(raw)).toBe(expected);
  });

  it('never shows a cancelled order as pending', () => {
    expect(mapFluxStatus('cancelled')).not.toBe('pending');
  });

  it('falls back to pending for an unknown status', () => {
    expect(mapFluxStatus('something_new')).toBe('pending');
  });
});
