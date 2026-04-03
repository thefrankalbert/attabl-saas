---
paths:
  - "src/components/**/*.tsx"
  - "src/app/**/*.tsx"
---

# Responsive Design Rules - ATTABL SaaS

## Principe Fondamental

ATTABL est un SaaS multi-device : les restaurants utilisent le dashboard admin sur desktop/tablette, les clients consultent les menus sur mobile. CHAQUE composant DOIT fonctionner sur tous les ecrans.

## Breakpoints (Tailwind v4)

Utiliser EXCLUSIVEMENT les breakpoints Tailwind definis dans `src/lib/layout/breakpoints.ts` :
- `sm:` → 640px (grand mobile / petit tablette)
- `md:` → 768px (tablette portrait)
- `lg:` → 1024px (tablette paysage / petit desktop)
- `xl:` → 1280px (desktop)
- `2xl:` → 1536px (grand ecran)

## Approche Mobile-First (OBLIGATOIRE)

- TOUJOURS ecrire les styles de base pour mobile SANS prefixe responsive
- PUIS ajouter les adaptations pour ecrans plus grands avec prefixes
- Exemple correct : `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- Exemple INCORRECT : `grid-cols-4 sm:grid-cols-2` (desktop-first)

## Regles de Grilles

- JAMAIS de `grid-cols-N` fixe sans variantes responsives
- TOUJOURS definir au minimum 2 breakpoints : base (mobile) + `md:` ou `lg:`
- Pour les grilles de cartes : `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- Pour les grilles de menu items : `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`

## Tailles et Espacements

- JAMAIS de largeurs fixes en pixels pour les conteneurs principaux (`w-[500px]`)
- Preferer les largeurs fluides : `w-full`, `max-w-sm`, `max-w-md`, `max-w-lg`
- Pour les images/avatars : tailles responsives `w-12 h-12 sm:w-16 sm:h-16`
- Padding responsive : `px-4 sm:px-6 lg:px-8`
- Gap responsive : `gap-3 sm:gap-4 lg:gap-6`

## Typographie Responsive

- Titres principaux : `text-xl sm:text-2xl lg:text-3xl`
- Sous-titres : `text-lg sm:text-xl`
- Corps de texte : `text-sm sm:text-base`
- Texte secondaire : `text-xs sm:text-sm`
- JAMAIS de taille de texte fixe > `text-xl` sans variante responsive

## Navigation et Layout

- Admin dashboard : utiliser `DeviceContext` pour adapter le layout
  - Mobile : bottom navigation (`BottomNavigation` component)
  - Tablette : sidebar repliee
  - Desktop : sidebar etendue
- Menu tenant (client) : toujours mobile-first, le menu est principalement consulte sur telephone
- Modales et dialogues : `max-w-sm sm:max-w-md lg:max-w-lg` avec `mx-4 sm:mx-auto`

## Images et Media

- TOUJOURS utiliser `next/image` avec `sizes` attribut pour le responsive
- Pattern : `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`
- Les images de produits menu : `aspect-square` avec `object-cover`
- QR codes : taille fixe acceptable (impression), mais previsualisation responsive

## Tableaux de Donnees (Admin)

- Utiliser `ResponsiveDataTable` qui switch automatiquement :
  - Mobile : vue en cartes empilees
  - Desktop : tableau classique avec colonnes
- JAMAIS de tableau HTML classique sans alternative mobile
- Pour les tableaux complexes : scroll horizontal `overflow-x-auto` comme fallback minimum

## Touch Targets (OBLIGATOIRE)

Les interfaces tactiles (KDS, POS, menu client) sont utilisees sur tablette et mobile. Les zones de touch doivent etre suffisamment grandes.

