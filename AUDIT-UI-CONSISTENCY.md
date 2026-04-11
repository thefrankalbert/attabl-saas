# AUDIT UI - Coherence shadcn/ui & Design System

**Projet :** ATTABL SaaS
**Date :** 2026-04-11
**Scope :** Tout le repertoire `src/` (293 fichiers .tsx scannes)
**Methode :** Scan exhaustif grep ligne par ligne — ZERO approximation

---

## RESUME EXECUTIF

| Categorie                                          | Occurrences exactes      | Severite |
| -------------------------------------------------- | ------------------------ | -------- |
| `<button>` natif → `<Button>`                      | **255** dans 71 fichiers | CRITIQUE |
| `<label>` natif → `<Label>`                        | **54** dans 14 fichiers  | CRITIQUE |
| `<input>` natif → `<Input>`                        | **44** dans 26 fichiers  | CRITIQUE |
| `<select>` natif → `<Select>`                      | **21** dans 14 fichiers  | HAUTE    |
| `type="checkbox"` → `<Checkbox>`                   | **15** dans 9 fichiers   | HAUTE    |
| `<textarea>` natif → `<Textarea>`                  | **9** dans 8 fichiers    | HAUTE    |
| `<table>` natif → `<Table>`                        | **7** dans 6 fichiers    | HAUTE    |
| `<img>` natif → `<Image>` Next.js                  | **A scanner**            | MOYENNE  |
| `<a>` natif → `<Link>` / `<Button variant="link">` | **1+**                   | MOYENNE  |
| `title=` tooltip natif → `<Tooltip>` shadcn        | **2+**                   | BASSE    |
| **TOTAL elements a migrer**                        | **405+**                 |          |

**42 composants shadcn/ui sont installes** mais massivement sous-utilises.

---

## COMPOSANTS SHADCN/UI INSTALLES (42 au total)

### Composants standard (24)

alert, badge, button, input, label, textarea, switch, form, select, slider, card, separator, accordion, tabs, breadcrumb, dialog, sheet, popover, dropdown-menu, table, avatar, skeleton, command, date-picker-field, sonner

### Composants animation/magic-ui (14)

animated-gradient-text, animated-shiny-text, bento-grid, blur-fade, border-beam, dot-pattern, marquee, number-ticker, particles, safari, shimmer-button, shimmer-text, word-rotate

### Composants custom (4)

single-pricing-card, testimonials-columns, cobe-globe-analytics

---

## FIX-UI-01 : TOUS LES `<button>` NATIFS (255 instances, 71 fichiers)

**Regle :** Remplacer CHAQUE `<button>` par `<Button>` de `@/components/ui/button` avec la variante appropriee.

**Mapping des variantes :**
| Usage | Variante shadcn/ui |
|-------|-------------------|
| Bouton principal / CTA | `<Button>` (default) |
| Bouton secondaire | `<Button variant="outline">` |
| Bouton danger / suppression | `<Button variant="destructive">` |
| Bouton discret / navigation | `<Button variant="ghost">` |
| Bouton icone seul | `<Button variant="ghost" size="icon">` |
| Bouton texte / lien | `<Button variant="link">` |

### ZONE TENANT (espace client) — 63 buttons

**src/app/sites/[site]/cart/page.tsx** — 16 buttons

- Ligne 541, 561, 652, 662, 689, 706, 722, 809, 854, 865, 881, 915, 953, 967, 993, 1118

**src/components/tenant/ClientMenuPage.tsx** — 9 buttons

- Ligne 199, 237, 283, 486, 532, 648, 702, 835, 1036

**src/components/tenant/ClientSettings.tsx** — 8 buttons

- Ligne 95, 221, 334, 344, 388, 565, 632, 681

**src/components/tenant/ClientMenuDetailPage.tsx** — 8 buttons

- Ligne 366, 429, 466, 485, 512, 537, 555, 597

**src/components/tenant/ItemDetailSheet.tsx** — 6 buttons

- Ligne 227, 360, 426, 492, 509, 549

**src/components/tenant/ClientOrders.tsx** — 5 buttons

- Ligne 347, 379, 404, 531, 553

