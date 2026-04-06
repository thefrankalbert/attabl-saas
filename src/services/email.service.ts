/**
 * Email Service - Wraps Resend SDK for transactional emails.
 *
 * Factory pattern: createEmailService() returns all email methods.
 * Gracefully handles missing API key in development.
 */

import { Resend } from 'resend';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmailResult {
  success: boolean;
  error?: string;
}
interface WelcomeEmailData {
  confirmationUrl: string;
}
interface PasswordResetEmailData {
  resetUrl: string;
}
interface TeamInvitationEmailData {
  restaurantName: string;
  role: string;
  inviteUrl: string;
}

interface OrderConfirmationEmailData {
  orderNumber: string;
  restaurantName: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  currency?: string;
  tableNumber?: string;
}

interface LowStockAlertEmailData {
  restaurantName: string;
  items: { name: string; currentStock: number; threshold: number }[];
  dashboardUrl: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return encodeURI(url);
    }
    return '';
  } catch {
    return '';
  }
}

const FOOTER = 'ATTABL SAS - Douala, Cameroun';

function wrap(preheader: string, body: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>ATTABL</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;">
<tr><td align="center" style="padding:40px 16px 32px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
<tr><td style="padding:0 0 24px;text-align:center;font-size:18px;font-weight:700;color:#111827;">ATTABL</td></tr>
${body}
<tr><td style="padding:24px 0 0;text-align:center;font-size:11px;color:#9ca3af;">${FOOTER}</td></tr>
</table></td></tr></table></body></html>`;
}

function card(content: string): string {
  return `<tr><td style="background:#fff;padding:32px;border-radius:8px;border:1px solid #e5e7eb;">${content}</td></tr>`;
}

function cta(url: string, label: string): string {
  const safe = sanitizeUrl(url);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 0 0;"><a href="${safe}" style="display:inline-block;background:#111827;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(label)}</a></td></tr></table>`;
}

