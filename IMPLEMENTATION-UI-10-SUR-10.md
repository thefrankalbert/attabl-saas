# IMPLEMENTATION UI — Objectif 10/10

**But** : Ce document contient TOUTES les corrections restantes pour atteindre un score parfait sur chaque critere UI. Chaque correction est exacte (fichier, ligne, avant/apres). Un agent Claude Code doit pouvoir suivre ce document et implementer chaque correction sans ambiguite.

**REGLE ABSOLUE** : Lire chaque fichier EN ENTIER avant de le modifier. Ne modifier QUE ce qui est indique. Ne rien "refactorer" d'autre. Apres chaque fichier modifie, lancer `pnpm typecheck && pnpm lint`.

---

## TABLE DE CORRESPONDANCE DES COULEURS TENANT

Ces hex sont utilises partout dans les composants tenant. Voici le mapping unique :

| Hex en dur | Classe Tailwind                  | Variable CSS (.tenant-client)   |
| ---------- | -------------------------------- | ------------------------------- |
| `#1A1A1A`  | `text-app-text` ou `bg-app-text` | `--app-text: #1a1a1a`           |
| `#737373`  | `text-app-text-secondary`        | `--app-text-secondary: #737373` |
| `#B0B0B0`  | `text-app-text-muted`            | `--app-text-muted: #b0b0b0`     |
| `#F6F6F6`  | `bg-app-elevated`                | `--app-elevated: #f6f6f6`       |
| `#EEEEEE`  | `border-app-border`              | `--app-border: #eeeeee`         |
| `#FFFFFF`  | `bg-app-bg`                      | `--app-bg: #ffffff`             |
| `#FF3008`  | `text-danger`                    | `--color-danger: #ff3008`       |
| `#06C167`  | `text-accent`                    | `--app-accent: #06c167`         |

**Cas special `#FFB800`** : Cette couleur (jaune/allergene) n'existe pas dans globals.css. AVANT de commencer les corrections, ajouter dans `src/app/globals.css` a l'interieur du bloc `.tenant-client` :

```css
--color-allergen: #ffb800 !important;
```

Et dans le bloc `@theme inline` de globals.css :

```css
--color-allergen: #ffb800;
```

Ensuite utiliser `text-allergen` ou `text-[var(--color-allergen)]` selon ce que Tailwind v4 supporte.

**Cas special `bg-[#EEEEEE]`** : Quand `#EEEEEE` est utilise comme background (diviseur visuel), utiliser `bg-app-border` (la couleur de bordure utilisee comme fond de separateur).

---

## CHANTIER 1 — Composants tenant (6 fichiers, ~89 hex a remplacer)

### 1.1 src/components/tenant/BottomNav.tsx

**Etape 1** : Supprimer le const COLORS (lignes 9-14) :

```
SUPPRIMER :
const C = {
  primary: '#1A1A1A',
  background: '#FFFFFF',
  divider: '#EEEEEE',
  textMuted: '#B0B0B0',
}
```

**Etape 2** : Remplacer les references a C.primary, C.textMuted, etc. dans les props `color=` des icones Lucide :

- `color={active ? C.primary : C.textMuted}` → remplacer par `className={active ? 'text-app-text' : 'text-app-text-muted'}` et supprimer la prop `color=`

**Etape 3** : Remplacer les hex dans les classNames :
| Ligne | Avant | Apres |
|-------|-------|-------|
| 74 | `bg-[#FFFFFF] border-t border-[#EEEEEE]` | `bg-app-bg border-t border-app-border` |
| 92 | `bg-[#1A1A1A] border-2 border-[#FFFFFF]` | `bg-app-text border-2 border-app-bg` |
| 97 | `'text-[#1A1A1A]' : 'text-[#B0B0B0]'` | `'text-app-text' : 'text-app-text-muted'` |

**Etape 4** : Remplacer les styles inline par des classes Tailwind (si des `style=` existent).

---

