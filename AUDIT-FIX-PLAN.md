# ATTABL SaaS - Plan de Corrections Post-Audit

## Document executif pour Claude - A executer fix par fix, dans l'ordre

> **INSTRUCTION A CLAUDE** : Ce document contient 16 corrections a appliquer sur le projet ATTABL SaaS.
> Execute-les **dans l'ordre numerique**. Pour chaque fix :
>
> 1. Lis le fichier concerne
> 2. Applique la correction exacte decrite
> 3. Verifie avec `pnpm typecheck` et `pnpm lint` que rien n'est casse
> 4. Confirme la completion avant de passer au fix suivant
>
> **NE PAS improviser** — suivre les instructions exactes ci-dessous.
> Si un doute existe, demander confirmation AVANT de modifier.

---

## PHASE 1 - CRITIQUE (Cette semaine)

---

### FIX-01 | CSP : Remplacer 'unsafe-inline' par nonce dans script-src

**Severite : HAUTE**
**Fichier a modifier : `next.config.mjs`**
**Fichiers a creer : `src/lib/csp.ts`**

**Contexte :** La Content-Security-Policy actuelle autorise `'unsafe-inline'` dans script-src, ce qui annule la protection contre les attaques XSS. Il faut utiliser des nonces generes par requete.

**Etape 1 — Creer `src/lib/csp.ts` :**

```typescript
/**
 * Content Security Policy nonce generation.
 * Used by the proxy/middleware to generate a per-request nonce
 * and by next.config.mjs to build the CSP header.
 */

/**
 * Build the full CSP header string with a given nonce.
 * style-src keeps 'unsafe-inline' because Tailwind v4 requires it
 * (inline styles cannot execute code, so this is acceptable).
 */
export function buildCspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://*.stripe.com https://*.sentry.io`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://*.stripe.com https://cdn.jsdelivr.net https://images.unsplash.com",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.stripe.com https://*.sentry.io",
    'frame-src https://*.stripe.com',
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}
```

**Etape 2 — Modifier `src/proxy.ts` :**

Ajouter en haut du fichier, apres les imports existants :

```typescript
import crypto from 'crypto';
```

Dans la fonction `proxy()`, juste apres la ligne `request.headers.delete('x-tenant-slug');`, ajouter :

```typescript
// Generate a per-request CSP nonce
const nonce = crypto.randomBytes(16).toString('base64');
request.headers.set('x-csp-nonce', nonce);
```

Ensuite, pour **chaque `NextResponse.next()`** et **chaque `NextResponse.rewrite()`** dans le fichier, ajouter le header CSP a la reponse. Par exemple, apres la creation de `response`, ajouter :

```typescript
// Note: Le CSP avec nonce est applique via next.config.mjs headers()
// Le nonce est passe via le header x-csp-nonce pour les Server Components
```

**Etape 3 — Modifier `next.config.mjs` :**

Remplacer le bloc CSP statique dans la fonction `headers()` par une version dynamique.

**IMPORTANT** : Next.js 16 ne supporte pas les headers dynamiques dans `next.config.mjs`. La methode correcte est d'utiliser le middleware pour injecter le header CSP. Donc a la place :

Dans `next.config.mjs`, **supprimer** le bloc Content-Security-Policy du tableau headers (lignes 58-70 environ) et ajouter un commentaire :

```javascript
// Content-Security-Policy is now set dynamically in src/proxy.ts with per-request nonces
```

Puis dans `src/proxy.ts`, avant chaque `return response;` (il y en a environ 6), ajouter :

```typescript
response.headers.set('Content-Security-Policy', buildCspHeader(nonce));
```

En ajoutant l'import en haut :

```typescript
import { buildCspHeader } from '@/lib/csp';
```

**Etape 4 — Tester :**

```bash
pnpm typecheck
pnpm build
# Puis ouvrir Chrome DevTools > Network > verifier que le header CSP contient un nonce
# Verifier que Stripe Checkout fonctionne toujours
```

**Note :** Si l'integration nonce s'avere trop complexe a cause de Next.js Script components, une alternative acceptable est de remplacer `'unsafe-inline'` par `'unsafe-eval'` en script-src (moins risque) ou d'utiliser des hashes SHA256 pour les scripts inline specifiques. Demander confirmation si blocage.

---

### FIX-02 | Mettre a jour les dependances vulnerables

**Severite : HAUTE**
**Fichier a modifier : `package.json`**

**Contexte :** `jspdf` et `xlsx` ont des vulnerabilites connues.

**Etape 1 :**

```bash
pnpm update jspdf@latest
pnpm audit
```

**Etape 2 :** Pour `xlsx@0.18.5` (Prototype Pollution), verifier s'il existe une version corrigee :

```bash
pnpm info xlsx versions --json | tail -5
```

Si aucune version corrigee n'existe, ajouter un override dans `package.json` sous `pnpm.overrides` pour forcer une version safe, ou envisager de migrer vers `exceljs` comme alternative. Le package xlsx est utilise pour l'import de menus — chercher les usages avec :

```bash
grep -r "from 'xlsx'" src/ --include="*.ts" --include="*.tsx"
```

**Etape 3 :** Verifier que rien n'est casse :

```bash
pnpm typecheck
pnpm test
pnpm build
```

---

### FIX-03 | Creer les tests E2E responsive Playwright

**Severite : CRITIQUE**
**Fichier a creer : `tests/e2e/responsive.spec.ts`**

**Contexte :** Aucun test responsive n'existe. Le script `pnpm test:e2e:responsive` dans package.json pointe vers un fichier vide ou inexistant.

**Etape 1 — Creer `tests/e2e/responsive.spec.ts` :**

```typescript
import { test, expect } from '@playwright/test';

