---
paths:
  - "src/components/**/*.tsx"
  - "src/app/**/*.tsx"
  - "src/hooks/**/*.ts"
  - "src/contexts/**/*.tsx"
---

# Frontend Quality Rules - ATTABL SaaS

## React et Next.js

### Server vs Client Components
- Server Components par defaut — pas de `'use client'` sauf necessite
- `'use client'` UNIQUEMENT si le composant utilise : `useState`, `useEffect`, `onClick`, `onChange`, `useRef`, ou tout hook de navigateur
- JAMAIS de `'use client'` sur un composant qui ne fait que du rendu statique
- Les pages dans `app/` sont Server Components — extraire la partie interactive dans un Client Component enfant

### Performance
- Utiliser `React.memo()` pour les composants qui re-render frequemment avec les memes props
- Utiliser `useMemo` / `useCallback` uniquement quand necessaire (calculs couteux, deps de useEffect)
- JAMAIS de function ou objet defini inline dans le JSX d'un composant parent si passe en prop
- Preferer `next/image` a `<img>` pour le chargement optimise
- Preferer `next/link` a `<a>` pour la navigation client-side

### Etat et Data Fetching
- TanStack Query pour le data fetching cote client (hooks dans `src/hooks/queries/`)
- Mutations via TanStack Query (hooks dans `src/hooks/mutations/`)
- React Context pour l'etat global UI (panier, tenant, device, langue)
- JAMAIS de fetch() nu dans un useEffect — toujours passer par TanStack Query ou un Server Component
- `DeviceContext` avec `useSyncExternalStore` pour le responsive (pas de hydration mismatch)

## Tailwind CSS v4

### Classes et Organisation
- Utiliser `cn()` (clsx + tailwind-merge) pour combiner les classes conditionnelles
- Ordre des classes : layout → sizing → spacing → typography → colors → borders → effects
- JAMAIS de styles inline (`style={{}}`) sauf pour les valeurs dynamiques (couleurs du tenant)
- JAMAIS de fichier CSS custom sauf pour les animations complexes ou les variables du tenant

### Theming
- Couleurs du tenant via CSS custom properties et non via classes Tailwind hardcodees
- Dark mode via `next-themes` — utiliser `dark:` prefix quand le dark mode est actif
- Animations via `framer-motion` ou `motion` — JAMAIS de CSS @keyframes custom sauf cas exceptionnel

## Composants UI (shadcn/ui)

- NE PAS modifier les fichiers dans `src/components/ui/` manuellement
- Pour personnaliser un composant shadcn : creer un wrapper dans `components/shared/`
- Toujours utiliser les composants shadcn existants avant d'en creer de nouveaux
- Composants disponibles : Button, Dialog, Select, Tabs, Card, Table, etc.

## Formulaires

- TOUJOURS utiliser React Hook Form + Zod resolver
- Schema Zod dans `src/lib/validations/[domaine].schema.ts`
- Pattern : `useForm({ resolver: zodResolver(schema) })`
- Afficher les erreurs de validation inline sous chaque champ
- Desactiver le bouton submit pendant le loading
- Toast de confirmation (sonner) apres succes

## Accessibilite (a11y)

- Tous les boutons interactifs ont un `aria-label` si pas de texte visible
- Les images ont un attribut `alt` descriptif
- Les formulaires ont des `<label>` associes aux inputs
- Focus visible sur tous les elements interactifs (ne pas supprimer `outline`)
- Contraste minimum WCAG AA (4.5:1 pour le texte, 3:1 pour les grands textes)

## Internationalisation (i18n)

- Textes dans `src/messages/fr.json` et `src/messages/en.json`
- Utiliser `useTranslations()` de `next-intl` pour tous les textes visibles
- JAMAIS de texte hardcode en francais ou anglais dans le JSX
- Cles i18n en dot notation : `menu.categories.title`

## Typographie (REGLE STRICTE)

- JAMAIS de caracteres Unicode speciaux dans le code ou les fichiers i18n
- Interdit : `--` (em dash), `...` (ellipsis unicode), guillemets smart, guillemets francais
- Utiliser uniquement : `-`, `...` (3 points ASCII), `"` et `'` droits
- EXCEPTION : fichiers .md et documents generes (.docx, .pdf)

## Anti-Patterns Frontend

- JAMAIS de `useEffect` pour synchroniser un state avec un prop (calculer directement)
- JAMAIS de `useEffect` avec un `setState` qui declenche un re-render immediat
- JAMAIS de `key={Math.random()}` — utiliser un identifiant stable
- JAMAIS de composant > 300 lignes — decomposer en sous-composants
- JAMAIS de prop drilling > 3 niveaux — utiliser un Context ou remonter l'etat
