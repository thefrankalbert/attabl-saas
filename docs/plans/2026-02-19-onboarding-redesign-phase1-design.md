# Onboarding Redesign Phase 1 — Visual + UX

## Context

The ATTABL onboarding flow has 5 steps split across 7 component files (~1,750 lines total). It works but has significant visual and UX issues: the layout wastes space, tablet responsiveness is missing, the color picker is too limited, the menu form is unusable, and several bugs silently degrade the experience.

Phase 1 focuses on visual quality and UX fixes only. No new database fields. No establishment-type differentiation (Phase 2). Same 5 steps, same API endpoints.

## Design Decisions (user-approved)

| Decision                      | Choice                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| Layout style                  | Kastamer-inspired sidebar + content, adapted to ATTABL chart (lime, flat, rounded-xl) |
| Sidebar on tablet             | Compact (icons + titles, no descriptions) visible at `md+`                            |
| Sidebar on mobile             | Horizontal step bar at top                                                            |
| Color picker                  | 16 preset palettes + hex input (native `input[type=color]` enlarged)                  |
| Menu step                     | Multi-category accordion with articles per category                                   |
| Establishment differentiation | Phase 2 (deferred)                                                                    |
| Scope                         | Visual redesign + UX bug fixes. No new DB schema.                                     |

## Design Charter (inherited from dashboard)

- Accent: `#CCFF00` (lime)
- Borders: `border-neutral-200` (inputs), `border-neutral-100` (cards)
- Corners: `rounded-xl`
- Shadows: none (flat design)
- CTAs: `variant="lime"` (shadcn Button)
- Fonts: system fonts
- Labels: `text-sm font-medium text-neutral-700`
- Icons: Lucide React (no emojis in establishment type tiles)

## Layout Architecture

### Desktop (lg+, 1024px+)

```
+-------------------------------------------------------------+
| +--sidebar (w-72)---+ +--content (flex-1)----------------+ |
| |                    | |                                   | |
| | ATTABL logo        | | Badge: ETAPE X SUR 5             | |
| |                    | |                                   | |
| | (v) Etablissement  | | H1: Step title                    | |
| |     description    | |                                   | |
| |                    | | [Scrollable form content]         | |
| | (*) Tables         | |   max-w-xl mx-auto               | |
| |     description    | |                                   | |
| |                    | |                                   | |
| | ( ) Personnalis.   | |                                   | |
| |     description    | |                                   | |
| |                    | |                                   | |
| | ( ) Menu           | |                                   | |
| |     description    | |                                   | |
| |                    | |                                   | |
| | ( ) Lancement      | | [<- Back]        [Continue ->]    | |
| |     description    | |                                   | |
| |                    | +-----------------------------------+ |
| | Tenant name        |                                      |
| | 14j essai gratuit  |                                      |
| +--------------------+                                      |
+-------------------------------------------------------------+
```

- Sidebar: `w-72 bg-neutral-50 border-r border-neutral-100`
- Sidebar step items: vertical list with connecting line (lime if completed, neutral-200 if not)
- Step icon: 32px circle, lime bg + white check (completed), neutral-900 bg + white icon (active), neutral-200 bg + neutral-400 icon (future)
- Content: `flex-1 bg-white`, form area `max-w-xl mx-auto`
- Footer nav: sticky bottom, `border-t border-neutral-100`

### Tablet (md, 768-1023px)

- Sidebar: `w-56`, descriptions hidden, just icon + title per step
- Content: same as desktop but `max-w-lg`

### Mobile (< 768px)

- No sidebar
- Horizontal step bar at top: 5 circle icons in a row with connecting lines
- Below: "ETAPE X SUR 5" badge + step title
- Content: full width with `px-4`
- Footer: Back (icon only) + Continue (full width)

## Step-by-Step Design

### Step 1 — Etablissement

**New field:** "Nom de l'etablissement" (text input, first field). Pre-filled from `data.tenantName` which comes from signup. Editable. Stored in existing `tenantName` field (no new DB column — the name was already stored in `tenants.name` at signup).

