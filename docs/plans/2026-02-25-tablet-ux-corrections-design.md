# Tablet UX & Feature Corrections — Design Document

**Date:** 2026-02-25
**Scope:** 7 chantiers — responsive tablette, flux service, modales, date pickers, edition CRUD, suggestions intelligentes, cibles tactiles.

---

## Contexte

Retour utilisateur sur iPad 11" : le SaaS presente des problemes de responsive sur tablette, des fonctionnalites manquantes (edition annonces/coupons, flux service incomplet, suggestions manuelles), et des problemes d'ergonomie tactile (clavier qui cache les formulaires, boutons trop petits, date pickers natifs inadaptes).

---

## Chantier 1 : Flux Service/Serveur

### Probleme

Quand un serveur s'assigne a une table via ServiceManager, rien ne se passe apres l'assignation. Le serveur devrait voir les commandes en temps reel pour ses tables assignees.

### Solution

- **ServiceManager.tsx** : Apres `assignServer.mutate()`, naviguer vers la vue serveur ou ouvrir un panneau detail
- **ServerDashboard.tsx** : Rendre chaque table cliquable → expand inline montrant les commandes actives de cette table
- Ajouter un abonnement Realtime scope aux tables du serveur connecte
- Les commandes clients arrivent en temps reel et le serveur peut les valider ou les voir se valider automatiquement

### Composants concernes

- `src/components/admin/ServiceManager.tsx` (navigation post-assignation)
- `src/components/admin/ServerDashboard.tsx` (vue detail par table, commandes temps reel)
- `src/hooks/queries/useOrders.ts` (filtrage par table_id)

---

## Chantier 2 : Responsive Tablette (Layout & Sidebar)

### Probleme

- La sidebar bouge quand on scrolle (devrait etre fixe)
- Le contenu deborde sur tablette, necessitant un scroll horizontal
- Quand la sidebar est etendue, le contenu passe en colonnes ecrasees
- Le scroll fait monter toute la page, laissant des vides en bas

### Solution

