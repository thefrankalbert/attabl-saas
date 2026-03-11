# ATTABL — Audit Responsive Design

**Diagnostic complet + Plan d'action | Mars 2026**

---

## 1. Diagnostic : pourquoi le responsive casse

Après analyse complète du codebase ATTABL, j'ai identifié la cause racine de tes problèmes de responsive. Ce n'est pas un problème de technologie — tes fondations sont solides. C'est un problème de **patterns répétés dans le code** qui créent des régressions à chaque itération.

### 1.1 Ce qui marche déjà bien

- **Layout admin 3 niveaux :** mobile (bottom nav) / tablette (sidebar collapsed) / desktop (sidebar expanded) — c'est exactement le pattern de Linear et Notion.
- **h-dvh :** hauteur dynamique qui gère la barre de navigation mobile Safari/Chrome.
- **min-w-0 sur les flex children :** empêche le débordement classique des conteneurs flex.
- **Dialog responsive :** bottom-sheet sur mobile, modal centrée sur desktop — comme Stripe Dashboard.
- **DeviceContext avec matchMedia :** détection JS des breakpoints, pas juste CSS.
- **Safe area insets :** gestion du notch iPhone avec env(safe-area-inset-\*).

### 1.2 Les 5 problèmes qui cassent tout

| #   | Problème                              | Impact                                              | Occurrences  | Sévérité     |
| --- | ------------------------------------- | --------------------------------------------------- | ------------ | ------------ |
| 1   | Largeurs en pixels fixes (w-[Xpx])    | Conteneurs débordent quand la sidebar change d'état | 84 instances | **CRITIQUE** |
| 2   | Grilles sans breakpoints tablette     | Saut de 2 à 4 colonnes sans transition              | 38 grilles   | **HAUTE**    |
| 3   | Tables sans scroll horizontal         | Page entière scrolle horizontalement sur mobile     | 6 tables     | **HAUTE**    |
| 4   | Pas de max-width sur le contenu admin | Contenu s'étire sur 3840px sur écran 4K             | Pages admin  | **MOYENNE**  |
| 5   | min-w-[Xpx] sur petits écrans         | Boutons et nav débordent sur iPhone SE              | 41 instances | **BASSE**    |

### 1.3 Pourquoi ça casse à chaque itération

Le cycle de régression est toujours le même :

- **Le développeur code sur desktop (1440px) :** il met `w-[600px]` sur un formulaire. Ça marche.
- **Un utilisateur tablette (768px) ouvre la page :** sidebar (256px) + contenu (512px). Le formulaire de 600px déborde.
- **L'utilisateur toggle la sidebar :** l'espace passe de 512px à 768px. Le layout ne s'adapte pas car `w-[600px]` est fixe.
- **Sur mobile (375px) :** la sidebar est cachée, donc 375px de large. Le formulaire de 600px déborde complètement.

C'est exactement ce que les **media queries classiques ne peuvent pas résoudre**. Elles réagissent à la taille du navigateur, pas à la taille réelle du conteneur parent.

---

## 2. La solution : Container Queries

Ce n'est pas un gadget CSS expérimental. Les Container Queries sont supportées par tous les navigateurs depuis 2023 (Chrome 105+, Firefox 110+, Safari 16+) et sont utilisées en production par les SaaS modernes.

### 2.1 Media Queries vs Container Queries

|                      | Media Queries (actuel)                                     | Container Queries (solution)                             |
| -------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| **Réagit à**         | Taille du navigateur (viewport)                            | Taille du conteneur parent                               |
| **Problème sidebar** | Ne détecte pas le changement d'espace quand sidebar toggle | S'adapte automatiquement à l'espace disponible           |
| **Composants**       | Même composant, comportement différent selon la page       | Composant s'adapte tout seul peu importe où il est placé |
| **Tablettes**        | Faut gérer chaque taille manuellement                      | Le composant se reconfigure seul                         |
| **Tailwind v4**      | `sm:` `md:` `lg:` `xl:`                                    | `@sm:` `@md:` `@lg:` `@xl:` (natif, pas de plugin)       |

### 2.2 Tailwind v4 : support natif

Tu es déjà sur Tailwind v4. Les Container Queries sont intégrées nativement, sans plugin :

**Déclarer un conteneur :**

```jsx
<div className="@container">
  <div className="@sm:flex-row @lg:grid-cols-3">
    {/* S'adapte à la taille du PARENT, pas du viewport */}
  </div>
</div>
```

