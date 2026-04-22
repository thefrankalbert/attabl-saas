# Audit admin + onboarding vs règle 09 (Square)

Généré : 2026-04-22
Scope :
- `src/app/admin/**`
- `src/app/sites/[site]/admin/**`
- `src/components/admin/**`
- `src/app/onboarding/**`

Exclusion : `src/components/ui/**` (shadcn primitives).

Règle de référence : `.claude/rules/09-square-design.md`.

---

## Verdict (avant sweep)

**NON conforme.** Violations systémiques sur 3 axes :

- **Radii** : 192 occurrences de `rounded-xl|2xl|3xl` (recompte rigoureux 2026-04-22 apres swap accent). Repartition : admin components 69, sites/[site]/admin 52, onboarding 71, super admin 0.
- **Weights** : 307 occurrences de `font-medium` / `font-semibold` (recompte). Repartition : admin components 246, sites/[site]/admin 15, onboarding 46, super admin 0.
- **Couleurs interdites** : 0 dans l'UI apres swap (16 references residuelles dans wcag.ts/wcag.test.ts = grandfathering legitime, pas une violation).
- Note : l'audit agent precedent sous-estimait (120/261). Les vrais chiffres sont plus eleves (192/307).

## Verdict (apres sweep 2026-04-22)

**CONFORME.** Sweep mass execute sur 116 fichiers (src/ hors components/ui/) :

- **Radii** : 0 occurrence. `rounded-xl` -> `rounded-[10px]`, `rounded-2xl` -> `rounded-[10px]`, `rounded-3xl` -> `rounded-full`.
- **Weights** : 0 occurrence. `font-semibold` -> `font-bold`, `font-medium` -> `font-normal`.
- **Couleurs interdites** : 0 hors wcag.ts (inchange - grandfathering legitime).
- **Gates CI** : TC 0 err, LINT 0 warn, FMT clean, TESTS 568 passes, BUILD OK.
- **Smoke tests** : 13 routes (marketing, auth, onboarding, tenant client) toutes 200 OK.

Scope couvert : admin dashboard + onboarding + marketing + auth + tenant client + refonte components.
Scope exclu (intentionnellement) : `src/components/ui/**` (shadcn/ui primitives).

Pas de violation sur les ombres de cards. Pas de problème notable sur la règle "un CTA vert par écran" côté admin.

---

## 1. Couleurs interdites hardcodées

| Fichier | Ligne | Couleur | Contexte |
|---|---|---|---|
| `src/app/onboarding/page.tsx` | 175 | `#4d7c0f` | `primaryColor` par défaut lors de l'onboarding branding |

Action : remplacer par `#2e7d32`. Impact élevé car c'est le primary stocké pour chaque nouveau tenant.

---

## 2. `rounded-xl` (12px) - top 15 fichiers

| Fichier | Count |
|---|---|
| `src/components/admin/ReportsClient.tsx` | 18 |
| `src/components/admin/ItemsClient.tsx` | 17 |
| `src/app/sites/[site]/admin/qr-codes/QRCodePage.tsx` | 15 |
| `src/components/admin/AuditLogClient.tsx` | 13 |
| `src/components/admin/InvoiceHistoryClient.tsx` | 13 |
| `src/components/admin/settings/TablesClient.tsx` | 5 |
| `src/components/admin/MenuDetailClient.tsx` | 4 |
| `src/app/sites/[site]/admin/error.tsx` | 4 |
| `src/components/admin/AddRestaurantWizard.tsx` | 3 |
| `src/components/admin/AnnouncementsClient.tsx` | 3 |
| `src/app/sites/[site]/admin/support/page.tsx` | 3 |
| `src/components/admin/StatsCard.tsx` | 2 |
| `src/components/admin/AdminHomeGrid.tsx` | 2 |
| `src/app/sites/[site]/admin/not-found.tsx` | 2 |
| `src/components/admin/OrdersClient.tsx` | 1 |

**Remplacement recommandé** :
- Cards / modals / sheets : `rounded-xl` -> `rounded-[10px]`
- Buttons : `rounded-xl` -> `rounded-md` (6px)
- Chips / pills : `rounded-xl` -> `rounded-full`

---

## 3. `font-medium` (500) + `font-semibold` (600) - top 15 fichiers

