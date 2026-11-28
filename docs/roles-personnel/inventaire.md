# Inventaire roles et permissions - ATTABL (lecture seule, origin/main 729e2150)

Worktree lu : `.claude/worktrees/roles-lot1` (HEAD 729e2150, 2026-11-28). Rien n'a ete modifie, aucune base touchee.
Toutes les references `schema.sql:N` renvoient a `supabase/schema.sql`.

---

## A. BASE DE DONNEES

### A.0 Comment l'etat effectif a ete determine

- `supabase/schema.sql:46` porte le marqueur `SCHEMA_SNAPSHOT_MIGRATION=20261124210700` (lu par `scripts/run-pgtap.sh:136`).
  L'en-tete (`schema.sql:33-41`) indique que l'instantane a ete regenere le 2026-11-27 apres la PR #473, et que toutes les migrations jusqu'a `20261124210700` y sont incluses (plus `20261124190000_email_unsubscribes`).
- Une seule migration est posterieure au marqueur : `supabase/migrations/20261127120000_publicites_stockage_et_lecture_publique.sql`. Je l'ai lue : elle ne mentionne aucun role litteral, aucun `has_tenant_*`, ni `custom_permissions`, ni `role_permissions`. Elle ne touche que les publicites (stockage, `get_storefront_ads`, grant ligne 56).
- **L'etat effectif = `schema.sql` (schemas public + private).** Exception : `schema.sql` n'inclut pas le schema `storage`. Les politiques de `storage.objects` ont donc ete reconstituees depuis les migrations (A.3-bis).
- Methode : tous les corps de fonctions ont ete extraits par script et filtres (litteraux de role, codes de permission, `custom_permissions`, `role_permissions`, appels `has_tenant_*`, `assert_*`, `get_my_*`). Les 194 `CREATE POLICY` ont ete filtrees de la meme facon.

### A.1 Contraintes CHECK sur les colonnes de role

| Table.colonne           | Ligne           | Valeurs autorisees                                        | Remarque                                                                          |
| ----------------------- | --------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `admin_users.role`      | schema.sql:6490 | owner, admin, manager, cashier, chef, waiter, super_admin | **DEFAULT `'admin'`** a schema.sql:6475 (!)                                       |
| `invitations.role`      | schema.sql:6917 | admin, manager, cashier, chef, waiter                     | owner exclu                                                                       |
| `role_permissions.role` | schema.sql:7556 | admin, manager, cashier, chef, waiter                     | UNIQUE (tenant_id, role) a schema.sql:8535                                        |
| `audit_log.user_role`   | schema.sql:6625 | texte libre, sans CHECK                                   | ecrit par le trigger `audit_log_auteur_session` et par l'application (`userRole`) |

Autres structures liees :

- `admin_users.custom_permissions jsonb` (schema.sql:6484), `is_super_admin boolean` (6480).
- Index unique `idx_admin_users_email_tenant (tenant_id, email)` (8806). Il n'y a **pas** d'unicite (tenant_id, user_id).
- `invitations.custom_permissions jsonb` (6910). Index unique partiel : une seule invitation en attente par email (9989).
- `role_permissions.permissions jsonb DEFAULT '{}'` (7553).
- Copie gelee `tests/journeys/fixtures/schema.sql` (FIXTURE_MARKER=20260628000000, voir schema.sql:48-50). Elle porte ses propres CHECK et doit etre adaptee a part.

Grants de colonnes (decisifs pour savoir qui peut ecrire un role) :

- `admin_users` : `authenticated` n'a que SELECT, plus UPDATE sur `full_name`, `last_login`, `phone`, `last_login_at` et `login_count` (schema.sql:14665-14702). **Un employe ne peut donc jamais ecrire `role` ni `custom_permissions` via PostgREST.** Toute ecriture de role passe par service_role ou par une RPC SECURITY DEFINER.
- `invitations` : `authenticated` n'a que SELECT, colonne par colonne, y compris `role` et `custom_permissions` (14857-14920). Il n'a ni INSERT ni UPDATE. Les politiques INSERT et UPDATE d'invitations ne servent donc a rien ; la politique SELECT, elle, est active.
- `role_permissions` : GRANT ALL a `authenticated` (15434). C'est la politique RLS `owner_can_manage_role_permissions` qui limite l'ecriture au proprietaire.

### A.2 Fonctions SQL qui decident des droits

#### A.2.1 Noyau des permissions

1. **`has_tenant_write_permission(p_tenant uuid, p_perm text)`**, schema.sql:3668-3712, SQL STABLE SECURITY DEFINER, executable par anon, authenticated et service_role.
   - Calcul : `mfa_satisfait() AND EXISTS(admin_users au LEFT JOIN role_permissions rp ON rp.tenant_id=au.tenant_id AND rp.role=au.role WHERE au.user_id=auth.uid() AND au.tenant_id=p_tenant AND (is_active IS NULL OR true) AND deleted_at IS NULL AND ( au.role='owner' OR CASE ... ))`.
   - Ordre de resolution : `custom_permissions ? p_perm` (tranche dans les deux sens), puis `rp.permissions ? p_perm`, puis la valeur par defaut.
   - Valeurs par defaut codees en dur (schema.sql:3693-3707) :
     - `orders.manage` : admin, manager, cashier, chef, waiter
     - `orders.pay` : admin, manager, cashier
     - `settings.edit` : admin
     - `menu.edit` : admin, manager
     - `inventory.edit` : admin, manager
     - `inventory.view` : admin, manager, chef
     - **`ELSE` (tout autre code, y compris `reports.view` et tout code inconnu ou mal orthographie) : admin, manager**
   - Un seul role par ligne : la jointure se fait sur `rp.role = au.role`.
2. **`has_tenant_money_permission(p_tenant)`**, schema.sql:3644-3659, SQL SECURITY DEFINER. Calcul : `au.role = ANY(['owner','admin','manager'])` **ET** `has_tenant_write_permission(.,'orders.manage')` **ET** `has_tenant_write_permission(.,'orders.pay')`. La liste de roles est codee en dur.
3. **`has_tenant_floor_permission(p_tenant)`**, schema.sql:3621-3635, SQL SECURITY DEFINER. Calcul : `au.role = ANY(['owner','admin','manager'])` **ET** `has_tenant_write_permission(.,'orders.manage')`.
4. **`is_super_admin()`**, schema.sql:3904-3915, SECURITY DEFINER. Calcul : `mfa_satisfait() AND (is_super_admin=true OR role='super_admin') AND actif AND non supprime`.
5. `mfa_satisfait()`, schema.sql:4144-4157, SECURITY DEFINER. Ne regarde pas le role.
6. `get_my_tenant_ids()` (2829) et `get_my_tenant_ids_array()` (2847), SECURITY DEFINER. Appartenance seule : `coalesce(is_active,true)` et MFA. Elles ne filtrent pas `deleted_at`.
7. **`get_my_inventory_tenant_ids()`**, schema.sql:2811-2820, SECURITY DEFINER. Restaurants ou l'appelant a `inventory.view` OU `inventory.edit` (via has_tenant_write_permission).
8. `assert_tenant_member(t)`, schema.sql:579-599, SECURITY DEFINER. Laisse passer service_role, puis is_super_admin, puis `t = ANY(get_my_tenant_ids_array())`.
9. `assert_inventory_edit(t)` (507-524) et `assert_inventory_view(t)` (533-550), INVOKER. Laissent passer service_role et super admin, puis exigent `has_tenant_write_permission(t,'inventory.edit')` ou `'inventory.view'`.
10. `assert_tenant_reports_view(t)`, schema.sql:647-663, SECURITY DEFINER (service_role seul). Calcul : membre, puis `has_tenant_write_permission(t,'reports.view')`, qui **tombe dans le ELSE** (admin, manager).
11. `assert_tenant_reports(t)` (Pro et plus, appartenance seule), `assert_tenant_reports_ventes(t)` (reports.view + plan) et `assert_tenant_business_reports(t)` (reports.view + Business), entre schema.sql:610 et 640. Fonctions SECURITY DEFINER.