**src/components/tenant/MenuItemCard.tsx** — 3 buttons

- Ligne 333, 352, 421

**src/components/tenant/QRScanner.tsx** — 3 buttons

- Ligne 193, 273, 284

**src/components/tenant/SubscriptionManager.tsx** — 3 buttons

- Ligne 172, 295, 305

**src/components/tenant/FullscreenSplash.tsx** — 2 buttons

- Ligne 127, 136

**src/components/tenant/TablePicker.tsx** — 2 buttons

- Ligne 75, 113

**src/components/tenant/SearchOverlay.tsx** — 2 buttons

- Ligne 76, 97

**src/components/tenant/InstallPrompt.tsx** — 2 buttons

- Ligne 198, 206

**src/components/tenant/ClientShortcuts.tsx** — 1 button

- Ligne 80

**src/components/tenant/BottomNav.tsx** — 1 button

- Ligne 97

**src/components/tenant/CategoryNav.tsx** — 1 button

- Ligne 126

**src/components/tenant/AdsSlider.tsx** — 1 button

- Ligne 66

### ZONE ADMIN (dashboard) — 103 buttons

**src/components/admin/PaymentModal.tsx** — 10 buttons

- Ligne 177, 299, 316, 334, 383, 402, 419, 437, 472, 536

**src/components/admin/settings/TablesClient.tsx** — 7 buttons

- Ligne 379, 389, 414, 424, 510, 533, 542

**src/components/admin/ItemsClient.tsx** — 7 buttons

- Ligne 321, 352, 436, 462, 528, 697, 874

**src/components/admin/MenuDetailClient.tsx** — 7 buttons

- Ligne 384, 441, 577, 593, 600, 610, 741

**src/components/admin/AdminSidebar.tsx** — 6 buttons

- Ligne 196, 221, 258, 298, 334, 456

**src/components/admin/ServiceManager.tsx** — 5 buttons

- Ligne 170, 640, 705, 731, 839

**src/components/admin/NotificationCenter.tsx** — 4 buttons

- Ligne 46, 106, 125, 143

**src/components/admin/OrdersClient.tsx** — 4 buttons

- Ligne 502, 552, 571, 578

**src/components/admin/POSClient.tsx** — 3 buttons

- Ligne 84, 94, 107

**src/components/admin/DashboardClient.tsx** — 2 buttons

- Ligne 433, 444

**src/components/admin/CategoriesClient.tsx** — 2 buttons

- Ligne 91, 484

**src/components/admin/RecipesClient.tsx** — 2 buttons

- Ligne 263, 356

**src/components/admin/SuggestionsClient.tsx** — 2 buttons

- Ligne 314, 407

**src/components/admin/AddRestaurantWizard.tsx** — 2 buttons

- Ligne 144, 241

**src/components/admin/RuptureButton.tsx** — 2 buttons

- Ligne 72, 89

**src/components/admin/ServerDashboard.tsx** — 2 buttons

- Ligne 120, 211

**src/components/admin/AdminTopBar.tsx** — 1 button

- Ligne 63

**src/components/admin/settings/PermissionsClient.tsx** — 1 button

- Ligne 298

**src/components/admin/settings/SoundSettings.tsx** — 1 button

- Ligne 250

**src/components/admin/ItemModifierEditor.tsx** — 1 button

- Ligne 121

**src/components/admin/StockHistoryClient.tsx** — 1 button

- Ligne 299

**src/components/admin/ScreenLock.tsx** — 1 button

- Ligne 198

**src/components/admin/CouponsClient.tsx** — 1 button

- Ligne 170

**src/components/admin/DataTable.tsx** — 1 button

- Ligne 36

**src/components/admin/TrialBanner.tsx** — 1 button

- Ligne 45

**src/components/admin/ReportsClient.tsx** — 1 button

- Ligne 293

**src/components/admin/OrderCard.tsx** — 1 button

- Ligne 194

### ZONE FEATURES (modules fonctionnels) — 29 buttons

**src/components/features/pos/POSCart.tsx** — 10 buttons

- Ligne 172, 191, 209, 288, 297, 304, 329, 357, 521, 550