- **AdminSidebar.tsx** : Ajouter `h-[100dvh]` explicite pour gerer le chrome navigateur mobile
- **AdminLayoutClient.tsx** : Passer le `<main>` en `h-[100dvh] overflow-y-auto` pour que seul le contenu scrolle, pas la page entiere
- Auditer les breakpoints tablette : `md` (768px), `lg` (1024px), `xl` (1280px)
- S'assurer que les DataTable, grilles, et cards s'adaptent entre 768px et 1180px (iPad 11")
- Utiliser `container queries` ou des breakpoints intermediaires si necessaire

### Composants concernes

- `src/components/admin/AdminSidebar.tsx` (hauteur + position fixe)
- `src/components/admin/AdminLayoutClient.tsx` (overflow + hauteur main)
- `src/components/admin/sidebar/SidebarNav.tsx` (scroll interne)
- Toutes les pages admin (audit responsive)

---

## Chantier 3 : Modales & Formulaires sur Tablette

### Probleme

- Les modales s'ouvrent trop grandes, le bas du formulaire est invisible
- On ne peut pas scroller dans la modale
- Le clavier iPad cache le formulaire

### Solution

- **AdminModal.tsx** : Ajouter `max-h-[calc(100dvh-2rem)] overflow-y-auto` sur le conteneur de la modale
- Ajouter du padding-bottom supplementaire quand le clavier est actif (`visualViewport` API)
- S'assurer que le focus sur un input scrolle automatiquement l'element visible
- **CouponForm.tsx** : Passer `grid-cols-2` en `grid-cols-1 sm:grid-cols-2` pour les dates

### Composants concernes

- `src/components/admin/AdminModal.tsx` (max-height + scroll)
- `src/components/admin/CouponForm.tsx` (grid responsive dates)
- `src/components/admin/AnnouncementsClient.tsx` (formulaire creation)

---

## Chantier 4 : Date Pickers

### Probleme

Les `<input type="date">` natifs HTML sont inconsistants et peu esthetiques sur tablette/mobile. L'UX de selection de dates est mauvaise.

### Solution

- Remplacer tous les `<input type="date">` par le composant shadcn **Popover + Calendar**
- Creer un composant reutilisable `DatePickerField` wrappant Popover + Calendar + formatage
- Appliquer sur : `AnnouncementsClient.tsx`, `CouponForm.tsx`

### Composants concernes

- Creer `src/components/ui/date-picker-field.tsx`
- Modifier `src/components/admin/AnnouncementsClient.tsx`
- Modifier `src/components/admin/CouponForm.tsx`

---

## Chantier 5 : Edition Annonces & Coupons

### Probleme

On peut creer des annonces et coupons mais pas les modifier. Le texte des annonces est tronque (line-clamp).

### Solution Annonces

- Ajouter un mode edition : clic sur une annonce → modale pre-remplie avec les donnees existantes
- Le `handleSave` gere a la fois insert (create) et update (edit) selon la presence d'un `selectedAnnouncement`
- Supprimer ou augmenter le `line-clamp` pour afficher le texte complet dans les cards

### Solution Coupons

- Ajouter un mode edition : clic sur un coupon → formulaire pre-rempli
- Le `CouponForm` accepte un prop `initialData` optionnel pour le mode edition
- Le submit fait un `update` au lieu d'un `insert` quand `initialData` est present

### Composants concernes

- `src/components/admin/AnnouncementsClient.tsx` (edit mode + texte complet)
- `src/components/admin/CouponsClient.tsx` (edit mode)
- `src/components/admin/CouponForm.tsx` (accept initialData prop)

---

## Chantier 6 : Suggestions Intelligentes

### Probleme

Les suggestions sont purement manuelles. L'utilisateur veut des suggestions automatiques basees sur le menu.

### Solution

- Ajouter un bouton "Generer automatiquement" dans `SuggestionsClient.tsx`
- Algorithme local (pas d'IA externe) :
  - **Pairings** : plat principal → entree ou dessert de la meme categorie ou complementaire
  - **Upsells** : proposer un article 20-50% plus cher dans la meme categorie
  - **Alternatives** : articles similaires (meme categorie, prix proche)
- Toggle d'activation/desactivation par tenant dans les settings
- Conditionne au plan : Essentiel = suggestions manuelles uniquement, Premium = generation automatique

### Composants concernes

- `src/components/admin/SuggestionsClient.tsx` (bouton generer + toggle)
- `src/services/suggestion.service.ts` (logique de generation)
- `src/lib/plans/features.ts` (gating par plan)

---

## Chantier 7 : Cibles Tactiles & Touch

### Probleme

Le bouton toggle de la sidebar ne repond pas bien au toucher. Certains elements interactifs sont trop petits.

### Solution

- Augmenter toutes les cibles tactiles a minimum `44x44px` (norme Apple HIG / WCAG 2.5.8)
- Ajouter `touch-action: manipulation` sur les boutons principaux pour eliminer le delai 300ms
- Auditer : bouton toggle sidebar, boutons action dans les DataTable, selects, boutons filtre
- S'assurer que les `<select>` natifs ont un padding suffisant pour le tap

### Composants concernes

- `src/components/admin/AdminSidebar.tsx` (bouton toggle)
- `src/components/admin/DataTable.tsx` (boutons pagination)
- Tous les boutons `size="sm"` dans les composants admin

---

## Ordre d'execution

1. Chantier 2 (Layout/Sidebar) — fondation pour tout le reste
2. Chantier 3 (Modales) — debloque les formulaires
3. Chantier 7 (Touch) — ameliore l'interaction globale
4. Chantier 4 (Date Pickers) — remplacement composant
5. Chantier 5 (Edition CRUD) — ajout fonctionnel
6. Chantier 1 (Flux Service) — feature la plus complexe
7. Chantier 6 (Suggestions) — feature premium

## Verification

- `pnpm typecheck` — 0 erreurs
- `pnpm lint` — 0 erreurs/warnings
- `pnpm test` — 316+ tests passent
- Test manuel sur iPad 11" (ou simulateur tablette 1194x834)
- Test tactile : tous les boutons repondent au premier tap