function formatCurrency(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${escapeHtml(currency)}`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEmailService() {
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
      logger.warn('RESEND_API_KEY not configured - email skipped', { subject });
      return { success: true };
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
      const safeUrl = sanitizeUrl(data.confirmationUrl);
      const rawUrl = escapeHtml(data.confirmationUrl);

      const html = wrap(
        'Confirmez votre adresse email pour activer votre compte.',
        card(
          `<p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Bienvenue sur ATTABL</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">Merci pour votre inscription. Confirmez votre adresse email pour activer votre compte.</p>
          ${cta(safeUrl, 'Confirmer mon adresse')}
          <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">Ce lien expire dans 24 heures.</p>
          <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;word-break:break-all;">Lien : ${rawUrl}</p>`,
        ),
      );

      const text = `Bienvenue sur ATTABL\n\nConfirmez votre adresse email :\n${data.confirmationUrl}\n\nCe lien expire dans 24 heures.\n\n${FOOTER}`;

      return send(to, 'Confirmez votre adresse email', html, text);
    },

    async sendPasswordResetEmail(to: string, data: PasswordResetEmailData): Promise<EmailResult> {
      const safeUrl = sanitizeUrl(data.resetUrl);
      const rawUrl = escapeHtml(data.resetUrl);

      const html = wrap(
        'Reinitialiser votre mot de passe ATTABL.',
        card(
          `<p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Reinitialiser votre mot de passe</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">Vous avez demande a reinitialiser votre mot de passe. Cliquez ci-dessous pour en choisir un nouveau.</p>
          ${cta(safeUrl, 'Choisir un nouveau mot de passe')}
          <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
          <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;word-break:break-all;">Lien : ${rawUrl}</p>`,
        ),
      );

      const text = `Reinitialiser votre mot de passe\n\nCliquez sur le lien ci-dessous :\n${data.resetUrl}\n\nCe lien expire dans 1 heure.\n\n${FOOTER}`;

      return send(to, 'Reinitialiser votre mot de passe', html, text);
    },

    async sendTeamInvitationEmail(to: string, data: TeamInvitationEmailData): Promise<EmailResult> {
      const roleLabels: Record<string, string> = {
        admin: 'Administrateur',
        manager: 'Manager',
        cashier: 'Caissier',
        chef: 'Chef Cuisine',
        waiter: 'Serveur',
      };
      const roleLabel = roleLabels[data.role] || data.role;
      const safeName = escapeHtml(data.restaurantName);
      const safeRole = escapeHtml(roleLabel);

      const html = wrap(
        `${data.restaurantName} vous invite a rejoindre son equipe.`,
        card(
          `<p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Vous avez ete invite</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;"><strong style="color:#111827;">${safeName}</strong> vous invite a rejoindre son equipe en tant que <strong style="color:#111827;">${safeRole}</strong>.</p>
          ${cta(data.inviteUrl, "Accepter l'invitation")}
          <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">Cette invitation est valide pendant 72 heures.</p>`,
        ),
      );

      const text = `Invitation - ${data.restaurantName}\n\n${data.restaurantName} vous invite en tant que ${roleLabel}.\n\nAcceptez ici : ${data.inviteUrl}\n\nValide 72 heures.\n\n${FOOTER}`;

      return send(to, `Invitation : rejoignez ${data.restaurantName} sur ATTABL`, html, text);
    },

    async sendOrderConfirmationEmail(
      to: string,
      data: OrderConfirmationEmailData,
    ): Promise<EmailResult> {
      const cur = data.currency || 'EUR';
      const safeName = escapeHtml(data.restaurantName);
      const safeOrder = escapeHtml(data.orderNumber);
      const tableInfo = data.tableNumber
        ? `<p style="margin:0 0 16px;font-size:14px;color:#6b7280;">Table : ${escapeHtml(data.tableNumber)}</p>`
        : '';

      const itemRows = data.items
        .map(
          (item) =>
            `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#4b5563;">${escapeHtml(item.name)}</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:center;font-size:14px;color:#4b5563;">x${item.quantity}</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:14px;color:#4b5563;">${formatCurrency(item.price * item.quantity, cur)}</td></tr>`,
        )
        .join('');

      const th = (t: string, a: string) =>
        `<th style="padding:8px 0;text-align:${a};font-size:12px;font-weight:600;color:#6b7280;">${t}</th>`;
      const html = wrap(
        `Commande ${data.orderNumber} confirmee.`,
        card(
          `<p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">${safeName}</p>
        <p style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111827;">Commande ${safeOrder}</p>${tableInfo}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <thead><tr style="border-bottom:2px solid #e5e7eb;">${th('Article', 'left')}${th('Qte', 'center')}${th('Prix', 'right')}</tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot><tr><td colspan="2" style="padding:12px 0 0;font-size:16px;font-weight:700;color:#111827;">Total</td>
        <td style="padding:12px 0 0;text-align:right;font-size:16px;font-weight:700;color:#111827;">${formatCurrency(data.total, cur)}</td></tr></tfoot></table>`,
        ),
      );

      const itemsText = data.items
        .map((i) => `- ${i.name} x${i.quantity} : ${formatCurrency(i.price * i.quantity, cur)}`)
        .join('\n');
      const text = `Commande ${data.orderNumber} - ${data.restaurantName}\n\n${itemsText}\n\nTotal : ${formatCurrency(data.total, cur)}\n\n${FOOTER}`;

      return send(to, `Commande ${data.orderNumber} confirmee`, html, text);
    },

    async sendLowStockAlertEmail(
      to: string | string[],
      data: LowStockAlertEmailData,
    ): Promise<EmailResult> {
      const safeName = escapeHtml(data.restaurantName);
      const count = data.items.length;

      const rows = data.items
        .map(
          (item) =>
            `<tr><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#4b5563;">${escapeHtml(item.name)}</td><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:14px;color:${item.currentStock === 0 ? '#dc2626' : '#ca8a04'};font-weight:600;">${item.currentStock}</td><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:14px;color:#6b7280;">${item.threshold}</td></tr>`,
        )
        .join('');

      const sh = (t: string) =>
        `<th style="padding:8px 12px;text-align:center;font-size:12px;font-weight:600;color:#6b7280;">${t}</th>`;
      const html = wrap(
        `${count} produit(s) sous le seuil de stock.`,
        card(
          `<p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">${safeName}</p>
        <p style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111827;">Alerte stock</p>
        <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">${count} produit(s) necessitent votre attention.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:6px;">
        <thead><tr style="background:#f9fafb;"><th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;">Produit</th>${sh('Stock')}${sh('Seuil')}</tr></thead>
        <tbody>${rows}</tbody></table>${cta(data.dashboardUrl, "Voir l'inventaire")}`,
        ),
      );

      const itemsText = data.items
        .map((i) => `- ${i.name}: ${i.currentStock} (seuil: ${i.threshold})`)
        .join('\n');
      const text = `Alerte stock - ${data.restaurantName}\n\n${itemsText}\n\nVoir l'inventaire : ${data.dashboardUrl}\n\n${FOOTER}`;

      return send(to, `Alerte stock : ${count} produit(s) - ${data.restaurantName}`, html, text);
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
  data: {
    userName?: string;
    restaurantName?: string;
    dashboardUrl: string;
    totalRestaurants: number;
  },
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
