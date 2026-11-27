import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const { envoyer } = vi.hoisted(() => ({ envoyer: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: envoyer };
  },
}));

import {
  createEmailSuppressionService,
  empreinteAdresse,
  raisonDeLEvenement,
} from '../email-suppression.service';
import { createEmailService } from '../email.service';

const DESINSCRIPTION = {
  pageUrl: 'https://attabl.com/unsubscribe?t=jeton',
  oneClickUrl: 'https://attabl.com/api/email/unsubscribe?t=jeton',
};

/** Faux client limite a la table `adresses_email_bloquees`, tenue en memoire. */
function fausseBase() {
  const lignes = new Map<string, { raison: string }>();
  const client = {
    from: (table: string) => {
      expect(table).toBe('adresses_email_bloquees');
      return {
        select: () => ({
          eq: (_col: string, hash: string) => ({
            maybeSingle: async () => ({
              data: lignes.has(hash) ? { id: 'x', ...lignes.get(hash) } : null,
              error: null,
            }),
          }),
        }),
        upsert: async (ligne: { email_hash: string; raison: string }) => {
          lignes.set(ligne.email_hash, { raison: ligne.raison });
          return { error: null };
        },
      };
    },
  };
  return { lignes, client: client as unknown as SupabaseClient };
}

describe('raisonDeLEvenement', () => {
  it('bloque un rebond definitif et une plainte, pas un rebond temporaire', () => {
    expect(
      raisonDeLEvenement({ type: 'email.bounced', data: { bounce: { type: 'Permanent' } } }),
    ).toBe('rebond_definitif');
    expect(raisonDeLEvenement({ type: 'email.complained' })).toBe('plainte');
    expect(
      raisonDeLEvenement({ type: 'email.bounced', data: { bounce: { type: 'Transient' } } }),
    ).toBeNull();
    expect(raisonDeLEvenement({ type: 'email.delivered' })).toBeNull();
  });
});

describe('liste des adresses bloquees', () => {
  beforeEach(() => {
    envoyer.mockReset();
    envoyer.mockResolvedValue({ error: null });
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('RESEND_FROM_EMAIL', 'ATTABL <noreply@attabl.com>');
    vi.stubEnv('RESEND_MARKETING_FROM_EMAIL', 'ATTABL <bonjour@attabl.com>');
  });

  it("garde une empreinte et jamais l'adresse en clair", async () => {
    const { lignes, client } = fausseBase();
    await createEmailSuppressionService(client).appliquerEvenement(
      { type: 'email.bounced', data: { to: ['Gerant <Gerant@Exemple.com>'] } },
      'msg_1',
    );
    expect([...lignes.keys()]).toEqual([empreinteAdresse('gerant@exemple.com')]);
    expect(JSON.stringify([...lignes])).not.toContain('exemple');
  });

  it("un rebond bloque l'adresse, puis l'envoi suivant (hors securite) est refuse", async () => {
    const { client } = fausseBase();
    const suppression = createEmailSuppressionService(client);
    await suppression.appliquerEvenement(
      { type: 'email.bounced', data: { to: ['morte@exemple.com'], bounce: { type: 'Permanent' } } },
      'msg_2',
    );
    const emails = createEmailService({ estBloquee: (e) => suppression.estBloquee(e) });

    const facture = await emails.sendRenewalReminderEmail('MORTE@exemple.com', {
      restaurantName: 'Le Jardin',
      paymentUrl: 'https://pay.example/x',
      daysLeft: 3,
      periodEndLabel: '01/12/2026',
      amount: 15000,
      planLabel: 'Pro',
    });
    expect(facture).toEqual({ success: false, error: 'ADDRESS_BLOCKED' });
    expect(envoyer).not.toHaveBeenCalled();

    // Securite: le lien de reinitialisation part quand meme.
    const securite = await emails.sendPasswordResetEmail('morte@exemple.com', {
      resetUrl: 'https://attabl.com/reset',
    });
    expect(securite.success).toBe(true);
    expect(envoyer).toHaveBeenCalledTimes(1);
  });

  it("temoin: une adresse non bloquee recoit l'envoi", async () => {
    const { client } = fausseBase();
    const suppression = createEmailSuppressionService(client);
    const emails = createEmailService({ estBloquee: (e) => suppression.estBloquee(e) });
    const r = await emails.sendTrialIdleEmail('vivante@exemple.com', {
      restaurantName: 'Le Jardin',
      dashboardUrl: 'https://attabl.com/admin',
      unsubscribe: DESINSCRIPTION,
    });
    expect(r.success).toBe(true);
    expect(envoyer).toHaveBeenCalledTimes(1);
  });

  it("une liste illisible n'empeche pas l'envoi", async () => {
    const emails = createEmailService({
      estBloquee: async () => {
        throw new Error('base indisponible');
      },
    });
    const r = await emails.sendTrialIdleEmail('vivante@exemple.com', {
      restaurantName: 'Le Jardin',
      dashboardUrl: 'https://attabl.com/admin',
      unsubscribe: DESINSCRIPTION,
    });
    expect(r.success).toBe(true);
  });

  it('les relances partent de l adresse de cycle de vie, la securite de noreply', async () => {
    const emails = createEmailService({ estBloquee: async () => false });
    await emails.sendTrialIdleEmail('a@exemple.com', {
      restaurantName: 'Le Jardin',
      dashboardUrl: 'https://attabl.com/admin',
      unsubscribe: DESINSCRIPTION,
    });
    await emails.sendNewLoginEmail('a@exemple.com', {
      dateLabel: '24 novembre 2026 a 10:00 (heure GMT)',
      methode: 'mot_de_passe',
      changePasswordUrl: 'https://attabl.com/forgot-password',
    });
    expect(envoyer.mock.calls[0][0].from).toBe('ATTABL <bonjour@attabl.com>');
    expect(envoyer.mock.calls[1][0].from).toBe('ATTABL <noreply@attabl.com>');
  });

  it("sans adresse de cycle de vie, les relances reprennent l'adresse actuelle", async () => {
    vi.stubEnv('RESEND_MARKETING_FROM_EMAIL', '');
    const emails = createEmailService({ estBloquee: async () => false });
    await emails.sendTrialIdleEmail('a@exemple.com', {
      restaurantName: 'Le Jardin',
      dashboardUrl: 'https://attabl.com/admin',
      unsubscribe: DESINSCRIPTION,
    });
    expect(envoyer.mock.calls[0][0].from).toBe('ATTABL <noreply@attabl.com>');
  });
});
