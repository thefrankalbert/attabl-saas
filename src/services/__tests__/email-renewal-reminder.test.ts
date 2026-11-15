import { describe, it, expect } from 'vitest';
import { buildRenewalReminderEmail } from '../email.templates';

const base = {
  restaurantName: 'Chez Awa',
  paymentUrl: 'https://checkout.flutterwave.com/v3/hosted/pay/abc',
  periodEndLabel: '22/11/2026',
  amount: 149000,
  planLabel: 'Business',
};

describe('buildRenewalReminderEmail', () => {
  it('annonce la date, le montant groupe et porte le lien de paiement', () => {
    const { subject, html, text } = buildRenewalReminderEmail({ ...base, daysLeft: 7 });
    expect(subject).toBe('Chez Awa - Votre abonnement se termine dans 7 jours.');
    expect(html).toContain('149 000 FCFA');
    expect(html).toContain('22/11/2026');
    expect(html).toContain('href="https://checkout.flutterwave.com/v3/hosted/pay/abc"');
    expect(text).toContain('https://checkout.flutterwave.com/v3/hosted/pay/abc');
  });

  it('dernier jour: formulation "demain"', () => {
    expect(buildRenewalReminderEmail({ ...base, daysLeft: 1 }).subject).toBe(
      'Chez Awa - Votre abonnement se termine demain.',
    );
  });

  it('reste en ASCII (aucun tiret long, guillemet courbe ni espace insecable)', () => {
    const { subject, html, text } = buildRenewalReminderEmail({ ...base, daysLeft: 7 });
    const nonAscii = [...(subject + html + text)].some((c) => c.charCodeAt(0) > 127);
    expect(nonAscii).toBe(false);
  });

  it('echappe le nom du restaurant dans le HTML', () => {
    const { html } = buildRenewalReminderEmail({
      ...base,
      restaurantName: '<script>x</script>',
      daysLeft: 7,
    });
    expect(html).not.toContain('<script>');
  });

  it('refuse un lien qui n est pas http(s)', () => {
    const { html } = buildRenewalReminderEmail({
      ...base,
      paymentUrl: 'javascript:alert(1)',
      daysLeft: 7,
    });
    expect(html).not.toContain('javascript:');
  });
});
