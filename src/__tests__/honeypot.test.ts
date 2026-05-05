import { describe, it, expect } from 'vitest';
import { isHoneypotTriggered } from '@/lib/honeypot';

describe('isHoneypotTriggered', () => {
  it('returns false when website field is empty string (legitimate browser)', () => {
    expect(isHoneypotTriggered({ email: 'a@b.com', password: 'secret', website: '' })).toBe(false);
  });

  it('returns true when website field is filled (bot)', () => {
    expect(
      isHoneypotTriggered({ email: 'a@b.com', password: 'secret', website: 'https://bot.com' }),
    ).toBe(true);
  });

  it('returns true when website field is a single space', () => {
    expect(isHoneypotTriggered({ website: ' ' })).toBe(true);
  });

  it('returns true when website field is absent (direct API call, not browser)', () => {
    expect(isHoneypotTriggered({ email: 'a@b.com', password: 'secret' })).toBe(true);
  });

  it('returns true for empty object (all fields absent)', () => {
    expect(isHoneypotTriggered({})).toBe(true);
  });

  it('returns true for null body', () => {
    expect(isHoneypotTriggered(null)).toBe(true);
  });

  it('returns true for non-object body', () => {
    expect(isHoneypotTriggered('string')).toBe(true);
    expect(isHoneypotTriggered(42)).toBe(true);
  });

  it('returns true for array body', () => {
    expect(isHoneypotTriggered([])).toBe(true);
    expect(isHoneypotTriggered([{ website: '' }])).toBe(true);
  });

  it('returns true when website is a number (not a string)', () => {
    expect(isHoneypotTriggered({ website: 123 })).toBe(true);
  });
});