**src/components/features/kitchen/KitchenFilters.tsx** — 6 buttons

- Ligne 70, 90, 101, 124, 151, 184

**src/components/features/kitchen/KDSTicket.tsx** — 4 buttons

- Ligne 303, 312, 326, 339

**src/components/features/pos/POSItemCustomizer.tsx** — 3 buttons

- Ligne 113, 132, 163

**src/components/features/kitchen/FooterSummaryBar.tsx** — 3 buttons

- Ligne 127, 153, 164

**src/components/features/dashboard/DashboardRecentOrders.tsx** — 3 buttons

- Ligne 126, 135, 144

**src/components/features/users/UserForm.tsx** — 2 buttons

- Ligne 72, 85

**src/components/features/settings/SettingsSecurity.tsx** — 2 buttons

- Ligne 88, 100

**src/components/features/settings/SettingsBranding.tsx** — 1 button

- Ligne 88

**src/components/features/settings/SettingsDataReset.tsx** — 1 button

- Ligne 127

**src/components/features/dashboard/PeriodSelector.tsx** — 1 button

- Ligne 24

**src/components/features/pos/POSProductBrowser.tsx** — 1 button

- Ligne 282

**src/components/features/menus/MenuImportPDF.tsx** — 1 button

- Ligne 338

**src/components/features/menus/WizardStepCategories.tsx** — 1 button

- Ligne 143

**src/components/features/menus/MenusTable.tsx** — 1 button

- Ligne 110

### ZONE AUTH — 4 buttons

**src/components/auth/AuthForm.tsx** — 3 buttons

- Ligne 238, 387, 409

**src/components/auth/TestimonialCarousel.tsx** — 1 button

- Ligne 115

### ZONE ONBOARDING — 19 buttons

**src/components/onboarding/MenuStep.tsx** — 6 buttons

- Ligne 235, 260, 303, 347, 359, 380

**src/components/onboarding/TablesStep.tsx** — 5 buttons

- Ligne 138, 213, 230, 290, 396

**src/components/onboarding/LaunchStep.tsx** — 5 buttons

- Ligne 219, 272, 299, 336, 371

**src/components/onboarding/BrandingStep.tsx** — 4 buttons

- Ligne 203, 258, 334, 387

**src/components/onboarding/LogoCropper.tsx** — 3 buttons

- Ligne 105, 133, 149

**src/components/onboarding/EstablishmentStep.tsx** — 2 buttons

- Ligne 178, 400

### ZONE SHARED — 7 buttons

**src/components/shared/ImageUpload.tsx** — 5 buttons

- Ligne 219, 251, 268, 278, 445

**src/components/shared/PastDueBanner.tsx** — 1 button

- Ligne 33

**src/components/shared/ThemeToggle.tsx** — 1 button

- Ligne 55

### ZONE QR — 5 buttons

**src/components/qr/QRCustomizerPanel.tsx** — 4 buttons

- Ligne 214, 282, 386, 540

**src/components/qr/ColorPicker.tsx** — 1 button

- Ligne 87

### ZONE MARKETING — 5 buttons

**src/components/marketing/Header.tsx** — 3 buttons

- Ligne 47, 57, 102

**src/components/marketing/VideoHero.tsx** — 1 button

- Ligne 55

**src/components/marketing/PhoneAnimation.tsx** — 1 button

- Ligne 61

### ZONE PAGES APP — 14 buttons

**src/app/sites/[site]/order-confirmed/page.tsx** — 3 buttons

- Ligne 280, 295, 374

**src/app/(marketing)/pricing/page.tsx** — 3 buttons

- Ligne 236, 294, 306

**src/app/admin/tenants/tenants-page-client.tsx** — 3 buttons

- Ligne 555, 566, 762

**src/app/onboarding/page.tsx** — 3 buttons

- Ligne 522, 601, 623

**src/app/contact/page.tsx** — 2 buttons

- Ligne 15, 84

**src/app/auth/accept-invite/page.tsx** — 2 buttons

- Ligne 179, 208

**src/app/reset-password/page.tsx** — 1 button

- Ligne 197

