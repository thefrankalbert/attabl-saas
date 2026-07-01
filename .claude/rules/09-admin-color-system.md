# Admin Color System Rules - ATTABL SaaS

## Principe fondamental

ATTABL a DEUX langages couleur distincts. Ne jamais les melanger.

| Contexte | Palette | Couleur d'accent |
| --- | --- | --- |
| **Admin** (dashboard tenant, super-admin plateforme) | shadcn neutral | **bleu** (`#3B82F6` / tokens) |
| **Tenant / marketing / auth / onboarding / storefront** | marque ATTABL | **lime `#CCFF00`** |

Le PR #168 a purge tout le vert/lime de l'admin et l'a aligne sur shadcn neutral +
accent bleu. Cette regle rend ce choix permanent et le fait respecter par la CI.

## Regle stricte : PAS de lime en admin

Dans toute surface admin :

- INTERDIT : `#CCFF00` (ou `CCFF00` en toute casse) - hex brut, classe arbitraire
  `bg-[#CCFF00]`, `text-[#CCFF00]`, style inline `{ backgroundColor: '#CCFF00' }`,
  ou tableau de couleurs JS (`const COLORS = ['#CCFF00', ...]`).
- INTERDIT : classes de palette Tailwind brute `lime-*`, `green-*`, `emerald-*`
  (ex : `bg-green-500`, `text-emerald-400`, `border-l-lime-300`).
- OBLIGATOIRE : couleurs de statut via tokens semantiques - `text-status-success`,
  `bg-status-success-bg`, `text-status-info`, `bg-status-warning-bg`, etc.
- OBLIGATOIRE : couleurs de charts via `CHART_PALETTE` de `@/lib/design-tokens`
  (palette oklch generee, espacee en teinte). JAMAIS de hex hardcode dans un chart.

## Ce qui reste legitime (NE PAS toucher)

Le lime `#CCFF00` est la couleur de MARQUE ATTABL. Il est correct et voulu dans :

- Pages auth (`src/components/auth/`), onboarding (`src/components/onboarding/`)
- Marketing / landing (`src/app/(marketing)/`, `src/components/marketing/`)
- Storefront / menu client / cart tenant (`src/app/sites/[site]/` hors `/admin`)
- Theme PWA (`src/app/layout.tsx` `themeColor`), color-picker de branding tenant
- Valeur par defaut de `primary_color` d'un tenant (`onboarding.service.ts`)

Le vert semantique (statut "success", table "occupied") passe par les tokens
`status-success`, PAS par `green-500` brut - meme en dehors de l'admin, preferer
les tokens.

## D'ou venaient les fuites (racine du probleme)

`#CCFF00` etait l'accent de marque d'origine, utilise partout y compris le vieux
admin. Le purge #168 a reecrit les classes Tailwind VISIBLES. Il a rate le lime :

1. Visible seulement en erreur (`ErrorLayout` variante admin, `global-error.tsx`) -
   jamais vu en QA de navigation normale.
2. Hardcode en hex dans des tableaux JS (`DONUT_COLORS`) - ne ressemble pas a une
   "classe couleur", echappe au sweep par classe.

Fixes : `ErrorLayout` (db6771dd), donut dashboard -> `CHART_PALETTE`, `global-error`
neutralise.

## Enforcement (CI)

Garde-fou ESLint dans `eslint.config.mjs` (`no-restricted-syntax` scope admin) :
tout `#CCFF00` ou classe `lime|green|emerald-N` dans une surface admin FAIL le lint
(`pnpm lint`), donc bloque le merge. Scope :

- `src/components/admin/**`, `src/app/admin/**`, `src/app/sites/**/admin/**`
- Fichiers partages rendus en admin : `ErrorLayout.tsx`, `global-error.tsx`,
  hooks data admin (`useDashboardStats.ts`, `useDashboardData.ts`)

Pour etendre la protection a une nouvelle surface admin, ajouter son glob a la liste
`files` de ce bloc ESLint.
