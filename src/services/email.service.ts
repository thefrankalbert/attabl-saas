/**
 * Email Service — Wraps Resend SDK for transactional emails
 *
 * Anti-spam best practices applied:
 * - Proper DOCTYPE + table-based layout for email clients
 * - Plain-text alternative (text field) on every email
 * - Preheader text for inbox preview
 * - Reply-To header
 * - Physical address in footer (CAN-SPAM / RGPD compliance)
 * - Clean subject lines (no ALL CAPS, no emoji, no spammy words)
 * - Minimal HTML, high text-to-HTML ratio
 * - Inline styles only (no <style> blocks)
 * - Single clear CTA
 */

import { Resend } from 'resend';
import { logger } from '@/lib/logger';

/** Escape user-controlled strings before interpolating into HTML. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Sanitise a URL for use in an href attribute. */
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

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'ATTABL <bonjour@attabl.com>';
const REPLY_TO = 'support@attabl.com';

const FOOTER_ADDRESS = 'ATTABL SAS — Douala, Cameroun';
const FOOTER_TAGLINE = 'Menus digitaux pour restaurants et h\u00f4tels';

/** Wraps email body content in a proper HTML document with table layout. */
function wrapHtmlDocument(opts: { preheader: string; bodyContent: string }): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ATTABL</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <!-- Preheader text (hidden, shown in inbox preview) -->
  <div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${escapeHtml(opts.preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
          ${opts.bodyContent}
          <!-- Footer -->
          <tr>
            <td style="padding:24px 24px 16px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:#a1a1aa;">
                ${FOOTER_TAGLINE}
              </p>
              <p style="margin:0;font-size:11px;line-height:1.5;color:#a1a1aa;">
                ${FOOTER_ADDRESS}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Email 1 — Verification d'adresse (court, transactionnel)
// Envoye immediatement apres inscription.
// ---------------------------------------------------------------------------

interface WelcomeConfirmationEmailData {
  restaurantName: string;
  confirmationUrl: string;
}

export async function sendWelcomeConfirmationEmail(
  to: string,
  data: WelcomeConfirmationEmailData,
): Promise<boolean> {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured — skipping confirmation email');
    return false;
  }

  const safeRestaurantName = escapeHtml(data.restaurantName);
  const safeUrl = sanitizeUrl(data.confirmationUrl);
  const rawUrl = escapeHtml(data.confirmationUrl);

  const subject = `Confirmez votre adresse — ${data.restaurantName}`;
  const preheader = `Un clic pour activer votre compte ATTABL pour ${data.restaurantName}.`;

  const bodyContent = `
          <!-- Header -->
          <tr>
            <td style="background-color:#18181b;padding:28px 24px;text-align:center;border-radius:8px 8px 0 0;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">ATTABL</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:36px 28px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;text-align:center;">
              <p style="margin:0 0 12px;font-size:20px;font-weight:600;color:#18181b;">
                Confirmez votre adresse email
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#3f3f46;">
                ${safeRestaurantName}, appuyez sur le bouton ci-dessous pour activer votre compte.
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:4px 0 20px;">
                    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safeUrl}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="17%" fillcolor="#18181b"><center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">Confirmer mon adresse</center></v:roundrect><![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${safeUrl}" style="display:inline-block;background-color:#18181b;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;line-height:1.4;">
                      Confirmer mon adresse
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:12px;color:#a1a1aa;">
                Ce lien expire dans 24 heures.
              </p>
              <!-- Separator -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #e4e4e7;padding:0;height:1px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              <p style="margin:20px 0 8px;font-size:12px;line-height:1.5;color:#a1a1aa;">
                Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :
              </p>
              <p style="margin:0;font-size:11px;line-height:1.4;color:#a1a1aa;word-break:break-all;">
                ${rawUrl}
              </p>
            </td>
          </tr>
          <!-- Bottom bar -->
          <tr>
            <td style="background-color:#fafafa;padding:16px 28px;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 8px 8px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;text-align:center;">
                Vous n'avez pas cree de compte ? Ignorez cet email.
              </p>
            </td>
          </tr>`;

  const html = wrapHtmlDocument({ preheader, bodyContent });

  const text = `Confirmez votre adresse email — ATTABL

${data.restaurantName}, activez votre compte en ouvrant le lien ci-dessous :

${data.confirmationUrl}

Ce lien expire dans 24 heures.

Vous n'avez pas cree de compte ? Ignorez cet email.

---
${FOOTER_TAGLINE}
${FOOTER_ADDRESS}`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: [to],
      subject,
      html,
      text,
    });

    if (error) {
      logger.error('Resend confirmation email error', error);
      return false;
    }

    return true;
  } catch (err) {
    logger.error('Failed to send confirmation email', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Email 2 — Bienvenue + Onboarding (envoye apres verification)
// ---------------------------------------------------------------------------

interface WelcomeOnboardingEmailData {
  restaurantName: string;
  dashboardUrl: string;
  totalRestaurants: number;
}

export async function sendWelcomeOnboardingEmail(
  to: string,
  data: WelcomeOnboardingEmailData,
): Promise<boolean> {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured — skipping welcome email');
    return false;
  }

  const safeRestaurantName = escapeHtml(data.restaurantName);
  const safeUrl = sanitizeUrl(data.dashboardUrl);

  const subject = `${data.restaurantName}, votre menu digital est pret`;
  const preheader = `Creez votre premier menu en quelques minutes. ${data.restaurantName} est pret a accueillir ses clients.`;

  const bodyContent = `
          <!-- Header -->
          <tr>
            <td style="background-color:#18181b;padding:28px 24px;text-align:center;border-radius:8px 8px 0 0;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">ATTABL</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:36px 28px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
              <!-- Badge -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:#f0fdf4;color:#166534;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:5px 12px;border-radius:100px;">
                    Compte active
                  </td>
                </tr>
              </table>
              <!-- Titre -->
              <p style="margin:20px 0 6px;font-size:22px;font-weight:700;color:#18181b;line-height:1.3;">
                ${safeRestaurantName}, bienvenue sur ATTABL.
              </p>
              <p style="margin:0 0 24px;font-size:16px;color:#71717a;line-height:1.4;">
                Votre menu digital est pret a prendre vie.
              </p>
              <!-- Corps -->
              <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#3f3f46;">
                A partir de maintenant, vous pouvez creer et modifier votre carte en temps reel — depuis votre telephone, entre deux services, sans appeler un graphiste ni relancer d'impression.
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#3f3f46;">
                Vos clients scannent un QR code, votre menu s'affiche. <strong style="color:#18181b;">Un plat en rupture ? Vous le retirez en 10 secondes.</strong> Un nouveau dessert ? Il est en ligne avant le coup de feu.
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:4px 0 8px;">
                    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safeUrl}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="17%" fillcolor="#18181b"><center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">Creer mon premier menu</center></v:roundrect><![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${safeUrl}" style="display:inline-block;background-color:#18181b;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;line-height:1.4;">
                      Creer mon premier menu
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
              <p style="margin:8px 0 0;font-size:12px;color:#a1a1aa;text-align:center;">
                Prend environ 5 minutes
              </p>
            </td>
          </tr>
          <!-- Steps section -->
          <tr>
            <td style="background-color:#ffffff;padding:0 28px 32px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
              <!-- Separator -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #e4e4e7;padding:0;height:1px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              <p style="margin:24px 0 18px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#a1a1aa;">
                Votre premier menu en 3 etapes
              </p>
              <!-- Step 1 -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                <tr>
                  <td width="32" valign="top" style="padding-right:12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                      <td style="width:28px;height:28px;background-color:#f0fdf4;color:#166534;font-size:13px;font-weight:700;text-align:center;border-radius:50%;line-height:28px;">1</td>
                    </tr></table>
                  </td>
                  <td valign="top">
                    <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#18181b;">Ajoutez vos plats et vos prix</p>
                    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.5;">Tapez-les directement ou importez votre carte existante. ~ 3 min</p>
                  </td>
                </tr>
              </table>
              <!-- Step 2 -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                <tr>
                  <td width="32" valign="top" style="padding-right:12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                      <td style="width:28px;height:28px;background-color:#f0fdf4;color:#166534;font-size:13px;font-weight:700;text-align:center;border-radius:50%;line-height:28px;">2</td>
                    </tr></table>
                  </td>
                  <td valign="top">
                    <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#18181b;">Personnalisez le look</p>
                    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.5;">Ajoutez votre logo, choisissez vos couleurs, ajoutez des photos. ~ 2 min</p>
                  </td>
                </tr>
              </table>
              <!-- Step 3 -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                <tr>
                  <td width="32" valign="top" style="padding-right:12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                      <td style="width:28px;height:28px;background-color:#f0fdf4;color:#166534;font-size:13px;font-weight:700;text-align:center;border-radius:50%;line-height:28px;">3</td>
                    </tr></table>
                  </td>
                  <td valign="top">
                    <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#18181b;">Recuperez votre QR code</p>
                    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.5;">Imprimez-le ou collez-le sur vos tables. ~ 30 sec</p>
                  </td>
                </tr>
              </table>
              <!-- Separator -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #e4e4e7;padding:0;height:1px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              <!-- Social proof -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:#fafafa;padding:16px 20px;border-radius:8px;text-align:center;margin-top:20px;">
                    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;">
                      <strong style="color:#3f3f46;">${data.totalRestaurants} restaurants et hotels</strong> utilisent ATTABL au quotidien pour garder leur carte toujours a jour.
                    </p>
                  </td>
                </tr>
              </table>
              <!-- Help -->
              <p style="margin:24px 0 0;font-size:13px;color:#71717a;text-align:center;line-height:1.6;">
                Besoin d'aide pour demarrer ?
                <a href="mailto:support@attabl.com" style="color:#18181b;font-weight:600;text-decoration:none;border-bottom:1px solid #d4d4d8;">Ecrivez-nous</a>
                — on repond en moins de 2 heures.
              </p>
            </td>
          </tr>
          <!-- Bottom bar -->
          <tr>
            <td style="background-color:#fafafa;padding:16px 28px;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 8px 8px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;text-align:center;">
                <a href="https://attabl.com" style="color:#a1a1aa;text-decoration:underline;">attabl.com</a>
                &nbsp;&middot;&nbsp;
                <a href="https://attabl.com/confidentialite" style="color:#a1a1aa;text-decoration:underline;">Confidentialite</a>
                &nbsp;&middot;&nbsp;
                <a href="https://attabl.com/conditions" style="color:#a1a1aa;text-decoration:underline;">Conditions</a>
              </p>
            </td>
          </tr>`;

  const html = wrapHtmlDocument({ preheader, bodyContent });

  const text = `${data.restaurantName}, bienvenue sur ATTABL !

Votre compte est active. Votre menu digital est pret a prendre vie.

A partir de maintenant, vous pouvez creer et modifier votre carte en temps reel — depuis votre telephone, entre deux services, sans appeler un graphiste ni relancer d'impression.

Creez votre premier menu ici :
${data.dashboardUrl}

VOTRE PREMIER MENU EN 3 ETAPES :

1. Ajoutez vos plats et vos prix (~3 min)
2. Personnalisez le look (~2 min)
3. Recuperez votre QR code (~30 sec)

${data.totalRestaurants} restaurants et hotels utilisent deja ATTABL.

Besoin d'aide ? Ecrivez-nous : support@attabl.com — on repond en moins de 2 heures.

---
${FOOTER_TAGLINE}
${FOOTER_ADDRESS}`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: [to],
      subject,
      html,
      text,
    });

    if (error) {
      logger.error('Resend welcome onboarding email error', error);
      return false;
    }

    return true;
  } catch (err) {
    logger.error('Failed to send welcome onboarding email', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Invitation Email
// ---------------------------------------------------------------------------

interface InvitationEmailData {
  restaurantName: string;
  restaurantLogoUrl?: string;
  role: string;
  inviteUrl: string;
}

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
  const safeRestaurantName = escapeHtml(data.restaurantName);
  const safeUrl = sanitizeUrl(data.inviteUrl);
  const safeRoleLabel = escapeHtml(roleLabel);

  const subject = `Invitation a rejoindre ${data.restaurantName} sur ATTABL`;
  const preheader = `${data.restaurantName} vous invite a rejoindre son equipe en tant que ${roleLabel}.`;

  const logoRow = data.restaurantLogoUrl
    ? `<img src="${sanitizeUrl(data.restaurantLogoUrl)}" alt="${safeRestaurantName}" width="48" height="48" style="display:block;margin:0 auto 12px;border-radius:8px;height:48px;width:48px;" />`
    : '';

  const bodyContent = `
          <!-- Header -->
          <tr>
            <td style="background-color:#18181b;padding:28px 24px;text-align:center;border-radius:8px 8px 0 0;">
              ${logoRow}
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${safeRestaurantName}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:32px 28px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
              <p style="margin:0 0 20px;font-size:18px;font-weight:600;color:#18181b;">
                Vous avez ete invite
              </p>
              <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3f3f46;">
                <strong>${safeRestaurantName}</strong> vous invite a rejoindre son equipe sur ATTABL en tant que <strong>${safeRoleLabel}</strong>.
              </p>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.5;color:#71717a;">
                Cette invitation est valide pendant 72 heures.
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:4px 0 28px;">
                    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safeUrl}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="17%" fillcolor="#CCFF00"><center style="color:#000000;font-family:sans-serif;font-size:15px;font-weight:bold;">Accepter l'invitation</center></v:roundrect><![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${safeUrl}" style="display:inline-block;background-color:#CCFF00;color:#000000;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;line-height:1.4;">
                      Accepter l'invitation
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">
                Si vous n'avez pas demande cette invitation, ignorez simplement cet email.
              </p>
            </td>
          </tr>
          <!-- Bottom bar -->
          <tr>
            <td style="background-color:#fafafa;padding:16px 28px;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 8px 8px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;text-align:center;">
                Envoye par ATTABL au nom de ${safeRestaurantName}
              </p>
            </td>
          </tr>`;

  const html = wrapHtmlDocument({ preheader, bodyContent });

  const text = `Vous avez ete invite a rejoindre ${data.restaurantName} sur ATTABL

${data.restaurantName} vous invite a rejoindre son equipe en tant que ${roleLabel}.

Acceptez l'invitation en ouvrant le lien ci-dessous :

${data.inviteUrl}

Cette invitation est valide pendant 72 heures.

Si vous n'avez pas demande cette invitation, ignorez simplement cet email.

---
${FOOTER_TAGLINE}
${FOOTER_ADDRESS}`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: [to],
      subject,
      html,
      text,
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

// ---------------------------------------------------------------------------
// Stock Alert Email
// ---------------------------------------------------------------------------

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

  const safeTenantName = escapeHtml(data.tenantName);
  const safeUrl = sanitizeUrl(data.dashboardUrl);

  const subject =
    outOfStockItems.length > 0
      ? `Alerte stock : ${outOfStockItems.length} produit(s) en rupture — ${data.tenantName}`
      : `Stock bas : ${lowStockItems.length} produit(s) sous le seuil — ${data.tenantName}`;

  const preheader =
    outOfStockItems.length > 0
      ? `${outOfStockItems.length} produit(s) en rupture de stock necessitent votre attention.`
      : `${lowStockItems.length} produit(s) sont en dessous du seuil d'alerte.`;

  const itemRows = data.items
    .map((item) => {
      const statusColor = item.is_out ? '#dc2626' : '#ca8a04';
      const statusText = item.is_out ? 'Rupture' : 'Stock bas';
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:14px;color:#3f3f46;">${escapeHtml(item.name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;text-align:center;font-size:14px;color:#3f3f46;">${item.current_stock} ${escapeHtml(item.unit)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;text-align:center;font-size:14px;color:#3f3f46;">${item.min_stock_alert} ${escapeHtml(item.unit)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;text-align:center;font-size:13px;font-weight:600;color:${statusColor};">${statusText}</td>
      </tr>`;
    })
    .join('');

  const summaryLine = [
    outOfStockItems.length > 0
      ? `<strong>${outOfStockItems.length}</strong> en rupture de stock`
      : null,
    lowStockItems.length > 0
      ? `<strong>${lowStockItems.length}</strong> sous le seuil d'alerte`
      : null,
  ]
    .filter(Boolean)
    .join(', ');

  const bodyContent = `
          <!-- Header -->
          <tr>
            <td style="background-color:#18181b;padding:24px;text-align:left;border-radius:8px 8px 0 0;">
              <p style="margin:0;font-size:18px;font-weight:600;color:#ffffff;">Alerte stock — ${safeTenantName}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:28px 24px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3f3f46;">
                ${summaryLine}.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e4e7;border-radius:6px;">
                <thead>
                  <tr style="background-color:#fafafa;">
                    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Produit</th>
                    <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Actuel</th>
                    <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Seuil</th>
                    <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Statut</th>
                  </tr>
                </thead>
                <tbody>${itemRows}</tbody>
              </table>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:28px 0 4px;">
                    <a href="${safeUrl}" style="display:inline-block;background-color:#18181b;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;line-height:1.4;">
                      Voir l'inventaire
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Bottom bar -->
          <tr>
            <td style="background-color:#fafafa;padding:16px 24px;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 8px 8px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;text-align:center;">
                Alerte automatique ATTABL — maximum une alerte par produit par heure.
              </p>
            </td>
          </tr>`;

  const html = wrapHtmlDocument({ preheader, bodyContent });

  const textItemList = data.items
    .map(
      (item) =>
        `- ${item.name}: ${item.current_stock} ${item.unit} (seuil: ${item.min_stock_alert}) — ${item.is_out ? 'RUPTURE' : 'Stock bas'}`,
    )
    .join('\n');

  const text = `Alerte stock — ${data.tenantName}

${outOfStockItems.length > 0 ? `${outOfStockItems.length} produit(s) en rupture de stock.` : ''}
${lowStockItems.length > 0 ? `${lowStockItems.length} produit(s) sous le seuil d'alerte.` : ''}

${textItemList}

Voir l'inventaire : ${data.dashboardUrl}

---
Alerte automatique ATTABL — maximum une alerte par produit par heure.
${FOOTER_ADDRESS}`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to,
      subject,
      html,
      text,
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