- Taille minimale : `min-h-[44px] min-w-[44px]` pour TOUT bouton interactif (standard Apple/Google)
- Espacement entre boutons tactiles : minimum `gap-1.5` (6px) pour eviter les taps accidentels
- Footer bars, toolbars : hauteur minimum `h-14` (56px) pour confort tactile sur tablette
- Boutons d'action principaux (CTA) : `min-h-[44px]` avec padding genereux `px-4 py-2`
- Icones seules comme boutons : toujours wrapper avec `p-2 min-h-[44px] min-w-[44px] flex items-center justify-center`

## Texte et Lisibilite

- JAMAIS de `text-[10px]` sur des elements interactifs - minimum `text-xs` (12px)
- `text-[10px]` acceptable UNIQUEMENT pour des labels purement decoratifs non-interactifs
- Sur les interfaces KDS/POS (tablette) : preferer `text-xs` a `text-[10px]`, `text-sm` a `text-xs`
- Les numeros de commande longs doivent etre raccourcis pour l'affichage (ex: `CMD-20260403-001` -> `#001`)
- Couleurs de texte : contraste minimum WCAG AA - `text-app-text-muted` est le minimum acceptable

## Couleurs et Harmonisation

- Les tabs/filtres de statut doivent utiliser une palette coherente et subtile
- Preferer les fonds semi-transparents pour les etats actifs : `bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30`
- EVITER les couleurs pleines criardes (`bg-amber-500 text-black`) pour les filtres - les reserver aux CTA principaux
- Les etats inactifs utilisent une couleur neutre uniforme (`text-app-text-muted`), pas chacun sa couleur

## Hydration et localStorage (CRITIQUE)

Le responsive design depend souvent de valeurs lues depuis `localStorage` ou `window` (sidebar collapsed, preferences). Ces valeurs causent des hydration mismatches si lues dans `useState` initializer.

- JAMAIS lire `localStorage` ou `window.innerWidth` dans un `useState(() => ...)` initializer
- Pattern correct : `useState(SERVER_DEFAULT)` + `useEffect(() => { readFromLocalStorage(); }, [])`
- La valeur serveur par defaut doit etre la valeur la plus commune (ex: sidebar expanded = `false`)
- Accepter un flash visuel rapide au mount plutot qu'un hydration mismatch

## Dev/Prod Responsive Parity

Turbopack (dev) et Webpack (prod) rendent differemment. Une page responsive en local peut casser en production.

- TOUJOURS tester avec `pnpm build && pnpm start` avant de valider un changement layout/responsive
- Les classes Tailwind dynamiques (`text-${size}`) sont purgees en prod - TOUJOURS utiliser des classes completes
- Le PWA service worker (actif en prod, inactif en dev) peut cacher du CSS obsolete

## Tests Responsive

- Avant de valider un composant, verifier visuellement sur :
  - 375px (iPhone SE - plus petit ecran courant)
  - 768px (iPad portrait)
  - 1024px (iPad paysage)
  - 1440px (desktop standard)
- Utiliser `pnpm test:e2e:responsive` pour les tests automatises
- OBLIGATOIRE pour les changements layout : `pnpm build && pnpm start` et tester en mode production

## Anti-Patterns a EVITER

- `w-[500px]` ou toute largeur fixe en pixels pour un conteneur
- `grid-cols-4` sans variantes `sm:`, `md:`, `lg:`
- `text-4xl` sans variante responsive
- `hidden` sans `sm:block` ou `md:flex` (contenu invisible sur mobile sans alternative)
- `overflow-hidden` sur un conteneur parent qui tronque du contenu sur petit ecran
- `h-screen` sans penser au viewport mobile (barre d'adresse)
- Composants qui dependent de `hover:` sans alternative `active:` pour le tactile
- `text-[10px]` sur des elements interactifs (trop petit pour etre lu/tape)
- Boutons sans `min-h-[44px]` sur interfaces tactiles
- Lire `localStorage`/`window` dans `useState` initializer (hydration mismatch)
- Classes Tailwind construites dynamiquement (`\`text-${var}\``) - purgees en prod