### 1.2 src/components/tenant/ItemDetailSheet.tsx

Remplacements systematiques (chercher-remplacer dans tout le fichier) :

| Chercher           | Remplacer par                  |
| ------------------ | ------------------------------ |
| `text-[#1A1A1A]`   | `text-app-text`                |
| `text-[#737373]`   | `text-app-text-secondary`      |
| `text-[#B0B0B0]`   | `text-app-text-muted`          |
| `bg-[#F6F6F6]`     | `bg-app-elevated`              |
| `bg-[#EEEEEE]`     | `bg-app-border`                |
| `border-[#EEEEEE]` | `border-app-border`            |
| `border-[#1A1A1A]` | `border-app-text`              |
| `bg-[#1A1A1A]`     | `bg-app-text`                  |
| `text-[#FF3008]`   | `text-danger`                  |
| `text-[#FFB800]`   | `text-[var(--color-allergen)]` |

**Attention ligne 296** : `bg-[#F6F6F6] text-[#FF3008]` → `bg-app-elevated text-danger`
**Attention ligne 302** : `bg-[#F6F6F6] text-[#FFB800]` → `bg-app-elevated text-[var(--color-allergen)]`

---

### 1.3 src/components/tenant/TablePicker.tsx

| Chercher             | Remplacer par             |
| -------------------- | ------------------------- |
| `text-[#737373]`     | `text-app-text-secondary` |
| `bg-[#1A1A1A]`       | `bg-app-text`             |
| `hover:bg-[#F6F6F6]` | `hover:bg-app-elevated`   |
| `text-[#B0B0B0]`     | `text-app-text-muted`     |
| `bg-[#EEEEEE]`       | `bg-app-border`           |

---

### 1.4 src/components/tenant/FullscreenSplash.tsx

| Chercher           | Remplacer par             |
| ------------------ | ------------------------- |
| `border-[#EEEEEE]` | `border-app-border`       |
| `text-[#1A1A1A]`   | `text-app-text`           |
| `text-[#B0B0B0]`   | `text-app-text-muted`     |
| `text-[#737373]`   | `text-app-text-secondary` |

**EXCEPTION** : Ligne 56 `primaryColor = '#1A1A1A'` — GARDER tel quel. C'est un prop dynamique pour la personnalisation tenant.

---

### 1.5 src/components/tenant/SearchOverlay.tsx

| Chercher              | Remplacer par             |
| --------------------- | ------------------------- |
| `border-[#EEEEEE]/50` | `border-app-border/50`    |
| `hover:bg-[#F6F6F6]`  | `hover:bg-app-elevated`   |
| `bg-[#F6F6F6]`        | `bg-app-elevated`         |
| `text-[#B0B0B0]`      | `text-app-text-muted`     |
| `text-[#737373]`      | `text-app-text-secondary` |

---

### 1.6 src/components/tenant/InstallPrompt.tsx

| Chercher           | Remplacer par             |
| ------------------ | ------------------------- |
| `border-[#EEEEEE]` | `border-app-border`       |
| `text-[#1A1A1A]`   | `text-app-text`           |
| `text-[#B0B0B0]`   | `text-app-text-muted`     |
| `text-[#737373]`   | `text-app-text-secondary` |

---

## CHANTIER 2 — ServiceManager.tsx (16 styles inline)

Fichier : `src/components/admin/ServiceManager.tsx`

Pour chaque ligne, supprimer `style={{...}}` et ajouter la classe Tailwind equivalente dans le `className` existant :

