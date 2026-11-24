/**
 * Email Service - Shared types.
 *
 * Data shapes and the public EmailService interface consumed by the factory.
 */

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

export interface OrderConfirmationEmailData {
  orderNumber: string;
  restaurantName: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  currency?: string;
  tableNumber?: string;
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

/** Alerte de connexion depuis un appareil inconnu (audit Q19). */
export interface NewLoginEmailData {
  /** Date et heure deja formatees, fuseau compris. */
  dateLabel: string;
  methode: 'mot_de_passe' | 'google' | 'autre';
  changePasswordUrl: string;
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
  sendTeamInvitationEmail(to: string, data: TeamInvitationEmailData): Promise<EmailResult>;
  sendOrderConfirmationEmail(to: string, data: OrderConfirmationEmailData): Promise<EmailResult>;
  sendLowStockAlertEmail(to: string | string[], data: LowStockAlertEmailData): Promise<EmailResult>;
  sendFirstOrderTriggerEmail(
    to: string,
    data: { restaurantName: string; dashboardUrl: string },
  ): Promise<EmailResult>;
  sendTenthOrderTriggerEmail(
    to: string,
    data: { restaurantName: string; dashboardUrl: string },
  ): Promise<EmailResult>;
  sendTrialIdleEmail(
    to: string,
    data: { restaurantName: string; dashboardUrl: string },
  ): Promise<EmailResult>;
  sendRenewalReminderEmail(to: string, data: RenewalReminderEmailData): Promise<EmailResult>;
  sendTrialEndgameEmail(
    to: string,
    data: { restaurantName: string; dashboardUrl: string; ordersCount: number; daysLeft: number },
  ): Promise<EmailResult>;
  sendNewLoginEmail(to: string, data: NewLoginEmailData): Promise<EmailResult>;
}
