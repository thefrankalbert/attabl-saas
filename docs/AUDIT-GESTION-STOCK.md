# Audit complet - Gestion de stock (ATTABL SaaS)

Date : 2026-06-29
Périmètre : toute la fonctionnalité "gestion de stock" (inventaire, recettes, mouvements, alertes, fournisseurs) - DB, migrations, services, server actions, routes API, frontend, plan-gating, RBAC.
Méthode : 4 agents spécialisés (DB, service/API, frontend, gating) + vérification LIVE de la base de production (`nqufpobuozrzwpeijkxt`).

> Légende vérdict : **WORKS** = fonctionne / **RISKY** = fonctionne mais fragile / **BROKEN** = ne marche pas / **MISSING** = absent.
> Les éléments marqués **[PROUVÉ LIVE]** ont été testés directement sur la base de production.

---

## 0. Verdict global

La fonctionnalité de stock est **réelle et bien construite au niveau données** (types `NUMERIC`, RLS partout, RPC anti-IDOR, déstockage atomique anti-survente). Ce n'est PAS un stub.

MAIS l'argument commercial central - **"l'alerte de stock"** - est **cassé en production** : l'email d'alerte de stock bas ne part jamais. Et il manque la **restauration du stock à l'annulation** d'une commande. Plusieurs bugs d'intégrité (double-clic, désync du grand-livre) peuvent corrompre les compteurs.

Tableau de bord :

| Couche                                   | État                          |
| ---------------------------------------- | ----------------------------- |
| Schéma DB / précision                    | Excellent                     |
| Isolation multi-tenant                   | Solide (3 couches)            |
| Sécurité RPC (IDOR / anon)               | Solide                        |
| Déstockage commande (course/survente DB) | Atomique, sûr                 |
| **Alerte stock bas (email)**             | **CASSÉ en prod**             |
| **Restock annulation/remboursement**     | **ABSENT**                    |
| Intégrité du grand-livre (mouvements)    | Plusieurs bugs                |
| Frontend CRUD                            | Fonctionne, bugs de polissage |
| Plan-gating                              | Incohérent (2 pages sur 4)    |

---

## 1. CE QUI FONCTIONNE (vérifié)

- **Précision monétaire/quantité [PROUVÉ LIVE]** : `current_stock`, `min_stock_alert`, `quantity_needed`, `stock_movements.quantity` = `NUMERIC(10,3)` ; `cost_per_unit` = `NUMERIC(10,2)`. L'anti-pattern "argent en float" est **absent**.
- **Isolation multi-tenant [PROUVÉ LIVE]** : les 5 tables (`ingredients`, `recipes`, `stock_movements`, `stock_alert_notifications`, `suppliers`) ont `tenant_id NOT NULL` + RLS activée + policies (5/6/4/4/6). Les policies dérivent le tenant via `auth.uid()` (join `admin_users` / `get_my_tenant_ids_array()`), **jamais via `user_metadata`**.
- **Anti-IDOR sur les RPC [PROUVÉ LIVE]** : `adjust_ingredient_stock`, `set_opening_stock`, `get_stock_status` sont `SECURITY DEFINER` mais appellent toutes `assert_tenant_member(p_tenant_id)` en tête (vérifié : bypass service_role + super_admin, sinon le tenant du caller doit être dans `get_my_tenant_ids_array()`). `anon` ne peut appeler aucune RPC de stock (REVOKE confirmé). `destock_order` = service_role uniquement.
- **Déstockage atomique anti-survente [PROUVÉ LIVE]** : `destock_order` utilise `UPDATE ... SET current_stock = current_stock - v_required WHERE current_stock >= v_required` - instruction unique avec garde, donc deux commandes concurrentes ne peuvent pas faire passer le stock en négatif. Indisponibilise l'item (`is_available=false`) quand le stock atteint 0.
- **Indexation [PROUVÉ LIVE]** : excellente - index composite partiel pour les alertes `(tenant_id, is_active, current_stock, min_stock_alert) WHERE is_active`, `UNIQUE(menu_item_id, ingredient_id)` sur recipes, index de rate-limit `(tenant_id, ingredient_id, sent_at DESC)` sur les alertes.
- **Frontend** : tous les boutons sont câblés à un vrai handler -> action -> service. Aucun bouton mort, aucun TODO, aucun placeholder. CRUD ingrédients/recettes/fournisseurs réel. Conformité shadcn/ui (aucun élément natif), nested-interactive OK, cleanup realtime OK.
- **Éditeur de recettes** : robuste - garde anti-double-soumission (`saving`), anti-doublon d'ingrédient, validation quantité>0, sync du compteur.

