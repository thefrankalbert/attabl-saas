/**
 * Email Service - Low-level HTML rendering helpers.
 *
 * Pure string builders shared by every email template. No side effects.
 */

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * B43: seule porte d'encodage d'un lien (appelee par `cta`). `URL.href`
 * encode ce qui doit l'etre (espaces, guillemets, chevrons) sans toucher a un
 * `%XX` deja present: `encodeURI` le transformait en `%25XX`, et un lien passe
 * deux fois (modele puis `cta`) arrivait casse.
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
    return '';
  } catch {
    return '';
  }
}

export const FOOTER = 'ATTABL SAS - Douala, Cameroun';

// Gris des petits textes de tous les e-mails (surtitre, notes, pied de page):
// `#6b7280`, 4,8:1 sur la carte blanche et 4,6:1 sur le fond `#f9fafb`, soit
// le niveau AA (4,5:1). L'ancien `#9ca3af` tombait a 2,4-2,5:1 en 11-12 px.

/**
 * Pied de page d'une relance commerciale: lien visible de desabonnement
 * (en plus de l'en-tete List-Unsubscribe, que toutes les messageries
 * n'affichent pas). A placer comme dernier bloc du `body` passe a `wrap`.
 */
export function unsubscribeFooter(pageUrl: string): string {
  const safe = escapeHtml(sanitizeUrl(pageUrl));
  return `<tr><td style="padding:16px 0 0;text-align:center;font-size:12px;color:#6b7280;">Vous recevez cet e-mail parce que vous avez un compte ATTABL. <a href="${safe}" style="color:#6b7280;text-decoration:underline;">Se desabonner de ces e-mails</a></td></tr>`;
}

/** Equivalent texte du pied de page de desabonnement. */
export function unsubscribeFooterText(pageUrl: string): string {
  return `Se desabonner de ces e-mails : ${pageUrl}`;
}

export function wrap(preheader: string, body: string): string {
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
<tr><td style="padding:24px 0 0;text-align:center;font-size:11px;color:#6b7280;">${FOOTER}</td></tr>
</table></td></tr></table></body></html>`;
}

export function card(content: string): string {
  return `<tr><td style="background:#fff;padding:32px;border-radius:8px;border:1px solid #e5e7eb;">${content}</td></tr>`;
}

export function cta(url: string, label: string): string {
  // Echappement HTML de l'attribut (un `&` du lien devient `&amp;`).
  const safe = escapeHtml(sanitizeUrl(url));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 0 0;"><a href="${safe}" style="display:inline-block;background:#111827;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(label)}</a></td></tr></table>`;
}