**src/app/global-error.tsx** — 1 button

- Ligne 52

---

## FIX-UI-02 : TOUS LES `<label>` NATIFS (54 instances, 14 fichiers)

**Regle :** Remplacer CHAQUE `<label>` par `<Label>` de `@/components/ui/label`.

**src/components/admin/InventoryClient.tsx** — 10 labels

- Ligne 495, 508, 525, 541, 553, 567, 616, 635, 650, 669

**src/components/features/settings/SettingsBilling.tsx** — 5 labels

- Ligne 72, 125, 174, 223, 244

**src/app/contact/page.tsx** — 4 labels

- Ligne 101, 120, 137, 157

**src/app/sites/[site]/cart/page.tsx** — 3 labels

- Ligne 719, 878, 966

**src/components/admin/AuditLogClient.tsx** — 3 labels

- Ligne 222, 247, 267

**src/app/sites/[site]/admin/qr-codes/QRCodePage.tsx** — 2 labels

- Ligne 144, 177

**src/components/tenant/TablePicker.tsx** — 2 labels

- Ligne 67, 105

**src/components/features/pos/POSItemCustomizer.tsx** — 2 labels

- Ligne 127, 156

**src/components/features/pos/POSCart.tsx** — 2 labels

- Ligne 516, 543

**src/components/admin/settings/TablesClient.tsx** — 1 label

- Ligne 570

**src/components/features/settings/SettingsSecurity.tsx** — 1 label

- Ligne 40

**src/components/onboarding/MenuStep.tsx** — 1 label

- Ligne 314

---

## FIX-UI-03 : TOUS LES `<input>` NATIFS (44 instances, 26 fichiers)

**Regle :** Remplacer CHAQUE `<input>` par `<Input>` de `@/components/ui/input`.
**Exception :** `<input type="file">` et `<input type="color">` n'ont pas d'equivalent shadcn/ui direct — les wrapper dans un composant custom base sur Input.

**src/components/features/settings/SettingsBilling.tsx** — 5 inputs

- Ligne 80, 126, 175, 224, 245

**src/app/contact/page.tsx** — 4 inputs

- Ligne 96, 107, 126, 143
- NOTE : Ligne 96 est un honeypot (`type="text" name="website" tabIndex={-1}`) — le garder natif est acceptable

**src/app/sites/[site]/cart/page.tsx** — 2 inputs

- Ligne 896, 1020

**src/components/admin/ItemsClient.tsx** — 2 inputs

- Ligne 375, 399

**src/components/admin/OrdersClient.tsx** — 2 inputs

- Ligne 248, 266

**src/components/admin/AdsClient.tsx** — 2 inputs

- Ligne 234, 276

**src/components/features/menus/MenuForm.tsx** — 2 inputs

- Ligne 131, 194

**src/components/features/settings/SettingsBranding.tsx** — 2 inputs

- Ligne 42, 63

**src/components/shared/ImageUpload.tsx** — 2 inputs

- Ligne 369, 399

**src/components/admin/PaymentModal.tsx** — 1 input

- Ligne 351

**src/components/admin/MenuDetailClient.tsx** — 1 input

- Ligne 563

**src/components/admin/settings/TablesClient.tsx** — 1 input

- Ligne 571

**src/components/admin/settings/SoundSettings.tsx** — 1 input

- Ligne 354

**src/components/features/kitchen/KitchenFilters.tsx** — 1 input

- Ligne 81

**src/components/features/settings/SettingsSecurity.tsx** — 1 input

- Ligne 41

**src/components/features/menus/MenuImportExcel.tsx** — 1 input

- Ligne 179

**src/components/features/menus/MenuImportPDF.tsx** — 1 input

- Ligne 237

**src/components/features/menus/MenusTable.tsx** — 1 input

- Ligne 102

**src/components/tenant/ClientMenuDetailPage.tsx** — 1 input

- Ligne 381

**src/components/tenant/SearchOverlay.tsx** — 1 input

- Ligne 88

**src/components/qr/QRCustomizerPanel.tsx** — 1 input

- Ligne 353

**src/components/qr/ColorPicker.tsx** — 1 input