**Breakpoints disponibles (Tailwind v4) :**

| Variant           | Min-width      | Cas d'usage                           |
| ----------------- | -------------- | ------------------------------------- |
| `@xs:`            | 320px          | Widget dans sidebar très étroite      |
| `@sm:`            | 384px          | Carte dans grille, colonne de sidebar |
| `@md:`            | 448px          | Section de formulaire                 |
| `@lg:`            | 512px          | Zone principale avec sidebar visible  |
| `@xl:`            | 576px          | Zone de contenu large                 |
| `@2xl:` à `@7xl:` | 672px à 1280px | Layouts complexes, dashboards         |

### 2.3 Approche hybride (ce que font les vrais SaaS)

Les SaaS comme Linear, Notion et Vercel ne font pas du 100% media queries ni du 100% container queries. Ils utilisent une **approche hybride** :

- **Media queries (`sm:` `md:` `lg:`)** : pour les layouts de page — afficher/masquer la sidebar, changer le nombre de colonnes de la grille principale, passer d'un header à un bottom nav.
- **Container queries (`@sm:` `@md:` `@lg:`)** : pour les composants — cartes, tableaux, formulaires, widgets de stats. Tout ce qui peut être placé dans différents contextes.

Concrètement pour ATTABL, ton `AdminLayoutClient.tsx` avec le système sidebar/bottom-nav **garde ses media queries**. Mais les composants à l'intérieur (cartes de stats, formulaires de menu, tableaux de commandes) **passent en container queries**.

---

## 3. Plan d'action : migration en 3 phases

### Phase 1 : Corrections immédiates (1-2 jours)

Ces corrections ne nécessitent pas de refactoring. C'est du remplacement direct.

#### A. Remplacer les 84 largeurs en pixels fixes

```jsx
// AVANT (problème)
<div className="w-[600px]">

// APRES (solution)
<div className="w-full max-w-lg">

// OU avec container query (meilleur)
<div className="@container">
  <div className="w-full @lg:max-w-lg">
```

#### B. Wrapper les 6 tables sans scroll

```jsx
// AVANT
<table className="w-full">

// APRES
<div className="overflow-x-auto">
  <table className="w-full min-w-[640px]">
</div>
```

Fichiers concernés : `PermissionsClient.tsx`, `ReportsClient.tsx`, et 4 autres tables identifiées dans l'audit.

#### C. Ajouter max-width aux pages admin

```jsx
// Dans chaque page admin, wrapper le contenu
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">{/* contenu de la page */}</div>
```

### Phase 2 : Migration Container Queries (1 semaine)

Migrer les composants réutilisables vers les container queries. Commencer par les plus utilisés.

| Composant       | Avant (media query)              | Après (container query)                          |
| --------------- | -------------------------------- | ------------------------------------------------ |
| Cartes de stats | `grid-cols-2 md:grid-cols-4`     | `@container` + `@sm:grid-cols-2 @lg:grid-cols-4` |
| MenuItemCard    | Layout fixe qui casse en sidebar | `@sm:flex-row` (horizontal si espace)            |
| Formulaires     | `w-[600px]` ou `max-w-xl` fixe   | `w-full @md:max-w-xl`                            |
| DataTable       | Colonnes fixes                   | `@container` → masquer colonnes selon espace     |
| ServiceManager  | `aside w-[220px] md:w-[280px]`   | `@container` → aside en dessous si <512px        |

**Pattern de migration :**

```jsx
// 1. Le parent devient un @container
<div className="@container flex-1 min-w-0">

// 2. Les enfants utilisent @breakpoints au lieu de breakpoints
  <div className="
    flex flex-col          /* mobile par défaut */
    @sm:flex-row           /* horizontal si parent > 384px */
    @lg:grid @lg:grid-cols-3  /* grille si parent > 512px */
  ">
```

### Phase 3 : Protection contre les régressions (2-4 semaines)

C'est la phase la plus importante. Sans elle, le responsive va encore casser à la prochaine itération.

#### A. Tests visuels automatisés avec Playwright

Tu as déjà Playwright configuré. Ajoute des tests de screenshot sur 4 breakpoints :

