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
    // Mot-cle exact, guillemets compris: 'wasm-unsafe-eval' (decodeur QR en
    // WebAssembly) n'autorise que la compilation WASM, pas eval().
    expect(directives().join('; ')).not.toContain("'unsafe-eval'");
  });

  it('autorise la compilation WebAssembly du decodeur QR', () => {
    const script = directives().find((d) => d.startsWith('script-src')) ?? '';
    expect(script).toContain("'wasm-unsafe-eval'");
  });

  it('garde les directives sans repli vers default-src', () => {
    const all = directives();
    expect(all).toContain("base-uri 'none'");
    expect(all).toContain("form-action 'self'");
    expect(all).toContain("object-src 'none'");
  });

  it('envoie les violations a la route de rapports (audit K3.16)', () => {
    expect(directives()).toContain('report-uri /api/csp-report');
  });

  it("n'autorise plus d'appel du navigateur vers le service de taux de change", () => {
    const connect = directives().find((d) => d.startsWith('connect-src')) ?? '';
    expect(connect).not.toContain('exchangerate-api.com');
  });
});
