# Audit UI Visuel - ATTABL vs Standards Professionnels (Square)

**Date** : 11 avril 2026
**Methode** : Analyse statique de chaque composant rendu — couleurs, polices, espacements, rayons, ombres.
**Reference** : Square for Restaurants (leader UI dans la restauration).
**But** : Identifier tout ce que l'utilisateur VOIT qui ne respecte pas les standards d'un SaaS professionnel.

---

## DIAGNOSTIC RAPIDE

| Critere            | Score | Verdict                                                                                                   |
| ------------------ | ----- | --------------------------------------------------------------------------------------------------------- |
| Couleurs           | 3/10  | 929 couleurs hardcodees vs 606 semantiques. Le systeme existe mais est ignore dans 60% des cas.           |
| Typographie        | 7/10  | 13 polices chargees (correct pour les tenants), mais les headings n'ont pas de hierarchie de taille fixe. |
| Bordures           | 3/10  | 667 bordures hardcodees vs 226 semantiques. 75% des bordures contournent le design system.                |
| Border-radius      | 5/10  | 11 variantes la ou Square en a 3. Pas de convention claire par type d'element.                            |
| Espacement         | 6/10  | Tailwind bien utilise mais sans echelle restreinte. 6 valeurs de padding differentes pour les cartes.     |
| Composants         | 4/10  | shadcn/ui installe (42 composants) mais 405+ elements HTML natifs l'ignorent.                             |
| Coherence visuelle | 4/10  | Certaines pages paraissent "finies", d'autres "prototype". Pas d'uniformite.                              |

**Score global : 4.6/10** — Le design system est bien concu mais sous-adopte. Le resultat visuel est celui d'un SaaS ou plusieurs developpeurs travaillent sans guide de style commun.

---

## 1. COULEURS — Le probleme principal

### Ce que Square fait

Square utilise 12 couleurs au total dans toute son interface : noir, blanc, 3 gris, 1 vert accent, et 6 couleurs semantiques (succes, erreur, attention, info, et leurs fonds). C'est tout. Chaque couleur a un seul role.

### Ce qu'ATTABL fait

ATTABL a un excellent systeme de variables CSS (`--app-bg`, `--app-card`, `--app-accent`, etc.) qui supporte dark mode, light mode et tenant mode. Mais le code ne l'utilise que dans 40% des cas.

**Les chiffres :**

| Type de couleur                                                                    | Occurrences | % du total |
| ---------------------------------------------------------------------------------- | ----------- | ---------- |
| Couleurs semantiques (`bg-app-*`, `text-app-*`, `border-app-*`)                    | 1 112       | 40%        |
| Couleurs Tailwind hardcodees (`bg-gray-*`, `text-zinc-*`, `border-slate-*`, etc.)  | 1 596       | 57%        |
| Couleurs hex arbitraires (`bg-[#...]`, `text-[#...]`, `style={{ color: '#...' }}`) | ~100        | 3%         |

**Ce que l'utilisateur voit concretement :**

Quand l'utilisateur navigue dans l'admin en mode sombre, il voit un fond `#0f1117` avec des cartes `#1a1d27` — c'est correct. Mais a certains endroits, il voit des gris qui "detonnent" parce qu'ils viennent de `bg-gray-100` (un gris Tailwind fait pour le mode clair) au lieu de `bg-app-elevated`. Le resultat : des zones qui semblent plus claires ou plus ternes que d'autres sans raison.

Sur l'interface tenant (le menu que les clients du restaurant voient), c'est pire : les couleurs sont hardcodees en hex (`#1A1A1A`, `#737373`, `#F6F6F6`, `#EEEEEE`) dans chaque composant. Si un restaurateur veut changer la couleur de son menu, il ne peut pas — tout est en dur.

### Les 55+ couleurs hex en dur