| Ligne   | Style inline a supprimer                                                                                 | Classe Tailwind a ajouter au className                                                 |
| ------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 94      | `style={{ gap: isH ? 5 : 4 }}`                                                                           | Conditionnel : `className={cn(existant, isH ? 'gap-[5px]' : 'gap-1')}`                 |
| 100-103 | `style={ isH ? { width: 24, height: 8, borderRadius: 4 } : { width: 8, height: 24, borderRadius: 4 } }`  | Conditionnel : `className={cn(existant, isH ? 'w-6 h-2 rounded' : 'w-2 h-6 rounded')}` |
| 149     | `style={{ marginBottom: 2 }}`                                                                            | `mb-0.5`                                                                               |
| 154     | `style={{ gap: 2 }}`                                                                                     | `gap-0.5`                                                                              |
| 162     | `style={{ borderRadius: 8, minHeight: 120 }}`                                                            | `rounded-lg min-h-[120px]`                                                             |
| 225     | `style={{ marginTop: 2 }}`                                                                               | `mt-0.5`                                                                               |
| 252     | `style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)' }}`                                               | `bg-white/[0.02]`                                                                      |
| 255     | `style={{ minWidth: 42 }}`                                                                               | `min-w-[42px]`                                                                         |
| 539-542 | `style={{ borderRight: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(13, 16, 23, 0.95)' }}` | `border-r border-app-border bg-app-bg/95`                                              |
| 559     | `style={{ scrollbarWidth: 'none' }}`                                                                     | `[scrollbar-width:none]`                                                               |
| 621     | `style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)' }}`                                               | `bg-white/[0.02]`                                                                      |
| 623     | `style={{ minWidth: 42 }}`                                                                               | `min-w-[42px]`                                                                         |
| 675     | `style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)' }}`                                               | `bg-white/[0.02]`                                                                      |
| 699     | `style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}`                                           | `border-b border-app-border`                                                           |
| 703     | `style={{ scrollbarWidth: 'none' }}`                                                                     | `[scrollbar-width:none]`                                                               |
| 768     | `style={{ scrollbarWidth: 'none' }}`                                                                     | `[scrollbar-width:none]`                                                               |

**Objectif** : ZERO `style=` dans ce fichier apres correction.

---

## CHANTIER 3 — Boutons natifs restants (67 → 0)

Migrer chaque `<button>` natif vers `<Button>` de `@/components/ui/button`.

### Exceptions a NE PAS migrer :

- `src/app/global-error.tsx:75` — Error boundary, Tailwind peut ne pas etre charge. GARDER natif.

### Fichiers admin (par priorite) :

| Fichier                                       | Lignes                                 | Type                      | Migration                                                  |
| --------------------------------------------- | -------------------------------------- | ------------------------- | ---------------------------------------------------------- |
| `src/components/admin/PaymentModal.tsx`       | 296, 313, 331, 380, 399, 416, 434, 469 | Boutons numpad/tips       | `<Button variant="outline">` ou `<Button variant="ghost">` |
| `src/components/admin/AdminSidebar.tsx`       | 197, 222, 299, 335                     | Trigger popover + actions | `<Button variant="ghost">`                                 |
| `src/components/admin/NotificationCenter.tsx` | 103                                    | Action                    | `<Button variant="ghost" size="icon">`                     |
| `src/components/admin/ItemsClient.tsx`        | 490                                    | Action                    | `<Button variant="ghost" size="icon">`                     |

### Fichiers tenant (par priorite) :

