import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  buildUnsubscribeLinks,
  createUnsubscribeToken,
  isUnsubscribeConfigured,
  normalizeEmailAddress,
  readUnsubscribeToken,
} from '../email-unsubscribe-token';

const SECRET = 'un-secret-de-test-suffisamment-long-0123456789';
const ORIGINAL = {
  secret: process.env.EMAIL_UNSUBSCRIBE_SECRET,
  app: process.env.NEXT_PUBLIC_APP_URL,
};

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/** Change un caractere du jeton sans sortir de l'alphabet base64url. */
function flip(token: string, index: number): string {
  const c = token[index] === 'A' ? 'B' : 'A';
  return token.slice(0, index) + c + token.slice(index + 1);
}

describe('jeton de desabonnement', () => {
  beforeEach(() => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = SECRET;
    process.env.NEXT_PUBLIC_APP_URL = 'https://attabl.com';
  });
  afterEach(() => {
    restore('EMAIL_UNSUBSCRIBE_SECRET', ORIGINAL.secret);
    restore('NEXT_PUBLIC_APP_URL', ORIGINAL.app);
  });

  it('aller-retour: rend l adresse normalisee (casse et espaces ignores)', () => {
    const token = createUnsubscribeToken('  Patron@Resto.TEST ');
    expect(token).not.toBeNull();
    expect(readUnsubscribeToken(token!)).toBe('patron@resto.test');
    expect(normalizeEmailAddress('  Patron@Resto.TEST ')).toBe('patron@resto.test');
  });

  it('l adresse n apparait pas en clair dans le jeton ni dans les liens', () => {
    const links = buildUnsubscribeLinks('patron@resto.test')!;
    for (const url of [links.pageUrl, links.oneClickUrl]) {
      expect(url).not.toContain('patron');
      expect(decodeURIComponent(url)).not.toContain('resto.test');
      const token = new URL(url).searchParams.get('t')!;
      expect(Buffer.from(token, 'base64url').toString('latin1')).not.toContain('patron');
    }
    expect(links.pageUrl.startsWith('https://attabl.com/unsubscribe?t=')).toBe(true);
    expect(links.oneClickUrl.startsWith('https://attabl.com/api/email/unsubscribe?t=')).toBe(true);
  });

  it('deux jetons de la meme adresse different (pas d identifiant devinable ni stable)', () => {
    expect(createUnsubscribeToken('a@b.test')).not.toBe(createUnsubscribeToken('a@b.test'));
  });

  it('falsification: un seul caractere change, a n importe quelle position, est refuse', () => {
    const token = createUnsubscribeToken('patron@resto.test')!;
    for (const i of [0, 1, 5, 14, 20, 30, token.length - 1]) {
      expect(readUnsubscribeToken(flip(token, i))).toBeNull();
    }
  });

  it('dernier caractere change (bits de remplissage base64url): refuse, pour toute longueur', () => {
    // Les bits de remplissage du dernier caractere sont ignores au decodage:
    // sans exigence de forme canonique, A et B y donnaient le meme jeton.
    for (const email of ['a@b.test', 'ab@b.test', 'abc@b.test', 'patron@resto.test']) {
      for (let n = 0; n < 20; n++) {
        const token = createUnsubscribeToken(email)!;
        const last = token[token.length - 1];
        const voisin = String.fromCharCode(last.charCodeAt(0) ^ 1);
        const altere = token.slice(0, -1) + voisin;
        if (/^[A-Za-z0-9_-]$/.test(voisin)) expect(readUnsubscribeToken(altere)).toBeNull();
      }
    }
  });

  it('jeton tronque refuse, quelle que soit la coupe', () => {
    const token = createUnsubscribeToken('patron@resto.test')!;
    for (const n of [1, 10, 29, 40, token.length - 1]) {
      expect(readUnsubscribeToken(token.slice(0, n))).toBeNull();
    }
  });

  it('autre secret: un jeton fabrique ailleurs (autre adresse) est refuse', () => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'un-autre-secret-de-test-tout-aussi-long-987654';
    const forge = createUnsubscribeToken('victime@resto.test')!;
    process.env.EMAIL_UNSUBSCRIBE_SECRET = SECRET;
    expect(readUnsubscribeToken(forge)).toBeNull();
    // Temoin positif: le meme jeton est lu sous son propre secret.
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'un-autre-secret-de-test-tout-aussi-long-987654';
    expect(readUnsubscribeToken(forge)).toBe('victime@resto.test');
  });

  it('formes invalides refusees sans erreur', () => {
    for (const bad of ['', 'abc', 'a+b/c=', 'x'.repeat(600), 'cGF0cm9uQHJlc3RvLnRlc3Q']) {
      expect(readUnsubscribeToken(bad)).toBeNull();
    }
  });

  it('secret absent ou trop court: aucun jeton fabrique ni accepte', () => {
    const token = createUnsubscribeToken('patron@resto.test')!;
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    expect(isUnsubscribeConfigured()).toBe(false);
    expect(createUnsubscribeToken('patron@resto.test')).toBeNull();
    expect(buildUnsubscribeLinks('patron@resto.test')).toBeNull();
    expect(readUnsubscribeToken(token)).toBeNull();
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'court';
    expect(isUnsubscribeConfigured()).toBe(false);
    process.env.EMAIL_UNSUBSCRIBE_SECRET = SECRET;
    expect(isUnsubscribeConfigured()).toBe(true);
  });

  it('adresse invalide: pas de jeton', () => {
    expect(createUnsubscribeToken('pas une adresse')).toBeNull();
  });
});