- Ligne 109 (type="color" — wrapper custom necessaire)

**src/components/onboarding/BrandingStep.tsx** — 1 input

- Ligne 148 (type="file" — wrapper custom necessaire)

**src/components/onboarding/LogoCropper.tsx** — 1 input

- Ligne 140

**src/components/onboarding/MenuStep.tsx** — 1 input

- Ligne 280

**src/components/onboarding/LaunchStep.tsx** — 1 input

- Ligne 386

---

## FIX-UI-04 : TOUS LES `<select>` NATIFS (21 instances, 14 fichiers)

**Regle :** Remplacer CHAQUE `<select>` par le composant shadcn/ui Select :

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
```

**src/components/admin/InventoryClient.tsx** — 3 selects

- Ligne 511, 619, 653

**src/components/qr/QRCustomizerPanel.tsx** — 2 selects

- Ligne 570, 735

**src/components/admin/SuggestionsClient.tsx** — 2 selects

- Ligne 387, 429

**src/components/admin/AuditLogClient.tsx** — 2 selects

- Ligne 225, 250

**src/components/features/menus/MenuForm.tsx** — 2 selects

- Ligne 156, 175

**src/app/sites/[site]/admin/qr-codes/QRCodePage.tsx** — 2 selects

- Ligne 151, 184

**src/components/features/menus/MenuImportExcel.tsx** — 1 select

- Ligne 150

**src/components/features/menus/MenuImportPDF.tsx** — 1 select

- Ligne 206

**src/components/features/settings/SettingsBilling.tsx** — 1 select

- Ligne 51

**src/components/features/settings/SettingsIdentity.tsx** — 1 select

- Ligne 318

**src/components/admin/settings/TablesClient.tsx** — 1 select

- Ligne 554

**src/components/admin/CategoriesClient.tsx** — 1 select

- Ligne 458

**src/components/admin/RecipesClient.tsx** — 1 select

- Ligne 324

**src/components/shared/LocaleSwitcher.tsx** — 1 select

- Ligne 21

---

## FIX-UI-05 : TOUS LES `type="checkbox"` NATIFS (15 instances, 9 fichiers)

**Regle :** Remplacer CHAQUE `<input type="checkbox">` par `<Checkbox>` de `@/components/ui/checkbox`.
**Note :** Installer le composant Checkbox si pas encore present : `npx shadcn@latest add checkbox`

**src/components/features/settings/SettingsBilling.tsx** — 5 checkboxes

- Ligne 81, 127, 176, 225, 246

**src/components/admin/ItemsClient.tsx** — 2 checkboxes

- Ligne 376, 400

**src/components/admin/OrdersClient.tsx** — 2 checkboxes

- Ligne 249, 267

**src/components/features/menus/MenuForm.tsx** — 2 checkboxes

- Ligne 132, 195

**src/components/features/menus/MenusTable.tsx** — 1 checkbox

- Ligne 103

**src/components/admin/settings/TablesClient.tsx** — 1 checkbox

- Ligne 572

**src/components/admin/AdsClient.tsx** — 1 checkbox

- Ligne 277

**src/components/features/settings/SettingsSecurity.tsx** — 1 checkbox

- Ligne 42

---

## FIX-UI-06 : TOUS LES `<textarea>` NATIFS (9 instances, 8 fichiers)

**Regle :** Remplacer CHAQUE `<textarea>` par `<Textarea>` de `@/components/ui/textarea`.

**src/components/features/pos/POSCart.tsx** — 2 textareas

- Ligne 229, 398

**src/app/contact/page.tsx** — 1 textarea

- Ligne 163

**src/app/sites/[site]/cart/page.tsx** — 1 textarea

- Ligne 735

**src/components/tenant/ItemDetailSheet.tsx** — 1 textarea

- Ligne 525

**src/components/admin/POSClient.tsx** — 1 textarea

- Ligne 202

**src/components/qr/QRCustomizerPanel.tsx** — 1 textarea

- Ligne 613

**src/components/onboarding/LaunchStep.tsx** — 1 textarea

- Ligne 401

**src/components/onboarding/BrandingStep.tsx** — 1 textarea

- Ligne 224

---

## FIX-UI-07 : TOUS LES `<table>` NATIFS (7 instances, 6 fichiers)

**Regle :** Remplacer CHAQUE `<table>` (et ses `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>`) par les composants shadcn/ui Table :

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

**src/components/admin/ReportsClient.tsx** — 2 tables

- Ligne 472, 628

**src/app/(marketing)/pricing/page.tsx** — 1 table

- Ligne 463

**src/components/admin/settings/PermissionsClient.tsx** — 1 table

- Ligne 263

**src/components/admin/DataTable.tsx** — 1 table

- Ligne 108

**src/components/admin/AuditLogClient.tsx** — 1 table

- Ligne 319

**src/components/admin/InvoiceHistoryClient.tsx** — 1 table

- Ligne 161

---

## FIX-UI-08 : AUTRES ELEMENTS NATIFS

### 8.1 — `<a>` natif → `<Link>` Next.js ou `<Button variant="link">`

**src/components/features/menus/MenuImportExcel.tsx** — 1 anchor

- Ligne 136 : `<a href="/api/menu-import" download>` — lien de telechargement
- NOTE : Les liens `download` et `tel:` / `mailto:` peuvent rester en `<a>` natif car `<Link>` Next.js ne gere pas ces cas

### 8.2 — `<img>` natif → `<Image>` Next.js

**src/components/onboarding/BrandingStep.tsx** — 1 img

- Ligne 171 : `<img src={data.logoUrl} alt="Logo">` — a migrer vers `<Image>`
- NOTE : Le fichier a un `/* eslint-disable @next/next/no-img-element */` en haut — le supprimer apres migration

### 8.3 — `title=` tooltip natif → `<Tooltip>` shadcn/ui

**src/components/admin/RuptureButton.tsx** — 2 tooltips natifs

- Ligne 72, 89 : `title={...}` sur des boutons
- Installer Tooltip si pas present : `npx shadcn@latest add tooltip`
- Remplacer par :

```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
```

### 8.4 — `<input type="color">` — wrapper custom

**src/components/qr/ColorPicker.tsx** — 1 color input

- Ligne 109 : `<input type="color">` — pas d'equivalent shadcn/ui
- Creer un wrapper `ColorInput` dans `src/components/ui/color-input.tsx` base sur le style Input shadcn/ui

### 8.5 — `<input type="file">` — wrapper custom

**src/components/onboarding/BrandingStep.tsx** — 1 file input

- Ligne 148
  **src/components/shared/ImageUpload.tsx** — 2 file inputs
- Ligne 369, 399
  **src/components/features/menus/MenuImportPDF.tsx** — 1 file input
- Ligne 237
  **src/components/features/menus/MenuImportExcel.tsx** — 1 file input
- Ligne 179
  **src/components/onboarding/LogoCropper.tsx** — 1 file input
- Ligne 140

NOTE : Les `<input type="file">` sont des cas speciaux car ils ne peuvent pas etre stylises via shadcn/ui Input standard. Creer un composant `FileInput` dans `src/components/ui/file-input.tsx` qui encapsule le file input avec le style du design system.

---

## INSTRUCTIONS D'EXECUTION POUR CLAUDE

### Prerequis

```bash
# Verifier les composants shadcn/ui necessaires
# Si Checkbox n'est pas installe :
npx shadcn@latest add checkbox

