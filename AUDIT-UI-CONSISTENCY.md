# AUDIT UI - Coherence shadcn/ui & Design System

**Projet :** ATTABL SaaS
**Date :** 2026-04-11
**Scope :** Tout le repertoire `src/` (293 fichiers .tsx scannes)

---

## RESUME EXECUTIF

| Categorie                                 | Occurrences | Severite |
| ----------------------------------------- | ----------- | -------- |
| Elements HTML natifs au lieu de shadcn/ui | **383**     | CRITIQUE |
| Styles inline (`style={{}}`)              | **50+**     | HAUTE    |
| Couleurs hardcodees (hex/rgb)             | **70+**     | MOYENNE  |
| Fichiers melangeant Tailwind + inline     | **8+**      | MOYENNE  |
| Inconsistances d'espacement               | **20+**     | BASSE    |

**42 composants shadcn/ui sont installes** mais massivement sous-utilises.
Le probleme principal : **383 elements HTML natifs** (`<button>`, `<input>`, `<select>`, etc.) sont utilises au lieu de leurs equivalents shadcn/ui.

---

## COMPOSANTS SHADCN/UI INSTALLES (42 au total)

### Composants standard (24)

alert, badge, button, input, label, textarea, switch, form, select, slider, card, separator, accordion, tabs, breadcrumb, dialog, sheet, popover, dropdown-menu, table, avatar, skeleton, command, date-picker-field, sonner

### Composants animation/magic-ui (14)

animated-gradient-text, animated-shiny-text, bento-grid, blur-fade, border-beam, dot-pattern, marquee, number-ticker, particles, safari, shimmer-button, shimmer-text, word-rotate

### Composants custom (4)

single-pricing-card, testimonials-columns, cobe-globe-analytics

---

## CATEGORIE 1 : ELEMENTS HTML NATIFS A REMPLACER (383 instances)

### 1.1 — `<button>` natif → `<Button>` shadcn/ui (255 instances)

**Impact :** Pas de styles coherents, pas de variantes (default, destructive, outline, ghost, link), pas d'etats hover/focus/disabled uniformes.

#### Fichiers les plus impactes :

| Fichier                                              | Nb buttons | Lignes                                                                    |
| ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| `src/app/sites/[site]/cart/page.tsx`                 | 15         | 541, 561, 652, 662, 689, 706, 722, 809, 854, 865, 881, 915, 953, 967, 993 |
| `src/components/admin/PaymentModal.tsx`              | 10         | 177, 299, 316, 334, 383, 402, 419, 437, 472, 536                          |
| `src/components/tenant/ClientMenuPage.tsx`           | 9          | 199, 237, 283, 486, 532, 648, 702, 835, 1036                              |
| `src/components/tenant/ClientMenuDetailPage.tsx`     | 8          | 366, 429, 466, 485, 512, 537, 555, 597                                    |
| `src/components/admin/settings/TablesClient.tsx`     | 8          | 379, 389, 414, 424, 510, 533, 542                                         |
| `src/components/features/pos/POSCart.tsx`            | 8          | 172, 191, 209, 288, 297, 304, 329, 357                                    |
| `src/components/admin/MenuDetailClient.tsx`          | 7          | 384, 441, 577, 593, 600, 610, 741                                         |
| `src/components/onboarding/MenuStep.tsx`             | 7          | 235, 260, 303, 347, 359, 380                                              |
| `src/components/tenant/ClientSettings.tsx`           | 7          | 95, 221, 334, 344, 388, 565, 632                                          |
| `src/components/tenant/ItemDetailSheet.tsx`          | 6          | 227, 360, 426, 492, 509, 549                                              |
| `src/components/features/kitchen/KitchenFilters.tsx` | 6          | 70, 90, 101, 124, 151, 184                                                |
| `src/components/admin/AdminSidebar.tsx`              | 6          | 196, 221, 258, 298, 334, 456                                              |
| `src/components/tenant/ClientOrders.tsx`             | 6          | 350, 384, 413, 552, 579                                                   |
| `src/components/admin/ServiceManager.tsx`            | 5          | 170, 640, 705, 731, 839                                                   |
| `src/components/onboarding/TablesStep.tsx`           | 5          | 138, 213, 230, 290, 396                                                   |
| `src/components/onboarding/LaunchStep.tsx`           | 5          | 219, 272, 299, 336, 371                                                   |
| `src/components/shared/ImageUpload.tsx`              | 5          | 219, 251, 268, 278, 445                                                   |

