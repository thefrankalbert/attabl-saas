import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { createEmailService } from '../email.service';

const unsubscribe = {
  pageUrl: 'https://attabl.com/unsubscribe?token=abc.def',
  oneClickUrl: 'https://attabl.com/api/email/unsubscribe?token=abc.def',
};
const base = { restaurantName: 'Le Jardin', dashboardUrl: 'https://attabl.com/sites/x/admin' };

interface SentEmail {
  html: string;
  text: string;
  headers?: Record<string, string>;
}
const lastSent = (): SentEmail => send.mock.calls.at(-1)?.[0] as SentEmail;

describe('relances: lien et en-tetes de desinscription (R5/T9)', () => {
  const ORIGINAL_KEY = process.env.RESEND_API_KEY;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test';
    send.mockReset().mockResolvedValue({ data: { id: '1' }, error: null });
  });
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = ORIGINAL_KEY;
  });

  const relances: [string, (svc: ReturnType<typeof createEmailService>) => Promise<unknown>][] = [
    [
      'premiere commande',
      (svc) => svc.sendFirstOrderTriggerEmail('p@x.test', { ...base, unsubscribe }),
    ],
    [
      'dixieme commande',
      (svc) => svc.sendTenthOrderTriggerEmail('p@x.test', { ...base, unsubscribe }),
    ],
    ['inactivite', (svc) => svc.sendTrialIdleEmail('p@x.test', { ...base, unsubscribe })],
    [
      'fin d essai',
      (svc) =>
        svc.sendTrialEndgameEmail('p@x.test', {
          ...base,
          unsubscribe,
          ordersCount: 3,
          daysLeft: 2,
        }),
    ],
  ];

  it.each(relances)(
    '%s: en-tetes RFC 2369/8058 et lien dans le pied (texte et HTML)',
    async (_n, run) => {
      await run(createEmailService());
      const sent = lastSent();
      expect(sent.headers).toEqual({
        'List-Unsubscribe': `<${unsubscribe.oneClickUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      });
      expect(sent.text).toContain(unsubscribe.pageUrl);
      expect(sent.html).toContain('href="https://attabl.com/unsubscribe?token=abc.def"');
    },
  );

  it('temoin: les e-mails transactionnels ne portent ni en-tete ni lien de desinscription', async () => {
    const svc = createEmailService();
    await svc.sendPasswordResetEmail('p@x.test', { resetUrl: 'https://attabl.com/reset' });
    expect(lastSent().headers).toBeUndefined();
    expect(lastSent().text).not.toContain('/unsubscribe');
    await svc.sendTeamInvitationEmail('p@x.test', {
      restaurantName: 'Le Jardin',
      role: 'waiter',
      inviteUrl: 'https://attabl.com/invite',
    });
    expect(lastSent().headers).toBeUndefined();
    expect(lastSent().html).not.toContain('/unsubscribe');
  });
});
