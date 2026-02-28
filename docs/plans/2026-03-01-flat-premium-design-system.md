# Design System "Flat Premium" — Attabl SaaS

> **Date** : 1 mars 2026
> **Scope** : Toutes les interfaces admin/back-office (pas le menu client)
> **Approche** : Design tokens + refonte globale (Approche A)
> **Inspiré de** : Interface POS d'encaissement Attabl + esthétique Square

---

## Principes fondamentaux

1. **Zéro ombres** — séparation par bordures subtiles uniquement
2. **Flat premium** — surfaces blanches, fond gris très clair, pas de gradients
3. **Typographie hiérarchique** — bold pour les KPIs, uppercase pour les labels
4. **Accent lime** — #CCFF00 uniquement sur les actions principales
5. **Espacement généreux** — minimum 16px entre éléments, 24px padding cartes
6. **Animations très subtiles** — transitions 150ms, pas de flashy
7. **Responsive parfait** — mobile, tablet, desktop

---

## 1. Design Tokens

### Surfaces

| Token                 | Hex     | Usage                        |
| --------------------- | ------- | ---------------------------- |
| `--surface-primary`   | #FFFFFF | Cartes, conteneurs           |
| `--surface-secondary` | #F9FAFB | Fond de page, sidebar        |
| `--surface-tertiary`  | #F3F4F6 | Éléments imbriqués, disabled |
| `--surface-accent`    | #F7FFD6 | Highlight lime léger         |

### Bordures

| Token              | Hex     | Usage                  |
| ------------------ | ------- | ---------------------- |
| `--border-default` | #E5E7EB | Standard               |
| `--border-subtle`  | #F3F4F6 | Quasi-invisible        |
| `--border-strong`  | #D1D5DB | Séparateurs importants |
| `--border-accent`  | #CCFF00 | Active/sélection       |

### Texte

| Token              | Hex     | Usage                |
| ------------------ | ------- | -------------------- |
| `--text-primary`   | #111827 | Titres, valeurs      |
| `--text-secondary` | #6B7280 | Descriptions, labels |
| `--text-muted`     | #9CA3AF | Hints, placeholders  |
| `--text-accent`    | #4D7C0F | Texte sur fond lime  |

### Actions

| Token                    | Hex     | Usage               |
| ------------------------ | ------- | ------------------- |
| `--action-primary`       | #CCFF00 | Boutons principaux  |
| `--action-primary-hover` | #B8E600 | Hover primary       |
| `--action-secondary`     | #111827 | Boutons secondaires |
| `--action-danger`        | #EF4444 | Destructif          |

### Statuts

| Statut  | Texte   | Background | Bordure        |
| ------- | ------- | ---------- | -------------- |
| Success | #059669 | #ECFDF5    | emerald-200/50 |
| Warning | #D97706 | #FFFBEB    | amber-200/50   |
| Error   | #DC2626 | #FEF2F2    | red-200/50     |
| Info    | #2563EB | #EFF6FF    | blue-200/50    |

---

## 2. Typographie

| Niveau         | Taille          | Poids | Tracking          | Usage                |
| -------------- | --------------- | ----- | ----------------- | -------------------- |
| Heading XL     | 36px (text-4xl) | 700   | tight             | Montants, KPIs       |
| Heading L      | 20px (text-xl)  | 600   | tight             | Titres de page       |
| Heading M      | 14px (text-sm)  | 600   | normal            | Titres de carte      |
| Label          | 12px (text-xs)  | 500   | wider + uppercase | Catégories, en-têtes |
| Body           | 14px (text-sm)  | 400   | normal            | Contenu standard     |
| Body Secondary | 13px            | 400   | normal            | Descriptions         |
| Small          | 12px (text-xs)  | 400   | normal            | Metadata, timestamps |

### Règles

- Montants : toujours bold, tracking-tight, séparateur espace (1 000)
- Labels de section : toujours uppercase, tracking-wider, text-secondary
- Max 3 niveaux typographiques par carte

---

## 3. Composants UI

### Card

```
bg-white rounded-xl border border-[--border-default] p-6
shadow: none
hover: border-[--border-strong] transition-colors duration-150
```

### Button Primary

```
bg-[#CCFF00] text-[#111827] font-semibold rounded-lg h-10
hover: bg-[#B8E600] | active: scale-[0.98]
shadow: none | transition: 150ms
```

### Button Secondary

```
bg-[#111827] text-white font-medium rounded-lg h-10
hover: bg-[#1F2937]
```

### Button Ghost

```
bg-transparent border border-[--border-default] text-[--text-secondary] rounded-lg
hover: bg-[--surface-secondary] border-[--border-strong]
```

### Input

```
h-10 rounded-lg border border-[--border-default] bg-white px-3 text-sm
focus: border-[#CCFF00] ring-1 ring-[#CCFF00]/30
shadow: none
```

### Table

```
En-têtes : text-xs uppercase tracking-wider font-medium text-secondary bg-surface-secondary
Lignes : border-b border-subtle hover:bg-surface-secondary py-3 px-4
Pas de bordures externes
```

### Badge

```
rounded-full px-2.5 py-0.5 text-xs font-medium
Semantic colors avec bg léger + texte foncé + bordure 50% opacity
```

---

## 4. Dashboard Layout

### Mobile (< 768px)

- Colonne unique, scroll vertical
- KPIs en grille 2x2
- Graphiques pleine largeur
- Commandes récentes en liste

### Tablet (768px - 1024px)

- KPIs en ligne de 4
- Graphiques 2 colonnes
- Commandes récentes pleine largeur

### Desktop (> 1024px)

- 3 colonnes : [KPIs 240px] [Charts 1fr] [Sidebar 280px]
- KPIs empilés à gauche
- Charts au centre
- Sidebar : catégories + commandes/heure

### KPI Card

```
Label : text-xs uppercase tracking-wider text-secondary font-medium
Valeur : text-3xl font-bold text-primary tracking-tight mt-1
Trend : text-xs font-medium mt-2 (vert/rouge avec icône flèche)
Style minimaliste — pas d'icône cercle, pas de sparkline
```

---

## 5. Animations

| Élément          | Animation                         | Durée         |
| ---------------- | --------------------------------- | ------------- |
| Page transition  | opacity 0→1, y: 8→0               | 200ms easeOut |
| Hover carte      | border-color transition           | 150ms         |
| Hover bouton     | background-color transition       | 150ms         |
| Click bouton     | scale 0.98                        | instantané    |
| KPI cards entrée | stagger 50ms, opacity 0→1, y: 4→0 | 200ms         |
| KPI compteurs    | count 0→valeur                    | 600ms spring  |
| Skeletons        | animate-pulse                     | continu       |

---

## 6. Pages admin

Toutes les pages admin adoptent :

- Fond : `bg-[--surface-secondary]`
- Contenu en cartes `bg-white rounded-xl border`
- En-tête : Heading L + Body Secondary + actions à droite
- Tables et listes suivent les composants standardisés

Pages : Categories, Items, Commandes, Inventaire, Paramètres, Suggestions IA
