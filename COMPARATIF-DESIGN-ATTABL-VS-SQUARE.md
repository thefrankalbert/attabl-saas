# Comparatif Design System : ATTABL vs Square for Restaurants

**Date** : 11 avril 2026
**Objectif** : Identifier les ecarts entre le design system d'ATTABL et les standards professionnels de Square, avec focus sur la zone "Gestion multi-restaurant" (admin + client).

---

## 1. Vue d'ensemble des deux design systems

### Square for Restaurants

| Aspect           | Choix Square                                             |
| ---------------- | -------------------------------------------------------- |
| Couleur primaire | `#000000` (noir)                                         |
| Accent           | `#28c101` (vert vif) — reserve aux CTA et succes         |
| Fond             | `#FFFFFF` (blanc pur)                                    |
| Fond secondaire  | `#F5F5F5` (gris clair)                                   |
| Texte            | `#1A1A1A` primaire, `#737373` secondaire                 |
| Typographie      | Square Sans (proprio), fallback system-ui                |
| Rayon de bord    | 8px standard, 12px cartes, 24px boutons pill             |
| Ombres           | Minimales, elevation par bordure et fond                 |
| Navigation       | Sidebar fixe a gauche, breadcrumbs en haut               |
| Multi-location   | Switch centralisé en haut de sidebar, dashboard unifie   |
| Mode sombre      | Supporte (admin)                                         |
| Icones           | Ligne fine, 24px, poids uniforme                         |
| Spacing          | Grille 8px (8, 16, 24, 32, 40, 48)                       |
| Etats commandes  | Couleurs semantiques coherentes avec une palette limitee |

### ATTABL (etat actuel)

| Aspect                        | Choix ATTABL                                                           | Conforme ?             |
| ----------------------------- | ---------------------------------------------------------------------- | ---------------------- |
| Couleur primaire (admin dark) | `#0f1117` (fond), `#f0f0f0` (texte)                                    | Oui                    |
| Accent (admin dark)           | `#ccff00` (lime neon)                                                  | Oui — choix distinctif |
| Accent (admin light)          | `#4d7c0f` (olive)                                                      | Oui                    |
| Accent (tenant client)        | `#06c167` (vert UberEats)                                              | Oui                    |
| Typographie                   | system-ui, sans-serif                                                  | Acceptable             |
| Rayon de bord                 | 11 variantes (`rounded-sm` a `rounded-2xl` + inline `borderRadius: 8`) | **NON**                |
| Ombres                        | Minimales                                                              | Oui                    |
| Navigation admin              | Sidebar fixe a gauche + bottom nav mobile                              | Oui                    |
| Multi-restaurant              | Switch venue dans sidebar                                              | Partiellement          |
| Mode sombre                   | Admin uniquement                                                       | Oui                    |
| Icones                        | Lucide (ligne fine)                                                    | Oui                    |
| Spacing                       | Inconsistant (pas de grille stricte)                                   | **NON**                |
| Etats commandes               | Tokens definis (`STATUS_STYLES`) mais contournes                       | **NON**                |

---

## 2. Palette de couleurs — Contradictions

### 2.1 Couleurs d'accent : systeme vs realite

**Ce que le design system definit :**

```
Admin dark:  --app-accent: #ccff00
Admin light: --app-accent: #4d7c0f
Tenant:      --app-accent: #06c167
```

**Ce qui existe dans le code :**

| Couleur parasite | Fichier             | Ligne                | Devrait etre                           |
| ---------------- | ------------------- | -------------------- | -------------------------------------- |
| `#4ade80`        | DashboardClient.tsx | 42, 49, 50, 351, 383 | `var(--app-accent)` ou `CHART_PALETTE` |
| `#60a5fa`        | DashboardClient.tsx | 359, 391             | `CHART_PALETTE[1]`                     |
| `#f97316`        | DashboardClient.tsx | 365, 396             | `CHART_PALETTE[2]`                     |
| `#a78bfa`        | DashboardClient.tsx | 371, 397             | `CHART_PALETTE[3]`                     |
| `#22C55E`        | DashboardClient.tsx | Divers               | `var(--app-accent)`                    |
| `#F59E0B`        | DashboardDonut.tsx  | 6                    | `CHART_PALETTE[n]`                     |
| `#3B82F6`        | DashboardDonut.tsx  | 6                    | `CHART_PALETTE[n]`                     |
| `#18181b`        | OrderDetails.tsx    | 88                   | `var(--app-text)`                      |