#### Autres fichiers impactes (1-4 buttons chacun) :

- `src/components/admin/ItemsClient.tsx` (4)
- `src/components/admin/NotificationCenter.tsx` (4)
- `src/components/admin/OrdersClient.tsx` (4)
- `src/components/features/kitchen/KDSTicket.tsx` (4)
- `src/components/onboarding/BrandingStep.tsx` (4)
- `src/components/qr/QRCustomizerPanel.tsx` (4)
- `src/components/auth/AuthForm.tsx` (3)
- `src/components/features/kitchen/FooterSummaryBar.tsx` (3)
- `src/components/features/pos/POSItemCustomizer.tsx` (3)
- `src/components/marketing/Header.tsx` (3)
- `src/components/onboarding/LogoCropper.tsx` (3)
- `src/components/admin/POSClient.tsx` (3)
- `src/components/admin/DashboardClient.tsx` (2)
- `src/components/admin/CategoriesClient.tsx` (2)
- `src/components/admin/RecipesClient.tsx` (2)
- `src/components/admin/RuptureButton.tsx` (2)
- `src/components/admin/ServerDashboard.tsx` (2)
- `src/components/admin/SuggestionsClient.tsx` (2)
- `src/components/admin/AddRestaurantWizard.tsx` (2)
- `src/components/features/users/UserForm.tsx` (2)
- `src/components/features/settings/SettingsSecurity.tsx` (2)
- `src/components/tenant/FullscreenSplash.tsx` (2)
- `src/components/tenant/TablePicker.tsx` (2)
- `src/components/tenant/InstallPrompt.tsx` (2)
- `src/components/tenant/SearchOverlay.tsx` (2)
- `src/components/tenant/QRScanner.tsx` (3)
- `src/components/tenant/SubscriptionManager.tsx` (3)
- `src/app/auth/accept-invite/page.tsx` (2)
- `src/app/contact/page.tsx` (2)
- `src/app/(marketing)/pricing/page.tsx` (3)
- `src/app/onboarding/page.tsx` (3)
- `src/app/sites/[site]/order-confirmed/page.tsx` (3)
- `src/app/admin/tenants/tenants-page-client.tsx` (3)
- Et 15+ fichiers avec 1 button chacun

---

### 1.2 — `<input>` natif → `<Input>` shadcn/ui (40 instances)

| Fichier                                                 | Nb inputs | Lignes                 |
| ------------------------------------------------------- | --------- | ---------------------- |
| `src/components/features/settings/SettingsBilling.tsx`  | 5         | 80, 126, 175, 224, 245 |
| `src/app/contact/page.tsx`                              | 4         | 96, 107, 126, 143      |
| `src/components/admin/ItemsClient.tsx`                  | 2         | 375, 399               |
| `src/components/admin/OrdersClient.tsx`                 | 2         | 248, 266               |
| `src/components/admin/AdsClient.tsx`                    | 2         | 234, 276               |
| `src/components/features/menus/MenuForm.tsx`            | 2         | 131, 194               |
| `src/components/features/settings/SettingsBranding.tsx` | 2         | 42, 63                 |
| `src/components/shared/ImageUpload.tsx`                 | 2         | 369, 399               |
| `src/app/sites/[site]/cart/page.tsx`                    | 2         | 896, 1020              |
| Et 15+ fichiers avec 1 input chacun                     |

---

### 1.3 — `<label>` natif → `<Label>` shadcn/ui (36 instances)

| Fichier                                                | Nb labels | Lignes                                           |
| ------------------------------------------------------ | --------- | ------------------------------------------------ |
| `src/components/admin/InventoryClient.tsx`             | 10        | 495, 508, 525, 541, 553, 567, 616, 635, 650, 669 |
| `src/components/features/settings/SettingsBilling.tsx` | 6         | 72, 125, 174, 223, 244                           |
| `src/app/contact/page.tsx`                             | 4         | 101, 120, 137, 157                               |
| `src/components/admin/AuditLogClient.tsx`              | 3         | 222, 247, 267                                    |
| Et 8+ fichiers avec 1-2 labels chacun                  |

