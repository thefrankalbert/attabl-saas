/**
 * Email Service - Wraps Resend SDK for transactional emails.
 *
 * Factory pattern: createEmailService() returns all email methods.
 * Gracefully handles missing API key in development.
 */

import { Resend } from 'resend';
import { logger } from '@/lib/logger';
import { escapeHtml } from './email.render';
import {
  buildWelcomeEmail,
  buildWelcomeOnboardingEmail,
  buildPasswordResetEmail,
  buildEmailChangeEmail,
  buildEmailChangeApprovalEmail,
  buildAccountExistsEmail,
  buildSignupPasswordRejectedEmail,
  buildSignupFailedEmail,
  buildTeamInvitationEmail,
  buildLowStockAlertEmail,
  buildFirstOrderTriggerEmail,
  buildTenthOrderTriggerEmail,
  buildTrialIdleEmail,
  buildTrialEndgameEmail,
  buildRenewalReminderEmail,
} from './email.templates';
import type {
  EmailResult,
  EmailService,
  WelcomeEmailData,
  WelcomeOnboardingEmailData,
  PasswordResetEmailData,
  EmailChangeEmailData,
  EmailChangeApprovalEmailData,
  AccountExistsEmailData,
  SignupPasswordRejectedEmailData,
  SignupFailedEmailData,
  TeamInvitationEmailData,
  LowStockAlertEmailData,
  RenewalReminderEmailData,
  LifecycleEmailData,
  TrialEndgameEmailData,
} from './email.types';
import type { UnsubscribeLinks } from '@/lib/email/unsubscribe-token';

export type { EmailService } from './email.types';

/** Delai maximum d'un envoi: le SDK Resend n'en a pas, un envoi bloque tiendrait la requete. */
const DELAI_ENVOI_MS = 10_000;

async function avecDelai<T>(envoi: Promise<T>): Promise<T> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      envoi,
      new Promise<never>((_, rejeter) => {
        minuteur = setTimeout(() => rejeter(new Error('Resend: delai depasse')), DELAI_ENVOI_MS);
      }),
    ]);
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * En-tetes de desinscription des relances (R5/T9): RFC 2369 (List-Unsubscribe)
 * et RFC 8058 (desinscription en un clic par POST). Jamais poses sur un e-mail
 * transactionnel (mot de passe, invitation, facture...).
 */
