/**
 * Email Service - Message templates.
 *
 * Pure builders that turn typed email data into { subject, html, text }.
 * Rendering strings are byte-identical to the original inline factory bodies.
 */

import { escapeHtml, sanitizeUrl, FOOTER, wrap, card, cta, formatCurrency } from './email.render';
import type {
  WelcomeEmailData,
  PasswordResetEmailData,
  TeamInvitationEmailData,
  OrderConfirmationEmailData,
  LowStockAlertEmailData,
} from './email.types';

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export function buildWelcomeEmail(data: WelcomeEmailData): EmailContent {
  const safeUrl = sanitizeUrl(data.confirmationUrl);
  const rawUrl = escapeHtml(data.confirmationUrl);

  const html = wrap(
    'Confirmez votre adresse email pour activer votre compte.',
    card(
      `<p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Bienvenue sur ATTABL</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">Merci pour votre inscription. Confirmez votre adresse email pour activer votre compte.</p>
          ${cta(safeUrl, 'Confirmer mon adresse')}
          <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">Ce lien expire dans 1 heure.</p>
          <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;word-break:break-all;">Lien : ${rawUrl}</p>`,
    ),
  );

  const text = `Bienvenue sur ATTABL\n\nConfirmez votre adresse email :\n${data.confirmationUrl}\n\nCe lien expire dans 1 heure.\n\n${FOOTER}`;

  return { subject: 'Confirmez votre adresse email', html, text };
}

export function buildPasswordResetEmail(data: PasswordResetEmailData): EmailContent {
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

  return { subject: 'Reinitialiser votre mot de passe', html, text };
}

export function buildTeamInvitationEmail(data: TeamInvitationEmailData): EmailContent {
  const roleLabels: Record<string, string> = {
    admin: 'Administrateur',
    manager: 'Gerant',
    cashier: 'Caissier',
    chef: 'Chef de cuisine',
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
          <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">Cette invitation est valide pendant 24 heures.</p>`,
    ),
  );

  const text = `Invitation - ${data.restaurantName}\n\n${data.restaurantName} vous invite en tant que ${roleLabel}.\n\nAcceptez ici : ${data.inviteUrl}\n\nValide 24 heures.\n\n${FOOTER}`;

  return { subject: `Invitation : rejoignez ${data.restaurantName} sur ATTABL`, html, text };
}

export function buildOrderConfirmationEmail(data: OrderConfirmationEmailData): EmailContent {
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

  return { subject: `Commande ${data.orderNumber} confirmee`, html, text };
}

export function buildLowStockAlertEmail(data: LowStockAlertEmailData): EmailContent {
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

  return { subject: `Alerte stock : ${count} produit(s) - ${data.restaurantName}`, html, text };
}

export function buildFirstOrderTriggerEmail(data: {
  restaurantName: string;
  dashboardUrl: string;
}): EmailContent {
  const safeName = escapeHtml(data.restaurantName);
  const safeUrl = sanitizeUrl(data.dashboardUrl);
  const html = wrap(
    'Bravo pour votre premiere commande ! Decouvrez 3 fonctionnalites Pro.',
    card(
      `<p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">${safeName}</p>
          <p style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111827;">Bravo ! Premiere commande recue.</p>
          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;">Votre menu digital fonctionne. Voici 3 fonctionnalites Pro qui changeront votre quotidien :</p>
          <p style="margin:0 0 8px;font-size:14px;color:#111827;"><strong>1. Ecran cuisine (KDS)</strong> - Les commandes arrivent directement a la cuisine. Fini les tickets papier.</p>
          <p style="margin:0 0 8px;font-size:14px;color:#111827;"><strong>2. Suivi des stocks</strong> - Vos ingredients se destockent automatiquement apres chaque commande.</p>
          <p style="margin:0 0 20px;font-size:14px;color:#111827;"><strong>3. Stats avancees</strong> - Voyez quels plats se vendent, a quelle heure, pour combien.</p>
          ${cta(safeUrl, 'Voir mon tableau de bord')}`,
    ),
  );
  const text = `Bravo ${data.restaurantName} !\n\nPremiere commande recue. Voici 3 fonctionnalites Pro pour aller plus loin :\n1. Ecran cuisine (KDS)\n2. Suivi des stocks automatique\n3. Stats avancees\n\n${data.dashboardUrl}\n\n${FOOTER}`;
  return { subject: `Bravo ${data.restaurantName} - Premiere commande !`, html, text };
}

