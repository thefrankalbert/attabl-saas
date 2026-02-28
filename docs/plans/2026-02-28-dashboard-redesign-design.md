# Dashboard Admin Redesign — Design Document

> **Date** : 2026-02-28
> **Approche** : "Clientify Light" — KPIs gauche, chart central, widgets droite, table en bas
> **Inspiration** : Dashboard Clientify (dark) transposé en light mode avec accent lime ATTABL

---

## Objectif

Refondre le dashboard admin pour qu'il soit visuellement à la hauteur d'un SaaS premium : graphiques soignés, hiérarchie visuelle claire, layout 3 colonnes inspiré Clientify, esthétique light mode raffinée.

## Utilisateurs cibles

- **Patron / Propriétaire** : Vue business (revenu, tendances, comparaisons)
- **Manager opérationnel** : Vue opérations (commandes en cours, alertes stock, rapidité service)
- Dashboard adaptatif : KPIs business en haut, opérations en bas. Le rôle détermine la visibilité.

## Layout Desktop (lg+)

```
┌──────────────────────────────────────────────────────────────┐
│  "Bonjour, {name}"              Jour | Semaine | Mois  2026 │
├───────────┬────────────────────────────┬─────────────────────┤
│  KPI 1    │                            │  Répartition        │
│  Revenu   │   Revenu cette semaine     │  par catégorie      │
│  245,000  │   AreaChart gradient       │  Donut Chart        │
│  +12.3%   │   lime → emerald           │  4 segments max     │
│───────────│                            │─────────────────────│
│  KPI 2    │   Tooltip dark avec        │  Commandes / heure  │
│  Commandes│   valeur + variation       │  BarChart vertical  │
│  34       │                            │  barres lime        │
│  +8.1%    │                            │  8h → 22h           │
│───────────│                            │                     │
│  KPI 3    │                            │                     │
│  Plats    │                            │                     │
│  127      │                            │                     │
├───────────┴───────────────────┬────────┴─────────────────────┤
│  Commandes récentes (2/3)     │  Alertes stock (1/3)         │
│  8 dernières avec actions     │  Top 8 ingrédients bas       │
│  rapides par statut           │  barres de progression       │
└───────────────────────────────┴──────────────────────────────┘
```

## Esthétique

### Couleurs

- **Fond page** : `#FAFAFA` (zinc-50)
- **Cards** : `white`, `border border-zinc-100`, `shadow-[0_1px_3px_rgba(0,0,0,0.04)]`
- **Accent principal** : `#CCFF00` (lime ATTABL)
- **Accent secondaire** : `#10B981` (emerald-500)
- **Chart gradient** : `#CCFF00` → `#10B981` (lime → emerald)
- **Donut segments** : lime `#CCFF00`, amber `#F59E0B`, blue `#3B82F6`, zinc `#D4D4D8`
- **Tooltip** : `zinc-900` fond, texte blanc, valeur bold
- **Tendances** : emerald pour positif, red-500 pour négatif

### Typographie

- **KPI valeurs** : `text-3xl sm:text-4xl font-bold tracking-tight`
- **KPI labels** : `text-xs uppercase tracking-wide text-zinc-400 font-medium`
- **Tendance pill** : `text-xs font-semibold` dans un badge arrondi
- **Section headers** : `text-sm font-semibold text-zinc-900`
- **Greeting** : `text-xl font-semibold text-zinc-900`
- **Body** : `text-sm text-zinc-600`
- **Font** : Geist Sans (existant)

### Cards

- `rounded-2xl` (16px radius)
- `p-5 sm:p-6`
- Hover subtil : `hover:shadow-md transition-shadow`
- KPI cards : sparkline 7 jours en bas (mini AreaChart 60×24px, sans axes)

### Spacing

- Gap principal : `gap-4 xl:gap-5`
- Padding content wrapper : inchangé (`lg:p-8`)

## Composants à modifier/créer

### Modifiés

1. **DashboardClient.tsx** — nouveau layout grid 3 colonnes
2. **DashboardStats.tsx** → renommé **DashboardKPIs.tsx** — KPIs empilés verticalement avec sparklines
3. **DashboardCharts.tsx** — AreaChart amélioré + sélecteur période
4. **DashboardRecentOrders.tsx** — table redesignée, 8 items
5. **StatsCard.tsx** — ajout sparkline, trend pill, layout vertical

### Nouveaux

6. **DashboardDonut.tsx** — PieChart répartition par catégorie
7. **DashboardHourlyBar.tsx** — BarChart commandes par heure
8. **PeriodSelector.tsx** — composant Jour/Semaine/Mois (tabs)

### Données additionnelles

- **Commandes par heure** : agrégation côté serveur (GROUP BY hour)
- **Répartition par catégorie** : JOIN order_items → menu_items → categories
- **Sparklines 7 jours** : réutiliser `getLast7DaysData()` existant
- **Tendances** : comparer période actuelle vs précédente

## Charts — Détails techniques

### AreaChart central (Recharts)

- `ResponsiveContainer` 100% × 100%
- `AreaChart` avec `margin={{ top: 10, right: 10, left: 0, bottom: 0 }}`
- `Area` : stroke `#CCFF00` 2.5px, fill gradient `lime-to-emerald`
- `XAxis` : jours abrégés (Lun, Mar...), `text-xs text-zinc-400`
- `YAxis` : valeurs formatées (10k, 20k...), `text-xs text-zinc-400`
- `Tooltip` customisé : fond `zinc-900`, texte blanc, valeur bold + variation %
- `CartesianGrid` : `strokeDasharray="3 3"` très discret `zinc-100`
- Gradient via `<defs><linearGradient>` : `#CCFF00` 40% opacity → transparent

### Donut Chart

- `PieChart` + `Pie` avec `innerRadius="60%"` `outerRadius="85%"`
- 4 segments max (top 3 catégories + "Autres")
- Légende à droite, texte `text-xs`
- Centre : total en `text-lg font-bold`

### Bar Chart horaire

- `BarChart` vertical, barres `#CCFF00` avec `radius={[4,4,0,0]}`
- `XAxis` : heures (8h, 10h, 12h, 14h...)
- Pas de `YAxis` (espace réduit)
- Tooltip avec heure + nombre de commandes

### Sparklines (dans KPI cards)

- Mini `AreaChart` 80×28px, sans axes ni grille
- Stroke `#CCFF00` 1.5px, fill gradient très léger
- 7 points de données (7 derniers jours)

## Responsive

### Mobile (< 768px)

- KPIs : row horizontale scrollable (`flex overflow-x-auto gap-3 snap-x`)
- Charts : empilés verticalement, pleine largeur
- Donut + Bar : côte à côte en `grid-cols-2`
- Table commandes : cards empilées (pas de table)
- Stock : liste compacte

### Tablet (md: 768px+)

- KPIs : `grid-cols-3` horizontal
- Chart + widgets : `grid-cols-2` (chart 1fr, widgets 1fr)
- Table + stock : `grid-cols-2`

### Desktop (lg: 1024px+)

- Layout 3 colonnes comme le schéma principal
- Full viewport height (`100dvh - 4.5rem`)
- Overflow hidden, scroll interne par section

## Permissions (inchangé)

- `showFinancials` → KPI revenu, AreaChart, Donut
- `showOrders` → Commandes récentes, BarChart horaire
- `showStock` → Alertes stock
- Quand un panneau est masqué, la grille s'adapte (colspan augmente)