export function lifecycleUnsubscribeHeaders(links: UnsubscribeLinks): Record<string, string> {
  return {
    'List-Unsubscribe': `<${links.oneClickUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * L'envoi est-il configure ? Meme test que `send` (sans cle, rien ne part):
 * un appelant qui reserve un envoi avant de le faire le verifie d'abord.
 */
export function isEmailDeliveryConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function createEmailService(): EmailService {
  const apiKey = isEmailDeliveryConfigured() ? process.env.RESEND_API_KEY : undefined;
  const from = process.env.RESEND_FROM_EMAIL || 'noreply@attabl.com';
  const resend = apiKey ? new Resend(apiKey) : null;

  async function send(
    to: string | string[],
    subject: string,
    html: string,
    text: string,
    headers?: Record<string, string>,
  ): Promise<EmailResult> {
    if (!resend) {
      // Do NOT report success here: a missing API key means no email was sent.
      // Callers (e.g. signup confirmation) must be able to surface this to the
      // user instead of silently claiming "check your inbox".
      logger.warn('RESEND_API_KEY not configured - email NOT sent', { subject });
      return { success: false, error: 'EMAIL_NOT_CONFIGURED' };
    }

    try {
      const { error } = await avecDelai(
        resend.emails.send({
          from,
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
          text,
          ...(headers ? { headers } : {}),
        }),
      );

      if (error) {
        logger.error('Resend API error', error, { subject });
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown email error';
      logger.error('Failed to send email', err, { subject });
      return { success: false, error: message };
    }
  }

  return {
    async sendWelcomeEmail(to: string, data: WelcomeEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildWelcomeEmail(data);
      return send(to, subject, html, text);
    },

    async sendWelcomeOnboardingEmail(
      to: string,
      data: WelcomeOnboardingEmailData,
    ): Promise<EmailResult> {
      const { subject, html, text } = buildWelcomeOnboardingEmail(data);
      return send(to, subject, html, text);
    },

    async sendPasswordResetEmail(to: string, data: PasswordResetEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildPasswordResetEmail(data);
      return send(to, subject, html, text);
    },

    async sendEmailChangeEmail(to: string, data: EmailChangeEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildEmailChangeEmail(data);
      return send(to, subject, html, text);
    },

    async sendEmailChangeApprovalEmail(
      to: string,
      data: EmailChangeApprovalEmailData,
    ): Promise<EmailResult> {
      const { subject, html, text } = buildEmailChangeApprovalEmail(data);
      return send(to, subject, html, text);
    },

    async sendAccountExistsEmail(to: string, data: AccountExistsEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildAccountExistsEmail(data);
      return send(to, subject, html, text);
    },

    async sendSignupPasswordRejectedEmail(
      to: string,
      data: SignupPasswordRejectedEmailData,
    ): Promise<EmailResult> {
      const { subject, html, text } = buildSignupPasswordRejectedEmail(data);
      return send(to, subject, html, text);
    },

    async sendSignupFailedEmail(to: string, data: SignupFailedEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildSignupFailedEmail(data);
      return send(to, subject, html, text);
    },

    async sendTeamInvitationEmail(to: string, data: TeamInvitationEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildTeamInvitationEmail(data);
      return send(to, subject, html, text);
    },

    async sendLowStockAlertEmail(
      to: string | string[],
      data: LowStockAlertEmailData,
    ): Promise<EmailResult> {
      const { subject, html, text } = buildLowStockAlertEmail(data);
      return send(to, subject, html, text);
    },

    async sendFirstOrderTriggerEmail(to: string, data: LifecycleEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildFirstOrderTriggerEmail(data);
      return send(to, subject, html, text, lifecycleUnsubscribeHeaders(data.unsubscribe));
    },

    async sendTenthOrderTriggerEmail(to: string, data: LifecycleEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildTenthOrderTriggerEmail(data);
      return send(to, subject, html, text, lifecycleUnsubscribeHeaders(data.unsubscribe));
    },

    async sendTrialIdleEmail(to: string, data: LifecycleEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildTrialIdleEmail(data);
      return send(to, subject, html, text, lifecycleUnsubscribeHeaders(data.unsubscribe));
    },

    async sendRenewalReminderEmail(
      to: string,
      data: RenewalReminderEmailData,
    ): Promise<EmailResult> {
      const { subject, html, text } = buildRenewalReminderEmail(data);
      return send(to, subject, html, text);
    },

    async sendTrialEndgameEmail(to: string, data: TrialEndgameEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildTrialEndgameEmail(data);
      return send(to, subject, html, text, lifecycleUnsubscribeHeaders(data.unsubscribe));
    },
  };
}

// ---------------------------------------------------------------------------
// Backward-compatible standalone exports (delegate to factory instance)
// ---------------------------------------------------------------------------

const _svc = createEmailService();

export const sendWelcomeConfirmationEmail = async (
  to: string,
  data: { confirmationUrl: string; restaurantName?: string },
): Promise<boolean> => (await _svc.sendWelcomeEmail(to, data)).success;

export const sendPasswordResetEmail = async (
  to: string,
  data: { resetUrl: string },
): Promise<boolean> => (await _svc.sendPasswordResetEmail(to, data)).success;

export const sendEmailChangeConfirmationEmail = async (
  to: string,
  data: { confirmUrl: string },
): Promise<boolean> => (await _svc.sendEmailChangeEmail(to, data)).success;

export const sendEmailChangeApprovalToCurrentAddress = async (
  to: string,
  data: { approveUrl: string; newEmail: string },
): Promise<boolean> => (await _svc.sendEmailChangeApprovalEmail(to, data)).success;

export const sendSignupAccountExistsEmail = async (
  to: string,
  data: { loginUrl: string; forgotPasswordUrl: string },
): Promise<boolean> => (await _svc.sendAccountExistsEmail(to, data)).success;

export const sendSignupPasswordRejectedEmail = async (
  to: string,
  data: SignupPasswordRejectedEmailData,
): Promise<boolean> => (await _svc.sendSignupPasswordRejectedEmail(to, data)).success;

export const sendSignupFailedEmail = async (
  to: string,
  data: SignupFailedEmailData,
): Promise<boolean> => (await _svc.sendSignupFailedEmail(to, data)).success;

export const sendWelcomeOnboardingEmail = async (
  to: string,
  data: WelcomeOnboardingEmailData,
): Promise<boolean> => (await _svc.sendWelcomeOnboardingEmail(to, data)).success;

export const sendInvitationEmail = async (
  to: string,
  data: { restaurantName: string; restaurantLogoUrl?: string; role: string; inviteUrl: string },
): Promise<boolean> => (await _svc.sendTeamInvitationEmail(to, data)).success;

export const sendContactFormEmail = async (data: {
  name: string;
  email: string;
  company?: string;
  date?: string;
  message: string;
}): Promise<boolean> => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // `false`, pas `true`: le message du visiteur n'est stocke nulle part,
    // un envoi saute est un message perdu et l'appelant doit le savoir.
    logger.warn('RESEND_API_KEY not configured - contact email NOT sent');
    return false;
  }
  try {
    const r = new Resend(apiKey);
    const { error } = await avecDelai(
      r.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@attabl.com',
        replyTo: data.email,
        to: ['support@attabl.com'],
        subject: `Contact : ${data.name}${data.company ? ` (${data.company})` : ''}`,
        html: `<p><strong>${escapeHtml(data.name)}</strong> (${escapeHtml(data.email)})</p><p>${escapeHtml(data.message)}</p>`,
        text: `De: ${data.name} (${data.email})\n\n${data.message}`,
      }),
    );
    if (error) {
      logger.error('Resend contact email error', error);
      return false;
    }
    return true;
  } catch (err) {
    logger.error('Failed to send contact email', err);
    return false;
  }
};

export const sendStockAlertEmail = async (
  to: string[],
  data: {
    tenantName: string;
    items: {
      name: string;
      unit: string;
      current_stock: number;
      min_stock_alert: number;
      is_out: boolean;
    }[];
    dashboardUrl: string;
  },
): Promise<boolean> => {
  if (to.length === 0) return false;
  return (
    await _svc.sendLowStockAlertEmail(to, {
      restaurantName: data.tenantName,
      items: data.items.map((i) => ({
        name: i.name,
        currentStock: i.current_stock,
        threshold: i.min_stock_alert,
      })),
      dashboardUrl: data.dashboardUrl,
    })
  ).success;
};