#### A.2.2 Fonctions et triggers qui appellent le noyau, avec le droit exige

Argent et commandes :

- **`record_refund(...)`**, schema.sql:4828-4970, SECURITY DEFINER, executable par authenticated.
  - Etape 1 : `assert_tenant_member`. service_role et super admin passent.
  - Etape 2 : **liste de roles codee en dur `v_role NOT IN ('owner','admin','manager')` donne un refus** (4873).
  - Etape 3 : resolution de `orders.manage` **re-implementee a la main** (custom, puis role_permissions, puis defaut `v_role IN ('owner','admin','manager','cashier','chef')`, 4878-4900).
  - Etape 4 : `has_tenant_write_permission(t,'orders.pay')`.
  - Le commentaire en 4897 dit « Seul waiter a false », ce qui est faux : par defaut le TS et le SQL donnent `orders.manage` au waiter.
- `encaisser_commande(...)`, 1579-1639, INVOKER : exige `orders.pay` (1592).
- `garder_ecriture_registre_paiements()`, 2402-2493 : trigger `trg_payments_insert_guard` BEFORE INSERT sur payments (10402). Exige `orders.pay`. Un remboursement ou un montant <= 0 exige `has_tenant_money_permission` (2449).
- `refuser_argent_sans_orders_pay()`, 4986-5069 : trigger `trg_argent_exige_orders_pay` BEFORE UPDATE sur orders (10171).
  - Sans `orders.pay`, seules les colonnes `status`, `served_at`, `server_id` et `updated_at` peuvent changer, et **passer en `cancelled` exige `orders.pay`** (5043).
  - Offrir, rembourser ou modifier une commande offerte exige `has_tenant_money_permission` (5060).
- `refuser_articles_argent_sans_orders_pay()`, 5078-5100 : trigger sur order_items (10178). Hors colonnes de suivi cuisine, il faut `orders.pay`.
- `refuser_reecriture_montants_commande()`, 5109-5375 : trigger `trg_montants_commande_non_reecrits` (10353). Chaque reecriture de montant (total, pourboire, remise, created_at...) exige `has_tenant_money_permission` (5224, 5241, 5261, 5283, 5305, 5352, 5366).
- `exiger_registre_pour_paid()`, 2146-2211 : constraint triggers 10388 et 10395. Passer `paid` avec un du nul est permis seulement avec `has_tenant_money_permission` (2201).
- `exiger_registre_rembourse_pour_annuler()`, 2220-2287 : constraint trigger 10164. Annuler alors que de l'argent est en caisse exige `has_tenant_money_permission` (2278).
- `normaliser_creation_commande()`, 4224-4244 : trigger 10206. Sans autorite argent, le statut de paiement est force a `pending`.
- `claim_coupon_usage()` (866-897) et `unclaim_coupon_usage()` (6262-6284), DEFINER : membre + `orders.pay`.
- `close_table_session_if_settled()`, 906-976, DEFINER : membre + `orders.pay` (925).
- `reassign_order_table()`, 4602-4729, DEFINER : membre + `orders.manage` (4621).

Stock (tous exigent `assert_inventory_edit`, qui revient a `inventory.edit`) :

- `adjust_ingredient_stock_tx` (195-248, ligne 205), `cancel_stock_count` (816-832), `commit_stock_count` (1018-1096), `import_recipes_tx` (3721-3810), `open_stock_count` (4253-4283), `reconcile_stock_ledger` (4738-4763), `record_loss_tx` (4772-4819), `save_stock_count_lines` (5940-5967), `set_opening_stock` (5976-6002), `set_recipe_tx` (6046-6089).

Lecture du stock (`assert_inventory_view`) : `get_losses_by_reason` (2780), `get_stock_movements_page` (3268), `get_stock_status` (3306), `verify_stock_ledger` (6420).

Rapports :

- `reports.view`, plus le plan, via `assert_tenant_reports_ventes` : `get_category_breakdown` (2552), `get_daily_revenue` (2635), `get_order_summary` (2865), `get_server_performance` (3113), `get_top_items` (3367).
- `reports.view` plus le plan Business : `get_dish_margins` (2671), `get_payment_method_report` (2985), `get_period_comparison` (3014), `get_sales_heatmap` (3060), `get_stock_losses_report` (3226), `get_venue_report` (3403), `get_venue_top_items` (3461).
- **Sans aucune permission (appartenance + plan seulement)** : `get_staff_stock_report` (3179, `assert_tenant_reports`, executable par authenticated) et `get_house_account_balances` (2749, `assert_tenant_member`, executable par authenticated).
- Les fonctions `*_brut` ne sont executables que par service_role.

Equipe, comptes, plateforme :

- **`accept_invitation_membership(inv, user, name)`**, 149-186, DEFINER, service_role seul. Insere dans `admin_users` le `role` et les `custom_permissions` **copies tels quels de l'invitation** (169-175).
- **`provision_signup_tenant(...)`** (4505-4554) et **`provision_group_restaurant(...)`** (4456-4496), DEFINER, service_role seul. Inserent `role='owner'`.
- `delete_admin_user_atomic(admin_user_id, user_id)`, 1309-1397, DEFINER, service_role seul. **Aucun controle de role dans le corps.** Il reattribue `invitations.invited_by` en preferant `(role='owner') DESC`. Si le membre supprime est le dernier, il supprime le restaurant.
- `delete_my_account()`, 1406-1469, DEFINER, executable par authenticated. Refuse `super_admin` et le proprietaire de groupe. Bloque l'**unique proprietaire actif** (`role='owner'`, 1430-1438). Meme reattribution `(role='owner') DESC`.
- `prevent_super_admin_elevation()`, 4354-4439 : trigger BEFORE INSERT OR UPDATE sur admin_users (10150). Seul un super admin peut donner ou retirer `role='super_admin'` ou `is_super_admin`. service_role passe.
- `audit_log_auteur_session()`, 694-717 : trigger BEFORE INSERT sur audit_log (10185). Copie `admin_users.role` (le premier par created_at) dans `audit_log.user_role`.
- `anonymize_closed_tenants` (257-356), `closed_tenant_auth_users` (985-1009) et `request_account_deletion` (5656-5687) : exclusions `is_super_admin OR role='super_admin'`.
- `increment_login_count` (3819) : service_role ou super admin.
- `private.viewer_owns_tenant_group` (schema.sql:129) et `private.storefront_tenant_visible` (101) : aucun role.

### A.3 Politiques RLS liees aux roles ou aux permissions (par table)

Litteral de role code en dur (**a changer**) :

- `audit_log` SELECT « Admins can read audit logs » (11512) : `role IN ('owner','admin','manager')`.
- `flutterwave_payments` SELECT « Proprietaires et admins lisent les paiements Flutterwave » (12331) : `role IN ('owner','admin')`. Elle ne filtre pas `deleted_at`.
- `invitations` :
  - « tenant_admins_can_insert_invitations » (13249), INSERT, `owner/admin`. Inactive faute de grant.
  - « tenant_admins_can_update_invitations » (13258), UPDATE, `owner/admin`. Inactive faute de grant.
  - « tenant_admins_can_view_invitations » (13267), SELECT, `owner/admin`. **Active.**
  - Les politiques 13249 et 13258 ne filtrent ni is_active ni deleted_at.
- `role_permissions` :
  - « owner_can_manage_role_permissions » (12947), ALL, USING et WITH CHECK `role='owner'`.
  - « tenant_members_can_view_role_permissions » (13276), SELECT, appartenance seule.
- `admin_users` :
  - « Block super_admin escalation by non-super-admins » (11608), RESTRICTIVE, `role IS DISTINCT FROM 'super_admin'`.
  - « Admins can view own tenant admins » (11539), SELECT, appartenance.
  - « Members update their own admin row » (12032), limitee par les grants de colonnes.
  - « Platform-removed admin rows are frozen » (12315).

Par `has_tenant_write_permission(tenant_id, <code>)` :

