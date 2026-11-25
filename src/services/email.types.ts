/**
 * Email Service - Shared types.
 *
 * Data shapes and the public EmailService interface consumed by the factory.
 */

import type { UnsubscribeLinks } from '@/lib/email/unsubscribe-token';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailResult {
  success: boolean;
  error?: string;
}
export interface WelcomeEmailData {
  confirmationUrl: string;
}
/** Envoye une fois l'adresse confirmee: le compte est actif, l'essai commence. */
export interface WelcomeOnboardingEmailData {
  dashboardUrl: string;
  restaurantName?: string;
}
export interface PasswordResetEmailData {
  resetUrl: string;
}
export interface AccountExistsEmailData {
  loginUrl: string;
  forgotPasswordUrl: string;
}
/** Inscription refusee par la politique de mot de passe (trop simple, trop long ou pirate). */
export interface SignupPasswordRejectedEmailData {
  signupUrl: string;
}
/** Inscription non aboutie pour une autre raison cote Auth (panne passagere comprise). */
export interface SignupFailedEmailData {
  signupUrl: string;
}
export interface EmailChangeEmailData {
  confirmUrl: string;
}
export interface EmailChangeApprovalEmailData {
  approveUrl: string;
  newEmail: string;
}
export interface TeamInvitationEmailData {
  restaurantName: string;
  role: string;
  inviteUrl: string;
}

export interface LowStockAlertEmailData {
  restaurantName: string;
  items: { name: string; currentStock: number; threshold: number }[];
  dashboardUrl: string;
}

export interface RenewalReminderEmailData {
  restaurantName: string;
  /** Lien de paiement Flutterwave, valable pour cette echeance. */
  paymentUrl: string;
  daysLeft: number;
  /** Date de fin de periode, deja formatee (JJ/MM/AAAA). */
  periodEndLabel: string;
  /** Montant en unites entieres (XOF/XAF n'ont pas de decimales). */
  amount: number;
  planLabel: string;
}

/**
 * E-mails de RELANCE (premiere et dixieme commande, inactivite, fin d'essai):
 * non transactionnels, ils portent toujours un lien de desinscription (pied de
 * l'e-mail) et les en-tetes List-Unsubscribe (RFC 2369 / 8058). R5/T9.
 */
export interface LifecycleEmailData {
  restaurantName: string;
  dashboardUrl: string;
  unsubscribe: UnsubscribeLinks;
}

export interface TrialEndgameEmailData extends LifecycleEmailData {
  ordersCount: number;
  daysLeft: number;
}

// ---------------------------------------------------------------------------
// Factory contract
// ---------------------------------------------------------------------------

export interface EmailService {
  sendWelcomeEmail(to: string, data: WelcomeEmailData): Promise<EmailResult>;
  sendWelcomeOnboardingEmail(to: string, data: WelcomeOnboardingEmailData): Promise<EmailResult>;
  sendPasswordResetEmail(to: string, data: PasswordResetEmailData): Promise<EmailResult>;
  sendEmailChangeEmail(to: string, data: EmailChangeEmailData): Promise<EmailResult>;
  sendEmailChangeApprovalEmail(
    to: string,
    data: EmailChangeApprovalEmailData,
  ): Promise<EmailResult>;
  sendAccountExistsEmail(to: string, data: AccountExistsEmailData): Promise<EmailResult>;
  sendSignupPasswordRejectedEmail(
    to: string,
    data: SignupPasswordRejectedEmailData,
  ): Promise<EmailResult>;
  sendSignupFailedEmail(to: string, data: SignupFailedEmailData): Promise<EmailResult>;
  sendTeamInvitationEmail(to: string, data: TeamInvitationEmailData): Promise<EmailResult>;
  sendLowStockAlertEmail(to: string | string[], data: LowStockAlertEmailData): Promise<EmailResult>;
  sendFirstOrderTriggerEmail(to: string, data: LifecycleEmailData): Promise<EmailResult>;
  sendTenthOrderTriggerEmail(to: string, data: LifecycleEmailData): Promise<EmailResult>;
  sendTrialIdleEmail(to: string, data: LifecycleEmailData): Promise<EmailResult>;
  sendRenewalReminderEmail(to: string, data: RenewalReminderEmailData): Promise<EmailResult>;
  sendTrialEndgameEmail(to: string, data: TrialEndgameEmailData): Promise<EmailResult>;
}