**Analyse Square** : Square utilise une palette de graphiques limitee a 5 couleurs derivees de sa palette primaire. ATTABL a `CHART_PALETTE` (8 couleurs OKLCH perceptuellement uniformes) mais ne l'utilise pas — les graphiques du dashboard utilisent des hex hardcodes.

### 2.2 Couleurs d'etat : tokens ignores

**Ce que `design-tokens.ts` definit :**

```typescript
pending:   bg-status-warning-bg  / text-status-warning  (#d97706)
confirmed: bg-status-info-bg     / text-status-info      (#2563eb)
preparing: bg-status-info-bg     / text-status-info      (#2563eb)
ready:     bg-status-success-bg  / text-status-success   (#059669)
delivered: bg-app-elevated       / text-app-text-muted
cancelled: bg-status-error-bg    / text-status-error     (#dc2626)
```

**Ce que les composants utilisent a la place :**

| Composant                 | Couleur utilisee                        | Token ignore                                  |
| ------------------------- | --------------------------------------- | --------------------------------------------- |
| DashboardRecentOrders.tsx | `bg-blue-500/10`, `text-blue-400`       | `bg-status-info-bg`, `text-status-info`       |
| DashboardRecentOrders.tsx | `bg-emerald-500/10`, `text-emerald-400` | `bg-status-success-bg`, `text-status-success` |
| DashboardRecentOrders.tsx | `bg-amber-500/10`, `text-amber-400`     | `bg-status-warning-bg`, `text-status-warning` |
| StockHistoryClient.tsx    | Systeme de couleurs local parallele     | `STATUS_STYLES` entierement ignore            |

**Analyse Square** : Square applique une palette d'etats stricte (vert/jaune/rouge/bleu) a travers TOUTE l'interface, sans exception. Les badges, lignes de tableau, icones et notifications utilisent les memes 4 couleurs partout.

### 2.3 Tenant client — hex hardcodes vs CSS custom properties

Le theme `.tenant-client` definit des custom properties (`--app-text: #1a1a1a`, `--app-text-secondary: #737373`, etc.) mais les composants tenant les ignorent massivement :

| Composant               | Hex hardcodes                                                                                      | Variables CSS disponibles                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| BottomNav.tsx (l.10-13) | `COLORS = { primary: '#1A1A1A', background: '#FFFFFF', divider: '#EEEEEE', textMuted: '#B0B0B0' }` | `--app-text`, `--app-bg`, `--app-border`, `--app-text-muted` |
| ItemDetailSheet.tsx     | 30+ instances de `#1A1A1A`, `#737373`, `#B0B0B0`, `#FF3008`                                        | Variables CSS correspondantes                                |
| TablePicker.tsx         | 8+ instances                                                                                       | Variables CSS correspondantes                                |
| FullscreenSplash.tsx    | 5 instances                                                                                        | Variables CSS correspondantes                                |
| SearchOverlay.tsx       | 4 instances                                                                                        | Variables CSS correspondantes                                |
| InstallPrompt.tsx       | 5 instances                                                                                        | Variables CSS correspondantes                                |

**Impact** : Si un restaurateur veut personnaliser ses couleurs de marque, il faudrait modifier chaque fichier individuellement au lieu de changer une variable CSS.

---

## 3. Composants — ATTABL vs Square

### 3.1 Navigation multi-restaurant

| Aspect                | Square                                              | ATTABL                                               | Ecart                                               |
| --------------------- | --------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Switch de lieu        | Menu deroulant en haut de sidebar, toujours visible | Integre dans `AdminSidebar.tsx`, section collapsible | Mineur                                              |
| Indicateur lieu actif | Badge + nom en gras + icone check                   | Nom + accent color                                   | Manque de clarte visuelle                           |
| Gestion lieux         | Page dediee "Locations" dans settings               | Page "Etablissements" (`VenueListClient.tsx`)        | OK                                                  |
| Multi-dashboard       | Dashboard agrege + filtrable par lieu               | Un dashboard par venue, switch complet               | **Ecart majeur** — Square montre une vue consolidee |
| Permissions par lieu  | Roles granulaires par location                      | Pas de granularite visible par venue                 | **Ecart**                                           |

### 3.2 Dashboard

