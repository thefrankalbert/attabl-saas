import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { createEmailService } from '../email.service';
import {
  buildFirstOrderTriggerEmail,
  buildTenthOrderTriggerEmail,
  buildTrialIdleEmail,
  buildTrialEndgameEmail,
  buildRenewalReminderEmail,
  buildLowStockAlertEmail,
  buildPasswordResetEmail,
} from '../email.templates';

const unsubscribe = {
  pageUrl: 'https://attabl.com/unsubscribe?t=JETON_PAGE',
  oneClickUrl: 'https://attabl.com/api/email/unsubscribe?t=JETON_CLIC',
};
const base = { restaurantName: 'Le Jardin', dashboardUrl: 'https://attabl.com/admin', unsubscribe };

describe('pied de page des relances commerciales', () => {
  const commerciales = {
    premiere: buildFirstOrderTriggerEmail(base),
    dixieme: buildTenthOrderTriggerEmail(base),
    inactivite: buildTrialIdleEmail(base),
    finEssai: buildTrialEndgameEmail({ ...base, ordersCount: 3, daysLeft: 2 }),
  };

  it.each(Object.entries(commerciales))('%s: lien visible dans le HTML et le texte', (_, mail) => {
    expect(mail.html).toContain('Se desabonner de ces e-mails');
    expect(mail.html).toContain('href="https://attabl.com/unsubscribe?t=JETON_PAGE"');
    expect(mail.text).toContain(
      'Se desabonner de ces e-mails : https://attabl.com/unsubscribe?t=JETON_PAGE',
    );
  });

  it('temoins: les e-mails transactionnels n ont pas de lien de desabonnement', () => {
    const transactionnels = [
      buildPasswordResetEmail({ resetUrl: 'https://attabl.com/reset' }),
      buildLowStockAlertEmail({
        restaurantName: 'R',
        items: [],
        dashboardUrl: 'https://attabl.com',
      }),
      buildRenewalReminderEmail({
        restaurantName: 'R',
        paymentUrl: 'https://attabl.com/pay',
        daysLeft: 3,
        periodEndLabel: '01/12/2026',
        amount: 15000,
        planLabel: 'Pro',
      }),
    ];
    for (const mail of transactionnels) {
      expect(mail.html).not.toContain('desabonner');
      expect(mail.text).not.toContain('desabonner');
    }
  });
});

describe('en-tetes RFC 8058', () => {
  const KEY = process.env.RESEND_API_KEY;
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test';
    sendMock.mockReset().mockResolvedValue({ error: null });
  });
  afterEach(() => {
    if (KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = KEY;
  });

  const ENTETES = {
    'List-Unsubscribe': '<https://attabl.com/api/email/unsubscribe?t=JETON_CLIC>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };

  it('les quatre relances commerciales portent List-Unsubscribe et One-Click', async () => {
    const svc = createEmailService();
    await svc.sendFirstOrderTriggerEmail('p@x.test', base);
    await svc.sendTenthOrderTriggerEmail('p@x.test', base);
    await svc.sendTrialIdleEmail('p@x.test', base);
    await svc.sendTrialEndgameEmail('p@x.test', { ...base, ordersCount: 0, daysLeft: 1 });
    expect(sendMock).toHaveBeenCalledTimes(4);
    for (const [arg] of sendMock.mock.calls) expect(arg.headers).toEqual(ENTETES);
  });

  it('temoin: un e-mail transactionnel n a aucun en-tete de desabonnement', async () => {
    const svc = createEmailService();
    await svc.sendPasswordResetEmail('p@x.test', { resetUrl: 'https://attabl.com/reset' });
    expect(sendMock.mock.calls[0][0]).not.toHaveProperty('headers');
  });
});

/** Rapport de contraste WCAG entre deux couleurs `#rrggbb`. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('contraste des petits textes (11-12 px) de tous les e-mails', () => {
  const tous = [
    buildFirstOrderTriggerEmail(base),
    buildTrialIdleEmail(base),
    buildTrialEndgameEmail({ ...base, ordersCount: 3, daysLeft: 2 }),
    buildPasswordResetEmail({ resetUrl: 'https://attabl.com/reset' }),
    buildRenewalReminderEmail({
      restaurantName: 'R',
      paymentUrl: 'https://attabl.com/pay',
      daysLeft: 3,
      periodEndLabel: '01/12/2026',
      amount: 15000,
      planLabel: 'Pro',
    }),
  ];

  it('surtitre, notes et pied de societe atteignent 4,5:1 sur la carte et sur le fond', () => {
    let mesures = 0;
    for (const mail of tous) {
      const styles = mail.html.match(/style="[^"]*font-size:1[12]px[^"]*"/g) ?? [];
      for (const style of styles) {
        const color = /(?:^|;|")color:(#[0-9a-f]{6})/i.exec(style)?.[1];
        if (!color) continue;
        mesures++;
        expect(contrast(color, '#ffffff')).toBeGreaterThanOrEqual(4.5);
        expect(contrast(color, '#f9fafb')).toBeGreaterThanOrEqual(4.5);
      }
    }
    // Temoin: la mesure porte bien sur le surtitre et le pied de page.
    expect(mesures).toBeGreaterThanOrEqual(10);
    expect(contrast('#9ca3af', '#ffffff')).toBeLessThan(4.5);
  });
});
