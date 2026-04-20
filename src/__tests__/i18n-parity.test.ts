import { describe, it, expect } from 'vitest';
import fr from '@/messages/fr-FR.json';
import en from '@/messages/en-US.json';

/**
 * i18n parity: every translation key present in one locale must exist in the
 * other. A missing key at runtime raises a next-intl error and breaks the
 * component that tries to read it. This test catches the gap at build time
 * (on every PR, via the test quality gate).
 */

type Msg = string | { [k: string]: Msg };

function collectPaths(node: Msg, prefix = '', out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(prefix);
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    const next = prefix ? `${prefix}.${key}` : key;
    collectPaths(value, next, out);
  }
  return out;
}

describe('i18n parity (fr-FR vs en-US)', () => {
  const frPaths = new Set(collectPaths(fr as Msg));
  const enPaths = new Set(collectPaths(en as Msg));

  it('every fr-FR key has a matching en-US key', () => {
    const missingInEn = [...frPaths].filter((p) => !enPaths.has(p));
    expect(missingInEn, `Missing in en-US.json:\n  ${missingInEn.join('\n  ')}`).toEqual([]);
  });

  it('every en-US key has a matching fr-FR key', () => {
    const missingInFr = [...enPaths].filter((p) => !frPaths.has(p));
    expect(missingInFr, `Missing in fr-FR.json:\n  ${missingInFr.join('\n  ')}`).toEqual([]);
  });
});