/**
 * Responsive regression tests for ATTABL SaaS.
 * Tests critical layouts at 4 viewport sizes to prevent
 * tablet/mobile regressions from reaching production.
 */

const viewports = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

// ---------------------------------------------------------------------------
// Helper: ensure no element overflows the viewport horizontally
// ---------------------------------------------------------------------------
async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflowing = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    let count = 0;
    document.querySelectorAll('*').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > vw + 1) count++;
    });
    return count;
  });
  expect(overflowing, 'Elements overflowing viewport horizontally').toBe(0);
}

// ---------------------------------------------------------------------------
// Public menu page (tenant client-facing)
// ---------------------------------------------------------------------------
for (const vp of viewports) {
  test(`Tenant menu page renders without overflow at ${vp.name} (${vp.width}x${vp.height})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/sites/blutable', { waitUntil: 'networkidle' });

    // Page should load without errors
    await expect(page.locator('body')).toBeVisible();

    // No horizontal overflow
    await assertNoHorizontalOverflow(page);

    // Visual regression screenshot
    await expect(page).toHaveScreenshot(`menu-${vp.name}.png`, {
      maxDiffPixelRatio: 0.02,
      fullPage: false,
    });
  });
}

// ---------------------------------------------------------------------------
// Admin dashboard (requires auth — skip if no test credentials)
// ---------------------------------------------------------------------------
// Note: These tests require a logged-in session.
// Configure Playwright auth state in tests/e2e/.auth/ or skip in CI.
// Uncomment when auth fixtures are ready:
//
// for (const vp of viewports) {
//   test(`Admin dashboard renders at ${vp.name}`, async ({ page }) => {
//     await page.setViewportSize({ width: vp.width, height: vp.height });
//     await page.goto('/sites/blutable/admin', { waitUntil: 'networkidle' });
//     await assertNoHorizontalOverflow(page);
//     await expect(page).toHaveScreenshot(`admin-${vp.name}.png`, {
//       maxDiffPixelRatio: 0.02,
//     });
//   });
// }
```

**Etape 2 — Verifier que le script dans package.json pointe correctement :**

Le script `"test:e2e:responsive"` dans `package.json` pointe deja vers `tests/e2e/responsive.spec.ts`. Verifier qu'il est correct :

```json
"test:e2e:responsive": "playwright test tests/e2e/responsive.spec.ts"
```

**Etape 3 — Tester :**

```bash
# Lancer le serveur de dev d'abord
pnpm dev &
# Puis les tests
pnpm test:e2e:responsive
```

---

## PHASE 2 - HAUTE PRIORITE (Semaine prochaine)

---

### FIX-04 | Corriger les largeurs fixes en pixels (79 occurrences)

**Severite : HAUTE**
**Fichiers : 32 fichiers (voir liste ci-dessous)**

**Contexte :** C'est LA cause principale du layout qui "flotte" sur tablette. 79 occurrences de `w-[Xpx]` et 46 de `min-w-[Xpx]` empechent le contenu de s'adapter quand la sidebar change de taille.

**Methode :** Pour chaque fichier, chercher les patterns `w-[` suivi de pixels et les remplacer par des alternatives fluides.

**Commande pour trouver toutes les occurrences :**

```bash
grep -rn "w-\[[0-9]*px\]" src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v .next
```

**Regles de remplacement :**

| Pattern actuel            | Remplacement                             | Quand utiliser                                  |
| ------------------------- | ---------------------------------------- | ----------------------------------------------- |
| `w-[600px]`               | `w-full max-w-[600px]`                   | Element de contenu qui doit remplir l'espace    |
| `w-[256px]` sur sidebar   | `w-64` (garder fixe)                     | Sidebar fixe, c'est normal                      |
| `w-[200px]` dans grid     | `w-full`                                 | Element dans un grid qui gere deja les colonnes |
| `min-w-[400px]` sur table | `min-w-0` + `overflow-x-auto` sur parent | Table dans un conteneur flexible                |
| `w-[32px]` sur icone      | `w-8` ou `size-8`                        | Taille fixe d'icone (OK, garder)                |

**ATTENTION :** Ne PAS remplacer aveuglement. Les largeurs fixes sur les elements suivants sont NORMALES et doivent etre gardees :

- Icones et avatars (< 64px)
- Sidebar (256px / 64px collapsed — c'est intentionnel)
- Boutons avec taille specifique
- Elements de visualisation de chaise/table dans ServiceManager (necessitent un redesign separe)

**Fichiers prioritaires a corriger (faire ceux-la en premier) :**

1. **`src/components/features/dashboard/DashboardKPIs.tsx`** — remplacer les `w-[Xpx]` sur les cartes KPI par `w-full`
2. **`src/components/features/dashboard/DashboardRecentOrders.tsx`** — remplacer les largeurs fixes sur les colonnes par des ratios flexibles
3. **`src/components/admin/POSClient.tsx`** — adapter les conteneurs POS pour etre flexibles
4. **`src/components/features/kitchen/KDSTicket.tsx`** — adapter les tickets KDS
5. **`src/components/features/kitchen/KitchenFilters.tsx`** — adapter les filtres

**Pour chaque fichier :**

1. Lire le fichier entier
2. Identifier chaque `w-[Xpx]` et `min-w-[Xpx]`
3. Determiner si c'est un conteneur (remplacer) ou un element fixe (garder)
4. Appliquer le remplacement
5. Verifier avec `pnpm typecheck`

---

### FIX-05 | Completer la migration @container queries

**Severite : HAUTE**
**Fichiers : ~30 composants a migrer**

**Contexte :** 31 fichiers utilisent deja @container (bon), mais ~70% du code utilise encore les media queries classiques (`md:`, `lg:`) pour le responsive au niveau composant. Les media queries reagissent au viewport, pas a l'espace disponible du conteneur — c'est pourquoi le layout casse quand la sidebar change de taille.

**Methode de migration :**

Pour chaque composant qui est affiche dans la zone de contenu admin (a droite de la sidebar) :

1. Verifier que le parent a `@container` (le `<main>` dans AdminLayoutClient l'a deja)
2. Remplacer les prefixes media query par des prefixes container query :
   - `sm:` -> `@sm:` (si le composant reagit a son conteneur)
   - `md:` -> `@md:`
   - `lg:` -> `@lg:`
   - `xl:` -> `@xl:`

**ATTENTION :** Ne PAS migrer ces cas :

- Les layouts racine (`src/app/layout.tsx`, `src/app/sites/[site]/layout.tsx`) — ceux-ci doivent reagir au viewport
- Les composants marketing (landing pages) — viewport-based est correct
- Les composants qui sont toujours full-width (pas dans une sidebar)

**Composants prioritaires a migrer :**

```
src/components/features/dashboard/DashboardKPIs.tsx
src/components/features/dashboard/DashboardRecentOrders.tsx
src/components/admin/ResponsiveDataTable.tsx
src/components/tenant/MenuItemCard.tsx
src/components/features/kitchen/KDSTicket.tsx
src/components/features/kitchen/KitchenFilters.tsx
src/components/admin/InventoryClient.tsx
src/components/admin/UsersClient.tsx
src/components/admin/ReportsClient.tsx
```

**Exemple concret de migration :**

```tsx
// AVANT
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

// APRES
<div className="grid grid-cols-1 @md:grid-cols-2 @lg:grid-cols-4 gap-4">
```

Pour chaque fichier :

1. Lire le fichier
2. Identifier les media queries (`sm:`, `md:`, `lg:`, `xl:`) dans les classes Tailwind
3. Determiner si ce composant est rendu dans un @container (verifier le parent)
4. Remplacer par les equivalents @container
5. `pnpm typecheck`

---

### FIX-06 | Convertir les styles inline en classes Tailwind (tenant components)

**Severite : MOYENNE**
**Fichiers : 58 fichiers, 574 occurrences**

**Contexte :** Les composants tenant (menu client, commandes, panier) utilisent massivement `style={{}}` pour le design. Ces styles inline ne reagissent pas aux breakpoints et ne sont pas modifiables par le theme.

**Commande pour trouver les occurrences :**

```bash
grep -rn "style={{" src/components/tenant/ --include="*.tsx" | wc -l
```

**Top 5 fichiers a traiter en priorite :**

1. `src/app/sites/[site]/ClientMenuPage.tsx` (70 occurrences)
2. `src/app/sites/[site]/admin/settings/ClientSettings.tsx` (65)
3. `src/app/sites/[site]/ClientMenuDetailPage.tsx` (37)
4. `src/components/tenant/ItemDetailSheet.tsx` (39)
5. `src/app/sites/[site]/orders/ClientOrders.tsx` (33)

**Regles de conversion :**

| Style inline              | Classe Tailwind |
| ------------------------- | --------------- |
| `fontSize: '11px'`        | `text-[11px]`   |
| `fontSize: '13px'`        | `text-[13px]`   |
| `fontSize: '14px'`        | `text-sm`       |
| `fontSize: '16px'`        | `text-base`     |
| `padding: '2px 6px'`      | `px-1.5 py-0.5` |
| `borderRadius: '8px'`     | `rounded-lg`    |
| `borderRadius: '12px'`    | `rounded-xl`    |
| `borderRadius: '9999px'`  | `rounded-full`  |
| `backgroundColor: '#...'` | `bg-[#...]`     |
| `color: '#...'`           | `text-[#...]`   |
| `gap: '8px'`              | `gap-2`         |
| `gap: '12px'`             | `gap-3`         |
| `gap: '16px'`             | `gap-4`         |
| `marginTop: '8px'`        | `mt-2`          |
| `marginBottom: '16px'`    | `mb-4`          |
| `width: '100%'`           | `w-full`        |
| `maxWidth: '600px'`       | `max-w-[600px]` |

**ATTENTION** : Certains styles inline dependent de variables dynamiques (ex: `style={{ backgroundColor: item.color }}`). Ceux-la DOIVENT rester en inline — ne pas les convertir. Seuls les styles avec des valeurs statiques/hardcodees doivent etre convertis.

**Pour chaque fichier :**

1. Lire le fichier entier
2. Identifier chaque `style={{...}}`
3. Si les valeurs sont statiques -> convertir en classes Tailwind
4. Si les valeurs sont dynamiques (variables) -> garder en inline
5. `pnpm typecheck && pnpm lint`

---

### FIX-07 | Verifier le rate limiting sur toutes les API routes

**Severite : HAUTE**
**Fichiers a verifier : les 40 routes API**

**Contexte :** L'audit a identifie que la plupart des routes ont un rate limiting, mais certaines pourraient en manquer. Le fichier `src/lib/rate-limit.ts` exporte 24 limiters. Il faut verifier que chaque route API publique ou sensible utilise un limiter.

**Etape 1 — Lister les routes sans rate limiting :**

```bash
# Pour chaque route API, verifier si elle importe depuis rate-limit
for f in $(find src/app/api -name "route.ts"); do
  if ! grep -q "rate-limit\|Limiter\|limiter" "$f"; then
    echo "MISSING RATE LIMIT: $f"
  fi
done
```

**Etape 2 — Pour chaque route identifiee sans rate limiting :**

Ajouter l'import et la verification au debut de la fonction handler :

```typescript
import { <appropriateLimiter>, getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { success } = await <appropriateLimiter>.check(ip);
  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 }
    );
  }
  // ... reste du code
}
```

**Limiters recommandes par type de route :**

- Routes auth (login, signup, forgot-password) : utiliser les limiters fail-closed existants
- Routes admin destructives : `adminResetLimiter` (3/heure, fail-closed)
- Routes publiques lecture : un limiter generique (100/minute)
- Routes d'upload : `importLimiter` (10/10min)

**Etape 3 :** `pnpm typecheck && pnpm test`

---

## PHASE 3 - MOYENNE PRIORITE (Sprint suivant)

---

### FIX-08 | Ajouter les headers Cross-Origin manquants

**Severite : BASSE**
**Fichier a modifier : `next.config.mjs`**

**Ajouter ces headers dans le tableau `headers` de la fonction `headers()`, a cote des headers existants :**

```javascript
{
  key: 'Cross-Origin-Opener-Policy',
  value: 'same-origin',
},
{
  key: 'Cross-Origin-Resource-Policy',
  value: 'same-origin',
},
```

Les ajouter APRES le header `Strict-Transport-Security` existant.

**Verifier :** `pnpm build` puis inspecter les headers avec Chrome DevTools.

---

### FIX-09 | Completer les icones PWA pour tablette

**Severite : MOYENNE**
**Fichier a modifier : `public/manifest.json`**

**Contexte :** Seul un favicon 48x48 est present. Pour une installation PWA correcte sur iPad et tablettes Android, il faut des icones a plusieurs tailles.

**Etape 1 — Generer les icones.**

Si un logo SVG existe dans `public/` (chercher `logo.svg`, `icon.svg`, `attabl-logo.*`) :

```bash
# Utiliser sharp ou un outil en ligne pour generer les tailles
# Sinon, creer des PNG verts (#CCFF00) avec le texte "A" comme placeholder
```

**Etape 2 — Modifier `public/manifest.json` :**

Remplacer le contenu complet par :

```json
{
  "name": "ATTABL - Menu Digital & Commandes",
  "short_name": "ATTABL",
  "description": "Solution digitale pour restaurants et hotels de luxe",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#CCFF00",
  "orientation": "any",
  "categories": ["business", "food"],
  "icons": [
    {
      "src": "/favicon.ico",
      "sizes": "48x48",
      "type": "image/x-icon"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-maskable-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/menu-mobile.png",
      "sizes": "375x812",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Menu digital sur mobile"
    },
    {
      "src": "/screenshots/admin-tablet.png",
      "sizes": "1024x768",
      "type": "image/png",
      "form_factor": "wide",
      "label": "Dashboard admin sur tablette"
    }
  ]
}
```

**Note :** Les fichiers PNG doivent etre crees dans `public/icons/` et `public/screenshots/`. Utiliser un generateur d'icones PWA en ligne (ex: realfavicongenerator.net) a partir du logo existant.

---

### FIX-10 | PWA : Desactiver skipWaiting pour mises a jour gracieuses

**Severite : BASSE**
**Fichier a modifier : `next.config.mjs`**

**Contexte :** `skipWaiting: true` force l'activation immediate du nouveau Service Worker. En restaurant sur tablette, ca peut causer des rechargements inattendus pendant l'utilisation.

**Remplacer dans `next.config.mjs` :**

```javascript
// AVANT
const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

// APRES
const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: false,
});
```

**Optionnel :** Ajouter un toast "Nouvelle version disponible - Cliquer pour mettre a jour" dans le layout client. Cela peut etre fait dans un fix ulterieur.

---

### FIX-11 | Sentry : Ajouter le masquage explicite des donnees sensibles

**Severite : BASSE**
**Fichiers a modifier : `sentry.server.config.ts`, `sentry.client.config.ts`**

**Etape 1 — Modifier `sentry.server.config.ts` :**

Remplacer le contenu complet par :

```typescript
// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,

  // Performance Monitoring
  // Capture 10% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Strip sensitive data from events before sending to Sentry
  beforeSend(event) {
    // Remove request body data (may contain PII, payment info, etc.)
    if (event.request?.data) {
      event.request.data = '[Filtered]';
    }
    // Remove cookies from request
    if (event.request?.cookies) {
      event.request.cookies = {};
    }
    // Remove query strings that may contain tokens
    if (event.request?.query_string) {
      event.request.query_string = '[Filtered]';
    }
    return event;
  },
});
```

**Etape 2 — Modifier `sentry.client.config.ts` :**

Ajouter le callback `beforeSend` apres le `beforeBreadcrumb` existant :

```typescript
  // Strip sensitive data from client events
  beforeSend(event) {
    // Remove user input data
    if (event.request?.data) {
      event.request.data = '[Filtered]';
    }
    return event;
  },
```

L'ajouter juste apres le bloc `beforeBreadcrumb(breadcrumb) { ... },` existant.

**Verifier :** `pnpm typecheck`

---

### FIX-12 | Ajouter une verification Origin/Referer sur les API publiques

**Severite : MOYENNE**
**Fichier a creer : `src/lib/csrf.ts`**
**Fichiers a modifier : routes API publiques qui modifient des donnees**

**Etape 1 — Creer `src/lib/csrf.ts` :**

```typescript
import { NextResponse } from 'next/server';

/**
 * Verify that the request originates from an allowed origin.
 * This provides basic CSRF protection for public API routes.
 * Server Actions are already protected by Next.js built-in mechanisms.
 */
export function verifyOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || 'localhost:3000';

  // Allow requests with matching origin
  if (origin) {
    const allowedOrigins = [appUrl, `https://${appDomain}`, `https://www.${appDomain}`];
    // Also allow tenant subdomains
    if (
      allowedOrigins.some((allowed) => origin.startsWith(allowed)) ||
      origin.endsWith(`.${appDomain}`)
    ) {
      return null; // OK
    }
  }

  // Allow requests with matching referer (fallback)
  if (referer) {
    if (referer.includes(appDomain)) {
      return null; // OK
    }
  }

  // Allow requests without origin/referer (e.g., server-to-server, mobile apps)
  // These are still protected by auth tokens
  if (!origin && !referer) {
    return null;
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

**Etape 2 — Appliquer aux routes publiques qui modifient des donnees :**

Pour chaque route POST publique (sans auth), ajouter au debut du handler :

```typescript
import { verifyOrigin } from '@/lib/csrf';

// Au debut de la fonction POST
const originError = verifyOrigin(request);
if (originError) return originError;
```

**Routes concernees :**

- `src/app/api/orders/route.ts` (commandes anonymes)
- `src/app/api/push-subscriptions/route.ts` (si public)
- Toute autre route POST accessible sans authentification

**NE PAS appliquer a :**

- Routes webhook (`/api/webhooks/stripe`) — Stripe envoie depuis ses serveurs
- Routes auth (`/api/signup`, `/api/login`) — l'origin peut etre differente pour OAuth

---

### FIX-13 | Ajouter un workflow GitHub Actions de scan securite

**Severite : HAUTE**
**Fichier a creer : `.github/workflows/security.yml`**

**Contexte :** Le CI actuel (`.github/workflows/ci.yml`) couvre lint/typecheck/test/build mais aucun scan de securite automatise.

**Creer `.github/workflows/security.yml` :**

```yaml
name: Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    # Run weekly on Monday at 8:00 UTC
    - cron: '0 8 * * 1'

jobs:
  # SAST with Semgrep (Next.js + TypeScript rules)
  semgrep:
    name: Static Analysis (Semgrep)
    runs-on: ubuntu-latest
    container:
      image: semgrep/semgrep
    steps:
      - uses: actions/checkout@v4
      - run: semgrep scan --config p/default --config p/nextjs --config p/typescript --config p/owasp-top-ten --sarif --output semgrep.sarif .
      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: semgrep.sarif

  # Dependency vulnerability audit
  dependency-audit:
    name: Dependency Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: latest
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: Audit production dependencies
        run: pnpm audit --prod --audit-level=high
      - name: Audit all dependencies (non-blocking)
        run: pnpm audit --audit-level=critical || true

  # Secret scanning
  secrets-scan:
    name: Secret Scanning
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Full history for secret detection
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

### FIX-14 | Verifier le RLS sur la table order_items

**Severite : MOYENNE**
**Action : verification SQL dans Supabase**

**Etape 1 — Verifier via Supabase SQL Editor ou CLI :**

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'order_items';
```

**Etape 2 — Si `rowsecurity = false`, creer une migration :**

```bash
supabase migration new enable_rls_order_items
```

Contenu de la migration :

```sql
-- Enable RLS on order_items (was missing from initial schema)
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Policy: order items are readable by the tenant that owns the parent order
CREATE POLICY "order_items_select" ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
      AND o.tenant_id IN (
        SELECT au.tenant_id FROM admin_users au
        WHERE au.user_id = auth.uid()
      )
    )
  );

-- Policy: order items are insertable via service_role only (from order creation API)
CREATE POLICY "order_items_insert_service" ON order_items
  FOR INSERT WITH CHECK (true);
-- Note: INSERT is done via service_role in the orders API, so this is safe

-- Policy: order items deletable by tenant admins
CREATE POLICY "order_items_delete" ON order_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
      AND o.tenant_id IN (
        SELECT au.tenant_id FROM admin_users au
        WHERE au.user_id = auth.uid()
      )
    )
  );
```

**Etape 3 :** `pnpm db:migrate`

---

## PHASE 4 - AMELIORATION CONTINUE

---

### FIX-15 | Creer un template de PR avec checklist responsive

**Severite : BASSE**
**Fichier a creer : `.github/PULL_REQUEST_TEMPLATE.md`**

```markdown
## Description

<!-- Decris brievement les changements -->

## Type de changement

- [ ] Bug fix
- [ ] Nouvelle feature
- [ ] Refactoring
- [ ] Style / UI
- [ ] Documentation

## Checklist Responsive

Si ce PR touche a l'UI (composants, styles, layout) :

- [ ] Pas de `w-[Xpx]` ajoute (utiliser `w-full max-w-[Xpx]` a la place)
- [ ] Les composants reutilisables utilisent `@container` (pas `md:`)
- [ ] Teste aux 3 viewports : 375px (mobile), 768px (tablette), 1024px (desktop)
- [ ] Pas de `style={{}}` avec des valeurs statiques (utiliser des classes Tailwind)
- [ ] Tests E2E responsive passent (`pnpm test:e2e:responsive`)

## Checklist Securite

Si ce PR touche aux API routes, auth, ou donnees :

- [ ] Validation Zod sur les entrees utilisateur
- [ ] Rate limiting applique sur les endpoints publics
- [ ] Requetes DB filtrent par `tenant_id`
- [ ] Pas de secrets en dur dans le code
```

---

### FIX-16 | Ajouter un max-width sur le contenu admin

**Severite : BASSE**
**Fichier a modifier : `src/app/sites/[site]/admin/layout.tsx` ou le composant AdminLayoutClient**

**Contexte :** Sur ecrans tres larges (4K, ultrawide), le contenu admin s'etire sans limite, rendant les tableaux et formulaires difficiles a lire.

**Trouver le fichier du layout admin :**

```bash
find src/app/sites -name "layout.tsx" -path "*/admin/*"
```

**Modifier le composant qui wrappe le contenu principal `{children}` :**

Ajouter un wrapper `max-w-screen-2xl mx-auto` autour du children :

```tsx
// AVANT
<main id="main-content" className="flex-1 min-h-0 @container overflow-y-auto">
  {children}
</main>

// APRES
<main id="main-content" className="flex-1 min-h-0 @container overflow-y-auto">
  <div className="max-w-screen-2xl mx-auto h-full">
    {children}
  </div>
</main>
```

**ATTENTION :** Verifier que cela ne casse pas le layout KDS/POS qui peut necessiter du full-width. Si c'est le cas, ajouter une condition :

```tsx
<div className={cn('mx-auto h-full', isFullWidthPage ? '' : 'max-w-screen-2xl')}>
```

---

## VERIFICATION FINALE

Apres avoir applique TOUS les fixes :

```bash
# 1. Types TypeScript
pnpm typecheck

# 2. Linting
pnpm lint

# 3. Formatage
pnpm format:check

# 4. Tests unitaires
pnpm test

# 5. Build production
pnpm build

# 6. Tests E2E responsive (serveur dev lance)
pnpm dev &
pnpm test:e2e:responsive

# 7. Scan de securite local
npx semgrep scan --config p/nextjs .
```

Si tout passe, commiter avec :

```bash
git add -A
git commit -m "security+responsive: apply post-audit fixes (16 items)

- FIX-01: Replace unsafe-inline CSP with nonce-based approach
- FIX-02: Update vulnerable dependencies (jspdf, xlsx)
- FIX-03: Add Playwright responsive E2E tests
- FIX-04: Replace fixed pixel widths with fluid alternatives
- FIX-05: Migrate components to @container queries
- FIX-06: Convert static inline styles to Tailwind classes
- FIX-07: Ensure rate limiting on all API routes
- FIX-08: Add Cross-Origin security headers
- FIX-09: Complete PWA icons for tablet
- FIX-10: Disable skipWaiting for graceful SW updates
- FIX-11: Add Sentry data scrubbing rules
- FIX-12: Add Origin/Referer verification on public APIs
- FIX-13: Add GitHub Actions security scanning workflow
- FIX-14: Verify RLS on order_items table
- FIX-15: Create PR template with responsive checklist
- FIX-16: Add max-width on admin content area"
```

---

_Document genere le 11 avril 2026 — Audit post-mortem Attabl SaaS_
_A executer par Claude, fix par fix, dans l'ordre numerique_