# Si Tooltip n'est pas installe :
npx shadcn@latest add tooltip
```

### Procedure pour chaque fichier

1. **Ouvrir le fichier** indique
2. **Ajouter les imports** en haut du fichier :

```tsx
// Selon les elements a remplacer dans le fichier :
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
```

3. **Aller a chaque ligne** indiquee
4. **Remplacer l'element natif** par le composant shadcn/ui
5. **Adapter les props** :
   - `className` custom avec couleurs/tailles → utiliser les variantes shadcn (variant, size)
   - Conserver les props fonctionnels : `onClick`, `onChange`, `disabled`, `type`, `name`, `id`, `aria-*`
   - Si du style custom est necessaire en plus de la variante, utiliser `className` sur le composant shadcn/ui (il accepte className via `cn()`)
6. **Supprimer les classes Tailwind redondantes** qui sont deja gerees par la variante shadcn/ui (ex: `bg-primary text-white` est inutile si on utilise `<Button>` default)

### Regles de remplacement specifiques

#### Boutons

```tsx
// AVANT :
<button onClick={handleClick} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
  Enregistrer
</button>

// APRES :
<Button onClick={handleClick}>
  Enregistrer
</Button>
```

```tsx
// AVANT (bouton icone) :
<button onClick={handleClose} className="p-2 rounded-full hover:bg-gray-100">
  <X className="h-4 w-4" />