> Note de production : `destock_order` n'a **jamais tourné en prod** (0 ligne `order_destock` dans `stock_movements`). Cohérent avec le fait que la feature est Pro+ et qu'aucun tenant payant avec recettes n'a encore commandé. La feature est **câblée mais non exercée** en prod.

---

## 2. FINDINGS PAR SÉVÉRITÉ

### CRITIQUE

**C1 - L'alerte de stock bas (email) ne part JAMAIS. [PROUVÉ LIVE]**
`src/services/notification.service.ts:32`

```ts
.or('current_stock.lte.0,current_stock.lte.min_stock_alert')
```

PostgREST ne sait pas comparer une colonne à une autre colonne : `min_stock_alert` est interprété comme une **valeur littérale** et casté vers le type numérique de la colonne. Test exécuté sur la prod :

```
SELECT 'min_stock_alert'::numeric;
ERROR: 22P02: invalid input syntax for type numeric: "min_stock_alert"
```

La requête `.or()` renvoie donc un **400**, `ingError` est truthy, et la fonction sort immédiatement (`if (ingError ...) return`, ligne 34). **Aucun email d'alerte n'est jamais envoyé**, ni pour stock bas ni pour rupture (les deux termes sont dans le même `.or()` qui plante en entier). Le filtre JS correct (lignes 37-39) n'est jamais atteint. **C'est exactement la fonctionnalité que l'on met en avant ("la gestion de stock") qui est morte.**
Correctif : retirer le terme colonne-vs-colonne du `.or()`. Sélectionner avec `current_stock` borné simplement (ex. récupérer tous les actifs et filtrer en JS, OU une RPC/vue, OU `.lte('current_stock', ...)` avec une vraie valeur). Le filtre JS lignes 37-39 fait déjà le bon calcul - il suffit que la requête DB ne plante pas.

**C2 - Aucune restauration du stock à l'annulation / remboursement. [ABSENT]**
Aucun chemin de "restock" n'existe (grep `src` + migrations = 0). L'enum `movement_type` n'a pas de `order_restock`. Quand une commande est annulée ou remboursée, le stock d'ingrédients déjà déduit **n'est jamais restauré**. Le stock dérive donc à la baisse à chaque annulation. Pour un système de stock, c'est un trou fonctionnel majeur.

### HAUTE

**H1 - Survente possible à la commande.**
`src/app/api/orders/route.ts:316-336` (+ `pos/route.ts:388-409`). Le déstockage tourne **après le commit de la commande**, en `after()` / fire-and-forget, explicitement **non bloquant**. L'exception `INSUFFICIENT_STOCK` ne peut donc pas rejeter la commande - elle est juste loguée. Le système accepte des commandes pour des plats en rupture ; le contrôle de stock est purement rétrospectif. (Décision produit possible, mais à assumer explicitement.)

**H2 - Déstockage tout-ou-rien : une commande peut ne rien déstocker du tout.**
`destock_order` (`20260516140000:139-140`) fait `RAISE EXCEPTION 'INSUFFICIENT_STOCK'` dès qu'**un seul** ingrédient manque. Le RAISE annule **toute la transaction de la fonction** : les déductions déjà faites pour les autres items sont rollback. Résultat : commande passée, **zéro mouvement de stock enregistré, aucune alerte**, juste un warning. La commande qui survend est précisément celle qui ne touche pas au stock.

**H3 - Corruption du stock par double-clic. [intégrité]**
`src/components/admin/InventoryClient.tsx` : `handleSave` (L265) et surtout `handleAdjust` (L303) n'ont **aucune garde anti-soumission en vol** (pas de `disabled`/`isSubmitting`). Double-clic sur "Confirmer" dans le modal d'ajustement = **deux `stock_movements` postés** = compteur d'inventaire corrompu. Même défaut dans `SuppliersClient.handleSave` (L228). À l'inverse `RecipesClient` fait correctement la garde - à copier.

