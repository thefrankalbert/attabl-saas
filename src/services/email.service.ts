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
import { buildNewLoginEmail } from './email.template-connexion';
import type {
  NewLoginEmailData,
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
  MarketingEmailData,
  TrialEndgameEmailData,
  UnsubscribeLinks,
} from './email.types';

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
 * Nature d'un envoi (audits R6 et R8):
 *  - `securite`: lien de connexion, de reinitialisation, alerte de compte. Part
 *    TOUJOURS, meme vers une adresse bloquee: le bloquer enfermerait le
 *    titulaire hors de son compte. Expediteur `RESEND_FROM_EMAIL`.
 *  - `service`: facture, rappel d'echeance, invitation, commande, alerte de
 *    stock. Expediteur `RESEND_FROM_EMAIL`, adresses bloquees ecartees.
 *  - `cycle_de_vie`: relances et accompagnement (bienvenue, premieres
 *    commandes, fin d'essai). Expediteur distinct `RESEND_MARKETING_FROM_EMAIL`
 *    pour qu'une plainte sur une relance n'entame pas la reputation de
 *    l'adresse qui porte les liens de securite. Adresses bloquees ecartees.
 */
type NatureEnvoi = 'securite' | 'service' | 'cycle_de_vie';

export interface EmailServiceDeps {
  /** Vrai si l'adresse ne doit plus recevoir d'e-mail (rebond definitif, plainte). */
  estBloquee?: (email: string) => Promise<boolean>;
}

/**
 * Lecture de la liste par le client service_role: la table appartient a la
 * plateforme et n'a aucune politique pour anon ou authenticated. Imports
 * dynamiques: `admin.ts` est `server-only`, et ce module est importe par des
 * tests et des fichiers qui ne l'appellent jamais.
 */
async function estBloqueeParDefaut(email: string): Promise<boolean> {
  const [{ createAdminClient }, { createEmailSuppressionService }] = await Promise.all([
    import('@/lib/supabase/admin'),
    import('./email-suppression.service'),
  ]);
  return createEmailSuppressionService(createAdminClient()).estBloquee(email);
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

export function createEmailService(deps: EmailServiceDeps = {}): EmailService {
  const apiKey = isEmailDeliveryConfigured() ? process.env.RESEND_API_KEY : undefined;
  const from = process.env.RESEND_FROM_EMAIL || 'noreply@attabl.com';
  const fromCycleDeVie = process.env.RESEND_MARKETING_FROM_EMAIL || from;
  const resend = apiKey ? new Resend(apiKey) : null;
  const estBloquee = deps.estBloquee ?? estBloqueeParDefaut;

  /** Ecarte les adresses bloquees. Une lecture en echec n'empeche pas l'envoi. */
  async function sansAdressesBloquees(adresses: string[]): Promise<string[]> {
    const verdicts = await Promise.all(
      adresses.map(async (adresse) => {
        try {
          return await estBloquee(adresse);
        } catch (err) {
          logger.warn('Blocked-address lookup failed - sending anyway', { error: String(err) });
          return false;
        }
      }),
    );
    return adresses.filter((_, i) => !verdicts[i]);
  }

  async function send(
    to: string | string[],
    subject: string,
    html: string,
    text: string,
    nature: NatureEnvoi,
    unsubscribe?: UnsubscribeLinks,
  ): Promise<EmailResult> {
    if (!resend) {
      // Do NOT report success here: a missing API key means no email was sent.
      // Callers (e.g. signup confirmation) must be able to surface this to the
      // user instead of silently claiming "check your inbox".
      logger.warn('RESEND_API_KEY not configured - email NOT sent', { subject });
      return { success: false, error: 'EMAIL_NOT_CONFIGURED' };
    }

    const demandes = Array.isArray(to) ? to : [to];
    const destinataires = nature === 'securite' ? demandes : await sansAdressesBloquees(demandes);
    if (destinataires.length < demandes.length) {
      logger.info('Blocked recipients skipped (bounce or complaint)', {
        subject,
        skipped: demandes.length - destinataires.length,
      });
    }
    if (destinataires.length === 0) {
      return { success: false, error: 'ADDRESS_BLOCKED' };
    }

    try {
      const { error } = await avecDelai(
        resend.emails.send({
          from: nature === 'cycle_de_vie' ? fromCycleDeVie : from,
          to: destinataires,
          subject,
          html,
          text,
          // RFC 8058: les messageries proposent alors leur bouton "Se
          // desabonner", qui envoie un POST a cette adresse.
          ...(unsubscribe && {
            headers: {
              'List-Unsubscribe': `<${unsubscribe.oneClickUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }),
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
      return send(to, subject, html, text, 'securite');
    },

    async sendWelcomeOnboardingEmail(
      to: string,
      data: WelcomeOnboardingEmailData,
    ): Promise<EmailResult> {
      const { subject, html, text } = buildWelcomeOnboardingEmail(data);
      return send(to, subject, html, text, 'cycle_de_vie');
    },

    async sendPasswordResetEmail(to: string, data: PasswordResetEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildPasswordResetEmail(data);
      return send(to, subject, html, text, 'securite');
    },

    async sendEmailChangeEmail(to: string, data: EmailChangeEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildEmailChangeEmail(data);
      return send(to, subject, html, text, 'securite');
    },

    async sendEmailChangeApprovalEmail(
      to: string,
      data: EmailChangeApprovalEmailData,
    ): Promise<EmailResult> {
      const { subject, html, text } = buildEmailChangeApprovalEmail(data);
      return send(to, subject, html, text, 'securite');
    },

    async sendAccountExistsEmail(to: string, data: AccountExistsEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildAccountExistsEmail(data);
      return send(to, subject, html, text, 'securite');
    },

    async sendSignupPasswordRejectedEmail(
      to: string,
      data: SignupPasswordRejectedEmailData,
    ): Promise<EmailResult> {
      const { subject, html, text } = buildSignupPasswordRejectedEmail(data);
      return send(to, subject, html, text, 'securite');
    },

    async sendSignupFailedEmail(to: string, data: SignupFailedEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildSignupFailedEmail(data);
      return send(to, subject, html, text, 'securite');
    },

    async sendTeamInvitationEmail(to: string, data: TeamInvitationEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildTeamInvitationEmail(data);
      return send(to, subject, html, text, 'service');
    },

    async sendLowStockAlertEmail(
      to: string | string[],
      data: LowStockAlertEmailData,
    ): Promise<EmailResult> {
      const { subject, html, text } = buildLowStockAlertEmail(data);
      return send(to, subject, html, text, 'service');
    },

    async sendFirstOrderTriggerEmail(to: string, data: MarketingEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildFirstOrderTriggerEmail(data);
      return send(to, subject, html, text, 'cycle_de_vie', data.unsubscribe);
    },

    async sendTenthOrderTriggerEmail(to: string, data: MarketingEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildTenthOrderTriggerEmail(data);
      return send(to, subject, html, text, 'cycle_de_vie', data.unsubscribe);
    },

    async sendTrialIdleEmail(to: string, data: MarketingEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildTrialIdleEmail(data);
      return send(to, subject, html, text, 'cycle_de_vie', data.unsubscribe);
    },

    async sendRenewalReminderEmail(
      to: string,
      data: RenewalReminderEmailData,
    ): Promise<EmailResult> {
      const { subject, html, text } = buildRenewalReminderEmail(data);
      return send(to, subject, html, text, 'service');
    },

    async sendTrialEndgameEmail(to: string, data: TrialEndgameEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildTrialEndgameEmail(data);
      return send(to, subject, html, text, 'cycle_de_vie', data.unsubscribe);
    },

    async sendNewLoginEmail(to: string, data: NewLoginEmailData): Promise<EmailResult> {
      const { subject, html, text } = buildNewLoginEmail(data);
      return send(to, subject, html, text, 'securite');
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
