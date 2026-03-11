# Instructions d'integration — Emails de bienvenue ATTABL (2 flux)

## Contexte

Le systeme actuel envoie un seul email apres inscription (confirmation + bienvenue melanges). L'objectif est de separer en 2 emails distincts :

- **Email 1** : Verification d'adresse (court, transactionnel, envoye immediatement apres signup)
- **Email 2** : Bienvenue + onboarding (envoye automatiquement APRES que l'utilisateur a clique le lien de verification)

## Donnees disponibles a l'inscription

Le formulaire d'inscription collecte :

- `restaurantName` (obligatoire, 2-100 chars)
- `email` (obligatoire)
- `password` (obligatoire, 8-100 chars)
- `phone` (optionnel)
- `plan` (optionnel, defaut 'essentiel')

**Il n'y a PAS de champ "prenom".** Le `full_name` dans `admin_users` est rempli avec `restaurantName`. L'adressage dans les emails utilise donc le nom de l'etablissement, pas un prenom.

## Architecture actuelle des fichiers concernes

```
src/services/email.service.ts        → Templates email + envoi via Resend
src/services/signup.service.ts       → Flux d'inscription (appelle sendWelcomeConfirmationEmail)
src/app/auth/confirm/route.ts        → Verification du token OTP, redirect vers /login
src/app/api/resend-confirmation/route.ts → Renvoi du lien de confirmation
```

## Conventions du code existant

- Resend SDK (v6.9.2) via `RESEND_API_KEY`
- From : `ATTABL <bonjour@attabl.com>` (configurable via `RESEND_FROM_EMAIL`)
- Reply-To : `support@attabl.com`
- Footer : `ATTABL SAS — Douala, Cameroun`
- Tous les emails utilisent `wrapHtmlDocument()` (table-based layout, inline styles uniquement, version texte obligatoire)
- Fonctions utilitaires existantes : `escapeHtml()`, `sanitizeUrl()`
- Logger : `logger.error()`, `logger.warn()`, `logger.info()` — jamais `console.*`
- Types TypeScript stricts, pas de `any`

---

## MODIFICATION 1 — `src/services/email.service.ts`

### 1A. Remplacer `sendWelcomeConfirmationEmail` par un email court de verification

La fonction garde la meme signature et le meme nom (pour ne rien casser dans signup.service.ts et resend-confirmation/route.ts).

Remplacer tout le contenu de `sendWelcomeConfirmationEmail` (lignes 94-200 environ) par ceci :

```typescript
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
```

### 1B. Ajouter la nouvelle fonction `sendWelcomeOnboardingEmail`

Ajouter cette nouvelle fonction APRES `sendWelcomeConfirmationEmail` et AVANT la section `// Invitation Email`.

```typescript
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
```

**IMPORTANT** : Ne pas oublier d'exporter `sendWelcomeOnboardingEmail` (c'est deja un `export` dans la declaration).

---

## MODIFICATION 2 — `src/app/auth/confirm/route.ts`

Ce fichier gere le clic sur le lien de verification. Actuellement, apres `verifyOtp()` reussi, il redirige simplement vers `/login?confirmed=true`. Il faut ajouter l'envoi de l'email 2 (bienvenue) entre la verification et la redirection.

### Code actuel a remplacer

Remplacer TOUT le contenu du fichier `src/app/auth/confirm/route.ts` par :

