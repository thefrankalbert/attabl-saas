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
  buildPasswordResetEmail,
  buildTeamInvitationEmail,
  buildOrderConfirmationEmail,
  buildLowStockAlertEmail,
  buildFirstOrderTriggerEmail,
  buildTenthOrderTriggerEmail,
  buildTrialIdleEmail,
  buildTrialEndgameEmail,
} from './email.templates';
import type {
  EmailResult,
  EmailService,
  WelcomeEmailData,
  PasswordResetEmailData,
  TeamInvitationEmailData,
  OrderConfirmationEmailData,
  LowStockAlertEmailData,
} from './email.types';

export type {
  EmailResult,
  EmailService,
  WelcomeEmailData,
  PasswordResetEmailData,
  TeamInvitationEmailData,
  OrderConfirmationEmailData,
  LowStockAlertEmailData,
} from './email.types';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEmailService(): EmailService {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'noreply@attabl.com';
  const resend = apiKey ? new Resend(apiKey) : null;

  async function send(
    to: string | string[],
    subject: string,
    html: string,
    text: string,
  ): Promise<EmailResult> {
    if (!resend) {
      // Do NOT report success here: a missing API key means no email was sent.
      // Callers (e.g. signup confirmation) must be able to surface this to the
      // user instead of silently claiming "check your inbox".
      logger.warn('RESEND_API_KEY not configured - email NOT sent', { subject });
      return { success: false, error: 'EMAIL_NOT_CONFIGURED' };
    }

    try {
      const { error } = await resend.emails.send({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
      });

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

    async sendPasswordResetEmail(to: string, data: PasswordResetEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildPasswordResetEmail(data);
      return send(to, subject, html, text);
    },

    async sendTeamInvitationEmail(to: string, data: TeamInvitationEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildTeamInvitationEmail(data);
      return send(to, subject, html, text);
    },

    async sendOrderConfirmationEmail(
      to: string,
      data: OrderConfirmationEmailData,
    ): Promise<EmailResult> {
      const { subject, html, text } = buildOrderConfirmationEmail(data);
      return send(to, subject, html, text);
    },

    async sendLowStockAlertEmail(
      to: string | string[],
      data: LowStockAlertEmailData,
    ): Promise<EmailResult> {
      const { subject, html, text } = buildLowStockAlertEmail(data);
      return send(to, subject, html, text);
    },

    async sendFirstOrderTriggerEmail(
      to: string,
      data: { restaurantName: string; dashboardUrl: string },
    ): Promise<EmailResult> {
      const { subject, html, text } = buildFirstOrderTriggerEmail(data);
      return send(to, subject, html, text);
    },

    async sendTenthOrderTriggerEmail(
      to: string,
      data: { restaurantName: string; dashboardUrl: string },
    ): Promise<EmailResult> {
      const { subject, html, text } = buildTenthOrderTriggerEmail(data);
      return send(to, subject, html, text);
    },

    async sendTrialIdleEmail(
      to: string,
      data: { restaurantName: string; dashboardUrl: string },
    ): Promise<EmailResult> {
      const { subject, html, text } = buildTrialIdleEmail(data);
      return send(to, subject, html, text);
    },

    async sendTrialEndgameEmail(
      to: string,
      data: { restaurantName: string; dashboardUrl: string; ordersCount: number; daysLeft: number },
    ): Promise<EmailResult> {
      const { subject, html, text } = buildTrialEndgameEmail(data);
      return send(to, subject, html, text);
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

export const sendWelcomeOnboardingEmail = async (
  to: string,
  data: { dashboardUrl: string },
): Promise<boolean> =>
  (await _svc.sendWelcomeEmail(to, { confirmationUrl: data.dashboardUrl })).success;

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
    logger.warn('RESEND_API_KEY not configured - contact email skipped');
    return true;
  }
  try {
    const r = new Resend(apiKey);
    const { error } = await r.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@attabl.com',
      replyTo: data.email,
      to: ['support@attabl.com'],
      subject: `Contact : ${data.name}${data.company ? ` (${data.company})` : ''}`,
      html: `<p><strong>${escapeHtml(data.name)}</strong> (${escapeHtml(data.email)})</p><p>${escapeHtml(data.message)}</p>`,
      text: `De: ${data.name} (${data.email})\n\n${data.message}`,
    });
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