**H4 - Tests en fausse confiance.**
`inventory.service.test.ts` et `stock-alerts-check.test.ts` ne couvrent que le happy path. Non testés : clamp/stock négatif, désync du grand-livre, atomicité (RPC OK puis insert mouvement KO), rejet cross-tenant (`setRecipe`/`getRecipesForItem` branche "refus"), branche 403 "non membre", et **`notification.service` n'a aucun test** (donc C1 n'a jamais été attrapé). Les tests vérifient des formes d'appel SDK, pas le comportement.

### MOYENNE

**M1 - Désync du grand-livre via `GREATEST(0, ...)`.**
`adjust_ingredient_stock` borne à 0 (`...:219`) mais le service enregistre le **delta complet** signé (`inventory.service.ts:241`). Ex : stock=30, `manual_remove` 50 -> stock=0 mais mouvement = -50. La somme des mouvements ne reconstruit plus `current_stock`. Soit borner aussi le mouvement, soit lever une erreur comme `destock_order`.

**M2 - Ajustement non atomique (stock + mouvement).**
RPC d'UPDATE (`:223`) puis INSERT mouvement (`:237`) = deux round-trips, pas une transaction. Si l'insert du mouvement échoue après l'UPDATE, le stock change sans trace d'audit. Devrait être une seule RPC.

**M3 - Sauvegarde de recette non transactionnelle.**
`inventory.service.ts:169-191` : delete-then-insert. Si l'insert échoue, la recette est **effacée** sans rollback. Risque de perte de données.

**M4 - Plan-gating incohérent (2 pages sur 4).**
Inventaire et Recettes sont gardées par `canAccessFeature('canAccessInventory'/'canAccessRecipes')` -> `FeatureUpgradeWall` (Pro+ ; Starter exclu, vérifié `features.ts:58-59`). Mais **`suppliers/page.tsx` et `stock-history/page.tsx` n'ont aucune garde de plan** - seulement `requireAdminPermission('inventory.view')`. Un tenant sans la feature peut donc ouvrir Fournisseurs et Historique. À aligner.

**M5 - Emails d'alerte en double (course).**
Déduplication lecture-puis-écriture sans contrainte unique / claim atomique (`notification.service.ts:43-57`). Deux commandes concurrentes voient "pas d'alerte récente" et envoient toutes deux. (Sans effet tant que C1 n'est pas corrigé, mais réel ensuite.)

**M6 - Pas de suppression / désactivation d'ingrédient dans l'UI.**
`InventoryClient` n'expose que Ajouter/Éditer/Ajuster ; le modal d'édition n'expose pas `is_active`. Le service le supporte pourtant. Un ingrédient créé ne peut jamais être retiré de l'admin.

**M7 - L'action d'ajustement manuel accepte des entrées dangereuses.**
`src/app/actions/inventory.ts` : accepte `movement_type: 'order_destock'` (un manager peut polluer le grand-livre attribué aux commandes, L22) ; accepte un `supplier_id` quelconque **sans vérifier qu'il appartient au tenant** (L24, écrit verbatim `:244`) ; `movement_type: 'adjustment'` ne peut **que diminuer** le stock (logique de direction `:217-220`) - pas de correction positive possible.

**M8 - Entrées numériques non bornées.**
`current_stock`, `min_stock_alert`, `cost_per_unit` = `z.number().finite()` sans `.nonnegative()` (`actions/inventory.ts:33-35,44-45`). On peut créer un ingrédient à `current_stock: -500` ou `cost_per_unit: -10`. Un `min_stock_alert` négatif désactive silencieusement le flag stock-bas (SQL exige `> 0`).

**M9 - Route stock-alerts sans garde de rôle.**
`src/app/api/stock-alerts/check/route.ts:54-64` : n'importe quel membre actif (caissier, serveur, cuisinier) peut déclencher l'envoi d'emails d'alerte à tous les admins. Incohérent avec les actions qui gardent sur `owner/admin/manager`.

**M10 - Violations ASCII (règle maison).**
Em-dash littéral `'—'` comme placeholder de cellule vide : `StockHistoryClient.tsx` L177/245/254/399 + `SuppliersClient.tsx` L97/105/114 (7+ occurrences). Littéraux accentués `'pièce'`/`'bouteille'` (è = U+00E8) : `InventoryClient.tsx` L154/456 et l'enum Zod `actions/inventory.ts:27` (lié à l'enum DB, plus délicat). Règle CLAUDE.md : ASCII uniquement dans le code.

### BASSE

