/**
 * Email Service - Wraps Resend SDK for transactional emails
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
 * - Light background, clean design (like Stripe/Linear) - avoids spam filters
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

const FOOTER_ADDRESS = 'ATTABL SAS - Douala, Cameroun';
const FOOTER_TAGLINE = 'Menus digitaux pour restaurants et h\u00f4tels';

/**
 * Wraps email body content in a proper HTML document with table layout.
 * Uses a light, clean design similar to Stripe/Linear emails.
 */
function wrapHtmlDocument(opts: { preheader: string; bodyContent: string }): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ATTABL</title>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <!-- Preheader text (hidden, shown in inbox preview) -->
  <div style="display:none;font-size:1px;color:#f9fafb;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${escapeHtml(opts.preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;">
    <tr>
      <td align="center" style="padding:40px 16px 32px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
          <!-- Logo -->
          <tr>
            <td style="padding:0 0 32px;text-align:center;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#111827;letter-spacing:0.5px;">ATTABL</p>
            </td>
          </tr>
          ${opts.bodyContent}
          <!-- Footer -->
          <tr>
            <td style="padding:32px 24px 16px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:#9ca3af;">
                ${FOOTER_TAGLINE}
              </p>
              <p style="margin:0;font-size:11px;line-height:1.5;color:#9ca3af;">
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
// Email 1 - Verification d'adresse (court, transactionnel)
// Envoye immediatement apres inscription.
// NOTE: At signup time, user only provided their email - no restaurant name yet.
// This email addresses the user directly, not their establishment.
// ---------------------------------------------------------------------------

interface WelcomeConfirmationEmailData {
  confirmationUrl: string;
  /** @deprecated Use userEmail instead. Kept for backwards compat. */
  restaurantName?: string;
}

export async function sendWelcomeConfirmationEmail(
  to: string,
  data: WelcomeConfirmationEmailData,
): Promise<boolean> {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured - skipping confirmation email');
    return false;
  }

  const safeUrl = sanitizeUrl(data.confirmationUrl);
  const rawUrl = escapeHtml(data.confirmationUrl);

  const subject = 'Confirmez votre adresse email';
  const preheader = 'Un clic pour activer votre compte ATTABL.';

  const bodyContent = `
          <!-- Body card -->
          <tr>
            <td style="background-color:#ffffff;padding:40px 32px;border-radius:8px;border:1px solid #e5e7eb;">
              <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">
                Bienvenue sur ATTABL
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#4b5563;">
                Merci pour votre inscription. Pour activer votre compte et commencer la configuration de votre etablissement, confirmez votre adresse email.
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:0 0 28px;">
                    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safeUrl}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="14%" fillcolor="#111827"><center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:600;">Confirmer mon adresse</center></v:roundrect><![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${safeUrl}" style="display:inline-block;background-color:#111827;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;line-height:1.4;">
                      Confirmer mon adresse
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:13px;color:#9ca3af;">
                Ce lien expire dans 24 heures.
              </p>
              <!-- Separator -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #e5e7eb;padding:0;height:1px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              <p style="margin:20px 0 8px;font-size:12px;line-height:1.5;color:#9ca3af;">
                Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :
              </p>
              <p style="margin:0;font-size:11px;line-height:1.4;color:#9ca3af;word-break:break-all;">
                ${rawUrl}
              </p>
            </td>
          </tr>
          <!-- Safety note -->
          <tr>
            <td style="padding:16px 24px 0;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">
                Vous n'avez pas cree de compte ? Ignorez simplement cet email.
              </p>
            </td>
          </tr>`;

  const html = wrapHtmlDocument({ preheader, bodyContent });

  const text = `Bienvenue sur ATTABL

Merci pour votre inscription. Confirmez votre adresse email pour activer votre compte.

${data.confirmationUrl}

Ce lien expire dans 24 heures.

Vous n'avez pas cree de compte ? Ignorez simplement cet email.

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
// Email - Password Reset
// ---------------------------------------------------------------------------

interface PasswordResetEmailData {
  resetUrl: string;
}

export async function sendPasswordResetEmail(
  to: string,
  data: PasswordResetEmailData,
): Promise<boolean> {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured - skipping password reset email');
    return false;
  }

  const safeUrl = sanitizeUrl(data.resetUrl);
  const rawUrl = escapeHtml(data.resetUrl);

  const subject = 'Reinitialiser votre mot de passe';
  const preheader = 'Cliquez pour choisir un nouveau mot de passe ATTABL.';

  const bodyContent = `
          <!-- Body card -->
          <tr>
            <td style="background-color:#ffffff;padding:40px 32px;border-radius:8px;border:1px solid #e5e7eb;">
              <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">
                Reinitialiser votre mot de passe
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#4b5563;">
                Vous avez demande a reinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:0 0 28px;">
                    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safeUrl}" style="height:44px;v-text-anchor:middle;width:280px;" arcsize="14%" fillcolor="#111827"><center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:600;">Reinitialiser mon mot de passe</center></v:roundrect><![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${safeUrl}" style="display:inline-block;background-color:#111827;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;line-height:1.4;">
                      Reinitialiser mon mot de passe
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:13px;color:#9ca3af;">
                Ce lien expire dans 1 heure.
              </p>
              <!-- Separator -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #e5e7eb;padding:0;height:1px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              <p style="margin:20px 0 8px;font-size:12px;line-height:1.5;color:#9ca3af;">
                Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :
              </p>
              <p style="margin:0;font-size:11px;line-height:1.4;color:#9ca3af;word-break:break-all;">
                ${rawUrl}
              </p>
            </td>
          </tr>
          <!-- Safety note -->
          <tr>
            <td style="padding:16px 24px 0;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">
                Si vous n'avez pas fait cette demande, ignorez simplement cet email.
              </p>
            </td>
          </tr>`;

  const html = wrapHtmlDocument({ preheader, bodyContent });

  const text = `Reinitialiser votre mot de passe