**Establishment type grid:** `grid grid-cols-2 sm:grid-cols-3 gap-3`

Each tile:

- Lucide icon (not emoji): `UtensilsCrossed` (restaurant), `Hotel` (hotel), `Wine` (bar), `Coffee` (cafe), `Flame` (fast-food), `Building2` (other)
- Title in `font-medium`
- 1-line description in `text-xs text-neutral-500`
- Selected: `border-[#CCFF00] bg-[#CCFF00]/5`, unselected: `border-neutral-200`
- All tiles: `rounded-xl p-4`

**Fields layout:**

```
[Nom de l'etablissement        ] (full width)
[Type grid 2x3                 ] (full width)
[Adresse          ] [Ville     ] (grid-cols-2)
[Pays             ] [Telephone ] (grid-cols-2)
[Nombre de tables: [-] 10 [+] ] (stepper component)
```

Table count stepper: - button, number display (centered, `text-lg font-semibold`), + button. Min 1, max 500. Styled with `rounded-xl border`.

**Conditional label only (no new fields):** When type is `hotel`, the table count label reads "Nombre de chambres" instead of "Nombre de tables". This is a text-only change based on `establishmentType`, not a structural change.

### Step 2 — Tables

**Mode selector:** 3 cards in `grid grid-cols-1 sm:grid-cols-3 gap-3`

Each card: Lucide icon + title + description. Selected = lime border + bg. Cards:

1. Settings icon — "Configuration complete" / "Zones, prefixes, capacite"
2. Zap icon — "Configuration rapide" / "Zone + nombre de tables"
3. Clock icon — "Configurer plus tard" / "10 tables par defaut"

**Mode: complete** — Zone cards:

Each zone is a flat card (`border border-neutral-200 rounded-xl p-4`):

```
Zone 1 header (text-sm font-medium)         [x delete]
+--grid grid-cols-2 gap-3-----------------------------+
| Nom de la zone:  [Terrasse    ]  Prefixe: [TER  ]  |
| Tables:          [12          ]  Capacite: [4 v  ]  |
+-----------------------------------------------------+
Preview: TER-1  TER-2  TER-3  ...  TER-12
```

- Capacity: `<Select>` from shadcn/ui (options: 2, 4, 6, 8, 10, 12)
- No animation on expand/collapse — always visible
- Add zone: dashed border button at bottom, max 20 zones
- Delete disabled if only 1 zone

**Mode: minimum** — Compact rows:

Each zone = single row: `[Zone name input] [Table count input] [x]`

- Add zone button below
- Preview chips below each row

**Mode: skip** — Simple info card explaining defaults.

### Step 3 — Personnalisation

**Logo upload:**

```
+--dashed border rounded-xl 120x120--+
|                                     |
|         [Upload icon]               |
|    "Glissez ou cliquez"             |
|         pour ajouter                |
+-------------------------------------+
```

- When logo set: show image preview with overlay delete button
- Accept: `image/*`, max 2MB
- Still uses `createObjectURL` for preview (real upload = Phase 2)

**Color presets:** `grid grid-cols-4 sm:grid-cols-8 gap-2`

16 presets, each = small card (48x48ish) showing primary color circle on secondary background. Selected = lime ring. Presets:

| Name     | Primary  | Secondary |
| -------- | -------- | --------- |
| Lime     | #CCFF00  | #000000   |
| Ocean    | #3B82F6  | #1E3A8A   |
| Ruby     | #EF4444  | #7F1D1D   |
| Forest   | #22C55E  | #14532D   |
| Violet   | #A855F7  | #581C87   |
| Sunset   | #F97316  | #7C2D12   |
| Gold     | #EAB308  | #422006   |
| Rose     | #EC4899  | #831843   |
| Teal     | #14B8A6  | #134E4A   |
| Slate    | #64748B  | #0F172A   |
| Coral    | #F97171  | #FFFFFF   |
| Navy     | #1E40AF  | #DBEAFE   |
| Mint     | #34D399  | #FFFFFF   |
| Wine     | #9F1239  | #FFF1F2   |
| Charcoal | #374151  | #F3F4F6   |
| Custom   | gradient | gradient  |