---

### 1.4 — `<select>` natif → `<Select>` shadcn/ui (21 instances)

| Fichier                                              | Nb selects | Lignes        |
| ---------------------------------------------------- | ---------- | ------------- |
| `src/components/admin/InventoryClient.tsx`           | 3          | 511, 619, 653 |
| `src/components/qr/QRCustomizerPanel.tsx`            | 2          | 570, 735      |
| `src/components/admin/SuggestionsClient.tsx`         | 2          | 387, 429      |
| `src/components/admin/AuditLogClient.tsx`            | 2          | 225, 250      |
| `src/components/features/menus/MenuForm.tsx`         | 2          | 156, 175      |
| `src/app/sites/[site]/admin/qr-codes/QRCodePage.tsx` | 2          | 151, 184      |
| Et 8+ fichiers avec 1 select chacun                  |

---

### 1.5 — `<input type="checkbox">` → `<Checkbox>` shadcn/ui (15 instances)

| Fichier                                                | Nb checkboxes | Lignes                 |
| ------------------------------------------------------ | ------------- | ---------------------- |
| `src/components/features/settings/SettingsBilling.tsx` | 5             | 81, 127, 176, 225, 246 |
| `src/components/admin/ItemsClient.tsx`                 | 2             | 376, 400               |
| `src/components/admin/OrdersClient.tsx`                | 2             | 249, 267               |
| `src/components/features/menus/MenuForm.tsx`           | 2             | 132, 195               |
| Et 4+ fichiers avec 1 checkbox chacun                  |

---

### 1.6 — `<textarea>` natif → `<Textarea>` shadcn/ui (9 instances)

| Fichier                                      | Lignes   |
| -------------------------------------------- | -------- |
| `src/app/contact/page.tsx`                   | 163      |
| `src/app/sites/[site]/cart/page.tsx`         | 735      |
| `src/components/tenant/ItemDetailSheet.tsx`  | 525      |
| `src/components/features/pos/POSCart.tsx`    | 229, 398 |
| `src/components/admin/POSClient.tsx`         | 202      |
| `src/components/qr/QRCustomizerPanel.tsx`    | 613      |
| `src/components/onboarding/LaunchStep.tsx`   | 401      |
| `src/components/onboarding/BrandingStep.tsx` | 224      |

---

### 1.7 — `<table>` natif → `<Table>` shadcn/ui (7 instances)

| Fichier                                               | Lignes   |
| ----------------------------------------------------- | -------- |
| `src/app/(marketing)/pricing/page.tsx`                | 463      |
| `src/components/admin/settings/PermissionsClient.tsx` | 263      |
| `src/components/admin/DataTable.tsx`                  | 108      |
| `src/components/admin/ReportsClient.tsx`              | 472, 628 |
| `src/components/admin/AuditLogClient.tsx`             | 319      |
| `src/components/admin/InvoiceHistoryClient.tsx`       | 161      |

---

## CATEGORIE 2 : STYLES INLINE QUI CONTOURNENT LE DESIGN SYSTEM (50+)

### Fichiers les plus impactes :

| Fichier                                            | Nb inline styles | Probleme principal                                       |
| -------------------------------------------------- | ---------------- | -------------------------------------------------------- |
| `src/components/qr/templates/StandardTemplate.tsx` | 8+               | Dimensions calculees en px (`* 3.78px`), couleurs inline |
| `src/components/qr/templates/NeonTemplate.tsx`     | 8+               | textShadow, boxShadow dynamiques, dimensions px          |
| `src/components/qr/templates/MinimalTemplate.tsx`  | 7+               | width/height/backgroundColor inline, marges negatives    |
| `src/components/onboarding/PhonePreview.tsx`       | 6+               | Gradients dynamiques, rgba() hardcodes, color inline     |
| `src/components/qr/ColorPicker.tsx`                | 1                | backgroundColor dynamique pour presets                   |