| Fichier                                          | Lignes                                 | Type                 | Migration                              |
| ------------------------------------------------ | -------------------------------------- | -------------------- | -------------------------------------- |
| `src/components/tenant/ClientMenuDetailPage.tsx` | 431, 468, 487, 514, 539, 557, 599      | Actions menu detail  | `<Button>` avec variantes appropriees  |
| `src/components/tenant/ClientMenuPage.tsx`       | 207, 236, 269, 434, 469, 554, 588, 683 | Navigation + actions | `<Button variant="ghost">`             |
| `src/components/tenant/BottomNav.tsx`            | 81 (multiple)                          | Onglets nav          | `<Button variant="ghost">`             |
| `src/components/tenant/ClientSettings.tsx`       | 335, 345, 389                          | Actions settings     | `<Button>`                             |
| `src/components/tenant/SubscriptionManager.tsx`  | 172, 295, 305                          | Actions abo          | `<Button>`                             |
| `src/components/tenant/CategoryNav.tsx`          | 126                                    | Filtre categorie     | `<Button variant="ghost" size="sm">`   |
| `src/components/tenant/MenuItemCard.tsx`         | 354                                    | Ajouter au panier    | `<Button>`                             |
| `src/components/tenant/AdsSlider.tsx`            | 66                                     | Navigation slider    | `<Button variant="ghost" size="icon">` |
| `src/components/tenant/SearchOverlay.tsx`        | 76, 96                                 | Fermer + clear       | `<Button variant="ghost" size="icon">` |
| `src/components/tenant/ClientShortcuts.tsx`      | 80                                     | Raccourci            | `<Button variant="ghost">`             |
| `src/components/tenant/ItemDetailSheet.tsx`      | 330, 379                               | Actions detail       | `<Button>`                             |
| `src/components/tenant/TablePicker.tsx`          | 77, 109                                | Selection table      | `<Button variant="outline">`           |
| `src/components/tenant/FullscreenSplash.tsx`     | 126, 135                               | Actions splash       | `<Button>`                             |

### Fichiers marketing/shared :

| Fichier                                                 | Lignes        | Type           | Migration                                |
| ------------------------------------------------------- | ------------- | -------------- | ---------------------------------------- |
| `src/components/marketing/VideoHero.tsx`                | 55            | Segment pill   | `<Button variant="ghost" size="sm">`     |
| `src/components/marketing/PhoneAnimation.tsx`           | 61            | Dot navigation | `<Button variant="ghost" size="icon">`   |
| `src/components/shared/ThemeToggle.tsx`                 | 55            | Toggle theme   | `<Button variant="ghost" size="icon">`   |
| `src/components/qr/ColorPicker.tsx`                     | 87            | Preset couleur | `<Button variant="outline" size="icon">` |
| `src/components/features/settings/SettingsBranding.tsx` | 88            | Upload         | `<Button>`                               |
| `src/components/features/menus/MenusTable.tsx`          | 110           | Action table   | `<Button variant="ghost" size="icon">`   |
| `src/app/(marketing)/pricing/page.tsx`                  | 236, 294, 306 | Toggle billing | `<Button variant="ghost">`               |
| `src/app/contact/page.tsx`                              | 19            | Submit form    | `<Button type="submit">`                 |

### Fichiers UI (cas speciaux) :

| Fichier                                     | Lignes        | Action                                                                                                           |
| ------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/single-pricing-card.tsx` | 165, 183, 276 | Composant UI — migrer vers `<Button>` avec les bons variants                                                     |
| `src/components/ui/shimmer-button.tsx`      | 30            | Composant decoratif — ce `<button>` EST le composant, GARDER natif mais s'assurer qu'il est stylise correctement |

---

## CHANTIER 4 — Inputs natifs restants (23 a migrer)

Migrer chaque `<input>` natif vers `<Input>` de `@/components/ui/input`.

### Exceptions a NE PAS migrer :

- `<input type="file">` (6 instances) — pas d'equivalent shadcn
- `<input type="color">` (1 instance dans ColorPicker.tsx) — pas d'equivalent shadcn
- `src/app/contact/page.tsx:101` — honeypot anti-spam, GARDER natif et cache

### Fichiers a migrer :

| Fichier                                                 | Lignes                 | Import a ajouter                                |
| ------------------------------------------------------- | ---------------------- | ----------------------------------------------- |
| `src/components/onboarding/MenuStep.tsx`                | 286                    | `import { Input } from '@/components/ui/input'` |
| `src/components/qr/QRCustomizerPanel.tsx`               | 363                    | `import { Input } from '@/components/ui/input'` |
| `src/components/admin/OrdersClient.tsx`                 | 256, 274               | `import { Input } from '@/components/ui/input'` |
| `src/components/admin/settings/SoundSettings.tsx`       | 355                    | `import { Input } from '@/components/ui/input'` |
| `src/components/admin/settings/TablesClient.tsx`        | 587                    | `import { Input } from '@/components/ui/input'` |
| `src/components/admin/AdsClient.tsx`                    | 234, 276               | `import { Input } from '@/components/ui/input'` |
| `src/components/admin/ItemsClient.tsx`                  | 402, 426               | `import { Input } from '@/components/ui/input'` |
| `src/components/features/menus/MenuForm.tsx`            | 138, 207               | `import { Input } from '@/components/ui/input'` |
| `src/components/features/menus/MenusTable.tsx`          | 102                    | `import { Input } from '@/components/ui/input'` |
| `src/components/features/settings/SettingsBilling.tsx`  | 93, 139, 188, 237, 258 | `import { Input } from '@/components/ui/input'` |
| `src/components/features/settings/SettingsBranding.tsx` | 42, 63                 | `import { Input } from '@/components/ui/input'` |
| `src/components/features/settings/SettingsSecurity.tsx` | 42                     | `import { Input } from '@/components/ui/input'` |

---

## CHANTIER 5 — Table native restante (1 → 0)

Fichier : `src/app/(marketing)/pricing/page.tsx` ligne 463

- Migrer `<table>` natif vers `<Table>` de `@/components/ui/table`
- Importer : `import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'`