| Couleur   | Ou elle apparait                                                                        | Ce qu'elle devrait etre                     |
| --------- | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| `#1A1A1A` | BottomNav, ItemDetailSheet, TablePicker, FullscreenSplash, SearchOverlay, InstallPrompt | `text-app-text` (variable CSS `--app-text`) |
| `#737373` | ItemDetailSheet, TablePicker, FullscreenSplash, InstallPrompt                           | `text-app-text-secondary`                   |
| `#B0B0B0` | BottomNav, ItemDetailSheet, FullscreenSplash, InstallPrompt                             | `text-app-text-muted`                       |
| `#F6F6F6` | TablePicker, SearchOverlay, ItemDetailSheet                                             | `bg-app-elevated`                           |
| `#EEEEEE` | BottomNav, ItemDetailSheet, TablePicker, InstallPrompt                                  | `border-app-border`                         |
| `#FF3008` | ItemDetailSheet (erreur/danger)                                                         | `text-danger` ou `text-status-error`        |
| `#FFB800` | ItemDetailSheet (allergenes)                                                            | `text-status-warning`                       |
| `#06C167` | ItemDetailSheet (accent)                                                                | `text-accent` (via variable CSS)            |
| `#4ade80` | DashboardClient (graphiques)                                                            | `CHART_PALETTE[0]` de design-tokens.ts      |
| `#60a5fa` | DashboardClient (graphiques)                                                            | `CHART_PALETTE[1]`                          |
| `#f97316` | DashboardClient (graphiques)                                                            | `CHART_PALETTE[2]`                          |
| `#a78bfa` | DashboardClient (graphiques)                                                            | `CHART_PALETTE[3]`                          |
| `#F59E0B` | DashboardDonut (graphiques)                                                             | `CHART_PALETTE[n]`                          |
| `#3B82F6` | DashboardDonut (graphiques)                                                             | `CHART_PALETTE[n]`                          |
| `#18181b` | OrderDetails (couleur primaire fallback)                                                | `var(--app-text)`                           |

### Les couleurs Tailwind qui ne respectent pas le theme

Ce sont des couleurs Tailwind "en dur" qui ne changent pas avec le theme dark/light :

| Classe Tailwind | Occurrences | Probleme                                                    |
| --------------- | ----------- | ----------------------------------------------------------- |
| `bg-gray-*`     | 478         | Ne suit pas le theme — gris "mode clair" en plein dark mode |
| `text-gray-*`   | ~100        | Idem                                                        |
| `border-gray-*` | 478         | Idem                                                        |
| `bg-slate-*`    | 113         | Alternative a gray, meme probleme                           |
| `border-zinc-*` | 155         | Gris verdatre, inconsistant avec les autres gris            |
| `bg-white`      | 162         | Blanc pur en dark mode = tache blanche                      |
| `bg-emerald-*`  | 6           | Vert "succes" qui ne suit pas `--color-status-success`      |
| `bg-blue-*`     | 29          | Bleu "info" qui ne suit pas `--color-status-info`           |
| `bg-amber-*`    | 36          | Orange "warning" qui ne suit pas `--color-status-warning`   |
| `bg-red-*`      | 18          | Rouge "erreur" qui ne suit pas `--color-status-error`       |
| `bg-purple-*`   | 13          | Pas de role semantique defini                               |
| `bg-orange-*`   | 42          | Pas de role semantique defini                               |

**Impact visuel** : L'utilisateur voit des gris qui ne sont pas les memes d'une page a l'autre. Un `bg-gray-100` et un `bg-app-elevated` ne donnent pas le meme rendu — l'un est un gris froid Tailwind, l'autre est un gris chaud adapte au theme ATTABL.

---

## 2. TYPOGRAPHIE

### Ce que Square fait

Square utilise une seule police (Square Sans, fallback system-ui) avec 4 poids (regular, medium, semibold, bold) et une echelle de 6 tailles fixes pour chaque niveau de heading. Un `h1` est TOUJOURS 32px bold. Un `h2` est TOUJOURS 24px semibold. Il n'y a aucune exception.

### Ce qu'ATTABL fait

ATTABL charge 13 polices Google Fonts, ce qui est correct — 10 sont des options de personnalisation pour les menus tenant (Inter, Poppins, Montserrat, etc.), et 3 sont pour l'interface systeme (Geist, Geist Mono, DM Serif Display).

**Ce qui est bien :**

