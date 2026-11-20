import { describe, it, expect } from 'vitest';
import { messageOrigin } from '../sw-message-origin';

const SITE = 'https://radisson.attabl.com';

describe('messageOrigin', () => {
  it('uses event.origin when the browser provides it', () => {
    expect(messageOrigin(SITE, 'https://evil.example/x')).toBe(SITE);
  });

  it('falls back on the sending client URL when origin is empty', () => {
    expect(messageOrigin('', `${SITE}/admin/orders`)).toBe(SITE);
  });

  it('a foreign origin never matches the site', () => {
    expect(messageOrigin('https://evil.example', undefined)).not.toBe(SITE);
    expect(messageOrigin('', 'https://evil.example/admin')).not.toBe(SITE);
  });

  it('returns empty (never same-origin) when nothing is readable', () => {
    expect(messageOrigin('', undefined)).toBe('');
    expect(messageOrigin('', 'not a url')).toBe('');
  });
});