| Aspect             | Square                                          | ATTABL                                                   | Ecart                 |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------- | --------------------- |
| Layout             | Grid 12 colonnes, cartes blanches sur fond gris | Container queries (@container, @md:, @lg:)               | OK — approche moderne |
| Graphiques         | Palette limitee (5 couleurs), legende alignee   | Hex hardcodes, couleurs incoherentes                     | **NON CONFORME**      |
| KPIs               | Cartes avec icone + valeur + variation %        | Cartes avec valeur + variation % + sparkline             | OK                    |
| Commandes recentes | Table avec badges d'etat colores uniformement   | Badges avec couleurs arbitraires (blue-500, emerald-500) | **NON CONFORME**      |
| Scroll             | Section scrollable independante                 | `overflow-hidden` cascade bloquant le scroll (BUG-00)    | **BUG CRITIQUE**      |

### 3.3 Boutons et actions

| Aspect    | Square                                                | ATTABL                                                                        | Ecart            |
| --------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------- |
| Composant | Custom, 4 variantes (primary/secondary/outline/ghost) | shadcn/ui `<Button>` avec variantes                                           | OK en theorie    |
| Adoption  | 100% via le design system                             | 255 `<button>` natifs vs `<Button>` shadcn                                    | **NON CONFORME** |
| Taille    | 3 tailles standardisees                               | Melange de tailles ad hoc                                                     | Inconsistant     |
| Rayon     | 8px standard, pill pour certains CTA                  | `rounded-lg` (majorite) mais aussi `rounded-xl`, `rounded-md`, `rounded-full` | Inconsistant     |

### 3.4 Formulaires

| Aspect     | Square                           | ATTABL                                                         | Ecart            |
| ---------- | -------------------------------- | -------------------------------------------------------------- | ---------------- |
| Inputs     | Composant maison, style uniforme | shadcn/ui `<Input>` disponible, 44 `<input>` natifs restants   | **NON CONFORME** |
| Selects    | Composant maison                 | shadcn/ui `<Select>` disponible, 21 `<select>` natifs restants | **NON CONFORME** |
| Labels     | Style uniforme                   | shadcn/ui `<Label>` disponible, 54 `<label>` natifs restants   | **NON CONFORME** |
| Validation | Inline, sous le champ            | React Hook Form + Zod (correct)                                | OK               |

### 3.5 Tables de donnees

| Aspect      | Square                                    | ATTABL                                              | Ecart        |
| ----------- | ----------------------------------------- | --------------------------------------------------- | ------------ |
| Composant   | Table maison avec tri, filtre, pagination | `DataTable.tsx` (admin) utilise shadcn + TanStack   | OK           |
| Adoption    | 100%                                      | `DataTable` dans admin, 7 `<table>` natifs ailleurs | **Partiel**  |
| Style ligne | Hover subtil, bordure fine                | Variable selon le composant                         | Inconsistant |

---

## 4. Styles inline — Le probleme ServiceManager

Square n'utilise JAMAIS de styles inline pour la mise en page ou les couleurs — tout passe par leur systeme de tokens CSS.

**ATTABL : 64+ styles inline detectes**

Le pire contrevenant est `ServiceManager.tsx` avec 15+ styles inline :

```
style={{ gap: 2 }}
style={{ gap: isH ? 5 : 4 }}
style={{ marginBottom: 2 }}
style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
style={{ backgroundColor: 'rgba(38, 42, 56, 0.9)', borderRadius: 8, minHeight: 120 }}
style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
```

**Pourquoi c'est un probleme :**

- Impossible a overrider par le theme
- Pas de support mode clair/sombre automatique
- Les RGBA hardcodes (`rgba(255,255,255,0.02)`) ne s'adaptent pas au changement de theme
- Contourne completement Tailwind et le design system

**Autres fichiers avec styles inline dans l'admin :**

- AdminBottomNav.tsx (1)
- CategoriesClient.tsx (1)
- DataTable.tsx (1)
- DashboardClient.tsx (1)
- KitchenClient.tsx (2)

**Tenant client :** 40+ styles inline repartis sur 6 composants principaux.

---

## 5. Border-radius — L'anarchie

**Square** : 3 valeurs uniquement — `8px` (standard), `12px` (cartes), `24px` (boutons pill).

**ATTABL** : 11 variantes detectees dans les composants admin seuls :