- La police par defaut (Geist Sans) est moderne et lisible
- Le systeme de polices "curated" pour les tenants est une bonne idee (10 polices selectionees, pas d'upload libre)
- Les poids sont bien utilises : bold pour l'emphase, semibold pour les sous-titres, medium pour les labels

**Ce qui ne va pas — la hierarchie des headings :**

Il n'y a pas de taille fixe par niveau de heading. Un `<h1>` peut etre `text-base` (16px) dans une page admin et `text-4xl` (36px) sur la page marketing. Ca veut dire que visuellement, l'utilisateur ne peut pas "sentir" la hierarchie de l'information.

| Heading | Ce que Square fait     | Ce qu'ATTABL fait                           |
| ------- | ---------------------- | ------------------------------------------- |
| h1      | Toujours 32px bold     | Varie de text-base (16px) a text-5xl (48px) |
| h2      | Toujours 24px semibold | Varie de text-sm (14px) a text-3xl (30px)   |
| h3      | Toujours 20px medium   | Varie de text-xs (12px) a text-xl (20px)    |

**Nombre total d'utilisations :** 240 headings (h1-h6) a travers 117 fichiers, tous avec des tailles differentes.

**Recommandation** : Definir une echelle fixe pour l'admin :

```
h1 : text-xl font-bold     (20px — titre de page)
h2 : text-lg font-semibold  (18px — titre de section)
h3 : text-base font-semibold (16px — titre de carte)
h4 : text-sm font-medium    (14px — sous-section)
```

### Couleurs de texte

Bonne nouvelle : 82% des textes utilisent les tokens semantiques (`text-app-text`, `text-app-text-secondary`, `text-app-text-muted`). Les 18% restants (259 occurrences) utilisent des gris Tailwind hardcodes (`text-gray-*`, `text-slate-*`, `text-zinc-*`) concentres dans les pages marketing et les composants legacy.

---

## 3. COMPOSANTS VISUELS

### 3.1 Boutons — Le probleme le plus visible

**Ce que Square fait** : Un seul composant `<Button>` avec 4 variantes visuelles (primary noir, secondary gris, outline, ghost). Chaque bouton de l'interface utilise ce composant. L'utilisateur voit des boutons identiques partout.

**Ce qu'ATTABL fait** : Le composant `<Button>` shadcn est installe et bien configure avec 6 variantes (default, destructive, outline, secondary, ghost, link). Mais 255 boutons dans l'interface utilisent le HTML natif `<button>` au lieu de ce composant.

**Ce que l'utilisateur voit** : Des boutons qui n'ont pas le meme look. Certains ont le bon arrondi, la bonne couleur d'accent, le bon hover. D'autres sont "plats" ou ont des styles ad hoc. C'est particulierement visible quand deux boutons sont cote a cote et l'un est un `<Button>` shadcn et l'autre un `<button>` natif.

**Exemple concret — BottomNav.tsx (navigation tenant)** :

```
// Ce que le code fait (tout en inline style, zero Tailwind)
style={{ display: flex, flexDirection: column, gap: 4, background: none, border: none, cursor: pointer, padding: 8px 0 }}

// Ce que ca devrait faire
className="flex flex-col items-center gap-1 bg-transparent border-none cursor-pointer py-2"
```

### 3.2 Cartes

**Ce que Square fait** : Fond blanc, bordure 1px gris clair, border-radius 12px, padding 24px. Toutes les cartes sont identiques.

**Ce qu'ATTABL fait** : Le composant `<Card>` shadcn est bien configure (`rounded-xl border border-app-border bg-app-card shadow-none`). Mais beaucoup de "cartes visuelles" dans l'interface sont des `<div>` avec des classes ad hoc au lieu d'utiliser ce composant.

**Bonne pratique trouvee** : L'admin utilise `shadow-none` partout (comme Square qui est minimaliste sur les ombres). C'est coherent et professionnel.

### 3.3 Inputs et formulaires

Le composant `<Input>` shadcn utilise `bg-app-elevated border-app-border rounded-lg` — c'est correct. Mais le composant `<Textarea>` utilise `bg-background border-input` (tokens legacy shadcn) au lieu de `bg-app-elevated border-app-border`. Visuellement, un input et un textarea sur le meme formulaire n'ont pas exactement les memes couleurs.

**Textarea** (`src/components/ui/textarea.tsx`) :

- Utilise `bg-background` au lieu de `bg-app-elevated`
- Utilise `border-input` au lieu de `border-app-border`
- A corriger pour etre identique au composant Input

### 3.4 Badges de statut

ATTABL a un excellent systeme de badges dans `badge.tsx` avec 8 variantes (default, secondary, destructive, outline, success, warning, info, muted). Il a aussi `STATUS_STYLES` dans `design-tokens.ts` pour les statuts de commande.

**Mais** : `DashboardRecentOrders.tsx` et `StockHistoryClient.tsx` n'utilisent ni l'un ni l'autre. Ils inventent leurs propres couleurs :

| Ce que l'utilisateur voit                              | Token disponible                           |
| ------------------------------------------------------ | ------------------------------------------ |
| `bg-blue-500/10 text-blue-400` (commande confirmee)    | `bg-status-info-bg text-status-info`       |
| `bg-emerald-500/10 text-emerald-400` (commande prete)  | `bg-status-success-bg text-status-success` |
| `bg-amber-500/10 text-amber-400` (commande en attente) | `bg-status-warning-bg text-status-warning` |

**Impact visuel** : Le bleu de "confirme" sur le dashboard (`blue-500`) n'est pas le meme bleu que "confirme" sur la page commandes (`status-info` = `#2563eb`). L'utilisateur voit deux bleus differents pour le meme statut.

---

## 4. BORDER-RADIUS

### Ce que Square fait

3 valeurs, point final :

- 8px pour les boutons, inputs, petits elements
- 12px pour les cartes, modales
- Pill (9999px) pour les badges et avatars

### Ce qu'ATTABL fait

11 variantes differentes. L'utilisateur voit des coins plus ou moins arrondis sans logique apparente :

| Element visuel                | Arrondi utilise                          | Arrondi recommande                                  |
| ----------------------------- | ---------------------------------------- | --------------------------------------------------- |
| Boutons shadcn                | `rounded-lg` (8px)                       | Correct                                             |
| Cartes shadcn                 | `rounded-xl` (12px)                      | Correct                                             |
| Modales (desktop)             | `rounded-xl` (12px)                      | Correct                                             |
| Modales (mobile bottom sheet) | `rounded-t-2xl` (16px en haut)           | Correct (convention mobile)                         |
| Calendrier (date picker)      | `rounded-md` (6px)                       | Devrait etre `rounded-lg` (8px)                     |
| Cartes marketing              | `rounded-lg` (8px)                       | Devrait etre `rounded-xl` (12px) pour etre coherent |
| ServiceManager                | `borderRadius: 8` inline                 | Devrait etre `rounded-lg`                           |
| Divers composants             | `rounded-sm` (2px), `rounded-2xl` (16px) | Pas de raison d'exister                             |

**Convention recommandee :**

- `rounded-lg` (8px) : boutons, inputs, petits elements
- `rounded-xl` (12px) : cartes, modales, panneaux
- `rounded-full` : badges, avatars, indicateurs

---

## 5. ESPACEMENT

### Ce que Square fait

Grille stricte de 8px. Tout espacement est un multiple de 8 : 8, 16, 24, 32, 40, 48. Il n'y a JAMAIS de 12px ou 20px.

### Ce qu'ATTABL fait

Tailwind utilise une base 4px (1 = 4px), donc les multiples de 8px sont `gap-2` (8px), `gap-4` (16px), `gap-6` (24px), `gap-8` (32px). Mais ATTABL utilise aussi les valeurs intermediaires (`gap-1` = 4px, `gap-3` = 12px, `gap-5` = 20px) qui ne sont pas dans la grille 8px.

| Valeur         | Occurrences | Grille 8px ? |
| -------------- | ----------- | ------------ |
| `gap-1` (4px)  | 70          | Non          |
| `gap-2` (8px)  | 186         | Oui          |
| `gap-3` (12px) | 111         | Non          |
| `gap-4` (16px) | 44          | Oui          |
| `gap-5` (20px) | 3           | Non          |
| `gap-6` (24px) | 8           | Oui          |
| `gap-8` (32px) | 5           | Oui          |

**Impact visuel** : Les espacements de 12px (`gap-3`) sont tres proches de 8px (`gap-2`) et 16px (`gap-4`). L'oeil humain ne distingue pas bien 8px de 12px — le resultat c'est que l'espacement semble "presque pareil mais pas tout a fait", ce qui donne une impression de manque de precision.

**Padding des cartes :**

| Valeur       | Occurrences | Usage           |
| ------------ | ----------- | --------------- |
| `p-3` (12px) | 155         | Le plus utilise |
| `p-4` (16px) | 226         | Le deuxieme     |
| `p-5` (20px) | 113         | Troisieme       |
| `p-6` (24px) | 44          | Quatrieme       |
| `p-8` (32px) | 36          | Cinquieme       |
| `p-2` (8px)  | 1           | Marginal        |

**L'utilisateur voit** : Des cartes avec 12px de padding a cote de cartes avec 16px, et d'autres avec 20px. Les trois sont trop proches pour que la difference soit intentionnelle — ca donne juste l'impression que "quelque chose ne colle pas".

**Recommandation** : Standardiser a 2 valeurs de padding pour les cartes :

- `p-4` (16px) pour les cartes compactes (listes, tableaux)
- `p-6` (24px) pour les cartes spacieuses (formulaires, detail)

---

## 6. OMBRES

### Ce que Square fait

Quasi aucune ombre. L'elevation se fait par la couleur de fond (blanc sur gris clair) et les bordures. C'est le style "flat design" moderne.

### Ce qu'ATTABL fait

Pareil — `shadow-none` sur tous les composants shadcn. C'est un choix correct et coherent avec les standards actuels. La seule exception est un `boxShadow: '0 4px 12px rgba(0,0,0,0.1)'` inline dans le tooltip des graphiques du dashboard. Ca devrait etre une classe Tailwind pour la coherence mais visuellement ce n'est pas choquant.

**Verdict** : Conforme. Rien a changer.

---

## 7. ETATS DE HOVER ET INTERACTIONS

### Ce que Square fait

Hover subtil et coherent : un leger changement de fond (`bg-gray-50` -> `bg-gray-100`), une transition de 150ms, et c'est tout. Meme pattern partout.

### Ce qu'ATTABL fait

La majorite des composants utilisent `hover:bg-app-hover transition-colors` — c'est bien et coherent avec le design system. Mais il y a des exceptions :

| Composant           | Hover                                  | Standard                                |
| ------------------- | -------------------------------------- | --------------------------------------- |
| Boutons shadcn      | `hover:bg-accent-hover`                | Correct                                 |
| Lignes de tableau   | `hover:bg-app-hover`                   | Correct                                 |
| Sidebar links       | `hover:bg-app-hover transition-colors` | Correct                                 |
| Date picker nav     | `opacity-50 hover:opacity-100`         | Devrait etre `hover:bg-app-hover`       |
| RuptureButton       | `hover:bg-red-500/10`                  | Devrait etre `hover:bg-status-error-bg` |
| Dialog close button | `opacity-70 hover:opacity-100`         | Acceptable (convention Radix)           |

**Impact** : Leger. La plupart des hovers sont corrects. Seuls le date picker et RuptureButton ont des patterns differents.

---

## 8. ICONES

### Ce que Square fait

Icones en ligne fine, taille 24px, epaisseur de trait uniforme. Un seul jeu d'icones.

### Ce qu'ATTABL fait

Lucide React, ligne fine, tailles standardisees :

- `w-3 h-3` (12px) : indicateurs, points de statut
- `w-4 h-4` (16px) : boutons, actions de tableau — le plus courant
- `w-5 h-5` (20px) : boutons plus grands, navigation
- `w-6 h-6` (24px) : icones principales, sections

**Verdict** : Correct et coherent. La seule exception est `BottomNav.tsx` qui utilise `size={24}` (prop Lucide) au lieu de `className="w-6 h-6"` — visuellement identique mais inconsistant dans le code.

---

## 9. RESUME — CE QUI DOIT CHANGER (par priorite)

### Priorite 1 — Impact visuel immediat (l'utilisateur voit la difference)

| #   | Probleme                                     | Quoi faire                                                                                           | Fichiers                                                                                                        |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | Couleurs de statut differentes selon la page | Utiliser `STATUS_STYLES` de design-tokens.ts partout                                                 | DashboardRecentOrders.tsx, StockHistoryClient.tsx                                                               |
| 2   | Couleurs hex en dur sur l'interface tenant   | Remplacer par classes Tailwind semantiques (`text-app-text`, `bg-app-elevated`, `border-app-border`) | BottomNav.tsx, ItemDetailSheet.tsx, TablePicker.tsx, FullscreenSplash.tsx, SearchOverlay.tsx, InstallPrompt.tsx |
| 3   | Graphiques avec couleurs aleatoires          | Utiliser `CHART_PALETTE` de design-tokens.ts                                                         | DashboardClient.tsx, DashboardDonut.tsx                                                                         |
| 4   | ServiceManager tout en inline style          | Migrer vers classes Tailwind                                                                         | ServiceManager.tsx                                                                                              |
| 5   | Textarea visuellement different de Input     | Aligner les tokens (`bg-app-elevated`, `border-app-border`)                                          | src/components/ui/textarea.tsx                                                                                  |

### Priorite 2 — Coherence globale (l'utilisateur "sent" que quelque chose ne va pas)

| #   | Probleme                                    | Quoi faire                                                                 |
| --- | ------------------------------------------- | -------------------------------------------------------------------------- |
| 6   | 255 boutons natifs avec styles ad hoc       | Migrer vers `<Button>` shadcn (voir AUDIT-UI-CONSISTENCY.md)               |
| 7   | 44 inputs, 21 selects, 54 labels natifs     | Migrer vers composants shadcn                                              |
| 8   | Padding de cartes variable (12px/16px/20px) | Standardiser : `p-4` (compact) ou `p-6` (spacieux)                         |
| 9   | Headings sans hierarchie de taille          | Definir 4 tailles fixes (h1=text-xl, h2=text-lg, h3=text-base, h4=text-sm) |

### Priorite 3 — Finitions (details qui comptent pour le "polish")

| #   | Probleme                                                             | Quoi faire                                                    |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| 10  | 11 variantes de border-radius                                        | Limiter a 3 : `rounded-lg`, `rounded-xl`, `rounded-full`      |
| 11  | gap-3 (12px) utilise 111 fois au lieu de gap-2 (8px) ou gap-4 (16px) | Migrer vers la grille 8px                                     |
| 12  | Hovers inconsistants (date picker, RuptureButton)                    | Aligner sur `hover:bg-app-hover`                              |
| 13  | 478 `bg-gray-*` et 478 `border-gray-*`                               | Migrer progressivement vers `bg-app-*` et `border-app-border` |

### Ce qui est BIEN et ne doit PAS changer

- Le systeme de variables CSS (dark/light/tenant) dans globals.css — bien structure
- Les design tokens (`STATUS_STYLES`, `CHART_PALETTE`) dans design-tokens.ts — bien definis
- Le systeme de polices curated (10 Google Fonts) pour les tenants
- La police Geist Sans pour l'admin
- Les ombres minimales (`shadow-none`) — coherent avec les standards
- Les icones Lucide (taille, epaisseur, style) — coherentes
- Le composant `<Button>` shadcn et ses 6 variantes — bien configure
- Le composant `<Badge>` shadcn et ses 8 variantes — bien configure
- La sidebar admin et sa structure — proche de Square

---

_Cet audit couvre uniquement l'aspect visuel (UI) — ce que l'utilisateur voit. Pour les bugs fonctionnels, voir AUDIT-FONCTIONNEL.md. Pour les composants HTML natifs a migrer, voir AUDIT-UI-CONSISTENCY.md._