- **`menu.edit`** :
  - INSERT, UPDATE et DELETE sur ads (12055, 12125, 12181), announcements (12062, 12132, 12188), coupons (12076, 12139, 12202), item_modifiers (12083, 12146, 12209), item_options (12090, 12153, 12216), item_price_variants (12118, 12174, 12244), item_suggestions (12097, 12160, 12223) et menus (12111, 12167, 12237).
  - categories : DELETE (12069), UPDATE (12195), INSERT `atfood_insert_categories` (12664).
  - menu_items : DELETE (12104), UPDATE (12230), INSERT `atfood_insert_menu_items` (12671).
  - dish_photo_drafts : ALL (11576).
  - **La politique UPDATE de `menu_items` couvre toutes les colonnes, y compris `price` : il n'existe aucune garde par colonne.**
- **`inventory.edit`** : INSERT, UPDATE et DELETE sur ingredients (11804, 11846, 11762), recipes (11811, 11853, 11769), stock_alert_notifications (11818, 11860, 11776), stock_count_lines (11825, 11867, 11783), stock_counts (11832, 11874, 11790) et suppliers (11839, 11881, 11797).
- **`inventory.view`/`edit`, via `get_my_inventory_tenant_ids()`** : SELECT sur ingredients (11888), recipes (11895), stock_count_lines (11902), stock_counts (11909), stock_movements (11916) et suppliers (11923).
- **`orders.manage`** : UPDATE sur orders (12308) et order_items (12297), INSERT sur order_notes (12290).
- **`orders.pay`** :
  - INSERT, UPDATE et DELETE sur table_sessions (11622, 11629, 11615).
  - INSERT `payments_tenant_insert` (12984) : `orders.pay AND ((status='completed' AND amount>=0) OR has_tenant_money_permission)`.
- **`settings.edit`** :
  - tenants UPDATE (12431).
  - INSERT, UPDATE et DELETE sur venues (12424, 12459, 12396), settings (12410, 12445, 12382), qr_designs (12403, 12438, 12375), tenant_supports (12417, 12452, 12389) et reminder_settings (13085, 13099, 13078).
- **`has_tenant_money_permission`** :
  - DELETE sur orders (12267) et order_items (12258).
  - INSERT, UPDATE et DELETE sur house_accounts (12276, 12283, 12251).
- **`has_tenant_floor_permission`** : INSERT, UPDATE et DELETE sur tables (11727, 11748, 11706), zones (11734, 11755, 11713) et table_assignments (11720, 11741, 11699).

Lecture par simple appartenance (`get_my_tenant_ids_array`), sans aucune permission : orders (11569), order_items (11560, 12884), payments (12991), house_accounts (12754) et table_sessions (13236). **Tout membre peut donc lire tout l'argent en base, quel que soit son role.**

Pas de politique INSERT pour authenticated sur `orders` : la creation de commande passe par le serveur (service_role).

### A.3-bis Politiques sur storage.objects (depuis les migrations)

- Bucket `menu-items` : « Tenants can upload menu photos », « ... update own menu photos » et « ... delete own menu photos » utilisent `has_tenant_write_permission(dossier,'menu.edit')`. Definies dans `20261108214107_atfood_security_hardening.sql:20-41`, recreees si absentes par `20261124120200_politiques_photos_menu_si_absentes.sql:46-79`.
- Bucket `tenant-sounds` : « Tenants can upload sounds », « update sounds » et « delete sounds » utilisent `has_tenant_write_permission(dossier,'settings.edit')`. Version effective : `20261124151100_espaces_fichiers_sons_et_qr.sql:57-93` (remplace `20261112210000_intrusion_isolation_lot1.sql:216-223`).
- Les buckets `logos` et `images` sont ecrits par l'application en service_role apres controle (voir C, `api/upload`).

### A.4 Triggers qui gardent les changements de role

- **Seul trigger sur `admin_users` lie aux roles : `prevent_super_admin_elevation_trg`** (schema.sql:10150). Il ne protege que `super_admin` et `is_super_admin`.
- **Aucun trigger n'empeche** de retirer le dernier proprietaire, de retrograder un proprietaire, de promouvoir quelqu'un en `owner`, ni de faire une escalade owner/admin. Ces invariants sont **uniquement applicatifs** (role-hierarchy.ts). La seule exception est `delete_my_account`, qui refuse l'unique proprietaire.
- Pas de trigger sur `invitations` ni sur `role_permissions`.
- La protection reelle contre l'auto-escalade vient des grants de colonnes (A.1).

### A.5 Tests pgTAP lies aux roles (`supabase/tests/rls/`, amorce `supabase/tests/bootstrap.sql`)

Fichiers qui creent des membres avec des roles et testent des droits (roles utilises entre parentheses) :

- **`garde_delegation.test.sql`** (chef, manager, waiter) : honorer et refuser les surcharges `custom_permissions` et `role_permissions` pour `inventory.edit`, `menu.edit`, `orders.pay` et `settings.edit`.
- **`garde_argent.test.sql`** (cashier, chef, manager, waiter) : matrice `orders.manage`, `orders.pay`, `menu.edit`, `inventory.edit` et `settings.edit`.
- **`argent_orders_pay.test.sql`** : orders.pay et orders.manage.
- `argent_write_roles`, `catalogue_write_roles`, `lot3_write_roles`, `lot4_write_roles` et `verification-ecritures-roles-sans-pgtap.sql` : manager peut ecrire, waiter ne peut pas.
- `admin_users_write_privileges` (owner, manager, waiter : grants de colonnes).
- `record_refund_tenant_guard` (manager, owner, waiter).
- `flutterwave_payments` (cree un membre **`'admin'`** a la ligne 390 : lecture owner/admin).
- **`revue_lot_b2a.test.sql`** (cree des membres **`'admin'`** aux lignes 59, 61, 64 et 69 : audit_log et membres retires ou desactives).
- `rapports_par_espace` et `rapports_avances` (reports.view par role).
- `registre_stock_lecture_inventaire` et `stock_rpc_inventory_edit` (inventory.view et inventory.edit, y compris chef).
- `encaissement_atomique`, `payments_bornes_tous_roles`, `paid_exige_registre`, `annulation_exige_registre_rembourse`, `registre_paiements_garde`, `pourboire_ne_baisse_pas`, `pourboires_rapports`, `fermeture_table_verrouillee`, `commandes_creees_par_le_serveur_seul` et `revue_lot_b2b1` / `b2b2` (argent par role).
- `double_auth_exigee_par_la_base` (menu.edit + MFA), `rappels_intelligents` (settings.edit), `intrusion_isolation_lot1` (role_permissions owner, audit_log, flutterwave), `deactivated_member`, `retention_purges` (super_admin), `menus_deplacement_et_cycles`, `revue_lot_a` et `verrou*_plan*`.

---

## B. SOURCE DE VERITE TYPESCRIPT

### B.1 `src/types/permission.types.ts`

- `PERMISSION_CODES` (lignes 1-15), 13 codes : `menu.view`, `menu.edit`, `orders.view`, `orders.manage`, `orders.pay`, `reports.view`, `pos.use`, `inventory.view`, `inventory.edit`, `team.view`, `team.manage`, `settings.view`, `settings.edit`.
- `PermissionMap = Partial<Record<PermissionCode, boolean>>` (19). `RolePermissions { role: string; permissions }` (21-28).
- `DEFAULT_PERMISSIONS` (30-121), avec `owner` et `admin` entierement a vrai :

| code           | owner | admin | manager | cashier | chef | waiter |
| -------------- | ----- | ----- | ------- | ------- | ---- | ------ |
| menu.view      | T     | T     | T       | T       | T    | T      |
| menu.edit      | T     | T     | T       | F       | F    | F      |
| orders.view    | T     | T     | T       | T       | T    | T      |
| orders.manage  | T     | T     | T       | T       | T    | T      |
| orders.pay     | T     | T     | T       | T       | F    | F      |
| reports.view   | T     | T     | T       | F       | F    | F      |
| pos.use        | T     | T     | T       | T       | F    | T      |
| inventory.view | T     | T     | T       | F       | T    | F      |
| inventory.edit | T     | T     | T       | F       | F    | F      |
| team.view      | T     | T     | T       | F       | F    | F      |
| team.manage    | T     | T     | **F**   | F       | F    | F      |
| settings.view  | T     | T     | **F**   | F       | F    | F      |
| settings.edit  | T     | T     | F       | F       | F    | F      |