| Classe                   | Occurrences | Equivalent px | Usage prevu                                |
| ------------------------ | ----------- | ------------- | ------------------------------------------ |
| `rounded-sm`             | 1           | 2px           | ?                                          |
| `rounded`                | ?           | 4px           | ?                                          |
| `rounded-md`             | 17          | 6px           | ?                                          |
| `rounded-lg`             | 134         | 8px           | Standard (le plus utilise)                 |
| `rounded-xl`             | 70          | 12px          | Cartes                                     |
| `rounded-2xl`            | 5           | 16px          | ?                                          |
| `rounded-full`           | 69          | 9999px        | Badges, avatars                            |
| `rounded-t/b/l/r`        | 5           | Directionnel  | Cas specifiques                            |
| `rounded-none`           | 7           | 0px           | Cas specifiques                            |
| Inline `borderRadius: 8` | 1           | 8px           | ServiceManager (devrait etre `rounded-lg`) |

**Recommandation** : Limiter a 4 valeurs comme Square :

- `rounded-md` (6px) pour les petits elements (badges, chips)
- `rounded-lg` (8px) pour les boutons et inputs
- `rounded-xl` (12px) pour les cartes et modales
- `rounded-full` pour les avatars et indicateurs circulaires

---

## 6. Spacing et grille

**Square** : Grille stricte de 8px. Tous les espacements sont des multiples de 8 (8, 16, 24, 32, 40, 48, 64).

**ATTABL** : Utilise Tailwind spacing (base 4px) mais sans discipline :

| Pattern detecte                                      | Equivalent               | Probleme                                        |
| ---------------------------------------------------- | ------------------------ | ----------------------------------------------- |
| `p-2` + `p-3` + `p-4` sur des composants similaires  | 8px / 12px / 16px        | Padding inconsistant pour le meme type de carte |
| `gap-2` / `gap-3` / `gap-4` / `gap-5` sur des listes | 8px / 12px / 16px / 20px | Pas de convention par type de liste             |
| `space-y-4` / `space-y-6` / `space-y-8`              | 16px / 24px / 32px       | Arbitraire selon le composant                   |
| `mb-2` / `mb-4` / `mb-6` sur les headings            | 8px / 16px / 24px        | Pas de regle par niveau de heading              |
| Inline `style={{ gap: 2 }}`                          | 2px (!)                  | Casse completement la grille                    |

**Recommandation** : Adopter une echelle Tailwind restreinte :

- `gap-2` (8px) entre elements d'une meme section
- `gap-4` (16px) entre sections
- `gap-6` (24px) entre blocs majeurs
- `p-4` (16px) padding standard des cartes
- `p-6` (24px) padding des pages

---

## 7. Zone critique : Gestion multi-restaurant

C'est la zone ou les ecarts avec Square sont les plus visibles.

### 7.1 AdminSidebar — Switch d'etablissement

**Square** : Le nom du restaurant actif est en haut de la sidebar, toujours visible. Un clic ouvre un dropdown avec tous les etablissements, chacun montrant son statut (ouvert/ferme) avec un badge colore.

**ATTABL** : Le switch est dans `AdminSidebar.tsx` sous forme de section collapsible. Les QR codes utilisent des hex hardcodes (`#ffffff`, `#000000` — lignes 309, 310, 327, 328) au lieu de variables, ce qui est acceptable pour un QR code mais le pattern devrait etre documente.

### 7.2 Dashboard unifie vs cloisonne

**Square** : Un seul dashboard avec filtres par lieu. Les KPIs montrent "Tous les etablissements" par defaut et on peut filtrer.

**ATTABL** : Chaque venue a son propre dashboard. Pas de vue consolidee. C'est un ecart fonctionnel majeur pour les gerants multi-sites.

### 7.3 ServiceManager — Le composant le plus problematique

`ServiceManager.tsx` est le coeur de la gestion du service en salle. C'est aussi le composant le plus eloigne du design system :

| Probleme                  | Detail                                                                           |
| ------------------------- | -------------------------------------------------------------------------------- |
| 15+ styles inline         | `backgroundColor`, `gap`, `borderBottom`, `borderRadius` en dur                  |
| RGBA hardcodes            | `rgba(255,255,255,0.02)`, `rgba(255,255,255,0.05)`, `rgba(38,42,56,0.9)`         |
| Pas de support light mode | Les RGBA blanc sur fond sombre ne fonctionnent pas en mode clair                 |
| Contourne Tailwind        | Devrait utiliser `bg-app-card`, `border-app-border`, `rounded-lg`, `gap-1`, etc. |

### 7.4 Gestion du stock