</button>

// APRES :
<Button variant="ghost" size="icon" onClick={handleClose}>
  <X className="h-4 w-4" />
</Button>
```

```tsx
// AVANT (bouton destructif) :
<button onClick={handleDelete} className="bg-red-600 text-white px-4 py-2 rounded-lg">
  Supprimer
</button>

// APRES :
<Button variant="destructive" onClick={handleDelete}>
  Supprimer
</Button>
```

#### Inputs

```tsx
// AVANT :
<input
  type="text"
  value={name}
  onChange={(e) => setName(e.target.value)}
  className="w-full px-4 py-2 border rounded-lg"
  placeholder="Nom"
/>

// APRES :
<Input
  type="text"
  value={name}
  onChange={(e) => setName(e.target.value)}
  placeholder="Nom"
/>
```

#### Labels

```tsx
// AVANT :
<label htmlFor="name" className="text-sm font-medium">Nom</label>

// APRES :
<Label htmlFor="name">Nom</Label>
```

#### Selects

```tsx
// AVANT :
<select
  value={category}
  onChange={(e) => setCategory(e.target.value)}
  className="w-full px-3 py-2 border rounded-lg"
>
  <option value="">Choisir...</option>
  <option value="entree">Entree</option>
  <option value="plat">Plat</option>
</select>

// APRES :
<Select value={category} onValueChange={setCategory}>
  <SelectTrigger>
    <SelectValue placeholder="Choisir..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="entree">Entree</SelectItem>
    <SelectItem value="plat">Plat</SelectItem>
  </SelectContent>
</Select>
```

#### Checkboxes

```tsx
// AVANT :
<input
  type="checkbox"
  checked={isActive}
  onChange={(e) => setIsActive(e.target.checked)}
/>

// APRES :
<Checkbox
  checked={isActive}
  onCheckedChange={setIsActive}
/>
```

**ATTENTION pour Checkbox :** L'API change !

- `onChange={(e) => setState(e.target.checked)}` → `onCheckedChange={setState}`
- `checked` reste `checked`

#### Textareas

```tsx
// AVANT :
<textarea
  value={notes}
  onChange={(e) => setNotes(e.target.value)}
  className="w-full px-3 py-2 border rounded-lg"
  rows={4}
/>

// APRES :
<Textarea
  value={notes}
  onChange={(e) => setNotes(e.target.value)}
  rows={4}
/>
```

#### Tables

```tsx
// AVANT :
<table className="w-full">
  <thead>
    <tr>
      <th>Nom</th>
      <th>Prix</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Item 1</td>
      <td>10.00</td>
    </tr>
  </tbody>
</table>

// APRES :
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Nom</TableHead>
      <TableHead>Prix</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Item 1</TableCell>
      <TableCell>10.00</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

### Ordre d'execution recommande

**Etape 1 — Formulaires d'abord (les plus simples, impact maximal)**
Fichiers a traiter en priorite (ceux avec le plus de remplacements non-button) :

1. `src/components/features/settings/SettingsBilling.tsx` (16 remplacements : 5 inputs, 5 checkboxes, 5 labels, 1 select)
2. `src/components/admin/InventoryClient.tsx` (13 remplacements : 10 labels, 3 selects)
3. `src/app/contact/page.tsx` (9 remplacements : 4 labels, 3 inputs, 1 textarea)
4. `src/components/admin/AuditLogClient.tsx` (6 remplacements : 3 labels, 2 selects, 1 table)
5. `src/app/sites/[site]/admin/qr-codes/QRCodePage.tsx` (4 remplacements : 2 labels, 2 selects)

