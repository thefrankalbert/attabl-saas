/**
 * Email Service - Alerte "nouvelle connexion a votre compte" (audit Q19).
 *
 * Fichier a part: email.templates.ts depasse deja 400 lignes.
 */

import { escapeHtml, sanitizeUrl, FOOTER, wrap, card, cta } from './email.render';
import type { NewLoginEmailData } from './email.types';

const LIBELLE_METHODE: Record<NewLoginEmailData['methode'], string> = {
  mot_de_passe: 'avec votre mot de passe',
  google: 'avec Google',
  autre: 'avec un fournisseur externe',
};

export function buildNewLoginEmail(data: NewLoginEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const safeUrl = sanitizeUrl(data.changePasswordUrl);
  const rawUrl = escapeHtml(data.changePasswordUrl);
  const quand = escapeHtml(data.dateLabel);
  const methode = LIBELLE_METHODE[data.methode];

  const html = wrap(
    'Nouvelle connexion a votre compte ATTABL.',
    card(
      `<p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Nouvelle connexion a votre compte</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4b5563;">Quelqu'un vient de se connecter a votre compte ATTABL ${methode}, depuis un appareil que nous ne connaissions pas.</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4b5563;">Quand : ${quand}.</p>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4b5563;">C'etait vous ? Rien a faire.</p>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4b5563;">Ce n'etait pas vous ? Changez votre mot de passe tout de suite.</p>
          ${cta(safeUrl, 'Changer mon mot de passe')}
          <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">Vous recevez cet e-mail a chaque connexion depuis un nouvel appareil, au plus une fois par heure.</p>
          <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;word-break:break-all;">Lien : ${rawUrl}</p>`,
    ),
  );

  const text = `Nouvelle connexion a votre compte\n\nQuelqu'un vient de se connecter a votre compte ATTABL ${methode}, depuis un appareil que nous ne connaissions pas.\nQuand : ${data.dateLabel}.\n\nC'etait vous ? Rien a faire.\nCe n'etait pas vous ? Changez votre mot de passe tout de suite :\n${data.changePasswordUrl}\n\n${FOOTER}`;

  return { subject: 'Nouvelle connexion a votre compte ATTABL', html, text };
}