Vous avez demande a reinitialiser votre mot de passe. Cliquez sur le lien ci-dessous pour en choisir un nouveau.

${data.resetUrl}

Ce lien expire dans 1 heure.

Si vous n'avez pas fait cette demande, ignorez simplement cet email.

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
      logger.error('Resend password reset email error', error);
      return false;
    }

    return true;
  } catch (err) {
    logger.error('Failed to send password reset email', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Email 2 - Bienvenue + Onboarding (envoye apres verification email)
// At this point, user confirmed their email. We use their name if available,
// otherwise fall back to "Bonjour".
// ---------------------------------------------------------------------------

interface WelcomeOnboardingEmailData {
  userName?: string;
  restaurantName?: string;
  dashboardUrl: string;
  totalRestaurants: number;
}

export async function sendWelcomeOnboardingEmail(
  to: string,
  data: WelcomeOnboardingEmailData,
): Promise<boolean> {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured - skipping welcome email');
    return false;
  }

  // Use the user's name if available, otherwise just "Bonjour"
  const greeting = data.userName ? escapeHtml(data.userName) : 'Bonjour';
  const safeUrl = sanitizeUrl(data.dashboardUrl);

  const subject = 'Votre compte ATTABL est actif';
  const preheader = 'Creez votre premier menu digital en quelques minutes.';

  const bodyContent = `
          <!-- Body card -->
          <tr>
            <td style="background-color:#ffffff;padding:40px 32px;border-radius:8px;border:1px solid #e5e7eb;">
              <!-- Badge -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:#ecfdf5;color:#065f46;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;padding:4px 10px;border-radius:100px;">
                    Compte active
                  </td>
                </tr>
              </table>
              <!-- Titre -->
              <p style="margin:20px 0 6px;font-size:20px;font-weight:600;color:#111827;line-height:1.3;">
                ${greeting}, bienvenue sur ATTABL.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.5;">
                Votre compte est pret. Configurez votre etablissement et creez votre menu digital.
              </p>
              <!-- Corps -->
              <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#4b5563;">
                A partir de maintenant, vous pouvez creer et modifier votre carte en temps reel - depuis votre telephone, entre deux services.
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#4b5563;">
                Vos clients scannent un QR code, votre menu s'affiche. <strong style="color:#111827;">Un plat en rupture ? Retirez-le en 10 secondes.</strong> Un nouveau dessert ? Il est en ligne avant le coup de feu.
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:0 0 8px;">
                    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safeUrl}" style="height:44px;v-text-anchor:middle;width:260px;" arcsize="14%" fillcolor="#111827"><center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:600;">Configurer mon etablissement</center></v:roundrect><![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${safeUrl}" style="display:inline-block;background-color:#111827;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;line-height:1.4;">
                      Configurer mon etablissement
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
              <p style="margin:8px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
                Prend environ 5 minutes
              </p>
            </td>
          </tr>
          <!-- Steps section -->
          <tr>
            <td style="padding:24px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:8px;border:1px solid #e5e7eb;">
                <tr>
                  <td style="padding:28px 32px;">
                    <p style="margin:0 0 20px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;">
                      En 3 etapes
                    </p>
                    <!-- Step 1 -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                      <tr>
                        <td width="32" valign="top" style="padding-right:12px;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                            <td style="width:24px;height:24px;background-color:#f3f4f6;color:#6b7280;font-size:12px;font-weight:600;text-align:center;border-radius:50%;line-height:24px;">1</td>
                          </tr></table>
                        </td>
                        <td valign="top">
                          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#111827;">Decrivez votre etablissement</p>
                          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Nom, type, adresse et coordonnees.</p>
                        </td>
                      </tr>
                    </table>
                    <!-- Step 2 -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                      <tr>
                        <td width="32" valign="top" style="padding-right:12px;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                            <td style="width:24px;height:24px;background-color:#f3f4f6;color:#6b7280;font-size:12px;font-weight:600;text-align:center;border-radius:50%;line-height:24px;">2</td>
                          </tr></table>
                        </td>
                        <td valign="top">
                          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#111827;">Ajoutez votre menu</p>
                          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Plats, prix, photos et categories.</p>
                        </td>
                      </tr>
                    </table>
                    <!-- Step 3 -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="32" valign="top" style="padding-right:12px;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                            <td style="width:24px;height:24px;background-color:#f3f4f6;color:#6b7280;font-size:12px;font-weight:600;text-align:center;border-radius:50%;line-height:24px;">3</td>
                          </tr></table>
                        </td>
                        <td valign="top">
                          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#111827;">Generez votre QR code</p>
                          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Imprimez-le ou collez-le sur vos tables.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Social proof -->
                <tr>
                  <td style="padding:0 32px 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td style="border-top:1px solid #e5e7eb;padding:0;height:1px;font-size:0;line-height:0;">&nbsp;</td></tr>
                    </table>
                    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.6;text-align:center;">
                      Rejoint par <strong style="color:#111827;">${data.totalRestaurants}+ etablissements</strong> au quotidien.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Help -->
          <tr>
            <td style="padding:20px 24px 0;text-align:center;">
              <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
                Besoin d'aide ?
                <a href="mailto:support@attabl.com" style="color:#111827;font-weight:600;text-decoration:none;">Ecrivez-nous</a>
                - on repond en moins de 2 heures.
              </p>
            </td>
          </tr>`;

  const html = wrapHtmlDocument({ preheader, bodyContent });

  const text = `${greeting}, bienvenue sur ATTABL !

Votre compte est actif. Configurez votre etablissement et creez votre menu digital.

A partir de maintenant, vous pouvez creer et modifier votre carte en temps reel.

Commencez ici : ${data.dashboardUrl}

EN 3 ETAPES :

1. Decrivez votre etablissement (nom, type, adresse)
2. Ajoutez votre menu (plats, prix, photos)
3. Generez votre QR code

${data.totalRestaurants}+ etablissements utilisent deja ATTABL.

Besoin d'aide ? Ecrivez-nous : support@attabl.com

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
    logger.warn('RESEND_API_KEY not configured - skipping invitation email');
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

  const subject = `Invitation : rejoignez ${data.restaurantName} sur ATTABL`;
  const preheader = `${data.restaurantName} vous invite en tant que ${roleLabel}.`;

  const logoRow = data.restaurantLogoUrl
    ? `<img src="${sanitizeUrl(data.restaurantLogoUrl)}" alt="${safeRestaurantName}" width="40" height="40" style="display:block;margin:0 auto 12px;border-radius:8px;height:40px;width:40px;" />`
    : '';

  const bodyContent = `
          <!-- Body card -->
          <tr>
            <td style="background-color:#ffffff;padding:40px 32px;border-radius:8px;border:1px solid #e5e7eb;">
              ${logoRow}
              <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">
                Vous avez ete invite
              </p>
              <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#4b5563;">
                <strong style="color:#111827;">${safeRestaurantName}</strong> vous invite a rejoindre son equipe sur ATTABL en tant que <strong style="color:#111827;">${safeRoleLabel}</strong>.
              </p>
              <p style="margin:0 0 28px;font-size:13px;line-height:1.5;color:#9ca3af;">
                Cette invitation est valide pendant 72 heures.
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:0 0 24px;">
                    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safeUrl}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="14%" fillcolor="#111827"><center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:600;">Accepter l'invitation</center></v:roundrect><![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${safeUrl}" style="display:inline-block;background-color:#111827;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;line-height:1.4;">
                      Accepter l'invitation
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#9ca3af;">
                Si vous n'avez pas demande cette invitation, ignorez simplement cet email.
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
// Contact Form Email (sent to support@attabl.com)
// ---------------------------------------------------------------------------

interface ContactFormEmailData {
  name: string;
  email: string;
  company?: string;
  date?: string;
  message: string;
}

export async function sendContactFormEmail(data: ContactFormEmailData): Promise<boolean> {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured - skipping contact form email');
    return false;
  }

  const safeName = escapeHtml(data.name);
  const safeEmail = escapeHtml(data.email);
  const safeCompany = data.company ? escapeHtml(data.company) : '';
  const safeDate = data.date ? escapeHtml(data.date) : '';
  const safeMessage = escapeHtml(data.message);

  const subject = `Demande de contact : ${data.name}${data.company ? ` (${data.company})` : ''}`;
  const preheader = `Nouvelle demande de ${data.name} via le formulaire de contact.`;

  const companyRow = safeCompany
    ? `<tr>
        <td style="padding:6px 0;font-size:13px;color:#9ca3af;width:120px;vertical-align:top;">Etablissement</td>
        <td style="padding:6px 0;font-size:14px;color:#111827;">${safeCompany}</td>
      </tr>`
    : '';

  const dateRow = safeDate
    ? `<tr>
        <td style="padding:6px 0;font-size:13px;color:#9ca3af;width:120px;vertical-align:top;">Date souhaitee</td>
        <td style="padding:6px 0;font-size:14px;color:#111827;">${safeDate}</td>
      </tr>`
    : '';

  const bodyContent = `
          <!-- Body card -->
          <tr>
            <td style="background-color:#ffffff;padding:40px 32px;border-radius:8px;border:1px solid #e5e7eb;">
              <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">
                Nouvelle demande de contact
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">
                Un visiteur a rempli le formulaire de contact sur attabl.com.
              </p>
              <!-- Contact info table -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;width:120px;vertical-align:top;">Nom</td>
                  <td style="padding:6px 0;font-size:14px;color:#111827;">${safeName}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9ca3af;width:120px;vertical-align:top;">Email</td>
                  <td style="padding:6px 0;font-size:14px;color:#111827;">
                    <a href="mailto:${safeEmail}" style="color:#111827;text-decoration:none;">${safeEmail}</a>
                  </td>
                </tr>
                ${companyRow}
                ${dateRow}
              </table>
              <!-- Separator -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #e5e7eb;padding:0;height:1px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              <!-- Message -->
              <p style="margin:20px 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">
                Message
              </p>
              <p style="margin:0;font-size:15px;line-height:1.7;color:#4b5563;white-space:pre-wrap;">
                ${safeMessage}
              </p>
            </td>
          </tr>`;

  const html = wrapHtmlDocument({ preheader, bodyContent });

  const text = `Nouvelle demande de contact - attabl.com

Nom : ${data.name}
Email : ${data.email}${data.company ? `\nEtablissement : ${data.company}` : ''}${data.date ? `\nDate souhaitee : ${data.date}` : ''}

Message :
${data.message}

---
${FOOTER_ADDRESS}`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: data.email,
      to: ['support@attabl.com'],
      subject,
      html,
      text,
    });

    if (error) {
      logger.error('Resend contact form email error', error);
      return false;
    }

    return true;
  } catch (err) {
    logger.error('Failed to send contact form email', err);
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
    logger.warn('RESEND_API_KEY not configured - skipping stock alert email');
    return false;
  }

  if (to.length === 0) return false;

  const outOfStockItems = data.items.filter((i) => i.is_out);
  const lowStockItems = data.items.filter((i) => !i.is_out);

  const safeTenantName = escapeHtml(data.tenantName);
  const safeUrl = sanitizeUrl(data.dashboardUrl);

  const subject =
    outOfStockItems.length > 0
      ? `Stock : ${outOfStockItems.length} produit(s) en rupture`
      : `Stock : ${lowStockItems.length} produit(s) sous le seuil`;

  const preheader =
    outOfStockItems.length > 0
      ? `${outOfStockItems.length} produit(s) en rupture de stock.`
      : `${lowStockItems.length} produit(s) en dessous du seuil d'alerte.`;

  const itemRows = data.items
    .map((item) => {
      const statusColor = item.is_out ? '#dc2626' : '#ca8a04';
      const statusText = item.is_out ? 'Rupture' : 'Stock bas';
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#4b5563;">${escapeHtml(item.name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:14px;color:#4b5563;">${item.current_stock} ${escapeHtml(item.unit)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:14px;color:#4b5563;">${item.min_stock_alert} ${escapeHtml(item.unit)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;font-weight:600;color:${statusColor};">${statusText}</td>
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
          <!-- Body card -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;border-radius:8px;border:1px solid #e5e7eb;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">
                ${safeTenantName}
              </p>
              <p style="margin:0 0 20px;font-size:18px;font-weight:600;color:#111827;">
                Alerte stock
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4b5563;">
                ${summaryLine}.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:6px;">
                <thead>
                  <tr style="background-color:#f9fafb;">
                    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Produit</th>
                    <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Actuel</th>
                    <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Seuil</th>
                    <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Statut</th>
                  </tr>
                </thead>
                <tbody>${itemRows}</tbody>
              </table>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:24px 0 0;">
                    <a href="${safeUrl}" style="display:inline-block;background-color:#111827;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;line-height:1.4;">
                      Voir l'inventaire
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Note -->
          <tr>
            <td style="padding:16px 24px 0;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">
                Alerte automatique - maximum une par produit par heure.
              </p>
            </td>
          </tr>`;

  const html = wrapHtmlDocument({ preheader, bodyContent });

  const textItemList = data.items
    .map(
      (item) =>
        `- ${item.name}: ${item.current_stock} ${item.unit} (seuil: ${item.min_stock_alert}) - ${item.is_out ? 'RUPTURE' : 'Stock bas'}`,
    )
    .join('\n');

  const text = `Alerte stock - ${data.tenantName}

${outOfStockItems.length > 0 ? `${outOfStockItems.length} produit(s) en rupture de stock.` : ''}
${lowStockItems.length > 0 ? `${lowStockItems.length} produit(s) sous le seuil d'alerte.` : ''}

${textItemList}

Voir l'inventaire : ${data.dashboardUrl}

---
Alerte automatique - maximum une par produit par heure.
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