The last tile "Custom" opens/reveals the custom section below.

**Custom colors section:**

```
+--grid grid-cols-2 gap-4--+
| Couleur principale:      | Couleur secondaire:      |
| [==color==] [#CCFF00  ]  | [==color==] [#000000  ]  |
+---------------------------+
```

- `<input type="color">` styled larger (48x48, `rounded-xl`)
- Hex input syncs bidirectionally
- Always visible (not collapsible)

**Description:** Textarea, 3 rows, max 500 chars, character counter.

**Live preview:** Card showing the branding applied to a mini menu card mockup.

### Step 4 — Menu

**Complete rework of the form:**

```
[+ Ajouter une categorie]

+--Category Card (accordion)---------------------------+
| [v] Entrees                              [x delete]  |
|-------------------------------------------------------|
| | Article 1: [Salade Cesar  ] [12.50 EUR] [x]      | |
| | Article 2: [Soupe du jour ] [ 8.00 EUR] [x]      | |
| | [+ Ajouter un article]                            | |
+-------------------------------------------------------+

+--Category Card (collapsed)--------------------------+
| [>] Plats principaux (3 articles)        [x delete] |
+------------------------------------------------------+
```

- Max 5 categories
- Max 10 articles per category
- Each category = collapsible card with header showing name + article count
- Category name = inline editable input in header
- Articles = rows with name (flex-1) + price (w-28, EUR suffix) + delete
- Add category = dashed button at top or bottom
- Tip card: "Vous pourrez ajouter descriptions, photos et options depuis le tableau de bord"

**State management fix:** Initialize local state from `data.menuItems` on mount. Group items by `category` field to reconstruct categories.

### Step 5 — Lancement

- Summary card with branding colors applied
- Checklist with real status checks (fix the `|| true` bug)
- QR code uses `primaryColor` for foreground
- Menu URL copyable
- CTA: "Lancer mon etablissement" (`variant="lime"`, full width)

## Bug Fixes (included in Phase 1)

| Bug                                      | Fix                                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- | --- | ---------------------------------------- |
| Logo upload sends blob URL to server     | Keep blob preview, add TODO comment for Supabase Storage upload in Phase 2                     |
| Step 4 doesn't restore from parent state | Initialize `items` from `data.menuItems` grouped by category on mount                          |
| `saveStep` errors swallowed silently     | Add toast notification on save failure                                                         |
| Country default inconsistency            | Align to 'Cameroun' everywhere                                                                 |
| Checklist "Menu initialise" always true  | Fix `data.menuOption !== 'skip'                                                                |     | true`to just`data.menuOption !== 'skip'` |
| No i18n                                  | Add full i18n with `useTranslations('onboarding')` across all step components + 8 locale files |
| Responsive: no tablet styles             | Add `md` breakpoint sidebar (compact), improve all grids for tablet                            |

## Files to Modify

| File                                              | Change Type                                                     |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `src/app/onboarding/page.tsx`                     | Major — new layout (sidebar redesign, responsive breakpoints)   |
| `src/components/onboarding/EstablishmentStep.tsx` | Major — add name field, Lucide icons, stepper, new grid         |
| `src/components/onboarding/TablesStep.tsx`        | Medium — restyle cards, fix Select component, remove animations |
| `src/components/onboarding/BrandingStep.tsx`      | Major — 16 presets, enlarged color picker, logo drop zone       |
| `src/components/onboarding/MenuStep.tsx`          | Major — complete rewrite to multi-category accordion            |
| `src/components/onboarding/LaunchStep.tsx`        | Medium — fix checklist bug, use branding colors on QR           |
| `src/messages/*.json` (8 files)                   | Add `onboarding` namespace with all keys                        |

## Out of Scope (Phase 2)

- Establishment-type differentiation (different fields/steps per type)
- Mirroring onboarding config in dashboard settings
- Real logo upload to Supabase Storage
- New database columns
- Import menu from file/template
