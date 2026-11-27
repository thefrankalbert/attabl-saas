import { describe, it, expect, vi, beforeEach } from 'vitest';

const { check } = vi.hoisted(() => ({ check: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({
  kitchenItemLimiter: { check },
  getClientIp: () => '1.2.3.4',
}));

import { logger } from '@/lib/logger';
import { POST } from '../route';

function requete(type: string, corps: string): Request {
  return new Request('https://attabl.com/api/csp-report', {
    method: 'POST',
    headers: { 'content-type': type },
    body: corps,
  });
}

describe('POST /api/csp-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    check.mockResolvedValue({ success: true, limit: 0, remaining: 0, reset: 0 });
  });

  it('accepte application/csp-report et journalise un resume sans requete', async () => {
    const res = await POST(
      requete(
        'application/csp-report',
        JSON.stringify({
          'csp-report': {
            'document-uri': 'https://attabl.com/reset-password?token=secret123',
            'effective-directive': 'script-src-elem',
            'blocked-uri': `https://evil.example/x.js?q=${'a'.repeat(500)}`,
          },
        }),
      ),
    );
    expect(res.status).toBe(204);
    expect(logger.warn).toHaveBeenCalledWith('CSP violation', {
      directive: 'script-src-elem',
      bloque: 'https://evil.example/x.js',
      page: 'https://attabl.com/reset-password',
    });
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('secret123');
  });

  it('accepte application/reports+json (Reporting API)', async () => {
    const res = await POST(
      requete(
        'application/reports+json',
        JSON.stringify([
          {
            type: 'csp-violation',
            url: 'https://radisson.attabl.com/menu?table=4',
            body: { effectiveDirective: 'img-src', blockedURL: 'https://cdn.example/a.png' },
          },
          { type: 'deprecation', url: 'https://attabl.com/' },
        ]),
      ),
    );
    expect(res.status).toBe(204);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('CSP violation', {
      directive: 'img-src',
      bloque: 'https://cdn.example/a.png',
      page: 'https://radisson.attabl.com/menu',
    });
  });

  it('refuse un corps de plus de 10 ko', async () => {
    const gros = JSON.stringify({ 'csp-report': { 'blocked-uri': 'x'.repeat(11 * 1024) } });
    const res = await POST(requete('application/csp-report', gros));
    expect(res.status).toBe(413);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('refuse un autre type de contenu', async () => {
    const res = await POST(requete('text/plain', 'bonjour'));
    expect(res.status).toBe(415);
  });

  it('refuse un JSON qui n est pas un rapport', async () => {
    const res = await POST(requete('application/csp-report', '{"autre":1}'));
    expect(res.status).toBe(400);
  });

  it('applique le limiteur avant toute lecture', async () => {
    check.mockResolvedValue({ success: false, limit: 0, remaining: 0, reset: 0 });
    const res = await POST(requete('application/csp-report', '{}'));
    expect(res.status).toBe(429);
    expect(check).toHaveBeenCalledWith('csp-report:1.2.3.4');
  });
});
