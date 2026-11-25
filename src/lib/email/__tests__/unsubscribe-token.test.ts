import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildUnsubscribeLinks,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  UNSUBSCRIBE_TOKEN_TTL_MS,
} from '../unsubscribe-token';
import { signRecoveryMarker } from '@/lib/auth/recovery-marker';

const ALICE = {
  adminUserId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
};
const BOB = {
  adminUserId: '33333333-3333-4333-8333-333333333333',
  tenantId: '22222222-2222-4222-8222-222222222222',
};
const NOW = Date.UTC(2026, 10, 25);
const DAY = 24 * 60 * 60 * 1000;

/** Remplace un caractere de la partie choisie sans sortir de l'alphabet base64url. */
function flipChar(token: string, part: 0 | 1): string {
  const parts = token.split('.');
  const s = parts[part];
  const i = Math.floor(s.length / 2);
  parts[part] = s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
  return parts.join('.');
}

describe('jeton de desinscription des relances (R5/T9)', () => {
  const ORIGINAL_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ORIGINAL_URL = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-de-test-serveur';
  });
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_KEY;
    if (ORIGINAL_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_URL;
  });

  it('un jeton signe identifie la personne et son restaurant', () => {
    expect(verifyUnsubscribeToken(signUnsubscribeToken(ALICE, NOW), NOW)).toEqual(ALICE);
  });

  it('temoin: une charge ou une signature modifiee est refusee', () => {
    const token = signUnsubscribeToken(ALICE, NOW);
    expect(verifyUnsubscribeToken(flipChar(token, 0), NOW)).toBeNull();
    expect(verifyUnsubscribeToken(flipChar(token, 1), NOW)).toBeNull();
  });

  it('temoin: la charge d une autre personne avec la signature d Alice est refusee', () => {
    const [, aliceSig] = signUnsubscribeToken(ALICE, NOW).split('.');
    const [bobPayload] = signUnsubscribeToken(BOB, NOW).split('.');
    expect(verifyUnsubscribeToken(`${bobPayload}.${aliceSig}`, NOW)).toBeNull();
    // et le jeton de Bob designe bien Bob, jamais Alice
    expect(verifyUnsubscribeToken(signUnsubscribeToken(BOB, NOW), NOW)).toEqual(BOB);
  });

  it('temoin: un jeton signe avec une autre cle est refuse', () => {
    const token = signUnsubscribeToken(ALICE, NOW);
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'une-autre-cle';
    expect(verifyUnsubscribeToken(token, NOW)).toBeNull();
  });

  it('temoin: un jeton d un autre usage (marqueur de reinitialisation) ne vaut rien ici', () => {
    expect(verifyUnsubscribeToken(signRecoveryMarker(ALICE.adminUserId, NOW), NOW)).toBeNull();
  });

  it('pas d expiration courte: valide des mois apres, refuse au dela de 2 ans', () => {
    const token = signUnsubscribeToken(ALICE, NOW);
    expect(verifyUnsubscribeToken(token, NOW + 180 * DAY)).toEqual(ALICE);
    expect(verifyUnsubscribeToken(token, NOW + UNSUBSCRIBE_TOKEN_TTL_MS + 1)).toBeNull();
  });

  it('refuse un jeton illisible ou sans cle serveur, sans lever', () => {
    expect(verifyUnsubscribeToken('pas-un-jeton', NOW)).toBeNull();
    const token = signUnsubscribeToken(ALICE, NOW);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(verifyUnsubscribeToken(token, NOW)).toBeNull();
  });

  it('les liens pointent vers le domaine principal', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://attabl.com/';
    const links = buildUnsubscribeLinks(ALICE);
    expect(links.pageUrl).toMatch(/^https:\/\/attabl\.com\/unsubscribe\?token=[A-Za-z0-9_.-]+$/);
    expect(links.oneClickUrl).toMatch(
      /^https:\/\/attabl\.com\/api\/email\/unsubscribe\?token=[A-Za-z0-9_.-]+$/,
    );
    const token = new URL(links.oneClickUrl).searchParams.get('token') ?? '';
    expect(verifyUnsubscribeToken(token)).toEqual(ALICE);
  });
});