Resolution (`src/lib/permissions.ts:30-57`) : `owner` donne toujours vrai (36). Puis `custom_permissions[perm]`, puis `roleOverrides.permissions[perm]`, puis `DEFAULT_PERMISSIONS[role][perm]`. Un role inconnu donne faux. `getEffectivePermissions` (63-74).

### B.2 Listes de roles en double et enums

- `src/types/admin/enums.types.ts:4` : `AdminRole = 'owner'|'admin'|'manager'|'cashier'|'chef'|'waiter'`, reutilise par `tenant.types.ts:82`. Pas de `super_admin`.
- `src/lib/validations/admin-user.schema.ts:24` : `z.enum(['owner','admin','manager','cashier','chef','waiter'])`. **Inclut `owner`** (changement de role). `custom_permissions` est valide contre PERMISSION_CODES (30-36).
- `src/lib/validations/invitation.schema.ts:5` : `INVITABLE_ROLES = ['admin','manager','cashier','chef','waiter']`. Ligne 23 : `custom_permissions: z.partialRecord(z.enum(PERMISSION_CODES), ...)`.
- `src/app/api/permissions/route.ts:14` : `VALID_ROLES = ['admin','manager','cashier','chef','waiter']`.
- `src/lib/admin-roles.ts` :
  - `ONBOARDING_COMPLETE_ROLES=['owner']` (4)
  - `ASSIGNMENT_MANAGER_ROLES=['owner','admin','manager']` (6)
  - `ALL_ADMIN_ROLES` (42-49, les 6 roles)
  - `ORDER_MONEY_ROLES=['owner','admin','manager']` (61)
  - `ORDER_PAY_PERMISSIONS=['orders.manage','orders.pay']` (71)
  - `isRoleAllowed` (73)
- `src/lib/auth/role-hierarchy.ts:8-15` : `ROLE_RANK` (owner 100, admin 80, manager 60, cashier 50, chef 40, waiter 20).
  - `canGrantRole` (25-32) : owner peut tout donner, **y compris owner** ; admin peut donner ce qui est strictement sous admin.
  - `canActOnUser` (41-45) : rang strictement superieur.
