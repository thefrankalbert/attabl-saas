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
export interface PasswordResetEmailData {
  resetUrl: string;
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

// ---------------------------------------------------------------------------
// Factory contract
// ---------------------------------------------------------------------------

export interface EmailService {
  sendWelcomeEmail(to: string, data: WelcomeEmailData): Promise<EmailResult>;
  sendPasswordResetEmail(to: string, data: PasswordResetEmailData): Promise<EmailResult>;
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
  sendTrialEndgameEmail(
    to: string,
    data: { restaurantName: string; dashboardUrl: string; ordersCount: number; daysLeft: number },
  ): Promise<EmailResult>;
}