**Note :** Les templates QR utilisent des styles inline parce que les couleurs sont dynamiques (choisies par l'utilisateur). C'est un cas acceptable si on utilise des CSS custom properties (`--qr-accent: ${color}`) au lieu de `style={{ backgroundColor: color }}`.

---

## CATEGORIE 3 : COULEURS HARDCODEES (70+)

### Fichiers les plus impactes :

| Fichier                                      | Nb couleurs | Exemples                                                    |
| -------------------------------------------- | ----------- | ----------------------------------------------------------- |
| `src/components/onboarding/BrandingStep.tsx` | 50+         | `#CCFF00`, `#3B82F6`, `#EF4444`, `#22C55E`, `#A855F7`, etc. |
| `src/components/onboarding/PhonePreview.tsx` | 4+          | `#1a1a2e`, `rgba(26,26,46,...)`, `#ffffff`                  |
| Templates QR (3 fichiers)                    | 10+         | Couleurs passees via `config` object                        |

**Note :** Les couleurs dans BrandingStep.tsx sont des presets pour que l'utilisateur choisisse sa palette - c'est un cas acceptable. Le probleme est quand ces couleurs ne correspondent pas aux tokens du theme Tailwind.

---

## CATEGORIE 4 : MELANGE TAILWIND + INLINE STYLES (8+ fichiers)

Ces fichiers appliquent a la fois des classes Tailwind ET des styles inline sur les memes elements, ce qui rend la maintenance difficile :

1. `src/components/qr/templates/StandardTemplate.tsx`
2. `src/components/qr/templates/NeonTemplate.tsx`
3. `src/components/qr/templates/MinimalTemplate.tsx`
4. `src/components/onboarding/PhonePreview.tsx`
5. `src/components/qr/ColorPicker.tsx`

**Correction recommandee :** Utiliser des CSS custom properties :

```tsx
// AVANT (inline)
<div className="rounded-lg p-4" style={{ backgroundColor: config.accent }}>

// APRES (CSS variable)
<div className="rounded-lg p-4 bg-[var(--qr-accent)]"
     style={{ '--qr-accent': config.accent } as React.CSSProperties}>
```

---

## CATEGORIE 5 : INCONSISTANCES D'ESPACEMENT

### Padding sur composants similaires :

- Cards : `p-6` (standard) vs `p-4` vs `px-5 py-4` (non-standard)
- Modals headers : `px-5 py-4` (devrait etre `p-6`)
- Boutons custom : `px-4 py-2` vs `px-3 py-1.5` vs `px-6 py-3`

### Marges negatives dans les templates QR :

- `-mt-3`, `-mt-2` hardcodes dans MinimalTemplate

---

## PLAN DE CORRECTION PAR PRIORITE

### Phase 1 : Formulaires (impact maximal, effort modere)

**Fichiers cibles :** Tout fichier avec `<input>`, `<select>`, `<textarea>`, `<label>`, `<checkbox>`

**Action :**

```bash
# Pour chaque fichier :
# 1. Ajouter l'import shadcn/ui
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

# 2. Remplacer les elements natifs par les composants shadcn/ui
# 3. Adapter les props (className → shadcn variants)
```

**Fichiers prioritaires :**

1. `src/components/features/settings/SettingsBilling.tsx` (16 remplacements)
2. `src/components/admin/InventoryClient.tsx` (13 remplacements)
3. `src/app/contact/page.tsx` (9 remplacements)
4. `src/components/admin/AuditLogClient.tsx` (6 remplacements)

---

### Phase 2 : Boutons (impact visuel majeur)

**Action :** Remplacer les 255 `<button>` natifs par `<Button>` avec les bonnes variantes :

| Usage actuel                | Variante shadcn/ui                     |
| --------------------------- | -------------------------------------- |
| Bouton principal / CTA      | `<Button>` (default)                   |
| Bouton secondaire           | `<Button variant="outline">`           |
| Bouton danger / suppression | `<Button variant="destructive">`       |
| Bouton discret / navigation | `<Button variant="ghost">`             |
| Bouton icone seul           | `<Button variant="ghost" size="icon">` |
| Bouton texte / lien         | `<Button variant="link">`              |

**Fichiers prioritaires :**

1. `src/app/sites/[site]/cart/page.tsx` (15 buttons - page client visible)
2. `src/components/admin/PaymentModal.tsx` (10 buttons)
3. `src/components/tenant/ClientMenuPage.tsx` (9 buttons - page client visible)
4. `src/components/tenant/ClientMenuDetailPage.tsx` (8 buttons - page client visible)

---

### Phase 3 : Tables (7 fichiers)

**Action :** Remplacer les `<table>` natifs par les composants shadcn/ui Table :

```tsx
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
```

**Fichiers :**

1. `src/components/admin/DataTable.tsx`
2. `src/components/admin/ReportsClient.tsx`
3. `src/components/admin/AuditLogClient.tsx`
4. `src/components/admin/InvoiceHistoryClient.tsx`
5. `src/components/admin/settings/PermissionsClient.tsx`
6. `src/app/(marketing)/pricing/page.tsx`

---

### Phase 4 : Templates QR et styles inline

**Action :** Migrer les inline styles vers des CSS custom properties pour les 3 templates QR et PhonePreview.

---

## OUTILS DE PREVENTION RECOMMANDES

### 1. ESLint custom rule (le plus efficace)

Il n'existe pas de plugin ESLint "shadcn/ui lint" officiel, mais on peut creer une regle custom :

```js
// .eslintrc.js - regle custom
rules: {
  'no-restricted-jsx': ['error', {
    elements: [
      { name: 'button', message: 'Use <Button> from @/components/ui/button' },
      { name: 'input', message: 'Use <Input> from @/components/ui/input' },
      { name: 'select', message: 'Use <Select> from @/components/ui/select' },
      { name: 'textarea', message: 'Use <Textarea> from @/components/ui/textarea' },
      { name: 'table', message: 'Use <Table> from @/components/ui/table' },
    ]
  }]
}
```

**Plugin ESLint recommande :** `eslint-plugin-react` inclut la regle `react/forbid-elements` qui fait exactement ca.

### 2. Script de scan reutilisable

Un script shell/node qui peut etre lance en CI pour detecter les regressions :

```bash
#!/bin/bash
# scan-ui-consistency.sh
echo "=== Scanning for native HTML elements that should use shadcn/ui ==="

ERRORS=0
for element in "button" "input" "select" "textarea" "table"; do
  COUNT=$(grep -r "<${element}" src/ --include="*.tsx" \
    --exclude-dir="src/components/ui" -l | wc -l)
  if [ "$COUNT" -gt 0 ]; then
    echo "WARN: <${element}> found in $COUNT files (use shadcn/ui instead)"
    ERRORS=$((ERRORS + COUNT))
  fi
done

echo "Total files with native elements: $ERRORS"
exit $([[ $ERRORS -gt 0 ]] && echo 1 || echo 0)
```

### 3. PR Review Checklist

Ajouter au template de PR :

- [ ] Aucun element HTML natif (`<button>`, `<input>`, `<select>`, `<textarea>`, `<table>`) utilise directement
- [ ] Composants shadcn/ui utilises avec les bonnes variantes
- [ ] Pas de styles inline sauf pour les valeurs dynamiques (via CSS custom properties)
- [ ] Couleurs utilisant les tokens Tailwind (`bg-accent`, `text-app-text`) et non des hex hardcodes

---

## INSTRUCTIONS POUR CLAUDE (EXECUTION)

Pour executer ces corrections, proceder fichier par fichier :

1. **Ouvrir le fichier** indique dans le tableau
2. **Aller aux lignes** indiquees
3. **Identifier le pattern** de l'element natif
4. **Remplacer** par le composant shadcn/ui equivalent
5. **Ajouter l'import** en haut du fichier si pas deja present
6. **Adapter les props** : `className` custom → variantes shadcn/ui
7. **Verifier** que le comportement (onClick, onChange, disabled, etc.) est preserve
8. **Lancer** `pnpm typecheck && pnpm lint && pnpm build` apres chaque fichier

**Regle importante :** Ne PAS modifier les fichiers dans `src/components/ui/` - ce sont les composants shadcn/ui eux-memes.

**Ordre d'execution recommande :**

1. Commencer par les fichiers avec le plus de remplacements (cart/page.tsx, PaymentModal.tsx, etc.)
2. Faire les formulaires d'abord (input, select, textarea, label, checkbox) car ils sont plus simples
3. Faire les boutons ensuite (255 instances - le plus gros volume)
4. Terminer par les tables (7 fichiers)