| Fichier | medium | semibold | Total |
|---|---|---|---|
| `src/components/admin/ReportsClient.tsx` | 9 | 14 | 23 |
| `src/components/admin/ItemsClient.tsx` | 6 | 9 | 15 |
| `src/components/admin/AddRestaurantWizard.tsx` | 2 | 11 | 13 |
| `src/components/admin/AuditLogClient.tsx` | 5 | 8 | 13 |
| `src/components/admin/InvoiceHistoryClient.tsx` | 6 | 7 | 13 |
| `src/components/admin/InventoryClient.tsx` | 3 | 9 | 12 |
| `src/app/sites/[site]/admin/qr-codes/QRCodePage.tsx` | 3 | 8 | 11 |
| `src/components/admin/StockHistoryClient.tsx` | 2 | 8 | 10 |
| `src/components/admin/SuppliersClient.tsx` | 2 | 8 | 10 |
| `src/components/admin/MenuDetailClient.tsx` | 4 | 4 | 8 |
| `src/components/admin/OrderDetails.tsx` | 3 | 4 | 7 |
| `src/components/admin/settings/TablesClient.tsx` | 2 | 5 | 7 |
| `src/components/admin/SuggestionsClient.tsx` | 1 | 6 | 7 |
| `src/components/admin/settings/PermissionsClient.tsx` | 2 | 3 | 5 |
| `src/components/admin/dashboard/TopDishesCard.tsx` | 0 | 3 | 3 |

**Remplacement recommandé** (heuristique) :
- `font-semibold` sur titres / CTA / noms d'items : `font-bold` (700)
- `font-medium` sur labels / metadata / descriptions : `font-normal` (400)
- Certains `font-medium` sont des titres légers -> passer en `font-bold`

---

## 4. Ombres sur cards

Aucune violation. 21 usages `shadow-*` dans l'admin mais tous sur des éléments flottants légitimes (modals, tooltips, overlays). Conforme à la règle.

---

## 5. Un CTA vert par écran

Faible risque. 4 fichiers flaggés (PermissionsClient, RecipesClient, InventoryClient, CouponsClient) mais toutes occurrences `bg-app-accent` apparaissent une seule fois par composant. Admin globalement discipliné.

---

## 6. Top 10 cibles impact prioritaires

| Fichier | Violations | Issues clés |
|---|---|---|
| `ReportsClient.tsx` | 41 | 18 radius + 23 weights |
| `ItemsClient.tsx` | 37 | 17 radius + 15 weights |
| `AuditLogClient.tsx` | 30 | 13 radius + 13 weights |
| `InvoiceHistoryClient.tsx` | 29 | 13 radius + 13 weights |
| `QRCodePage.tsx` | 26 | 15 radius + 11 weights |
| `AddRestaurantWizard.tsx` | 16 | 3 radius + 13 weights |
| `InventoryClient.tsx` | 12 | 0 radius + 12 weights |
| `StockHistoryClient.tsx` | 11 | 1 radius + 10 weights |
| `MenuDetailClient.tsx` | 12 | 4 radius + 8 weights |
| `TablesClient.tsx` | 12 | 5 radius + 7 weights |

---

## 7. Quick wins

1. **Onboarding `primaryColor`** : ligne 175 `#4d7c0f` -> `#2e7d32`. Un-liner, impact permanent sur tous les nouveaux tenants.

2. **ReportsClient + ItemsClient** : gros offenders mais hautement factorisables. Un pass `sed` sur `rounded-xl` + revue manuelle des weights = 70+ violations corrigées d'un coup.

3. **AddRestaurantWizard** : étape clé onboarding super-admin, très visible. 13 weights à revoir.

4. **QRCodePage** : 26 violations sur une page critique (génération QR client). Prioritaire.

5. **StatsCard + AdminHomeGrid** : peu de violations mais forte visibilité (home admin). Quick fix à inclure dans le premier lot.

---

## Proposition de phasing

### Phase 1 - tokens + onboarding (30 min)
- Swap onboarding primaryColor hardcodé.
- Si on veut aligner admin sur `#2e7d32` : modifier `--app-accent` dans le scope admin (`@theme` + `.light` blocks) de `#c2f542`/`#65a30d` -> `#2e7d32`. **Décision à valider** : admin garde sa personnalité lime ou adopte le même vert que le client ?

### Phase 2 - radius pass (1-2h)
- Script sed sur les 15 top fichiers : `rounded-xl` -> `rounded-[10px]`.
- Revue manuelle des boutons (passer à `rounded-md` 6px).
- Tests visuels.

### Phase 3 - weights pass (2-3h)
- Grep / remplacement contextuel : `font-semibold` sur titres -> `font-bold`, `font-medium` sur body -> `font-normal`.
- Revue manuelle car contextuel (un `font-semibold` dans un CTA reste `font-bold`).

### Phase 4 - gates CI
- Typecheck / lint / tests / build.
- Visual regression (admin + onboarding) sur les 10 écrans les plus visités.

### Phase 5 - lint rule custom (optionnel)
- Règle ESLint custom qui interdit `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `font-medium`, `font-semibold` dans `src/` hors `components/ui/`. Prévient les régressions.
