import { describe, it, expect } from 'vitest';
import { HONEYPOT_FIELD, isHoneypotTriggered } from '@/lib/honeypot';

describe('isHoneypotTriggered', () => {
  it('returns false when honeypot field is empty string (legitimate browser)', () => {
    expect(
      isHoneypotTriggered({ email: 'a@b.com', password: 'secret', [HONEYPOT_FIELD]: '' }),
    ).toBe(false);
  });

  it('returns true when honeypot field is filled (bot)', () => {
    expect(
      isHoneypotTriggered({
        email: 'a@b.com',
        password: 'secret',
        [HONEYPOT_FIELD]: 'https://bot.com',
      }),
    ).toBe(true);
  });

  it('returns false when honeypot field is whitespace only (treated as empty)', () => {
    expect(isHoneypotTriggered({ [HONEYPOT_FIELD]: '   ' })).toBe(false);
  });

  it('returns false when honeypot field is absent (browser JSON payload)', () => {
    expect(isHoneypotTriggered({ email: 'a@b.com', password: 'secret' })).toBe(false);
  });

  it('still accepts legacy website field for bots that target old name', () => {
    expect(isHoneypotTriggered({ website: 'spam' })).toBe(true);
    expect(isHoneypotTriggered({ website: '' })).toBe(false);
  });

  it('returns true for invalid body shapes (direct API abuse)', () => {
    expect(isHoneypotTriggered({})).toBe(false);
    expect(isHoneypotTriggered(null)).toBe(true);
    expect(isHoneypotTriggered('string')).toBe(true);
    expect(isHoneypotTriggered(42)).toBe(true);
    expect(isHoneypotTriggered([])).toBe(true);
  });

  it('returns true when honeypot value is not a string', () => {
    expect(isHoneypotTriggered({ [HONEYPOT_FIELD]: 123 })).toBe(true);
  });
});