export function buildTenthOrderTriggerEmail(data: {
  restaurantName: string;
  dashboardUrl: string;
}): EmailContent {
  const safeName = escapeHtml(data.restaurantName);
  const safeUrl = sanitizeUrl(data.dashboardUrl);
  const html = wrap(
    '10 commandes ! Le KDS vous ferait gagner 30 secondes par commande.',
    card(
      `<p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">${safeName}</p>
          <p style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111827;">10 commandes. Vous avez la cadence.</p>
          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;">A ce rythme, le KDS (ecran cuisine) vous ferait gagner 30 secondes par commande. Sur 10 commandes par jour, c'est 5 minutes recuperees. Par jour. Tous les jours.</p>
          <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">Les commandes arrivent directement sur l'ecran cuisine. Vos cuisiniers ne lisent plus les tickets papier. Moins d'erreurs, service plus rapide.</p>
          ${cta(safeUrl, 'Decouvrir le KDS')}`,
    ),
  );
  const text = `${data.restaurantName} - 10 commandes !\n\nLe KDS vous ferait gagner 30 secondes par commande. Decouvrez-le : ${data.dashboardUrl}\n\n${FOOTER}`;
  return {
    subject: `${data.restaurantName} - Le KDS peut vous faire gagner 30s/commande`,
    html,
    text,
  };
}

export function buildTrialIdleEmail(data: {
  restaurantName: string;
  dashboardUrl: string;
}): EmailContent {
  const safeName = escapeHtml(data.restaurantName);
  const safeUrl = sanitizeUrl(data.dashboardUrl);
  const html = wrap(
    'Votre essai gratuit est actif. On est la si vous avez besoin.',
    card(
      `<p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">${safeName}</p>
          <p style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111827;">On est la si vous avez besoin.</p>
          <p style="margin:0 0 16px;font-size:15px;color:#4b5563;">Votre essai gratuit est actif. Si quelque chose bloque - la configuration, les menus, les QR codes - repondez directement a cet email. On repond vite.</p>
          <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">Sinon, votre tableau de bord vous attend.</p>
          ${cta(safeUrl, 'Reprendre ou poser une question')}`,
    ),
  );
  const text = `${data.restaurantName} - On est la si vous avez besoin.\n\nVotre essai est actif. Une question ? Repondez directement a cet email.\n\n${data.dashboardUrl}\n\n${FOOTER}`;
  return { subject: `${data.restaurantName} - On peut vous aider ?`, html, text };
}

export function buildTrialEndgameEmail(data: {
  restaurantName: string;
  dashboardUrl: string;
  ordersCount: number;
  daysLeft: number;
}): EmailContent {
  const safeName = escapeHtml(data.restaurantName);
  const safeUrl = sanitizeUrl(data.dashboardUrl);
  const hasOrders = data.ordersCount >= 5;
  const subject = hasOrders
    ? `${data.restaurantName} - Votre essai se termine dans ${data.daysLeft}j`
    : `${data.restaurantName} - Ne perdez pas votre menu (${data.daysLeft}j restants)`;
  const body = hasOrders
    ? `<p style="margin:0 0 16px;font-size:15px;color:#4b5563;">Vous avez ${data.ordersCount} commandes. Votre menu digital fonctionne. Ne perdez pas l'elan : passez en Pro pour continuer sans interruption.</p>`
    : `<p style="margin:0 0 16px;font-size:15px;color:#4b5563;">Votre essai se termine dans ${data.daysLeft} jour(s). Votre menu et vos configurations sont prets - il suffit d'activer votre abonnement pour ne pas perdre votre travail.</p>`;
  const html = wrap(
    `Il reste ${data.daysLeft} jour(s) sur votre essai gratuit.`,
    card(
      `<p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">${safeName}</p>
          <p style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111827;">Il reste ${data.daysLeft} jour(s).</p>
          ${body}
          ${cta(safeUrl, 'Activer mon abonnement')}`,
    ),
  );
  const text = `${data.restaurantName} - Il reste ${data.daysLeft} jour(s) sur votre essai.\n\n${data.dashboardUrl}\n\n${FOOTER}`;
  return { subject, html, text };
}