- `src/services/plan-enforcement.service.ts:26` : `STAFF_ROLES=['manager','cashier','chef','waiter']`. Ligne 105 : quota d'administrateurs = `.in('role',['owner','admin'])`.
- `src/components/admin/settings/PermissionsClient.tsx:28` : `EDITABLE_ROLES=['admin','manager','cashier','chef','waiter']`. Couleurs par role aux lignes 134-138.
- `src/components/admin/KitchenClient.tsx:23` : `CHEF_VIEW_ROLES=['owner','admin','manager','chef']`.
- `src/services/reminders/rules.ts:35` : `MANAGER_ROLES=['owner','admin','manager']`. Ligne 137 : `role==='chef'`.
- `src/lib/billing/checkout-tenant.ts:28` : `ROLES_FACTURATION=['owner','admin']`.
- `src/lib/role-config.ts:15-45` : `buildRoleConfig` et `getRoleConfig` (libelle, icone et couleur pour les 6 roles).
- `src/components/features/users/UserForm.tsx:46-57` : cles de description et filtre « tout sauf owner ».
- `src/services/email.templates.ts:243-249` : libelles FR codes en dur pour admin, manager, cashier, chef et waiter (email d'invitation).
- Tests et fixtures qui listent les roles : `tests/journeys/fixtures/personas.ts:9`, `tests/journeys/fixtures/seed.ts:195-199` et `383`.

### B.3 Libelles i18n (`src/messages/fr-FR.json` et `en-US.json`, memes cles)

- `sidebar.roleOwner|roleAdmin|roleManager|roleStaff|roleKitchen|roleServer|roleUnknown` (fr:3355-3361).
- `users.roleOwner|roleAdmin|roleManager|roleCashier|roleChef|roleWaiter|roleStaff|roleKitchen|roleServer` (fr:3594-3602). Les variantes `...Label` et `roleDefaultLabel` (3612-3618) sont utilisees par `UsersClient.tsx:310-314`. On trouve aussi `roleAndPermissions` et `roleDescAdmin|Manager|Cashier|Chef|Waiter` (3629-3634).
- `permissions.role.owner|admin|manager|cashier|chef|waiter` (fr:3885-3890), lus par `t(\`role.${role}\`)`dans`PermissionsClient.tsx:78`et`use-permission-overrides.ts:37`.
- `permissions.perm.menu_view ... settings_edit` (13 cles) : libelles des codes.
- `segment.food|hospitality|retail|services.roleChef|roleWaiter` (fr:5787-5875) : libelles par segment de metier, declares dans `src/lib/segment-terms.ts:59-60`.
- `marketing.features.categories.equipe.items.roles.*` : texte marketing.

---

## C. POINTS DE CONTROLE DANS src

Legende : **[ROLE]** = controle sur un role litteral (a changer) ; **[ADMIN]** = accorde quelque chose a `admin` nommement ; [PERM] = controle sur une permission.

### C.1 Primitives de garde serveur

- `src/lib/auth/get-session.ts` :
  - `enforceTenantPermission` (46-93) : lit `role_permissions` par role unique (63-88), refuse si la lecture echoue (fail-closed), puis `hasPermission`.
  - `getAuthenticatedUserWithTenant(perm?)` (127-277) : le super admin y est traite comme `'owner'` (209, 216).
  - **`getAuthenticatedUserForTenant(tenantId, allowedRoles = ['owner','admin'], perm?)` (305-349) [ROLE][ADMIN]** : la liste de roles passe AVANT la permission (328). La valeur par defaut est owner/admin. Elle **ne filtre pas `deleted_at`** (312-318) et ne gere pas le super admin.
- `src/lib/auth/check-tenant-admin.ts:29-49` `checkTenantAdminPermissions(tenantId, allowedRoles=['owner','admin'])` **[ROLE][ADMIN]** : impose en plus `team.manage`.
- `src/lib/auth/resolve-admin-permission.ts:52-125` : resolution pour pages, proxy et API. Super admin sans ligne de membre donne `role:'owner'` (82). Le super admin n'est reconnu que via `is_super_admin=true` (pas `role='super_admin'`). Ligne 106 : `role !== 'owner'`.
- `src/lib/auth/require-admin-permission.ts` : `requireAdminPermission(site, perm)` (59), `requireAdminMember(site)` (81, sonde `menu.view`), `getAdminPermission` (100).
- `src/lib/auth/admin-route-guard.ts` : `isAdminRouteDenied` (18) et `isAdminMemberDenied` (36).
- `src/lib/auth/admin-route-permissions.ts:18-41` `ROUTE_PERMISSIONS` [PERM] :
  - /users : team.view
  - /settings/permissions : settings.edit
  - /settings, /subscription, /audit-logs, /invoices : settings.view
  - /reports : reports.view
  - /inventory, /inventory/counts, /stock-history, /stock-losses, /suppliers, /recipes : inventory.view
  - /pos : pos.use
  - /orders/house-accounts : orders.pay
  - /orders : orders.view
  - /coupons, /ads, /announcements, /suggestions, /supports : menu.edit
  - Toutes les autres routes sont ouvertes a tout membre (dashboard, kitchen, menus, items, categories, service, qr-codes, support, settings/espaces via /settings).
- `src/proxy.ts:390-405` : passerelle RBAC du middleware (`permissionForAdminSubPath` + `isAdminRouteDenied` / `isAdminMemberDenied`). **Fichier protege.**

### C.2 Pages (Server Components)

- Pages avec `requireAdminPermission` [PERM], dans `src/app/sites/[site]/admin/` :
  - `supports/page.tsx:20`, `coupons:18`, `announcements:18`, `ads:18`, `suggestions:16` : menu.edit
  - `orders/page.tsx:35` et `orders/[id]/page.tsx:21` : orders.view
  - `orders/house-accounts/page.tsx:17` : orders.pay
  - `pos/page.tsx:16` : pos.use
  - `settings/page.tsx:31`, `settings/espaces:21`, `settings/tables:20`, `subscription:30`, `(analyse)/invoices:18`, `(analyse)/audit-logs:18` : settings.view
  - `settings/permissions/page.tsx:19` : settings.edit
  - `(analyse)/reports:20`, `reports/venues:20`, `reports/advanced:24` : reports.view
  - `inventory:19`, `inventory/counts:19`, `inventory/counts/[countId]:23`, `inventory/reports:29`, `(analyse)/stock-history:19`, `(analyse)/stock-losses:23`, `suppliers:19`, `recipes:19` : inventory.view
  - `users/page.tsx:31` : team.view
- Pages avec `requireAdminMember` : `page.tsx:103` (dashboard), `categories:30`, `kitchen:22`, `items:32`, `service:21`, `support:18`, `menus:21`, `menus/[menuId]:33`, `qr-codes:18`.
- Autres controles [PERM] : `page.tsx:414` `getAdminPermission('reports.view')` (affichage du chiffre d'affaires), `src/components/admin/FeatureUpgradeWall.tsx:55` (settings.view).
- **[ROLE]** :
  - `settings/permissions/page.tsx:46` : `role !== 'owner'` donne un refus.
  - `(analyse)/audit-logs/page.tsx:43` : `['owner','admin'].includes(role)` **[ADMIN]**.
  - `users/page.tsx:54-63` : lit `role` (doit etre membre). Ligne 93 : lit `role_permissions`.
  - `settings/page.tsx:49-57` : lit `role` pour le transmettre au formulaire.
- **`src/app/sites/[site]/admin/layout.tsx`** :
  - super admin virtuel en `role:'owner'` (125)
  - lecture des emails des proprietaires `.eq('role','owner')` (180)
  - **`userRole = adminUser?.role ?? 'admin'` (237) [ADMIN]** : retombe sur admin pour la navigation
  - `userRole !== 'owner'` (245)
  - surcharge de role unique lue en 247-252
  - `getEffectivePermissions` (254)
  - reprise de l'onboarding si `userRole==='owner'` (265)
  - `PermissionsProvider` (275)
- `src/app/admin/tenants/page.tsx:49-52` : super admin (`is_super_admin || role==='super_admin'`) ou mode proprietaire si `role==='owner'` sur une ligne. `tenants-page-client.tsx:40,210` : serverMode `'owner'`.

### C.3 Server Actions

- `src/app/actions/admin.ts` (gestion de l'equipe, service_role apres controle) :
  - `actionDeleteAdminUser` (96) : `checkTenantAdminPermissions(['owner','admin'])` (104) **[ROLE][ADMIN]** et `canActOnUser` (124). Appelle la RPC `delete_admin_user_atomic` (159).
  - `actionUpdateAdminUser` (206) : `checkTenantAdminPermissions(['owner','admin'])` (215) **[ROLE][ADMIN]**, `canGrantRole` (239). **`custom_permissions` reserve a `currentRole === 'owner'` (248) [ROLE]**. `canActOnUser` (278). Quota de sieges par `STAFF_ROLES` / owner-admin (`checkSeatQuota` 43-69, `isStaffRole` 71, 285-289). UPDATE en 313-314.
  - `actionResetUserPassword` (378) : 414 [ROLE][ADMIN] et `canActOnUser` (460).
  - `actionUpdateUserEmail` (563) : 573 [ROLE][ADMIN] et `canActOnUser` (610).
- `src/app/actions/orders.ts` :
  - **`actionDeleteOrders` (113)** : `.in('role',['owner','admin'])` (171) **[ROLE][ADMIN]**, plus `resolveAdminPermission('orders.pay')` (186). **Le gerant est refuse alors que la base l'autorise** (has_tenant_money_permission).
  - `actionUpdateOrderStatus` (344) : ALL_ADMIN_ROLES ; `cancelled` exige ORDER_PAY_PERMISSIONS, sinon orders.manage (359-363).
  - `actionUpdateItemStatus` (497) et `actionSetCourseHeld` (565) : orders.manage.
  - `actionMarkOrderPaid` (678) et `actionRecordTender` (775) : ORDER_PAY_PERMISSIONS.
  - **`actionRefundOrder` (838) et `actionCompOrder` (927)** : `ORDER_MONEY_ROLES` **[ROLE][ADMIN]** + ORDER_PAY_PERMISSIONS.
  - `actionGetPaymentSummary` (887) et `actionListOrderNotes` (1026) : orders.view.
  - `actionAddOrderNote` (985) : orders.manage.
- `src/app/actions/house-accounts.ts` :
  - `actionCreateHouseAccount` (44) et `actionSettleHouseAccount` (136) : **ORDER_MONEY_ROLES [ROLE][ADMIN]** + ORDER_PAY_PERMISSIONS.
  - `actionListHouseAccounts` (77) et `actionAttachOrderToHouseAccount` (104) : ALL_ADMIN_ROLES + ORDER_PAY_PERMISSIONS.
- **`src/app/actions/tables.ts:36-40`**, toutes les actions zones et tables (65-308) : `['owner','admin','manager']` **[ROLE][ADMIN]** + orders.manage. Cela correspond au `has_tenant_floor_permission` de la base, mais la page `/settings/tables` exige `settings.view`, que le gerant n'a pas.
- **`src/app/actions/assignments.ts:24`** : `['owner','admin','manager']` **[ROLE][ADMIN]** + orders.manage.
- Actions avec ALL_ADMIN_ROLES et une permission [PERM] :
  - menu.edit : `menu-items.ts` (49, 130, 188, 238, 288, 334 ; `actionUpdateMenuItemPrice` en 320 n'exige que menu.edit), `categories.ts:45`, `menus.ts:34`, `modifiers.ts:34`, `suggestions.ts:34`, `ads.ts:43`, `coupons.ts:23`, `announcements.ts:30`
  - inventory.edit : `inventory.ts:190`, `stock-count.ts:29`, `suppliers.ts:60`
  - inventory.view : `inventory.ts:224`
  - membre seul : `notifications.ts:36`
- Actions avec `getAuthenticatedUserWithTenant(perm)` [PERM] :
  - settings.edit : `tenant-settings.ts:27`, `venues.ts` (43, 85, 116, 161), `reminders.ts:22`, `payment-methods.ts:27`, `qr-design.ts` (56, 106)
  - orders.manage : `table-reassign.ts:52`, `table-release.ts:36`
  - membre seul : `table-release.ts:60`, `qr-design.ts:160`, `reminders.ts:52`, `push-test.ts:21`
- `src/app/actions/account-deletion.ts:50-111` : `kind` vaut `'owner'` ou `'staff'`. Le service verifie `membre.role !== 'owner'` (`account-deletion.service.ts:219`) **[ROLE]**.
- `categories.ts:105` et `menus.ts:112,173,211` : `userRole: role` ecrit dans l'audit (un seul role).

### C.4 Routes API

- `src/app/api/invitations/route.ts` :
  - GET : `.in('role',['owner','admin'])` (79) **[ROLE][ADMIN]** + team.manage (89).
  - POST : 205 **[ROLE][ADMIN]** + team.manage (215). `custom_permissions` si `role !== 'owner'` donne un refus (232) **[ROLE]**. `canGrantRole` (240). Quota STAFF_ROLES (261).
- `src/app/api/invitations/[id]/route.ts` (DELETE) : `['owner','admin'].includes` (73) **[ROLE][ADMIN]**, team.manage (80), `canActOnUser` (93).
- `src/app/api/invitations/[id]/resend/route.ts` : 81 **[ROLE][ADMIN]** et team.manage (88).
- `src/app/api/invitations/accept/route.ts:111` : quota selon `STAFF_ROLES.includes(invitation.role)`, puis la RPC `accept_invitation_membership` (`invitation.service.ts:466`).
- `src/app/api/permissions/route.ts` : `verifyOwner` `.eq('role','owner')` (41-56) **[ROLE]**. Upsert de `role_permissions` par role unique (118-129). DELETE en 192. Schema `VALID_ROLES` (14) **[ADMIN]**.
- **Facturation [ROLE][ADMIN]** :
  - `update-subscription/route.ts:88` (owner ou admin)
  - `billing-portal/route.ts:68`
  - `invoices/route.ts:76` (+ settings.view en 82)
  - `lib/billing/checkout-tenant.ts:28,37` (checkout)
- `src/app/api/admin/reset/route.ts:45` : `role !== 'owner'` **[ROLE]** (le super admin compte comme owner).
- `src/app/api/restaurants/create/route.ts:59` : `.eq('role','owner')` **[ROLE]** (ajout d'un etablissement au groupe).
- `src/app/api/onboarding/{save:63,state:43,complete:71}/route.ts` : `ONBOARDING_COMPLETE_ROLES=['owner']` **[ROLE]**.
- `src/app/api/orders/pos/route.ts` :
  - pos.use (53)
  - orders.pay si paiement, pourboire ou coupon (127)
  - **auto-affectation si `adminUser.role === 'waiter'` (514) [ROLE]**
- `src/app/api/orders/[id]/claim/route.ts:66` : orders.manage.
- `src/app/api/upload/route.ts:106-124` : logos exige settings.edit ; images exige menu.edit ; les autres exigent l'un ou l'autre.
- `src/app/api/revalidate-menu/route.ts:72-79` : membre ou super admin (`role.eq.super_admin`).
- `src/app/api/menu-import/route.ts:40` et `menu-import-pdf:76` : menu.edit. `supplier-import:38` et `recipe-import:38` : inventory.edit. `recipe-import:143` : inventory.view. `domain-verify:28` : settings.edit. `supports/export:126` : menu.edit. `push-subscriptions` : membre.

### C.5 Services

- `email-change.service.ts:37` : demandeur dans `['owner','admin']` **[ROLE][ADMIN]**, puis `canActOnUser` (47).
- `plan-enforcement.service.ts:105,136` : quotas par role **[ROLE][ADMIN]**.
- `service-manager.service.ts:64` : serveurs affichables `.in('role',['waiter','manager','admin','owner'])` **[ROLE][ADMIN]**.
- `reminders/reminder.service.ts:414` : coach hebdomadaire envoye a `role==='owner' || role==='admin'` **[ROLE][ADMIN]**. `reminders/rules.ts:35,39,137` **[ROLE][ADMIN]**.
- Selection des proprietaires `.eq('role','owner')` **[ROLE]** :
  - `flutterwave-renewal.service.ts:73` (emails)
  - `trigger-emails.service.ts:251`
  - `api/orders/route.helpers.ts:157`, avec un `.maybeSingle()` qui echoue s'il y a plusieurs proprietaires
- `account-deletion.service.ts` : 108 (super_admin), 219 et 277 (`owner`) **[ROLE]**.
- `signup.service.ts:109` : insertion `role:'owner'`. Ligne 69 : RPC `provision_signup_tenant`.
- `restaurant-group.service.ts:96` : RPC `provision_group_restaurant`.
- `invitation.service.ts:255-256` : insertion d'une invitation `role` + `custom_permissions` (service_role).
- `payment.service.ts:191` : RPC `record_refund`.
- `assignment.service.ts:24-29` : lit le role de l'employe affecte sans le controler.
- `platform-admin.service.ts:367-475` : ban, deban, retrait et restauration (`is_active`, `deleted_at`). Aucun changement de role.
- `lib/auth/session-admin-user.ts:126` (filtre `ownerOnly`), `post-login-destination.ts:142,146,186` (super_admin, proprietaire, onboarding), `target-account-scope.ts:135` et `require-super-admin.ts:39` (super_admin) **[ROLE]**.

### C.6 Interface (hooks et composants)

- Contexte : `src/contexts/PermissionsContext.tsx:9-45` (`role`, `permissions`, `can`). Hook : `src/hooks/usePermissions.ts:7-23`.
  - **`useCanManageFloor` = `isRoleAllowed(role, ASSIGNMENT_MANAGER_ROLES) && can('orders.manage')` (22) [ROLE][ADMIN]**.
  - Utilise par `ServiceRightPanel.tsx:242`, `ServiceTableDetail.tsx:89` et `ServiceTableCard.tsx:75`.
- `src/components/admin/RoleGuard.tsx:39-53` : accepte `roles` (role litteral) et/ou `permission`.
  - `roles={['owner']}` **[ROLE]** : `SettingsDataReset.tsx:97`, `SettingsSecurity.tsx:130`.
  - `permission=` [PERM] : `LossesReportClient:68`, `MenusClient:135`, `StockHistoryClient:126`, `UsersClient:199`, `OrdersClient:231`, `SettingsForm:125`, `ItemsClient:270`, `POSClient:97`, `SuppliersClient:121`, `InventoryClient:170`, `CategoriesClient:241`.
- **[ROLE]**, combines ou non avec `can()` :
  - `HouseAccountsClient.tsx:70` (ORDER_MONEY_ROLES + orders.pay) [ADMIN]
  - `OrderPaymentPanel.tsx:74` (rembourser : ORDER_MONEY_ROLES) [ADMIN]
  - `order-details/useOrderDetails.ts:44` (offrir : ORDER_MONEY_ROLES) [ADMIN]
  - **`orders/OrdersBulkActionBar.tsx:41`** (supprimer : `['owner','admin']` + orders.pay) [ADMIN]
  - `SubscriptionBanners.tsx:28` (portail de facturation `['owner','admin']`) [ADMIN]
  - `hooks/useUsersData.ts:142` (gerer l'equipe `['owner','admin']` + team.manage) [ADMIN], `:145` (`canEditPermissions = role==='owner'`), `:129,223` (role d'invitation par defaut `'waiter'`)
  - `KitchenClient.tsx:23,35` (vue chef) [ADMIN]
  - `settings/SettingsForm.tsx:91` (`role==='owner'`)
  - `shell/SettingsDialog.tsx:161` (suppression de compte proprietaire)
  - `features/users/UserPermissionsDialog.tsx:191` (`isOwner`)
  - `features/users/UserForm.tsx:56` (exclut owner)
  - **`UsersClient.tsx:310-314` (options codees en dur, dont `admin`)** [ADMIN]
  - `PermissionsClient.tsx:28,124-138` [ADMIN]
- [PERM] `can()` :
  - menu.edit : `CategoriesClient:59`, `MenusClient:41`, `CategorySortableRow:21`, `ItemDetailPanel:21`, `ItemsHeader:38`, `ItemsList:89`, `use-menu-detail:14`, `MenusTable:80,248`, `CommandPalette:108`
  - reports.view : `DashboardClient:62`, `useDashboardData:68`
  - orders.pay : `HouseAccountsClient:70`, `OrderPaymentPanel:73`, `POSClient:36`, `OrdersTableSelectionBar:26`, `useOrderDetails:43`, `OrdersBulkActionBar:41`
  - inventory.edit : `InventoryClient:159`, `RecipesClient:54`, `StockCountClient:53`, `StockCountSheetClient:89`, `SuppliersClient:66`
  - orders.manage : `OrdersBulkActionBar:40`, `ServiceTableDetail:92`
  - settings.edit : `SettingsForm:87`, `QRAssignmentPanel:69`
  - pos.use : `CommandPalette:105` ; team.manage : `CommandPalette:111`
  - navigation par `canOpenAdminSubPath` : `AdminBottomNav:63,67`, `ShellSidebar:209`, `ShellAccountMenu:60`, `SettingsDialog:74`, `SubscriptionBanners:27`, `OrdersToolbar:44`, `CommandPalette:47`
- Affichage seul : `use-service-labels.ts:81`, `UsersTable.tsx` et `PendingInvitations.tsx` (via `getRoleConfig`), libelles de `PermissionsClient` et `use-permission-overrides`.

---

## D. OU LE ROLE EST ECRIT

- **Inscription** : `signup.service.ts:69` (RPC `provision_signup_tenant`, qui met `role='owner'`, schema.sql:4545) et `signup.service.ts:103-110` (`createAdminUser`, `role:'owner'`, fallback).
- **Nouvel etablissement de groupe** : `restaurant-group.service.ts:96` donne la RPC `provision_group_restaurant` (`'owner'`, schema.sql:4485), appelee par `api/restaurants/create`.
- **Invitations** : creation via POST `api/invitations/route.ts` puis `invitation.service.ts:255-256` (insertion service_role de `role` + `custom_permissions`). Acceptation via `invitation.service.ts:466` puis la RPC `accept_invitation_membership` (schema.sql:169-175, copie le role). Formulaire : `UserForm.tsx` et `UsersClient.tsx:310-314`, etat `useUsersData.ts:129`.
- **Changement de role et de permissions individuelles** : `actions/admin.ts:206-360` (`actionUpdateAdminUser`, UPDATE service_role en 313), avec l'interface `UserPermissionsDialog.tsx` et `UsersTable.tsx`.
- **Surcharges par role** : `api/permissions/route.ts:118` (upsert) et `:192` (delete), avec l'interface `PermissionsClient.tsx` et `use-permission-overrides.ts`.
- **Suppression** : `actions/admin.ts:159` (RPC `delete_admin_user_atomic`), `delete_my_account` et `account-deletion.service.ts:293` (anonymisation).
- **Plateforme et super admin** :
  - `platform-admin.service.ts` (seulement `is_active` et `deleted_at`).
  - **`scripts/manage-super-admin.js:101` : la revocation met `is_super_admin=false, role='admin'`. Cela casse la contrainte CHECK si `admin` est retire.**
  - `scripts/security-super-admin.sql:16` (commentaire sur `role='admin'`).
- **Seeds et fixtures** :
  - `scripts/seed-demo.ts:260-290` (owner, chef, manager, cashier, waiter x2)
  - `scripts/seed-qa.ts:289-329` (meme jeu)
  - `tests/journeys/fixtures/seed.ts:195-199` (correspondance persona vers role, avec `server` donnant `waiter` et `kitchen` donnant `chef`) et `:383-393` (le type accepte `'admin'`)
  - `tests/journeys/fixtures/personas.ts:9-59`
  - `scripts/repeter-migration-rls.sh:90-91`
  - les tests d'integration `tests/integration/*` : `reminders/engine.test.ts:41,82,336`, `stock/comp-house-account.test.ts:149,357`, `stock/stock-author-report.test.ts:94,193` et `postgrest/or-filter-updates.test.ts:83`
  - toutes les fixtures pgTAP (A.5)
- Aucun dossier `supabase/seed*` ni `e2e/` dans le depot.

---

## E. TESTS VITEST ET PLAYWRIGHT SUR LES ROLES

Les plus structurants, a reecrire en priorite :

- `src/lib/__tests__/permissions.test.ts` : matrice `hasPermission` / `DEFAULT_PERMISSIONS`.
- **`src/lib/__tests__/permission-defaults-sql.test.ts`** : lit la **derniere migration** qui definit `has_tenant_write_permission` et verifie que les valeurs par defaut SQL correspondent a `DEFAULT_PERMISSIONS` pour chaque code que le SQL utilise (roles admin, manager, cashier, chef et waiter codes en dur, ligne 17). Il **ne couvre pas la branche ELSE** pour des codes que le SQL n'utilise pas.
- `src/lib/auth/__tests__/role-access-matrix.test.ts` : chaque route croisee avec chacun des 6 roles.
- `src/lib/__tests__/admin-roles.test.ts` et `src/lib/auth/__tests__/role-hierarchy.test.ts`.
- `src/lib/auth/__tests__/resolve-admin-permission.test.ts`, `require-admin-permission.test.ts`, `get-session-fail-closed.test.ts`, `get-session-tenant-scope.test.ts`, `session-admin-user*.test.ts`, `post-login-destination.test.ts`, `target-account-scope.test.ts` et `require-super-admin.test.ts`.
- Actions :
  - `src/app/actions/__tests__/admin-takeover.action.test.ts` (62 occurrences : escalade et takeover)
  - `money-gates.action.test.ts`
  - `owner-overrides-honored.action.test.ts`
  - `orders-delete.action.test.ts`, `orders.action.test.ts`, `house-accounts.action.test.ts`, `inventory.action.test.ts`, `assignments*.action.test.ts`, `tenant-lock-writes.action.test.ts`, `notifications-read.action.test.ts`, `qr-design-print.action.test.ts`
- API :
  - `src/app/api/__tests__/invitations.test.ts` et `invitations-accept-session.test.ts`
  - `permissions-route.test.ts`
  - `orders-pos.test.ts` et `order-claim-gates.test.ts`
  - `invoices.test.ts`, `billing-portal.test.ts`, `update-subscription.test.ts`
  - `admin-reset.test.ts`
  - `onboarding-*.test.ts`
  - `upload-tenant-choice.test.ts`
  - `tenant-lock-routes.test.ts` et `login-route.test.ts`
- Schemas : `src/lib/validations/__tests__/invitation.schema.test.ts` et `admin-user.schema.test.ts`.
- Composants :
  - `src/components/admin/__tests__/role-ui-gates.component.test.tsx`, `RoleGuard.component.test.tsx`
  - `OrderPaymentPanel.component.test.tsx`, `POSClient.money-gate.component.test.tsx`
  - `AdminBottomNav.permissions.component.test.tsx`, `SubscriptionBanners.component.test.tsx`
  - `service/__tests__/ServiceTableCard.permissions.component.test.tsx`
  - `settings/__tests__/SettingsForm.read-only.component.test.tsx`
  - `features/settings/__tests__/SettingsDataReset.owner-only.component.test.tsx`
  - `features/users/__tests__/UsersTable.component.test.tsx` et `UserPermissionsDialog.component.test.tsx`
  - `CommandPalette.component.test.tsx`
- Proxy : `src/__tests__/proxy.test.ts`.
- Services : `account-deletion`, `platform-admin`, `invitation*`, `email-change`, `reminders/rules`, `reminder.service`, `plan-enforcement`, `flutterwave-renewal`, `trigger-emails` et `payment.service`.
- Playwright (`tests/journeys`) : `03-staff-permissions.spec.ts` (gerant), `04-service-and-ordering.spec.ts` (caissier) et `08-bola.spec.ts`.
- Liste complete (105 fichiers, avec le nombre d'occurrences) : `/private/tmp/claude-501/-Users-a-g-i-c-Documents-SAAS-Ressources-26-Project-App-Saas-attabl-saas/7e45ad08-ef55-45ef-8d3b-53ed5b4345f4/scratchpad/roles-map/tests.txt`.

---

## F. RISQUES POUR LA REFONTE

### F.1 Ce qui peut ouvrir un acces en silence

1. **Branche ELSE de `has_tenant_write_permission` (schema.sql:3706) : tout code non liste revient a `role IN ('admin','manager')`.** Si un nouveau code est appele en SQL (`orders.cancel`, `pos.close`, `reports.money`...) avant d'etre ajoute au CASE, il est accorde par defaut au gerant. Une faute de frappe dans un code donne aussi l'acces gerant (fail-open). Recommandation : faire du ELSE un `false`.
2. **Les anciennes cles de `custom_permissions` et `role_permissions.permissions` restent lues par le SQL** (`au.custom_permissions ? p_perm`, 3685-3690), sans validation. Sept codes conservent leur nom mais peuvent changer de sens : `menu.view`, `menu.edit`, `inventory.view`, `inventory.edit`, `team.view`, `team.manage` et `settings.edit`. Exemple : un `menu.edit:true` individuel accorde aujourd'hui l'edition des prix ; si `menu.price` est separe sans migrer les donnees, la RLS `menu_items` UPDATE (12230), qui ne connait que `menu.edit`, **laisse toujours changer `price` par PostgREST**, meme si l'interface le masque. Separer `menu.price` exige une garde par colonne (trigger) sur `menu_items.price`, `item_price_variants` et `item_options`/`item_modifiers` s'ils portent des prix.
3. **Colonne DEFAULT `'admin'` sur `admin_users.role` (6475)** : toute insertion qui oublie le role donne aujourd'hui un administrateur complet. Il faut retirer ce DEFAULT avant ou en meme temps que la contrainte CHECK.
4. **Les invitations en attente et `role_permissions` avec `role='admin'`** : `accept_invitation_membership` recopie le role tel quel (174). Une invitation `admin` en attente au moment de la migration sera soit refusee par la nouvelle CHECK (l'acceptation echoue), soit, si la CHECK est relachee dans le mauvais ordre, transformee en admin.
5. **`layout.tsx:237` `?? 'admin'`** : retombe sur la matrice admin pour la navigation. Pour l'instant c'est seulement de l'interface (le serveur controle), mais a remplacer par « aucun droit ».
6. **`canGrantRole('owner', 'owner')` donne vrai, et `admin-user.schema.ts:24` accepte `owner`** : un proprietaire peut aujourd'hui promouvoir n'importe quel membre en proprietaire via `actionUpdateAdminUser`. Personne ne peut ensuite le retrograder (`canActOnUser` exige un rang strictement superieur), et aucun trigger ne le defend. A trancher pour les « actes reserves au proprietaire » : co-proprietaire voulu, ou faille.
7. **Toutes les lectures d'argent sont ouvertes a tout membre en base** : SELECT sur orders, order_items, payments, house_accounts et table_sessions (A.3, appartenance seule). `get_staff_stock_report` et `get_house_account_balances` sont executables sans `reports.view`. Une permission `reports.money` ou `reports.own` purement applicative ne cacherait rien a quelqu'un qui appelle PostgREST directement.
8. **`get_my_tenant_ids*()` ne filtrent pas `deleted_at`**, et `getAuthenticatedUserForTenant` (get-session.ts:312-318) non plus. En pratique le retrait met aussi `is_active=false`, mais rien ne l'impose.
9. **`resolveAdminPermission` (82, 88) ne reconnait le super admin que par `is_super_admin`**, alors que `is_super_admin()` en SQL et `get-session.ts:195` acceptent aussi `role='super_admin'`.

### F.2 Ce qui peut fermer un acces en silence (retrait de `admin`)

1. **Listes de roles codees en dur en SQL** :
   - `has_tenant_money_permission` et `has_tenant_floor_permission` (`owner`, `admin`, `manager`)
   - `record_refund` (4873 `NOT IN ('owner','admin','manager')`, et 4899)
   - RLS `audit_log` (11512), `flutterwave_payments` (12331) et SELECT `invitations` (13267)
   - Il faut les remplacer par des permissions (`orders.refund`, `orders.discount`, `audit.view`, `billing.manage`, `team.manage`) sous peine d'enfermer ces droits dans un role.
   - **Dans le modele multi-postes, `has_tenant_write_permission` joint `role_permissions` sur UN seul `au.role`.** Il faut l'union des postes (nouvelle table d'association ou tableau), et une jointure qui ne cree pas de lignes dupliquees.
2. **Gardes owner/admin codees en dur dans l'application, en plus de la permission** (C.3 et C.4) :
   - equipe : `checkTenantAdminPermissions` x4, routes `invitations` x4, `email-change.service`, `useUsersData:142`
   - facturation : `update-subscription`, `billing-portal`, `invoices`, `checkout-tenant`, `SubscriptionBanners`
   - audit : `audit-logs/page.tsx:43`
   - suppression de commandes : `actionDeleteOrders:171`, `OrdersBulkActionBar:41`
   - Une fois `admin` supprime, seul le proprietaire passe, quelle que soit la permission accordee. Aujourd'hui deja, un gerant a qui l'on donne `team.manage` reste refuse par ces listes.
3. **`ROLE_RANK` et la hierarchie lineaire** (role-hierarchy.ts) n'ont pas de sens avec plusieurs postes additifs : il faut une nouvelle regle (« seul le proprietaire gere l'equipe », ou « on ne peut accorder que les droits qu'on detient »). Concernes : invitations, `actionUpdateAdminUser`, suppression, reinitialisation et changement d'email.
4. **Quotas d'abonnement** : `plan-enforcement.service.ts:105` compte les owner/admin et `:136` compte `STAFF_ROLES`. Sans `admin`, `maxAdmins` ne compte plus que les proprietaires. A redefinir pour les postes.
5. **Logique metier sur `role` hors droits** :
   - `service-manager.service.ts:64` (qui apparait comme serveur)
   - `api/orders/pos/route.ts:514` (auto-affectation du waiter)
   - `KitchenClient:23`
   - `reminders/rules.ts:35,137` et `reminder.service.ts:414` (destinataires des rappels)
   - `audit_log.user_role` (texte unique)
   - les libelles d'email (`email.templates.ts:243`)
   - Ces endroits doivent passer aux postes (barman, reception...).
6. **`scripts/manage-super-admin.js:101`** ecrit `role='admin'` et echouera apres la migration de la CHECK.
7. **Tests pgTAP qui creent des membres `'admin'`** (`revue_lot_b2a.test.sql:59-69`, `flutterwave_payments.test.sql:390`) et `tests/journeys/fixtures/seed.ts:383` (type `'admin'`) : ils casseront ou testeront un role mort.

### F.3 Incoherences actuelles entre TS et SQL (ou entre couches)

1. **Branche ELSE du SQL et `DEFAULT_PERMISSIONS`** pour les codes que le SQL n'utilise pas encore :
   - `team.manage` : TS = admin seul ; ELSE SQL = admin + manager.
   - `settings.view` : TS = admin seul ; SQL = admin + manager.
   - `menu.view` et `orders.view` : TS = tous les roles ; SQL = admin + manager.
   - `pos.use` : TS = owner, admin, manager, cashier, waiter ; SQL = admin + manager.
   - Le test `permission-defaults-sql` ne les voit pas.
2. **Suppression de commandes** : la base l'autorise au gerant (`has_tenant_money_permission`), l'application la reserve a owner/admin (`orders.ts:171`, `OrdersBulkActionBar:41`).
3. **Journal d'audit** : la RLS laisse lire owner, admin et manager (11512) ; la page le reserve a owner/admin (`audit-logs/page.tsx:43`) et la route exige `settings.view`, que le gerant n'a pas.
4. **Plan de salle** : les actions `tables.ts` et la RLS `has_tenant_floor_permission` autorisent le gerant ; la page `/settings/tables` exige `settings.view`, que le gerant n'a pas.
5. **Annulation** : en base, il faut `orders.pay` pour toute annulation (`refuser_argent_sans_orders_pay`, 5043), plus l'autorite argent si de l'argent est en caisse. L'application exige `ORDER_PAY_PERMISSIONS`. Le caissier peut donc annuler une commande non reglee. Le futur `orders.cancel`, avec un code de deblocage du gerant, devra etre code a la fois dans le trigger et dans l'action.
6. **`record_refund`** re-implemente la resolution de `orders.manage` a la main (4878-4900), separement de `has_tenant_write_permission`, avec un commentaire faux sur le waiter (4897). C'est une deuxieme copie a supprimer ou a aligner.
7. **Statut actif** : `record_refund` exige `is_active = true` strict, alors que les autres fonctions acceptent `is_active IS NULL OR true`. La colonne est NOT NULL, donc c'est sans effet aujourd'hui.
8. **Politiques `invitations` INSERT et UPDATE** (13249, 13258) : rendues inactives par les grants, et sans filtre is_active ni deleted_at. Code mort a supprimer pendant la refonte.
9. **Pas de sens ordonne** : `ROLE_RANK` met cashier (50) au-dessus de chef (40) alors qu'aucun des deux n'a l'autre comme sous-ensemble de droits.
10. **Role `platform`** : il n'existe nulle part, ni en base ni en TS. La plateforme repose sur `is_super_admin` ou `role='super_admin'` (A.1, A.2).
