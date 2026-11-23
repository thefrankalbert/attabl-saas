import { describe, it, expect } from 'vitest';
import { buildWelcomeEmail, buildWelcomeOnboardingEmail } from '../email.templates';

const CONFIRM_URL = 'https://attabl.com/auth/confirm?token_hash=abc&type=signup';
const DASHBOARD_URL = 'https://attabl.com/sites/epicurien/admin';

describe('e-mail de confirmation (inscription)', () => {
  it("demande de confirmer l'adresse et porte le lien de confirmation", () => {
    const mail = buildWelcomeEmail({ confirmationUrl: CONFIRM_URL });
    expect(mail.subject).toBe('Confirmez votre adresse e-mail pour ATTABL');
    expect(mail.html).toContain('Confirmer mon adresse');
    expect(mail.html).toContain('token_hash=abc');
    expect(mail.text).toContain(CONFIRM_URL);
    expect(mail.html).toContain('valable 1 heure');
  });
});

describe('e-mail de bienvenue (apres confirmation)', () => {
  it("ne redemande JAMAIS de confirmer l'adresse (ancien defaut)", () => {
    const mail = buildWelcomeOnboardingEmail({ dashboardUrl: DASHBOARD_URL });
    for (const part of [mail.subject, mail.html, mail.text]) {
      expect(part).not.toMatch(/confirm/i);
      expect(part).not.toMatch(/expire|valable 1 heure/i);
    }
  });

  it('temoin: le meme controle attrape bien le texte de confirmation', () => {
    const confirmation = buildWelcomeEmail({ confirmationUrl: CONFIRM_URL });
    expect(confirmation.html).toMatch(/confirm/i);
  });

  it('salue le restaurant, annonce les 14 jours et mene au tableau de bord', () => {
    const mail = buildWelcomeOnboardingEmail({
      dashboardUrl: DASHBOARD_URL,
      restaurantName: "L'Epicurien",
    });
    expect(mail.subject).toBe("Bienvenue sur ATTABL, L'Epicurien");
    expect(mail.html).toContain('14 jours');
    expect(mail.html).toContain(`href="${DASHBOARD_URL}"`);
    expect(mail.html).toContain('Ouvrir mon tableau de bord');
    expect(mail.text).toContain(DASHBOARD_URL);
    expect(mail.html).toContain('mailto:support@attabl.com');
  });

  it('echappe le nom du restaurant dans le HTML', () => {
    const mail = buildWelcomeOnboardingEmail({
      dashboardUrl: DASHBOARD_URL,
      restaurantName: '<script>x</script>',
    });
    expect(mail.html).not.toContain('<script>x</script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('reste correct sans nom de restaurant', () => {
    const mail = buildWelcomeOnboardingEmail({ dashboardUrl: DASHBOARD_URL, restaurantName: ' ' });
    expect(mail.subject).toBe('Bienvenue sur ATTABL');
    expect(mail.html).toContain('Vous avez 14 jours');
  });
});