```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { sendWelcomeOnboardingEmail } from '@/services/email.service';

/**
 * GET /auth/confirm?token_hash=...&type=signup
 *
 * Handles email confirmation links sent via Resend.
 * Verifies the OTP token, confirms the user, sends welcome email,
 * then redirects to login.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');

  if (!tokenHash || type !== 'signup') {
    logger.warn('Invalid confirmation link parameters', { tokenHash: !!tokenHash, type });
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=${encodeURIComponent('Lien de confirmation invalide.')}`,
    );
  }

  try {
    const supabase = createAdminClient();

    // Verify the OTP token to confirm the user's email
    const { data: verifyData, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'signup',
    });

    if (error) {
      logger.error('Email confirmation failed', { error: error.message });

      const isExpired = error.message.includes('expired') || error.message.includes('invalid');
      const errorMessage = isExpired
        ? 'Le lien de confirmation a expiré. Veuillez vous reconnecter pour recevoir un nouveau lien.'
        : 'Erreur lors de la confirmation. Veuillez réessayer.';

      return NextResponse.redirect(
        `${requestUrl.origin}/login?error=${encodeURIComponent(errorMessage)}`,
      );
    }

    // --- Send welcome onboarding email (best-effort, non-blocking) ---
    try {
      const userId = verifyData?.user?.id;
      const userEmail = verifyData?.user?.email;

      if (userId && userEmail) {
        // Get restaurant name from admin_users
        const { data: adminUser } = await supabase
          .from('admin_users')
          .select('full_name, tenant_id')
          .eq('user_id', userId)
          .single();

        if (adminUser) {
          // Get tenant slug for dashboard URL
          const { data: tenant } = await supabase
            .from('tenants')
            .select('slug')
            .eq('id', adminUser.tenant_id)
            .single();

          // Count total restaurants for social proof
          const { count } = await supabase
            .from('tenants')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true);

          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
          const dashboardUrl = tenant ? `${appUrl}/sites/${tenant.slug}/admin` : `${appUrl}/login`;

          await sendWelcomeOnboardingEmail(userEmail, {
            restaurantName: adminUser.full_name,
            dashboardUrl,
            totalRestaurants: count || 0,
          });
        }
      }
    } catch (emailErr) {
      // Welcome email is best-effort — never block the confirmation flow
      logger.error('Failed to send welcome onboarding email after confirmation', emailErr);
    }

    // Email confirmed successfully — redirect to login with success message
    return NextResponse.redirect(`${requestUrl.origin}/login?confirmed=true`);
  } catch (err) {
    logger.error('Unexpected error during email confirmation', err);
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=${encodeURIComponent('Erreur serveur. Veuillez réessayer.')}`,
    );
  }
}
```

### Points critiques de cette modification

1. **L'envoi de l'email 2 est dans un `try/catch` separe** — si l'email echoue, la confirmation reste valide et l'utilisateur est redirige normalement. C'est le meme pattern "best-effort" utilise dans `signup.service.ts` pour l'email 1.

2. **On recupere les donnees depuis la base** :
   - `admin_users.full_name` → nom de l'etablissement (c'est `restaurantName` stocke a l'inscription)
   - `admin_users.tenant_id` → pour trouver le tenant
   - `tenants.slug` → pour construire l'URL du dashboard
   - `count(tenants)` filtre par `is_active: true` → pour la preuve sociale

3. **`verifyData` retourne le user** apres `verifyOtp()` — on utilise `verifyData.user.id` et `verifyData.user.email` pour ne pas avoir a refaire un appel auth.

4. **Le `createAdminClient()` est deja utilise** dans ce fichier — c'est le client Supabase avec `service_role` key, il a acces a toutes les tables sans RLS. Pas besoin d'ajouter un nouveau client.

---

## MODIFICATION 3 — `src/services/signup.service.ts`

**Aucune modification necessaire.** Ce fichier appelle deja `sendWelcomeConfirmationEmail()` avec `{ restaurantName, confirmationUrl }`. La signature de la fonction n'a pas change, donc tout reste compatible.

---

## CE QUI NE CHANGE PAS

- `src/app/signup/page.tsx` — Pas de modification du formulaire
- `src/app/api/signup/route.ts` — Pas de modification
- `src/app/api/signup-oauth/route.ts` — Pas de modification (OAuth n'envoie pas d'email)
- `src/app/api/resend-confirmation/route.ts` — Pas de modification (utilise la meme `sendWelcomeConfirmationEmail`)
- `src/lib/validations/auth.schema.ts` — Pas de modification des schemas Zod
- Base de donnees / migrations — Aucune migration necessaire
- Les autres emails existants (`sendInvitationEmail`, `sendStockAlertEmail`) — Intacts

---

## TESTS A EFFECTUER

Apres les modifications :

1. `pnpm typecheck` — Verifier que le nouveau type `WelcomeOnboardingEmailData` et l'import de `sendWelcomeOnboardingEmail` sont corrects
2. `pnpm lint` — Verifier qu'il n'y a pas de warning ESLint
3. `pnpm test` — Verifier que les 99 tests existants passent toujours (aucun test ne devrait casser car on n'a pas change de signatures)
4. `pnpm build` — Verifier que le build Next.js passe

### Tests manuels

1. **Inscription email** : Creer un compte → verifier qu'on recoit l'email 1 (court, verification) → cliquer le lien → verifier qu'on recoit l'email 2 (bienvenue, onboarding) → verifier qu'on est redirige vers /login?confirmed=true
2. **Renvoi de confirmation** : Utiliser "Renvoyer le lien" → verifier qu'on recoit l'email 1 (pas l'email 2)
3. **Lien expire** : Attendre ou invalider le token → verifier le message d'erreur sur /login
4. **OAuth** : S'inscrire via Google → verifier qu'aucun email n'est envoye (comportement inchange)

---

## RESUME DES FICHIERS MODIFIES

| Fichier                         | Action                                                                                     | Risque                                |
| ------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------- |
| `src/services/email.service.ts` | Remplacer le body de `sendWelcomeConfirmationEmail` + ajouter `sendWelcomeOnboardingEmail` | Faible — meme signature, meme pattern |
| `src/app/auth/confirm/route.ts` | Ajouter l'import + l'envoi de l'email 2 apres `verifyOtp()`                                | Faible — bloc best-effort isole       |

Total : **2 fichiers modifies**, **0 migration**, **0 changement de schema**.
