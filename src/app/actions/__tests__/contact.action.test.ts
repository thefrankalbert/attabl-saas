import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Audit du 2026-11-10 (C-029, C-030): depuis la refonte de la vitrine, le
 * formulaire de contact ne transmettait plus aucun message. La validation
 * attendait un champ `date` que le formulaire n'envoie plus; FormData rend
 * `null` pour un champ absent et Zod refuse `null` sur un champ optionnel.
 * L'erreur n'avait aucun endroit ou s'afficher: le visiteur voyait le
 * formulaire se vider, sans confirmation ni erreur.
 *
 * Ce test envoie EXACTEMENT les champs du formulaire reel (pas de `date`).
 */

const sendContactFormEmail = vi.fn();

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (cle: string) => cle,
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  hashEmail: () => 'hash',
}));
vi.mock('@/lib/rate-limit', () => ({
  contactLimiter: { check: async () => ({ success: true }) },
  getClientIpFromHeaders: () => '127.0.0.1',
}));
vi.mock('@/services/email.service', () => ({
  sendContactFormEmail: (...args: unknown[]) => sendContactFormEmail(...args),
}));

import { actionSubmitContactForm } from '../contact';

/** Les champs que la page de contact envoie reellement. */
function formulaireReel(surcharge: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set('website', '');
  fd.set('name', 'Awa Ouedraogo');
  fd.set('company', 'Le Jardin');
  fd.set('email', 'awa@example.com');
  fd.set('message', 'Bonjour, je voudrais une demonstration.');
  for (const [cle, valeur] of Object.entries(surcharge)) fd.set(cle, valeur);
  return fd;
}

describe('actionSubmitContactForm', () => {
  beforeEach(() => {
    sendContactFormEmail.mockReset();
    sendContactFormEmail.mockResolvedValue(true);
  });

  it('transmet le message du formulaire reel, qui n a pas de champ date', async () => {
    const etat = await actionSubmitContactForm({}, formulaireReel());

    expect(etat.success).toBe(true);
    expect(sendContactFormEmail).toHaveBeenCalledTimes(1);
    expect(sendContactFormEmail.mock.calls[0][0]).toMatchObject({
      name: 'Awa Ouedraogo',
      email: 'awa@example.com',
      company: 'Le Jardin',
      date: undefined,
    });
  });

  it('accepte un etablissement laisse vide', async () => {
    const etat = await actionSubmitContactForm({}, formulaireReel({ company: '' }));

    expect(etat.success).toBe(true);
    expect(sendContactFormEmail.mock.calls[0][0].company).toBeUndefined();
  });

  // Temoin negatif: la validation refuse toujours ce qui doit l'etre.
  it('refuse un message trop court et n envoie rien', async () => {
    const etat = await actionSubmitContactForm({}, formulaireReel({ message: 'court' }));

    expect(etat.success).toBe(false);
    expect(etat.errors?.message).toBeDefined();
    expect(sendContactFormEmail).not.toHaveBeenCalled();
  });

  it('n annonce pas un succes quand le courriel ne part pas', async () => {
    sendContactFormEmail.mockResolvedValue(false);

    const etat = await actionSubmitContactForm({}, formulaireReel());

    expect(etat.success).toBe(false);
    expect(etat.message).toBe('contactSendFailed');
  });

  it('laisse croire au robot que son envoi a reussi, sans rien envoyer', async () => {
    const etat = await actionSubmitContactForm({}, formulaireReel({ website: 'spam.example' }));

    expect(etat.success).toBe(true);
    expect(sendContactFormEmail).not.toHaveBeenCalled();
  });
});
