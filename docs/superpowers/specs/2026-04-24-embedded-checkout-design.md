# Embedded Checkout - Design Spec

Date: 2026-04-24

## Objectif

Remplacer la redirection vers Stripe Hosted Checkout par une page `/checkout` branded ATTABL
utilisant Stripe Embedded Checkout. L'utilisateur reste sur attabl.com pendant tout le paiement.

## Layout

Split layout 40/60 (standard SaaS premium) :

- **Colonne gauche (40%)** : fond `#0a0a0a`, logo ATTABL, nom du plan, prix, liste des features, badge "Paiement securise Stripe"
- **Colonne droite (60%)** : fond blanc/light, formulaire Stripe Embedded avec Appearance API calque sur les tokens ATTABL
- **Mobile** : colonne gauche condensee en header fixe, formulaire en scroll dessous

## Architecture Technique

### 1. Package a installer

```
pnpm add @stripe/react-stripe-js
```

### 2. Nouveau endpoint : `/api/create-embedded-checkout/route.ts`

Meme stack de securite que l'endpoint existant, dans cet ordre exact :

1. `verifyOrigin(request)` - CSRF
2. `checkoutLimiter.check(ip)` - rate limiting
3. `supabase.auth.getUser()` - auth (pas getSession)
4. Join `admin_users` -> derivation `tenant_id` (pas de parametre client)
5. `checkoutBodySchema.safeParse(body)` - Zod validation
6. Check abonnement existant -> 409 si deja actif
7. `stripe.checkout.sessions.create({ ui_mode: 'embedded', return_url: ... })`
8. Retourne `{ clientSecret: session.client_secret }`

Le `return_url` est: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`
(identique au flow actuel, Stripe remplace le placeholder)

L'endpoint existant `/api/create-checkout-session` reste intact (non modifie).

### 3. Nouvelle page : `/checkout/page.tsx` (Client Component)

Lit `plan` et `interval` depuis `useSearchParams()`.
Au mount, appelle `/api/create-embedded-checkout` pour obtenir `clientSecret`.
Rend `EmbeddedCheckoutProvider` + `EmbeddedCheckout` de `@stripe/react-stripe-js`.

Structure JSX :

```
<div className="min-h-dvh flex flex-col md:flex-row">
  <LeftPanel plan={plan} interval={interval} />       // 40%, fond dark
  <RightPanel clientSecret={clientSecret} />          // 60%, fond light
</div>
```

Etats geres : loading (skeleton), error (plan invalide ou API echec), ready (formulaire visible).

### 4. Stripe Appearance API

Appliquee via `EmbeddedCheckoutProvider`:

```ts
appearance: {
  theme: 'stripe',
  variables: {
    colorBackground: '#ffffff',
    colorText: '#1c1917',
    colorPrimary: '#65a30d',
    colorDanger: '#dc2626',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    borderRadius: '8px',
    spacingUnit: '4px',
  }
}
```

### 5. Mise a jour : `SubscriptionManager.tsx`

Remplacer :

```ts
if (url) window.location.href = url;
```

Par :

```ts
router.push(`/checkout?plan=${plan}&interval=${billingInterval}`);
```

Appel a `/api/create-checkout-session` supprime de `SubscriptionManager`.

### 6. Pages success/cancel

Inchangees. Elles continuent a fonctionner via `?session_id=` dans l'URL.

## Securite

| Controle                        | Status                           |
| ------------------------------- | -------------------------------- |
| CSRF (verifyOrigin)             | Applique sur le nouveau endpoint |
| Rate limiting (checkoutLimiter) | Applique sur le nouveau endpoint |
| Auth via getUser()              | Applique (pas getSession)        |
| tenant_id derive de la session  | Applique (jamais du client)      |
| Zod validation plan/interval    | Applique                         |
| Check double abonnement         | Applique (409 si actif)          |
| clientSecret expose au client   | Safe by design (Stripe spec)     |
| CSP frame-src stripe.com        | Deja en place dans csp.ts        |
| CSP script-src stripe.com       | Deja en place dans csp.ts        |
| CSP connect-src stripe.com      | Deja en place dans csp.ts        |

Score securite : 10/10 - meme posture que l'endpoint existant, sans surface d'attaque ajoutee.

## Fichiers a creer / modifier

| Fichier                                          | Action                        |
| ------------------------------------------------ | ----------------------------- |
| `src/app/api/create-embedded-checkout/route.ts`  | Creer                         |
| `src/app/checkout/page.tsx`                      | Creer                         |
| `src/components/checkout/CheckoutLeftPanel.tsx`  | Creer                         |
| `src/components/checkout/CheckoutRightPanel.tsx` | Creer                         |
| `src/components/tenant/SubscriptionManager.tsx`  | Modifier (router.push)        |
| `src/messages/fr-FR.json`                        | Ajouter cles checkout.page.\* |
| `src/messages/en-US.json`                        | Ajouter cles checkout.page.\* |

## Cles i18n a ajouter

```json
"checkout": {
  "page": {
    "securePayment": "Paiement securise",
    "poweredByStripe": "Propulse par Stripe",
    "loading": "Chargement du formulaire de paiement...",
    "errorTitle": "Impossible de charger le paiement",
    "errorDescription": "Une erreur est survenue. Veuillez reessayer.",
    "retry": "Reessayer",
    "monthly": "/ mois",
    "yearly": "/ an",
    "semiannual": "/ 6 mois"
  }
}
```

## Portes CI (toutes doivent passer)

1. `pnpm typecheck` - 0 erreur
2. `pnpm lint --max-warnings 0` - 0 warning
3. `pnpm format:check` - pas de diff
4. `pnpm test` - tous passent
5. `pnpm build` - build clean
