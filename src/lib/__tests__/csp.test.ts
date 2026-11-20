import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildCspHeader } from '../csp';

/** Directives verrouillees apres le scan OWASP ZAP du 2026-11-20. */
describe('buildCspHeader en production', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const directives = (): string[] => {
    vi.stubEnv('NODE_ENV', 'production');
    return buildCspHeader('nonce-test').split('; ');
  };

  it("interdit d'afficher l'application dans un cadre d'un autre site", () => {
    expect(directives()).toContain("frame-ancestors 'none'");
  });

  it("n'autorise jamais eval (le polyfill vm d'une dependance en contient un)", () => {
    expect(directives().join('; ')).not.toContain('unsafe-eval');
  });

  it('garde les directives sans repli vers default-src', () => {
    const all = directives();
    expect(all).toContain("base-uri 'self'");
    expect(all).toContain("form-action 'self'");
    expect(all).toContain("object-src 'none'");
  });
});
