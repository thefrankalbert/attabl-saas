/**
 * Email Service — Wraps Resend SDK for transactional emails
 */

import { Resend } from 'resend';
import { logger } from '@/lib/logger';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Attabl <notifications@attabl.com>';

interface InvitationEmailData {
  restaurantName: string;
  restaurantLogoUrl?: string;
  role: string;
  inviteUrl: string;
}

interface StockAlertItem {
  name: string;
  unit: string;
  current_stock: number;
  min_stock_alert: number;
  is_out: boolean;
}

interface StockAlertEmailData {
  tenantName: string;
  items: StockAlertItem[];
  dashboardUrl: string;
}

export async function sendStockAlertEmail(
  to: string[],
  data: StockAlertEmailData,
): Promise<boolean> {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured — skipping stock alert email');
    return false;
  }

  if (to.length === 0) return false;

  const outOfStockItems = data.items.filter((i) => i.is_out);
  const lowStockItems = data.items.filter((i) => !i.is_out);

  const itemRows = data.items
    .map((item) => {
      const status = item.is_out ? '🔴 Rupture' : '🟡 Stock bas';
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500">${item.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.current_stock} ${item.unit}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.min_stock_alert} ${item.unit}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${status}</td>
      </tr>`;
    })
    .join('');

  const subject =
    outOfStockItems.length > 0
      ? `⚠️ ${data.tenantName} — ${outOfStockItems.length} produit(s) en rupture de stock`
      : `📉 ${data.tenantName} — ${lowStockItems.length} produit(s) en stock bas`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1f2937;padding:24px;border-radius:12px 12px 0 0">
        <h1 style="color:white;margin:0;font-size:20px">Alerte Stock — ${data.tenantName}</h1>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none">
        <p style="color:#374151;margin:0 0 16px">
          ${outOfStockItems.length > 0 ? `<strong>${outOfStockItems.length} produit(s)</strong> en rupture de stock.` : ''}
          ${lowStockItems.length > 0 ? `<strong>${lowStockItems.length} produit(s)</strong> sous le seuil d'alerte.` : ''}
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:8px 12px;text-align:left;font-weight:600;color:#6b7280">Produit</th>
              <th style="padding:8px 12px;text-align:center;font-weight:600;color:#6b7280">Stock actuel</th>
              <th style="padding:8px 12px;text-align:center;font-weight:600;color:#6b7280">Seuil alerte</th>
              <th style="padding:8px 12px;text-align:center;font-weight:600;color:#6b7280">Statut</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        <div style="margin-top:24px;text-align:center">
          <a href="${data.dashboardUrl}" style="display:inline-block;background:#1f2937;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500">
            Voir l'inventaire
          </a>
        </div>
      </div>
      <div style="background:#f9fafb;padding:16px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none">
        <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center">
          Cet email est envoyé automatiquement par Attabl. Vous ne recevrez pas plus d'une alerte par produit par heure.
        </p>
      </div>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      logger.error('Resend error', error);
      return false;
    }

    return true;
  } catch (err) {
    logger.error('Failed to send stock alert', err);
    return false;
  }
}

/**
 * Send an invitation email to join a restaurant team on ATTABL.
 *
 * Uses the ATTABL design charter: #CCFF00 CTA, dark header, clean white body.
 * The invitation link expires in 72 hours.
 */
export async function sendInvitationEmail(to: string, data: InvitationEmailData): Promise<boolean> {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured — skipping invitation email');
    return false;
  }

  const roleLabels: Record<string, string> = {
    admin: 'Administrateur',
    manager: 'Manager',
    cashier: 'Caissier',
    chef: 'Chef Cuisine',
    waiter: 'Serveur',
  };

  const roleLabel = roleLabels[data.role] || data.role;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1f2937;padding:24px;border-radius:12px 12px 0 0;text-align:center">
        ${data.restaurantLogoUrl ? `<img src="${data.restaurantLogoUrl}" alt="" style="height:48px;margin-bottom:12px;border-radius:8px" />` : ''}
        <h1 style="color:white;margin:0;font-size:22px">${data.restaurantName}</h1>
      </div>
      <div style="background:white;padding:32px 24px;border:1px solid #e5e7eb;border-top:none">
        <h2 style="color:#111827;margin:0 0 16px;font-size:18px">Vous avez ete invite !</h2>
        <p style="color:#374151;margin:0 0 8px;line-height:1.6">
          Vous avez ete invite a rejoindre l'equipe de <strong>${data.restaurantName}</strong> sur ATTABL
          en tant que <strong>${roleLabel}</strong>.
        </p>
        <p style="color:#6b7280;margin:0 0 24px;font-size:14px">
          Cette invitation expire dans 72 heures.
        </p>
        <div style="text-align:center;margin:32px 0">
          <a href="${data.inviteUrl}" style="display:inline-block;background:#CCFF00;color:#000;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px">
            Accepter l'invitation
          </a>
        </div>
        <p style="color:#9ca3af;font-size:13px;margin:0;text-align:center">
          Si vous n'avez pas demande cette invitation, vous pouvez ignorer cet email.
        </p>
      </div>
      <div style="background:#f9fafb;padding:16px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none">
        <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center">
          Envoye par ATTABL — Menus digitaux pour restaurants et hotels
        </p>
      </div>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `Rejoignez l'equipe de ${data.restaurantName} sur ATTABL`,
      html,
    });

    if (error) {
      logger.error('Resend invitation error', error);
      return false;
    }

    return true;
  } catch (err) {
    logger.error('Failed to send invitation email', err);
    return false;
  }
}