---

## CHANTIER 6 — Border-radius (11 variantes → 3+1)

Convention a appliquer dans TOUS les composants admin (`src/components/admin/`) :

| Element                          | Classe autorisee    | Interdit                                  |
| -------------------------------- | ------------------- | ----------------------------------------- |
| Boutons, inputs, petits elements | `rounded-lg` (8px)  | `rounded-sm`, `rounded-md`, `rounded-2xl` |
| Cartes, modales, panneaux        | `rounded-xl` (12px) | `rounded-2xl` sauf mobile bottom sheet    |
| Badges, avatars, points          | `rounded-full`      | —                                         |
| Mobile bottom sheet (haut)       | `rounded-t-2xl`     | OK, convention mobile                     |

**Chercher et remplacer dans src/components/admin/ :**
| Chercher | Remplacer par | Contexte |
|----------|--------------|---------|
| `rounded-sm` | `rounded-lg` | Partout sauf si c'est un cas tres specifique |
| `rounded-md` | `rounded-lg` | Boutons, inputs, badges |
| `rounded-2xl` | `rounded-xl` | Cartes (sauf bottom sheet mobile) |
| `borderRadius: 8` (inline) | `rounded-lg` | ServiceManager (deja couvert chantier 2) |

**Attention** : Ne PAS modifier les fichiers dans `src/components/ui/` — ce sont les composants shadcn generes.

---

## CHANTIER 7 — Couleur bg-white restante (164 → semantique)

Chercher `bg-white` dans les fichiers .tsx. Remplacer par :