- **B1** - Historique de stock plafonné à `.limit(200)` sans pagination (`useStockMovements.ts:21`) ; au-delà, l'historique ancien est invisible et le filtre/recherche n'opère que sur les 200 chargés.
- **B2** - `ingredients` n'a pas de policy RLS DELETE (lignes non supprimables par le tenant) - probablement voulu (soft-delete via `is_active`), mais implicite.
- **B3** - Les policies RLS UPDATE manquent de `WITH CHECK` (`tenant_id` théoriquement mutable cross-tenant). Risque faible car l'app fixe `tenant_id` côté serveur.
- **B4** - Les Server Actions acceptent `tenantId` en **paramètre** (interdit par CLAUDE.md), mitigé par `getAuthenticatedUserForTenant(tenantId, roles)` qui vérifie l'appartenance. Pas de faille réelle, mais le pattern découragé (param+vérif) au lieu de (dériver de la session).
- **B5** - `createIngredient` écrit le stock initial sans mouvement `opening` (`inventory.service.ts:74`) -> grand-livre désync dès la création.
- **B6** - Inputs numériques : `parseFloat(...) || 0` (`InventoryClient.tsx:276-278`) - une saisie invalide ("abc") devient 0 silencieusement, sans feedback.
- **B7** - 3 pages sur 4 (`inventory`, `suppliers`, `stock-history`) omettent `h-full` sur le wrapper de page (alors que `recipes/page.tsx` l'a) ; marche aujourd'hui via la hauteur du layout admin, fragile.
- **B8** - Hooks client en `select('*')` (`useIngredients`/`useStockMovements`) - la règle demande `select('colonnes')` en prod.

---

## 3. Détail des migrations (état composé réel)

Les fichiers de migration d'origine ne reflètent PAS l'état live - 4 migrations postérieures les corrigent. État final composé :

- `20260212000001_inventory_engine.sql` - création des tables (version `destock_order` SANS garde -> superseded).
- `20260212000000_adjust_ingredient_stock.sql` - RPC d'ajustement (timestamp antérieur mais réfère `ingredients` créée après ; ne marche qu'au runtime plpgsql).
- `20260402000002_fix_function_search_path.sql` - `SET search_path = public` sur les RPC.
- `20260516140000_p1_table_lock_payment_stock.sql` - **réécrit `destock_order` avec la garde anti-survente** + garde table active.
- `20260622140000_secdef_function_grants_hardening.sql` - REVOKE PUBLIC/anon.
- `20260623000000_secdef_cross_tenant_guard.sql` - ajoute `assert_tenant_member()` aux RPC.

Drift à vérifier : `stock_movements.supplier_id` apparaît dans `database.generated.ts` mais pas dans la migration `inventory_engine` d'origine -> colonne ajoutée hors-bande. Historique connu d'éditions de fonctions prod hors-bande - à confirmer que c'est une migration trackée.

---

## 4. QA LIVE (navigateur / gstack)

- **C1 a été prouvé en LIVE** directement contre la base de prod (cast `22P02`), sans aucun seeding.
- L'E2E navigateur complet (commande -> déstockage -> alerte) via gstack nécessite un tenant Pro seedé : la prod a 0 donnée de stock et la feature est Pro+. Seeding d'un tenant de test jetable en prod = **pré-approuvé par l'utilisateur**, à lancer en étape suivante (créer tenant Pro + ingrédients + recettes, passer une commande réelle, observer déstockage + alerte, puis tout supprimer).

---

## 5. Plan de correction recommandé (ordre)

1. **C1** - réparer la requête d'alerte (1 ligne) -> rétablit la feature phare. + test `notification.service`.
2. **C2** - ajouter `order_restock` + chemin de restauration sur annulation/remboursement.
3. **H3** - garde anti-double-soumission sur `InventoryClient` (adjust + save) et `SuppliersClient`.
4. **H2/M1/M2** - rendre déstockage et ajustement cohérents avec le grand-livre (mouvement = delta réellement appliqué ; atomiser en RPC unique).
5. **M4** - aligner le plan-gating sur les 4 pages.
6. **M7/M8/M9** - durcir l'action d'ajustement (bornes, rôle, supplier_id tenant-scoped, retirer `order_destock` du manuel).
7. **M10** - sweep ASCII.
8. Bas - pagination historique, suppression ingrédient UI, etc.

> Aucun fichier n'a été modifié pendant cet audit (lecture seule + requêtes SQL de lecture sur la prod).