`StockHistoryClient.tsx` cree un systeme de couleurs parallele au lieu d'importer `STATUS_STYLES` de `design-tokens.ts`. Chaque statut de stock a ses propres classes definies localement, ce qui cree une deuxieme source de verite pour les couleurs d'etat.

---

## 8. Synthese des contradictions

### Contradictions critiques (a corriger en priorite)

| #   | Contradiction                                                               | Impact                                           | Fichiers concernes                                 |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| 1   | Graphiques dashboard utilisent des hex hardcodes au lieu de `CHART_PALETTE` | Couleurs inconsistantes, pas de support theme    | DashboardClient.tsx (l.42-397), DashboardDonut.tsx |
| 2   | Badges de statut ignorent `STATUS_STYLES`                                   | Double source de verite pour les couleurs d'etat | DashboardRecentOrders.tsx, StockHistoryClient.tsx  |
| 3   | ServiceManager contourne tout le design system (15+ inline styles)          | Pas de support light mode, pas maintenable       | ServiceManager.tsx                                 |
| 4   | 255 `<button>` natifs au lieu de `<Button>` shadcn                          | Design inconsistant a travers l'app              | 50+ fichiers (voir AUDIT-UI-CONSISTENCY.md)        |
| 5   | Composants tenant hardcodent les couleurs au lieu d'utiliser les CSS vars   | Impossible de personnaliser par tenant           | ItemDetailSheet, BottomNav, TablePicker, etc.      |

### Contradictions moderees

| #   | Contradiction                                    | Impact                                 |
| --- | ------------------------------------------------ | -------------------------------------- |
| 6   | 11 variantes de border-radius (Square en a 3)    | Manque de cohesion visuelle            |
| 7   | Spacing arbitraire (pas de grille 8px stricte)   | Mises en page legerement desalignees   |
| 8   | 44 `<input>`, 21 `<select>`, 54 `<label>` natifs | Formulaires visuellement inconsistants |
| 9   | Pas de dashboard consolide multi-venue           | Ecart fonctionnel vs Square            |
| 10  | Styles inline sur RGBA dans admin (24 instances) | Pas de support automatique dark/light  |

### Ce qui est bien fait (a preserver)

| Aspect                      | Detail                                                                |
| --------------------------- | --------------------------------------------------------------------- |
| Theme CSS custom properties | Systeme bien structure (dark/light/tenant) dans globals.css           |
| Design tokens               | `STATUS_STYLES` et `CHART_PALETTE` bien definis dans design-tokens.ts |
| Sidebar navigation          | Structure proche de Square, switch venue integre                      |
| Container queries           | Approche moderne pour le dashboard responsive                         |
| Icones Lucide               | Coherentes, ligne fine, comme Square                                  |
| shadcn/ui installe          | 42 composants disponibles — le systeme existe, il est sous-utilise    |

---

## 9. Plan de correction recommande

### Phase 1 — Fondations (eliminer les doubles sources de verite)

1. **Graphiques** : Remplacer tous les hex hardcodes dans DashboardClient.tsx et DashboardDonut.tsx par `CHART_PALETTE` de design-tokens.ts
2. **Badges de statut** : Migrer DashboardRecentOrders.tsx et StockHistoryClient.tsx vers `STATUS_STYLES`
3. **ServiceManager** : Remplacer les 15 styles inline par des classes Tailwind semantiques

### Phase 2 — Composants (adopter shadcn/ui partout)

4. **Boutons** : Migrer les 255 `<button>` natifs vers `<Button>` (voir AUDIT-UI-CONSISTENCY.md pour la liste complete)
5. **Formulaires** : Migrer `<input>`, `<select>`, `<textarea>`, `<label>` natifs
6. **Tables** : Migrer les 7 `<table>` natifs restants

### Phase 3 — Tenant (theming dynamique)

7. **CSS vars** : Remplacer les hex hardcodes dans les composants tenant par `var(--app-*)` ou classes Tailwind semantiques
8. **Supprimer les COLORS locaux** : Eliminer les objets de couleurs locaux (ex: `COLORS` dans BottomNav.tsx)

### Phase 4 — Standardisation

9. **Border-radius** : Limiter a 4 valeurs (`rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full`)
10. **Spacing** : Documenter une echelle restreinte et l'appliquer

---

_Document genere par analyse statique du code source ATTABL + recherche sur Square for Restaurants._
_Tous les chemins de fichiers et numeros de ligne sont exacts au 11 avril 2026._