- Dans les composants admin : `bg-app-card` (en dark mode, bg-white serait une tache blanche)
- Dans les composants tenant : `bg-app-bg` (OK car tenant est toujours en light mode, mais bg-app-bg est plus semantique)
- Dans les composants marketing : GARDER `bg-white` (pages marketing n'utilisent pas le design system theme)

**Ne PAS remplacer** `bg-white` quand il est utilise avec une opacite (`bg-white/[0.02]`, `bg-white/10`, etc.) — c'est un pattern Tailwind valide pour les overlays.

---

## VERIFICATION — Script de controle automatique

Apres TOUS les chantiers, executer ce script qui verifie que le score est 10/10 :

```bash
#!/bin/bash
# verification-ui-10-sur-10.sh
# Lancer depuis la racine du projet : bash verification-ui-10-sur-10.sh

echo "=== VERIFICATION UI 10/10 ==="
echo ""

FAIL=0

# 1. Zero hex hardcodes dans tenant (sauf primaryColor prop)
echo "--- CHANTIER 1 : Hex dans tenant ---"
HEX_TENANT=$(grep -rn '#[0-9A-Fa-f]\{6\}' src/components/tenant/ --include='*.tsx' | grep -v 'primaryColor' | grep -v '// OK' | wc -l)
if [ "$HEX_TENANT" -gt 0 ]; then
  echo "FAIL : $HEX_TENANT hex hardcodes dans tenant"
  grep -rn '#[0-9A-Fa-f]\{6\}' src/components/tenant/ --include='*.tsx' | grep -v 'primaryColor' | grep -v '// OK'
  FAIL=1
else
  echo "PASS : Zero hex dans tenant"
fi
echo ""

# 2. Zero style= dans ServiceManager
echo "--- CHANTIER 2 : Inline styles ServiceManager ---"
INLINE_SM=$(grep -c 'style=' src/components/admin/ServiceManager.tsx)
if [ "$INLINE_SM" -gt 0 ]; then
  echo "FAIL : $INLINE_SM style= dans ServiceManager"
  grep -n 'style=' src/components/admin/ServiceManager.tsx
  FAIL=1
else
  echo "PASS : Zero inline styles dans ServiceManager"
fi
echo ""

# 3. Zero <button natifs (sauf exceptions)
echo "--- CHANTIER 3 : Boutons natifs ---"
BTN=$(grep -rn '<button' src/ --include='*.tsx' | grep -v 'src/components/ui/' | grep -v 'global-error' | grep -v 'shimmer-button' | wc -l)
if [ "$BTN" -gt 0 ]; then
  echo "FAIL : $BTN boutons natifs restants"
  grep -rn '<button' src/ --include='*.tsx' | grep -v 'src/components/ui/' | grep -v 'global-error' | grep -v 'shimmer-button'
  FAIL=1
else
  echo "PASS : Zero boutons natifs"
fi
echo ""

# 4. Zero <input natifs (sauf file, color, honeypot)
echo "--- CHANTIER 4 : Inputs natifs ---"
INP=$(grep -rn '<input' src/ --include='*.tsx' | grep -v 'src/components/ui/' | grep -v 'type="file"' | grep -v 'type="color"' | grep -v 'honeypot' | grep -v 'tabIndex' | wc -l)
if [ "$INP" -gt 0 ]; then
  echo "FAIL : $INP inputs natifs restants"
  grep -rn '<input' src/ --include='*.tsx' | grep -v 'src/components/ui/' | grep -v 'type="file"' | grep -v 'type="color"' | grep -v 'honeypot'
  FAIL=1
else
  echo "PASS : Zero inputs natifs"
fi
echo ""

# 5. Zero <table natifs
echo "--- CHANTIER 5 : Tables natives ---"
TBL=$(grep -rn '<table' src/ --include='*.tsx' | grep -v 'src/components/ui/' | wc -l)
if [ "$TBL" -gt 0 ]; then
  echo "FAIL : $TBL tables natives restantes"
  grep -rn '<table' src/ --include='*.tsx' | grep -v 'src/components/ui/'
  FAIL=1
else
  echo "PASS : Zero tables natives"
fi
echo ""

# 6. Border-radius : pas de rounded-sm ni rounded-2xl dans admin
echo "--- CHANTIER 6 : Border-radius admin ---"
BR=$(grep -rn 'rounded-sm\|rounded-2xl' src/components/admin/ --include='*.tsx' | wc -l)
if [ "$BR" -gt 0 ]; then
  echo "FAIL : $BR border-radius non standard dans admin"
  grep -rn 'rounded-sm\|rounded-2xl' src/components/admin/ --include='*.tsx'
  FAIL=1
else
  echo "PASS : Border-radius standardise dans admin"
fi
echo ""

# 7. bg-gray-* quasi zero
echo "--- CHANTIER 7 : bg-gray-* restants ---"
GRAY=$(grep -rn 'bg-gray-' src/ --include='*.tsx' | wc -l)
echo "INFO : $GRAY bg-gray-* restants (objectif: < 5)"
if [ "$GRAY" -gt 5 ]; then
  FAIL=1
  echo "FAIL"
else
  echo "PASS"
fi
echo ""

# 8. border-gray-* zero
echo "--- border-gray-* ---"
BGRAY=$(grep -rn 'border-gray-' src/ --include='*.tsx' | wc -l)
if [ "$BGRAY" -gt 0 ]; then
  echo "FAIL : $BGRAY border-gray-* restants"
  FAIL=1
else
  echo "PASS : Zero border-gray-*"
fi
echo ""

# 9. Semantic vs hardcoded ratio
echo "--- RATIO SEMANTIQUE ---"
SEM_BG=$(grep -rn 'bg-app-\|bg-accent\|bg-status-' src/ --include='*.tsx' | wc -l)
HARD_BG=$(grep -rn 'bg-gray-\|bg-slate-\|bg-zinc-\|bg-neutral-' src/ --include='*.tsx' | wc -l)
echo "Semantic bg: $SEM_BG | Hardcoded bg: $HARD_BG"
echo ""

# 10. TypeScript + Lint + Build
echo "--- QUALITY GATES ---"
echo "Lancement de pnpm typecheck..."
pnpm typecheck
TC=$?
echo "Lancement de pnpm lint..."
pnpm lint
LT=$?
echo "Lancement de pnpm test..."
pnpm test
TS=$?
echo "Lancement de pnpm build..."
pnpm build
BD=$?

if [ $TC -ne 0 ] || [ $LT -ne 0 ] || [ $TS -ne 0 ] || [ $BD -ne 0 ]; then
  echo "FAIL : Quality gates echouees"
  FAIL=1
else
  echo "PASS : Tous les quality gates passent"
fi

echo ""
echo "==========================="
if [ $FAIL -eq 0 ]; then
  echo "RESULTAT FINAL : 10/10"
else
  echo "RESULTAT FINAL : CORRECTIONS NECESSAIRES (voir les FAIL ci-dessus)"
fi
```

---

## ORDRE D'EXECUTION RECOMMANDE

1. **globals.css** — Ajouter `--color-allergen: #FFB800` (prerequis pour chantier 1)
2. **Chantier 1** — Tenant hex colors (6 fichiers)
3. **Chantier 2** — ServiceManager inline styles (1 fichier)
4. **Chantier 3** — Boutons natifs (27 fichiers)
5. **Chantier 4** — Inputs natifs (12 fichiers)
6. **Chantier 5** — Table native (1 fichier)
7. **Chantier 6** — Border-radius (admin)
8. **Chantier 7** — bg-white → semantique (admin uniquement)
9. **Verification** — Lancer le script `verification-ui-10-sur-10.sh`
10. **Quality gates** — `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

**Temps estime** : 2-3 heures de travail agent.

---

## REGLES CRITIQUES PENDANT L'IMPLEMENTATION

1. **NE PAS modifier** les fichiers dans `src/components/ui/` (sauf textarea.tsx si pas deja fait)
2. **NE PAS modifier** les fichiers proteges (proxy.ts, globals.css sauf ajout allergen, admin.ts, middleware.ts, rate-limit.ts, stripe webhook, order.service, signup.service, CartContext, next.config.mjs)
3. **NE PAS changer** la logique, les handlers, les imports existants — uniquement les classNames et styles
4. **NE PAS utiliser** `h-screen`, `100vh`, `min-h-screen` nulle part
5. **NE PAS utiliser** de construction dynamique de classes Tailwind (`` `text-${var}` ``)
6. **GARDER** toutes les classes Tailwind existantes qui ne sont pas des hex/inline — ne modifier QUE les couleurs et styles cibles
7. **Apres chaque fichier** : `pnpm typecheck && pnpm lint`
8. **Apres tous les chantiers** : `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

---

_Document genere le 11 avril 2026. Basee sur l'audit de verification post-corrections._
