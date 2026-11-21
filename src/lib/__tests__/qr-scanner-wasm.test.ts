import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCspHeader } from '@/lib/csp';

/**
 * Scanner QR du client (Safari sur iPhone): sans lecteur QR integre au
 * navigateur, le decodage passe par un module WebAssembly. Constat du
 * 2026-11-17: la bibliotheque le telechargeait sur fastly.jsdelivr.net, la CSP
 * le refusait, et le client voyait "camera non disponible" juste apres
 * l'ouverture de la camera.
 */

const sha = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

/** Le .wasm reellement installe, trouve en suivant la chaine de dependances. */
function installedReaderWasm(): string {
  const fromScanner = createRequire(require.resolve('@yudiel/react-qr-scanner'));
  const fromPonyfill = createRequire(fromScanner.resolve('barcode-detector/ponyfill'));
  return fromPonyfill.resolve('zxing-wasm/reader/zxing_reader.wasm');
}

describe('decodeur du scanner QR servi par notre domaine', () => {
  it("le module importe par QRScanner est celui qu'attend la bibliotheque du scanner", () => {
    // QRScanner.tsx importe zxing-wasm (dependance directe, epinglee) pour que
    // le bundler l'emette sous /_next/static. Si @yudiel/react-qr-scanner monte
    // de version, son zxing-wasm change: aligner la version epinglee.
    const direct = createRequire(path.join(process.cwd(), 'package.json')).resolve(
      'zxing-wasm/reader/zxing_reader.wasm',
    );
    expect(sha(direct)).toBe(sha(installedReaderWasm()));
  });

  it('la CSP de production autorise la compilation WebAssembly, pas eval', () => {
    const env = process.env as Record<string, string | undefined>;
    const before = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      const scriptSrc =
        buildCspHeader('n')
          .split('; ')
          .find((d) => d.startsWith('script-src')) ?? '';
      expect(scriptSrc).toContain("'wasm-unsafe-eval'");
      expect(scriptSrc).not.toContain("'unsafe-eval'");
    } finally {
      env.NODE_ENV = before;
    }
  });
});