```typescript
// tests/e2e/responsive.spec.ts
const viewports = [
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'ipad-portrait', width: 768, height: 1024 },
  { name: 'ipad-landscape', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const vp of viewports) {
  test(`admin dashboard - ${vp.name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/sites/demo/admin');
    await expect(page).toHaveScreenshot(`dashboard-${vp.name}.png`);
  });
}
```

#### B. Checklist PR (intégrer au code review)

| Vérification                                       | Obligatoire ? |
| -------------------------------------------------- | ------------- |
| Aucun `w-[Xpx]` ajouté (utiliser classes Tailwind) | **OUI**       |
| Composants réutilisables en `@container` query     | **OUI**       |
| Testé sur 4 viewports (375, 768, 1024, 1440)       | **OUI**       |
| Tables wrappées dans `overflow-x-auto`             | **OUI**       |
| Pas de hauteurs `calc()` avec valeurs hardcodées   | Recommandé    |
| Screenshots Playwright passés                      | Recommandé    |

---

## 4. Fichiers à modifier (par priorité)

| Fichier                          | Action                                                | Priorité |
| -------------------------------- | ----------------------------------------------------- | -------- |
| `settings/PermissionsClient.tsx` | Ajouter `overflow-x-auto` sur table                   | **P1**   |
| `admin/ReportsClient.tsx`        | Ajouter `overflow-x-auto` sur 2 tables                | **P1**   |
| `admin/menus/page.tsx`           | Ajouter `max-w-7xl mx-auto`                           | **P1**   |
| `AdminLayoutClient.tsx`          | Ajouter `@container` sur zone principale              | **P1**   |
| `onboarding/page.tsx`            | Remplacer `w-[220px] h-[440px]` par classes relatives | **P2**   |
| `contact/page.tsx`               | Remplacer `max-w-[460px]` par `max-w-sm`              | **P2**   |
| `ServiceManager.tsx`             | Migrer aside en container query                       | **P2**   |
| `POSClient.tsx`                  | Remplacer `h-[calc()]` hardcodés                      | **P2**   |
| `tenant/BottomNav.tsx`           | Remplacer `min-w-[72px]` par `min-w-16`               | **P3**   |
| `ui/dialog.tsx`                  | Ajouter `max-h-[90dvh]` pour paysage                  | **P3**   |
| `tenants-page-client.tsx`        | Ajouter `sm:grid-cols-3` entre 2 et 4                 | **P3**   |

---

## 5. Prompt pour ton IA de développement

Copie ce prompt et donne-le à ton IA pour qu'elle applique les corrections Phase 1 :

```
Lis le fichier CLAUDE.md à la racine du projet pour comprendre l'architecture.

Effectue ces corrections responsive Phase 1 :

1. Cherche TOUS les w-[Xpx] dans src/ et remplace-les par des classes
   Tailwind relatives (w-full, max-w-sm, max-w-lg, etc.) ou des container
   queries (@container + @sm:/@md:/@lg:).

2. Ajoute overflow-x-auto autour de chaque <table> qui n'en a pas
   (PermissionsClient.tsx, ReportsClient.tsx, et autres).

3. Ajoute max-w-7xl mx-auto sur le contenu principal de chaque page admin.

4. Ajoute la classe @container sur la zone principale dans
   AdminLayoutClient.tsx (le div flex-1 qui contient {children}).

5. Pour les grilles admin qui sautent de grid-cols-2 à grid-cols-4,
   ajoute un palier intermédiaire sm:grid-cols-3 ou utilise
   @container queries.

Règles strictes : jamais de w-[Xpx]. Toujours tester que ça fonctionne
quand la sidebar est ouverte ET fermée. Utiliser @container quand un
composant peut apparaître dans différents contextes.

Après chaque fichier modifié, lance pnpm typecheck et pnpm lint.
```

---

## 6. Résumé

Ton problème n'est pas que le responsive est mal implémenté — tes fondations (layout admin, sidebar, DeviceContext) sont solides. Le problème c'est que les composants à l'intérieur utilisent des media queries qui réagissent au viewport au lieu de réagir à l'espace réellement disponible.

Les **Container Queries** règlent ce problème à la racine. C'est la technologie utilisée par les SaaS modernes, c'est supporté nativement dans Tailwind v4 que tu utilises déjà, et ça ne nécessite aucune dépendance supplémentaire.

La clé pour ne plus jamais avoir ce problème : combiner les Container Queries avec des **tests visuels automatisés Playwright** sur 4 breakpoints. Comme ça, toute régression est détectée avant le merge.

---

_Document généré le 11 mars 2026_