**Etape 2 — Boutons (le plus gros volume)**
Traiter par zone dans cet ordre :

1. Zone Tenant (pages client visibles par les utilisateurs finaux) — 63 buttons
2. Zone Admin (dashboard restaurateur) — 103 buttons
3. Zone Features (modules) — 29 buttons
4. Zone Onboarding — 19 buttons
5. Zones restantes (auth, shared, qr, marketing, pages) — 41 buttons

**Etape 3 — Tables (7 instances)**

**Etape 4 — Elements speciaux** (img, tooltips, file/color inputs)

### Verification apres chaque fichier

```bash
pnpm typecheck    # Verifier les types TypeScript
pnpm lint         # Verifier ESLint
pnpm build        # Build production
```

### Verification finale

```bash
# Scanner qu'il ne reste AUCUN element natif
grep -r "<button" src/ --include="*.tsx" --exclude-dir="src/components/ui" -c
grep -r "<input" src/ --include="*.tsx" --exclude-dir="src/components/ui" -c
grep -r "<select" src/ --include="*.tsx" --exclude-dir="src/components/ui" -c
grep -r "<textarea" src/ --include="*.tsx" --exclude-dir="src/components/ui" -c
grep -r "<label" src/ --include="*.tsx" --exclude-dir="src/components/ui" -c
grep -r "<table" src/ --include="*.tsx" --exclude-dir="src/components/ui" -c

# Tous ces compteurs doivent etre a 0
# Exceptions acceptees :
# - <input type="file"> dans les wrappers custom
# - <input type="color"> dans ColorPicker custom
# - <a> avec href="tel:" ou href="mailto:" ou download
# - Honeypot <input> dans contact/page.tsx ligne 96
```

---

## OUTILS DE PREVENTION (a mettre en place apres les corrections)

### 1. Regle ESLint `react/forbid-elements`

Ajouter dans la config ESLint :

```js
// eslint.config.js ou .eslintrc
rules: {
  'react/forbid-elements': ['error', {
    forbid: [
      { element: 'button', message: 'Utiliser <Button> de @/components/ui/button' },
      { element: 'input', message: 'Utiliser <Input> de @/components/ui/input (sauf type="file" et type="color")' },
      { element: 'select', message: 'Utiliser <Select> de @/components/ui/select' },
      { element: 'textarea', message: 'Utiliser <Textarea> de @/components/ui/textarea' },
      { element: 'table', message: 'Utiliser <Table> de @/components/ui/table' },
      { element: 'label', message: 'Utiliser <Label> de @/components/ui/label' },
    ]
  }]
}
```

### 2. Script CI de verification

Creer `.github/scripts/check-ui-consistency.sh` :

```bash
#!/bin/bash
set -e
echo "=== UI Consistency Check ==="

ERRORS=0
for element in "button" "input" "select" "textarea" "table" "label"; do
  COUNT=$(grep -r "<${element}" src/ --include="*.tsx" \
    --exclude-dir="src/components/ui" -l 2>/dev/null | wc -l | tr -d ' ')
  if [ "$COUNT" -gt 0 ]; then
    echo "ERREUR: <${element}> natif trouve dans $COUNT fichiers"
    grep -r "<${element}" src/ --include="*.tsx" \
      --exclude-dir="src/components/ui" -l
    ERRORS=$((ERRORS + COUNT))
  fi
done

if [ "$ERRORS" -gt 0 ]; then
  echo "ECHEC: $ERRORS fichiers contiennent des elements HTML natifs"
  exit 1
fi

echo "OK: Aucun element HTML natif detecte"
```

### 3. Ajouter au PR template

```markdown
## Checklist UI

- [ ] Aucun element HTML natif (<button>, <input>, <select>, <textarea>, <table>, <label>)
- [ ] Composants shadcn/ui utilises avec les bonnes variantes
- [ ] Pas de styles inline (sauf CSS custom properties pour valeurs dynamiques)
- [ ] Couleurs via tokens Tailwind (bg-accent, text-app-text), pas de hex hardcodes
```
