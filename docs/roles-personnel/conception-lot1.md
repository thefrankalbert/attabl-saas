# Conception du lot 1 : catalogue de 22 droits, postes, cumul

Document de conception seulement. Rien n'a ete modifie dans le depot ni en base.
Base lue : worktree `.claude/worktrees/roles-lot1`, HEAD `729e2150` (2 commits de retard sur `origin/main`, `f7f54b3d` et `7664b75e`, qui ne touchent ni roles ni droits : rebaser avant de coder).
Sources : `docs/roles-personnel/cahier-des-charges.html` (valide le 2026-11-28) et l'inventaire `roles-map/inventaire.md`.

## Journal des revisions

Version 3 du 2026-11-28, apres le second contre-audit (section "Contre-audit v2" de `roles-map/audit-conception-lot1.md`, verdict : accepte avec corrections). Versions precedentes conservees : `roles-map/conception-lot1.v1.md` et `roles-map/conception-lot1.v2.md`.

Revisions de la version 3 :

| Constat v2                                                                   | Traitement                                                                                                                                                                  | Ou      |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| N1 script du super administrateur bloque par `prevent_super_admin_elevation` | chaque operation dans une transaction qui pose `request.jwt.claim.role = 'service_role'` ; le declencheur n'est pas desactive ; preuve rendue faisable                      | D.2 bis |
| N2 repli `pg_trigger_depth() > 1`                                            | retire ; remplace par un drapeau local a la transaction portant l'identifiant du restaurant                                                                                 | D.4     |
| M7 et N4 retour arriere de MIG2                                              | sections 3 et 4 recopiees mot pour mot depuis `schema.sql` (extraction par script, pas a la main) ; la garde voit aussi le cumul de postes et les invitations               | E.1     |
| N3 criteres `rg` impossibles                                                 | fichiers generes et table de traduction exclus nommement, temoin positif pour chaque commande ; le critere "0 ligne" sur les anciennes colonnes est deplace a la PR de MIG4 | D.2     |
| N5 preuve du choix INVOKER                                                   | cas 1 sous le jeton du proprietaire, cas 6 bis qui echoue si le declencheur passe en DEFINER                                                                                | F.1     |
| N6 ancien administrateur gardant le paiement                                 | ligne G.f, deux options neutres                                                                                                                                             | G       |
| N7 vues de cuisine hors RLS                                                  | exigence ecrite et test d'isolation entre deux restaurants                                                                                                                  | D.5 bis |
| Atomicite par fichier, MIG4 datee                                            | ecrit en E.2, etape 9 avec condition de declenchement et date limite                                                                                                        | E.2     |
| Arbitrage M5                                                                 | l'auditeur retire sa proposition ; la limite qu'il demande d'ecrire (ancien deploiement encore joignable) est ecrite                                                        | E.2     |

Revisions de la version 2 (premier contre-audit) :

| Constat                                                       | Traitement                                                                                                                                         | Ou              |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| H1 lectures d'argent ouvertes                                 | D.5 reecrit sans affirmation fausse ; lot 2 etendu a `orders`, `order_items`, `table_sessions` avec le besoin de chaque poste ; ligne ajoutee en G | D.5, D.5 bis, G |
| H2 fenetre entre resolveur et politiques                      | un seul fichier, une seule transaction (MIG2) ; controle "0 litteral hors catalogue" apres application                                             | E.1, E.2        |
| H3 declencheur `role_permissions` sans corps                  | corps complet, SECURITY INVOKER, `admin` jamais reporte, fusion sans ecraser le nouveau code                                                       | E.1 MIG1        |
| M1 ordre de M1                                                | `is_tenant_owner` creee apres les colonnes                                                                                                         | E.1 MIG1        |
| M2 chemins casses par la garde du proprietaire                | liste complete et correctif par chemin                                                                                                             | D.4             |
| M3 tests casses pour une autre raison                         | deuxieme categorie autorisee, liste a dresser sur le banc avant de coder                                                                           | B.4, F.1        |
| M4 `manage-super-admin.js`                                    | reactivation conservee, filtre par restaurant, `role` jamais reecrit                                                                               | D.2 bis         |
| M5 ecrasement de `permission_overrides`                       | fusion par `private.fusion_anciens_droits`, une cle posee par le nouveau code n'est jamais ecrasee                                                 | B.5, E.1 MIG1   |
| M6 imports de carte                                           | les deux droits exiges avant toute ecriture                                                                                                        | D.2             |
| M7 retour arriere de MIG2                                     | script ecrit, avec garde ; interdit apres la fusion du code                                                                                        | E.1, E.2        |
| M8 cout par ligne des 3 lectures                              | `tenants_avec_droit` evaluee une fois par requete                                                                                                  | C, D.1          |
| M9 lectures de `role` non typees                              | balayage `rg` ecrit comme critere de fin de lot                                                                                                    | D.2             |
| F1 `admin` ne manager a l'acceptation                         | ecrit                                                                                                                                              | A.4             |
| F2 le chef perd le deplacement de table et la prise en charge | ajoute au tableau                                                                                                                                  | B.4             |
| F3 `orders.manage: false` et `settings.view: false`           | controle E.0 numero 6 et regle de decision                                                                                                         | B.5, E.0        |
| F4 colonnes d'`invitations`                                   | decision : aucun grant a `authenticated`                                                                                                           | A.6             |
| F5 privileges par defaut                                      | test `has_function_privilege`                                                                                                                      | C, F.1          |
| F6 `droits_valides`                                           | reecrite avec `CASE`                                                                                                                               | B.5             |
| F7 doublons dans `postes`                                     | normalisation dans le declencheur                                                                                                                  | A.4, E.1        |
| F8 CHECK non vide des invitations                             | `cardinality(postes) >= 1`                                                                                                                         | A.6             |
| F9 desactivation du proprietaire                              | ecrit, test d'action                                                                                                                               | D.4, F.2        |
| F10 `service-manager`                                         | droits effectifs, pas la matrice seule                                                                                                             | D.2             |
| F11 publicites, annonces, supports                            | confirmation demandee                                                                                                                              | G               |
| F12 `suppliers.manage` lit le stock                           | ecrit                                                                                                                                              | D.1             |
| P1 cascade                                                    | preuve par `delete_admin_user_atomic` sur le banc                                                                                                  | D.4, F.1        |
| P2 autres tests pgTAP                                         | methode de recensement sur le banc                                                                                                                 | F.1             |
| P3 lignes `admin` et `super_admin` en production              | controle E.0 numero 7                                                                                                                              | E.0             |
| P4 sieges                                                     | parametre, regle actuelle conservee tant que le proprietaire n'a pas tranche                                                                       | D.2, G          |
| Tests manquants 1 a 7                                         | ajoutes                                                                                                                                            | F.1, F.2, E.2   |
| Points du proprietaire (a) et (b)                             | decisions parametrees, non tranchees ici                                                                                                           | G               |

Desaccord sur M5, clos : le second audit a retire sa proposition de faire vider `custom_permissions` par le nouveau code. Raison la plus forte, donnee par l'auditeur : la fusion se sert de l'ancienne colonne comme point de comparaison, la vider rendrait la fusion moins precise. La colonne reste donc intacte jusqu'a MIG4.

---

## 0. Ce qui a ete verifie dans le code avant de s'appuyer sur l'inventaire

| Affirmation de l'inventaire                                                                               | Verification                                           | Resultat                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ELSE de `has_tenant_write_permission` accorde admin et manager                                            | `supabase/schema.sql:3668-3712` lu                     | exact                                                                                                                                                              |
| `has_tenant_money_permission` et `has_tenant_floor_permission` portent une liste de roles                 | `schema.sql:3621-3659` lu                              | exact                                                                                                                                                              |
| `record_refund` a sa copie privee de la resolution                                                        | `schema.sql:4828-4918` lu                              | exact (liste de roles 4876, copie 4884-4902, `orders.pay` 4914)                                                                                                    |
| DEFAULT `'admin'` sur `admin_users.role`, CHECK a 7 valeurs                                               | `schema.sql:6474,6490`                                 | exact                                                                                                                                                              |
| pas d'unicite (tenant_id, user_id)                                                                        | index `schema.sql:8785-8827`                           | exact : seul `(tenant_id, email)` est unique                                                                                                                       |
| seuls 7 codes sont appeles en SQL                                                                         | comptage des litteraux dans `schema.sql`               | exact : `menu.edit` 42, `inventory.edit` 26, `settings.edit` 22, `orders.pay` 14, `orders.manage` 8, `inventory.view` 2, `reports.view` 1                          |
| grants EXECUTE a anon, authenticated, service_role sur les 3 gardes                                       | `schema.sql:14102-14122`                               | exact                                                                                                                                                              |
| le test de parite lit la derniere migration et ignore le ELSE                                             | `src/lib/__tests__/permission-defaults-sql.test.ts` lu | exact                                                                                                                                                              |
| `accept_invitation_membership` recopie role et custom_permissions                                         | `schema.sql:149-186`                                   | exact                                                                                                                                                              |
| les deux fonctions de suppression effacent des lignes `admin_users` et touchent `role_permissions`        | `schema.sql:1345-1397`, `1440-1469`                    | exact (important pour la garde du proprietaire et pour le retrait de `role_permissions`)                                                                           |
| `proxy.ts` (protege) ne fait que transmettre le resultat de `permissionForAdminSubPath`                   | `src/proxy.ts:390-405`                                 | exact : aucune modification de `proxy.ts` n'est necessaire                                                                                                         |
| `schema.sql` est un instantane de schema, les migrations posterieures au marqueur sont rejouees par pgTAP | `scripts/run-pgtap.sh:120-155`                         | exact. Consequence : une table de reference remplie par migration perdrait ses lignes au prochain instantane. La matrice vit donc dans un corps de fonction (B.3). |
| schema `private` utilisable par anon, authenticated, service_role                                         | `schema.sql:13345-13347`                               | exact                                                                                                                                                              |

Deux points que l'inventaire ne dit pas et qui pesent sur la conception :

1. `actionUpdatePaymentMethods` (`src/app/actions/payment-methods.ts:27`) n'ecrit que la liste des moyens acceptes (`tenants.enabled_payment_methods`). Le "compte de paiement" reserve au proprietaire n'existe pas encore en base (il arrivera avec Ligdicash).
2. Les prix vivent dans `menu_items.price`, `menu_items.prices`, `item_price_variants.price|prices`, `item_modifiers.price|prices`. `item_options` n'a pas de prix.

---

## A. Modele de donnees

### A.1 Decision : `postes text[]` sur `admin_users`, pas de table d'association

Colonne `admin_users.postes text[] NOT NULL DEFAULT '{}'`.

Pourquoi pas une table `staff_postes` :

- Les postes sont une liste fermee de 11 codes. Le cahier des charges ne prevoit aucun poste nomme par le restaurant. Une contrainte CHECK suffit, une cle etrangere n'apporte rien.
- L'ecriture reste atomique : la ligne de membre et ses postes naissent dans le meme INSERT. Avec une table a part, il existe une fenetre ou un membre n'a aucun poste, ou garde les postes d'un membre supprime.
- Aucune nouvelle politique RLS a ecrire et a auditer pour les postes : les grants de colonnes de `admin_users` (`schema.sql:14665-14702`) n'accordent a `authenticated` que `full_name`, `last_login`, `phone`, `last_login_at`, `login_count`. Une nouvelle colonne n'est donc pas modifiable par un employe via PostgREST, sans rien ajouter.
- La resolution lit une seule ligne puis fait `unnest(postes)` : pas de jointure qui duplique des lignes.

Codes de poste (11), dans l'ordre canonique utilise partout :

| Code         | Libelle (cahier des charges) |
| ------------ | ---------------------------- |
| `owner`      | Proprietaire                 |
| `manager`    | Gerant                       |
| `chef`       | Chef                         |
| `cashier`    | Caissier                     |
| `bartender`  | Barman                       |
| `reception`  | Reception                    |
| `waiter`     | Serveur                      |
| `cook`       | Cuisinier                    |
| `crew`       | Equipier polyvalent          |
| `sales`      | Vente                        |
| `production` | Fabrication                  |

### A.2 Reglage par personne : nouvelle colonne `permission_overrides`

`admin_users.permission_overrides jsonb` (NULL = aucun reglage). Cles = les 22 nouveaux codes, valeurs booleennes (`true` = droit permanent, `false` = aucun droit).

Pourquoi une nouvelle colonne au lieu de reutiliser `custom_permissions` : sept anciens codes gardent leur nom mais changent de sens (`menu.edit` contenait les prix, `inventory.edit` contenait les fournisseurs). Pendant la fenetre ou l'ancien code tourne encore sur la nouvelle base, une meme cle `menu.edit: true` serait ambigue : ecrite par l'ancien code elle veut dire "carte et prix", ecrite par le nouveau elle veut dire "carte seulement". Deux colonnes levent l'ambiguite : l'ancien code lit et ecrit `custom_permissions`, le nouveau lit et ecrit `permission_overrides`, un declencheur traduit de l'ancienne vers la nouvelle. `custom_permissions` est supprimee par la migration de contraction (E, MIG4).

### A.3 Reglage par poste et par restaurant : nouvelle table `poste_permissions`

Remplace `role_permissions` (0 ligne en production), meme raison d'ambiguite, plus le CHECK de `role_permissions.role` qui ne connait que les anciens roles.

```sql
CREATE TABLE public.poste_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  poste       text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  CONSTRAINT poste_permissions_tenant_poste_key UNIQUE (tenant_id, poste),
  CONSTRAINT poste_permissions_poste_check CHECK (poste = ANY (ARRAY[
    'manager','chef','cashier','bartender','reception','waiter','cook','crew','sales','production'])),
  CONSTRAINT poste_permissions_droits_check CHECK (private.droits_valides(permissions))
);
CREATE INDEX idx_poste_permissions_updated_by ON public.poste_permissions (updated_by);
ALTER TABLE public.poste_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.poste_permissions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poste_permissions TO authenticated;
GRANT ALL ON public.poste_permissions TO service_role;

CREATE POLICY poste_permissions_select ON public.poste_permissions FOR SELECT TO authenticated
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()));
CREATE POLICY poste_permissions_insert ON public.poste_permissions FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_owner(tenant_id));
CREATE POLICY poste_permissions_update ON public.poste_permissions FOR UPDATE TO authenticated
  USING (public.is_tenant_owner(tenant_id)) WITH CHECK (public.is_tenant_owner(tenant_id));
CREATE POLICY poste_permissions_delete ON public.poste_permissions FOR DELETE TO authenticated
  USING (public.is_tenant_owner(tenant_id));
```

`owner` est exclu du CHECK : le proprietaire a toujours tout, on ne regle pas son poste. L'unicite `(tenant_id, poste)` sert d'index pour la resolution (pas d'index `user_id` : la table n'a pas de colonne utilisateur, l'isolation passe par `tenant_id`). Lecture par tout membre (l'interface en a besoin pour calculer ses propres droits), ecriture par le seul proprietaire : les droits du personnel sont un acte reserve.

### A.4 Coexistence avec `admin_users.role` pendant la transition

Regle : **`postes` est la verite, `role` devient une projection** maintenue par declencheur jusqu'a sa suppression (fin du lot 4).

- CHECK de `role` elargi (additif) : les 7 valeurs actuelles plus `bartender, reception, cook, crew, sales, production`. `admin` reste autorise jusqu'a la migration finale.
- `role` projete = premier poste present dans l'ordre canonique de A.1. `owner` et `super_admin` restent donc exacts, ce qui garde justes les fonctions non reecrites au lot 1 qui lisent encore `role` : `delete_my_account` (`role = 'owner'`), `delete_admin_user_atomic` (tri), `is_super_admin`, `prevent_super_admin_elevation`, `anonymize_closed_tenants`.
- Declencheur `aa_admin_users_sync_postes` (BEFORE INSERT OR UPDATE, nomme pour passer avant `prevent_super_admin_elevation_trg`) :
  - INSERT sans postes : `postes` deduit de `role` (ancien code, fonctions `provision_*`, seeds, tests pgTAP existants).
  - INSERT avec postes : `role` projete.
  - UPDATE qui change `postes` : `role` projete. UPDATE qui ne change que `role` (ancien code) : `postes` deduit. Si les deux changent, `postes` gagne.
  - `custom_permissions` ecrit sans que `permission_overrides` change : traduction (B.5).
- Ligne `role = 'admin'` : `postes = {manager}` et `permission_overrides` recoit `"billing.manage": true` si la cle est absente. L'ancien administrateur garde ainsi tout ce qu'il avait (le gerant du nouveau modele a tous les droits sauf le paiement de l'abonnement). Sa valeur `role = 'admin'` n'est pas reecrite tant que ses postes ne changent pas, pour que l'ancien code deploye continue de le reconnaitre.
- Ligne `role = 'super_admin'` : `postes = {}` (aucun droit de restaurant, la plateforme passe par `is_super_admin()`).
- Exception a connaitre (F1) : une invitation `admin` acceptee porte deja `postes = {manager}`. La ligne de membre nait donc avec `role = 'manager'`, pas `admin`. L'ancien code lui donne alors moins de droits que le nouveau, jamais plus.
- Normalisation (F7) : le declencheur range `postes` dans l'ordre canonique et retire les doublons (`private.postes_normalises`, E.1). `{waiter,waiter}` devient `{waiter}`, et une comparaison `IS DISTINCT FROM` ne voit plus de faux changement.
- Limite assumee (F9) : la base n'empeche pas de desactiver la ligne du proprietaire (`is_active = false`, `deleted_at`), parce que la plateforme en a besoin et ecrit avec le meme role technique que les actions du restaurant. Cote restaurant, seul `canActOnMember` le refuse ; un test d'action le verrouille (F.2).

Contraintes ajoutees sur `admin_users` :

```sql
CONSTRAINT admin_users_postes_check CHECK (postes <@ ARRAY[
  'owner','manager','chef','cashier','bartender','reception','waiter','cook','crew','sales','production'])
CONSTRAINT admin_users_postes_non_vide CHECK (
  cardinality(postes) >= 1 OR role = 'super_admin' OR is_super_admin IS TRUE)
CONSTRAINT admin_users_overrides_check CHECK (
  permission_overrides IS NULL OR private.droits_valides(permission_overrides))
```

Index :

```sql
-- Un seul proprietaire vivant par restaurant (principe 5 du cahier des charges).
CREATE UNIQUE INDEX admin_users_un_proprietaire
  ON public.admin_users (tenant_id) WHERE 'owner' = ANY (postes) AND deleted_at IS NULL;
-- Une seule ligne vivante par personne et par restaurant : la resolution lit UNE ligne.
CREATE UNIQUE INDEX admin_users_tenant_user_vivant
  ON public.admin_users (tenant_id, user_id) WHERE deleted_at IS NULL;
```

Les deux index peuvent echouer sur des donnees existantes : controle prealable obligatoire (E.0).

### A.5 DEFAULT `'admin'`

`ALTER TABLE public.admin_users ALTER COLUMN role DROP DEFAULT;` des la premiere migration. Un INSERT qui oublie le role et les postes echoue (NOT NULL) au lieu de creer un administrateur complet. Le declencheur BEFORE remplit `role` avant le controle NOT NULL quand `postes` est fourni. Tous les ecrivains connus fournissent `role` (inventaire D) ; le verifier avant d'appliquer avec `rg -n "from\('admin_users'\)" src scripts tests | rg insert`.

### A.6 Invitations

Colonnes `invitations.postes text[] NOT NULL DEFAULT '{}'` et `invitations.permission_overrides jsonb`, memes CHECK que A.4 sauf :

```sql
CONSTRAINT invitations_postes_check CHECK (postes <@ ARRAY[
  'manager','chef','cashier','bartender','reception','waiter','cook','crew','sales','production'])
CONSTRAINT invitations_postes_non_vide CHECK (cardinality(postes) >= 1)
CONSTRAINT invitations_overrides_check CHECK (
  permission_overrides IS NULL OR private.droits_valides(permission_overrides))
```

`owner` n'est jamais invitable. Meme declencheur de synchronisation (`aa_invitations_sync_postes`, sans la branche `super_admin`). Le CHECK de `invitations.role` est elargi aux 6 nouveaux codes. `accept_invitation_membership` recopie en plus `postes` et `permission_overrides`. Une invitation `admin` en attente est convertie a la reprise en `{manager}` plus `billing.manage: true` : elle ne peut plus creer un administrateur, et elle n'echoue pas a l'acceptation.

Politiques : SELECT reecrite sur `team.manage` ; INSERT et UPDATE supprimees (inactives faute de grant, sans filtre `is_active` ni `deleted_at`, inventaire F.3.8). Toute ecriture reste en `service_role` apres controle applicatif.

Grants de colonnes (F4) : `authenticated` lit `invitations` colonne par colonne (`schema.sql:14857-14920`). Decision : **aucun grant** sur `postes` ni `permission_overrides`. Tout passe par le client de service (`invitation.service.ts`) ; ne pas exposer ces colonnes a un client de session est le choix le plus ferme. Si un ecran en a besoin un jour, il passera par le serveur.

---

## B. Catalogue des droits

### B.1 Les 22 codes

| #   | Code               | Droit du cahier des charges       |
| --- | ------------------ | --------------------------------- |
| 1   | `menu.view`        | Voir la carte                     |
| 2   | `menu.edit`        | Modifier la carte                 |
| 3   | `menu.price`       | Modifier les prix                 |
| 4   | `orders.take`      | Prendre une commande              |
| 5   | `kitchen.track`    | Suivre en cuisine ou au bar       |
| 6   | `orders.cancel`    | Annuler                           |
| 7   | `orders.discount`  | Faire une remise                  |
| 8   | `orders.refund`    | Rembourser                        |
| 9   | `orders.pay`       | Encaisser                         |
| 10  | `cash.close`       | Cloturer la caisse                |
| 11  | `cash.count`       | Compter sa caisse a l'aveugle     |
| 12  | `reports.menu`     | Rapports de la carte              |
| 13  | `reports.money`    | Rapports d'argent                 |
| 14  | `reports.own`      | Ses propres ventes                |
| 15  | `inventory.view`   | Voir le stock                     |
| 16  | `inventory.edit`   | Saisir le stock                   |
| 17  | `suppliers.manage` | Fournisseurs et commandes d'achat |
| 18  | `team.view`        | Voir l'equipe                     |
| 19  | `team.manage`      | Recruter et retirer               |
| 20  | `settings.edit`    | Reglages du restaurant            |
| 21  | `audit.view`       | Journal d'audit                   |
| 22  | `billing.manage`   | Abonnement ATTABL                 |

### B.2 Niveaux

La matrice du cahier des charges a cinq valeurs (Oui, Non, Code, QR marchand, Factures). Pour garder exactement 22 codes, chaque case porte un **niveau** : `full` (Oui), `limited` (droit restreint), ou absent (Non). Le sens de `limited` depend du droit :

| Droit                                               | Sens de `limited`                                          | Lot qui le fait respecter |
| --------------------------------------------------- | ---------------------------------------------------------- | ------------------------- |
| `orders.cancel`, `orders.discount`, `orders.refund` | possible seulement avec le code d'un responsable           | lot 3                     |
| `orders.pay`                                        | uniquement sur le QR ou le compte marchand du restaurant   | lot 3                     |
| `billing.manage`                                    | voit les factures, ne paie pas et ne change pas de formule | lot 1                     |

Regle de securite du lot 1 : **seul `full` ouvre une ecriture**. `limited` n'ouvre rien tant que le mecanisme qui le borne n'existe pas. Le serveur n'encaisse donc pas au lot 1 (comme aujourd'hui) : il encaissera au lot 3, quand la restriction au QR marchand sera appliquee par la base. C'est le sens sur : on n'ouvre pas la caisse especes au serveur en attendant. Ce reglage et celui du caissier (annulation et coupons sans code jusqu'au lot 3) sont des decisions du proprietaire, parametrees en G.b : la valeur decrite ici est celle qui ne change rien a aujourd'hui, pas un choix fait a sa place.

Les reglages par personne et par poste restent booleens (`true` = `full`, `false` = rien). Aucun cas du cahier des charges ne demande un reglage `limited` par personne.

### B.3 Matrice par defaut

Lecture : F = `full`, L = `limited`, vide = aucun droit. `owner` n'est pas dans la matrice : il a toujours `full` sur les 22 codes.

| Code             | manager | chef | cook | cashier | waiter | bartender | reception | crew | sales | production |
| ---------------- | ------- | ---- | ---- | ------- | ------ | --------- | --------- | ---- | ----- | ---------- |
| menu.view        | F       | F    | F    | F       | F      | F         | F         | F    | F     | F          |
| menu.edit        | F       | F    |      |         |        |           |           |      |       |            |
| menu.price       | F       | F    |      |         |        |           |           |      |       |            |
| orders.take      | F       |      |      | F       | F      | F         | F         | F    | F     |            |
| kitchen.track    | F       | F    | F    |         |        | F         |           | F    |       | F          |
| orders.cancel    | F       |      |      | L       | L      | L         | L         | L    | L     |            |
| orders.discount  | F       |      |      | L       | L      | L         | L         | L    | L     |            |
| orders.refund    | F       |      |      | L       |        | L         | L         | L    | L     |            |
| orders.pay       | F       |      |      | F       | L      | F         | F         | F    | F     |            |
| cash.close       | F       |      |      |         |        |           |           |      |       |            |
| cash.count       | F       |      |      | F       |        | F         | F         | F    | F     |            |
| reports.menu     | F       | F    |      |         |        |           |           |      |       |            |
| reports.money    | F       |      |      |         |        |           |           |      |       |            |
| reports.own      | F       |      |      | F       | F      | F         | F         | F    | F     |            |
| inventory.view   | F       | F    | F    |         |        | F         |           | F    |       | F          |
| inventory.edit   | F       | F    |      |         |        |           |           |      |       |            |
| suppliers.manage | F       | F    |      |         |        |           |           |      |       |            |
| team.view        | F       |      |      |         |        |           |           |      |       |            |
| team.manage      | F       |      |      |         |        |           |           |      |       |            |
| settings.edit    | F       |      |      |         |        |           |           |      |       |            |
| audit.view       | F       |      |      |         |        |           |           |      |       |            |
| billing.manage   | L       |      |      |         |        |           |           |      |       |            |

`crew` = union de `cashier`, `waiter`, `cook`. `sales` = `cashier`. `production` = `cook`. 86 cases non vides.

**Source de verite unique.** Le TypeScript est la source ecrite a la main ; le SQL en est la copie, et deux tests interdisent tout ecart.

TypeScript, `src/types/permission.types.ts` (remplace le contenu actuel) :

```ts
export const PERMISSION_CODES = [
  'menu.view',
  'menu.edit',
  'menu.price',
  'orders.take',
  'kitchen.track',
  'orders.cancel',
  'orders.discount',
  'orders.refund',
  'orders.pay',
  'cash.close',
  'cash.count',
  'reports.menu',
  'reports.money',
  'reports.own',
  'inventory.view',
  'inventory.edit',
  'suppliers.manage',
  'team.view',
  'team.manage',
  'settings.edit',
  'audit.view',
  'billing.manage',
] as const;
export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const POSTE_CODES = [
  'owner',
  'manager',
  'chef',
  'cashier',
  'bartender',
  'reception',
  'waiter',
  'cook',
  'crew',
  'sales',
  'production',
] as const;
export type Poste = (typeof POSTE_CODES)[number];
export type StaffPoste = Exclude<Poste, 'owner'>;

export type PermissionLevel = 'full' | 'limited';
export type PermissionMap = Partial<Record<PermissionCode, boolean>>;
type PosteRow = Partial<Record<PermissionCode, PermissionLevel>>;

const all = (level: PermissionLevel): PosteRow =>
  Object.fromEntries(PERMISSION_CODES.map((c) => [c, level])) as PosteRow;
const union = (...rows: PosteRow[]): PosteRow => {
  const out: PosteRow = {};
  for (const row of rows)
    for (const [code, level] of Object.entries(row) as [PermissionCode, PermissionLevel][])
      if (level === 'full' || out[code] === undefined) out[code] = level;
  return out;
};

const cashier: PosteRow = {
  'menu.view': 'full',
  'orders.take': 'full',
  'orders.pay': 'full',
  'cash.count': 'full',
  'reports.own': 'full',
  'orders.cancel': 'limited',
  'orders.discount': 'limited',
  'orders.refund': 'limited',
};
const waiter: PosteRow = {
  'menu.view': 'full',
  'orders.take': 'full',
  'reports.own': 'full',
  'orders.pay': 'limited',
  'orders.cancel': 'limited',
  'orders.discount': 'limited',
};
const cook: PosteRow = { 'menu.view': 'full', 'kitchen.track': 'full', 'inventory.view': 'full' };

export const POSTE_MATRIX: Record<StaffPoste, PosteRow> = {
  manager: { ...all('full'), 'billing.manage': 'limited' },
  chef: {
    'menu.view': 'full',
    'menu.edit': 'full',
    'menu.price': 'full',
    'kitchen.track': 'full',
    'reports.menu': 'full',
    'inventory.view': 'full',
    'inventory.edit': 'full',
    'suppliers.manage': 'full',
  },
  cashier,
  bartender: { ...cashier, 'kitchen.track': 'full', 'inventory.view': 'full' },
  reception: cashier,
  waiter,
  cook,
  crew: union(cashier, waiter, cook),
  sales: cashier,
  production: cook,
};
```

SQL, corps de fonction (les 86 lignes sont ecrites en clair, une par case, dans l'ordre poste puis code de B.1) :

```sql
CREATE OR REPLACE FUNCTION private.codes_droits() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  SELECT ARRAY[
    'menu.view','menu.edit','menu.price',
    'orders.take','kitchen.track','orders.cancel','orders.discount','orders.refund',
    'orders.pay','cash.close','cash.count',
    'reports.menu','reports.money','reports.own',
    'inventory.view','inventory.edit','suppliers.manage',
    'team.view','team.manage','settings.edit','audit.view','billing.manage'
  ]::text[];
$function$;

CREATE OR REPLACE FUNCTION private.matrice_postes()
RETURNS TABLE (poste text, droit text, niveau text)
LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  VALUES
    ('manager','menu.view','full'), ('manager','menu.edit','full'), ('manager','menu.price','full'),
    -- ... les 19 autres lignes manager : toutes 'full' sauf
    ('manager','billing.manage','limited'),
    ('chef','menu.view','full'), ('chef','menu.edit','full'), ('chef','menu.price','full'),
    ('chef','kitchen.track','full'), ('chef','reports.menu','full'), ('chef','inventory.view','full'),
    ('chef','inventory.edit','full'), ('chef','suppliers.manage','full'),
    ('cashier','menu.view','full'), ('cashier','orders.take','full'),
    ('cashier','orders.cancel','limited'), ('cashier','orders.discount','limited'),
    ('cashier','orders.refund','limited'), ('cashier','orders.pay','full'),
    ('cashier','cash.count','full'), ('cashier','reports.own','full')
    -- ... puis bartender (10), reception (8), waiter (6), cook (3), crew (10), sales (8), production (3)
  ;
$function$;
```

Pourquoi une fonction et pas une table : voir section 0 (instantane de schema), et parce qu'un `CREATE OR REPLACE` remplace la matrice d'un bloc, ce qui permet au test de lire "la derniere definition" sans rejouer des INSERT et DELETE.

**Tests de parite** (F) :

1. Vitest `permission-defaults-sql.test.ts` reecrit : il lit la derniere migration qui definit `private.matrice_postes` et `private.codes_droits`, extrait les triplets, et exige l'egalite exacte d'ensembles avec `POSTE_MATRIX` et `PERMISSION_CODES`, dans les deux sens (aucune case en trop cote SQL, aucune case manquante). Il exige aussi qu'aucune ligne SQL ne porte `owner`.
2. pgTAP `catalogue_droits_codes_connus.test.sql` : il parcourt `pg_policies` (qual, with_check) et `pg_proc.prosrc`, extrait tout litteral passe a `has_tenant_write_permission` ou `tenant_permission_level`, et exige que chacun soit dans `private.codes_droits()`. C'est le remplacant de la branche ELSE : un code inconnu ou mal orthographie est desormais (a) refuse par la base pour tout le monde, proprietaire compris, et (b) detecte par ce test sur l'etat effectif de la base, pas sur le texte des migrations.

### B.4 Ce qui change pour les roles existants (reference pour corriger les tests)

| Poste          | Gagne                                                                                                        | Perd                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| manager        | `settings.edit`, `team.manage`, `audit.view`, `cash.close`, `cash.count`, factures (`billing.manage` limite) | rien                                                                                                                                                                                                                                 |
| chef           | `menu.edit`, `menu.price`, `inventory.edit`, `suppliers.manage`, `reports.menu` (sans effet avant le lot 2)  | deplacer une commande de table (`reassign_order_table`, `table-reassign.ts:52`) et prendre en charge une commande (`orders/[id]/claim:66`), qui passent de `orders.manage` a `orders.take` (F2). Voulu : ce sont des gestes de salle |
| cashier        | `cash.count`, `reports.own` (sans effet avant les lots 2 et 3)                                               | rien au lot 1                                                                                                                                                                                                                        |
| waiter         | `reports.own` (sans effet avant le lot 2)                                                                    | rien au lot 1                                                                                                                                                                                                                        |
| admin (ancien) | rien                                                                                                         | rien (gerant plus `billing.manage: true`)                                                                                                                                                                                            |

Une assertion de test ne peut changer que pour l'une de ces deux raisons :

1. elle correspond a une ligne du tableau ci-dessus ;
2. les donnees du test contredisent une nouvelle contrainte (M3) : deux proprietaires dans un restaurant, deux lignes vivantes pour une personne, suppression du proprietaire avant son restaurant. Dans ce cas on corrige les donnees du test, jamais la contrainte.

Tout autre changement est une regression a corriger dans le code, pas dans le test.

### B.5 Correspondance des 13 anciens codes

| Ancien code      | Dans le code (sites TS et SQL)                                                                                     | Dans les donnees stockees (`custom_permissions`, `role_permissions.permissions`)                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `menu.view`      | `menu.view`                                                                                                        | `menu.view`                                                                                                                        |
| `menu.edit`      | `menu.edit` ; prix : `menu.price` ; coupons : `orders.discount` ; publicites, annonces, supports : `settings.edit` | `menu.edit` et `menu.price` (meme valeur)                                                                                          |
| `orders.view`    | l'un de `orders.take`, `kitchen.track`, `orders.pay`                                                               | abandonne (pas d'equivalent)                                                                                                       |
| `orders.manage`  | l'un de `orders.take`, `kitchen.track` ; plan de salle et affectations : `settings.edit`                           | `orders.take` et `kitchen.track` (meme valeur). Si `false` : en plus `orders.cancel`, `orders.discount`, `orders.refund` a `false` |
| `orders.pay`     | `orders.pay`                                                                                                       | `orders.pay`. Si `false` : en plus `orders.discount` et `orders.refund` a `false`                                                  |
| `reports.view`   | `reports.money` au lot 1 (le lot 2 repartit)                                                                       | `reports.money` et `reports.menu` (meme valeur)                                                                                    |
| `pos.use`        | `orders.take`                                                                                                      | `orders.take`                                                                                                                      |
| `inventory.view` | `inventory.view`                                                                                                   | `inventory.view`                                                                                                                   |
| `inventory.edit` | `inventory.edit` ; fournisseurs : `suppliers.manage`                                                               | `inventory.edit` et `suppliers.manage` (meme valeur)                                                                               |
| `team.view`      | `team.view`                                                                                                        | `team.view`                                                                                                                        |
| `team.manage`    | `team.manage`                                                                                                      | `team.manage`                                                                                                                      |
| `settings.view`  | `settings.edit` (pages reglages), `audit.view` (journal), `billing.manage` au moins limite (abonnement, factures)  | abandonne (pas d'equivalent)                                                                                                       |
| `settings.edit`  | `settings.edit`                                                                                                    | `settings.edit`                                                                                                                    |

Conflit entre deux anciennes cles qui visent le meme nouveau code (`pos.use` et `orders.manage` vers `orders.take`) : **le refus gagne** (`bool_and`).
Les deux abandons (`orders.view`, `settings.view`) sont documentes : le nouveau modele n'a pas de droit "voir seulement". Effet : une personne a qui l'on avait donne `settings.view` seul perd la lecture seule des reglages ; une personne a qui l'on avait retire `orders.view` revoit la liste des commandes si elle peut en prendre. La base laissait deja lire les commandes a tout membre.

Deux ouvertures possibles sur des donnees anciennes (F3), a trancher sur les lignes reelles, pas en theorie :

- un gerant portant `orders.manage: false` n'avait pas le plan de salle ; la traduction ne produit pas `settings.edit: false`, il le gagnerait ;
- un gerant portant `settings.view: false` gagnerait `settings.edit` (le gerant l'a par defaut dans le nouveau modele).
  Le controle E.0 numero 6 liste ces lignes. S'il en rend, la reprise ajoute `settings.edit: false` a ces personnes precises (liste ecrite dans la migration, par identifiant) : le refus pose par le proprietaire est conserve. S'il n'en rend aucune, rien a faire.

```sql
CREATE OR REPLACE FUNCTION private.droits_depuis_anciens(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  SELECT CASE WHEN p IS NULL OR jsonb_typeof(p) <> 'object' THEN NULL ELSE coalesce((
    SELECT jsonb_object_agg(t.nouveau, t.valeur)
    FROM (
      SELECT m.nouveau, bool_and(e.value = 'true'::jsonb) AS valeur
      FROM jsonb_each(p) AS e
      JOIN (VALUES
        ('menu.view','menu.view',false), ('menu.edit','menu.edit',false), ('menu.edit','menu.price',false),
        ('orders.manage','orders.take',false), ('orders.manage','kitchen.track',false),
        ('orders.manage','orders.cancel',true), ('orders.manage','orders.discount',true),
        ('orders.manage','orders.refund',true),
        ('pos.use','orders.take',false),
        ('orders.pay','orders.pay',false), ('orders.pay','orders.discount',true), ('orders.pay','orders.refund',true),
        ('reports.view','reports.money',false), ('reports.view','reports.menu',false),
        ('inventory.view','inventory.view',false),
        ('inventory.edit','inventory.edit',false), ('inventory.edit','suppliers.manage',false),
        ('team.view','team.view',false), ('team.manage','team.manage',false),
        ('settings.edit','settings.edit',false)
      ) AS m(ancien, nouveau, refus_seulement) ON m.ancien = e.key
      WHERE jsonb_typeof(e.value) = 'boolean'
        AND (NOT m.refus_seulement OR e.value = 'false'::jsonb)
      GROUP BY m.nouveau
    ) AS t), '{}'::jsonb) END;
$function$;

CREATE OR REPLACE FUNCTION private.postes_depuis_role(p_role text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  SELECT CASE p_role
    WHEN 'super_admin' THEN '{}'::text[]
    WHEN 'admin' THEN ARRAY['manager']
    ELSE ARRAY[p_role]
  END;
$function$;

CREATE OR REPLACE FUNCTION private.role_depuis_postes(p_postes text[]) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  SELECT c.poste
  FROM unnest(ARRAY['owner','manager','chef','cashier','bartender','reception',
                    'waiter','cook','crew','sales','production']) WITH ORDINALITY AS c(poste, rang)
  WHERE c.poste = ANY (p_postes)
  ORDER BY c.rang LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION private.droits_valides(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = '' AS $function$
  -- CASE : l'ordre d'evaluation est garanti, jsonb_each n'est jamais appele sur
  -- autre chose qu'un objet (F6).
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) <> 'object' THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_each(p) AS e
      WHERE NOT (e.key = ANY (private.codes_droits())) OR jsonb_typeof(e.value) <> 'boolean')
  END;
$function$;
REVOKE ALL ON FUNCTION private.droits_valides(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.droits_valides(jsonb) TO authenticated, service_role;
```

`postes_depuis_role` renvoie `ARRAY[p_role]` pour une valeur inconnue : le CHECK `admin_users_postes_check` la refuse alors, ce qui est l'effet voulu.

Fusion des anciennes ecritures (M5, H3). Pendant la transition, l'ancien code ecrit encore `custom_permissions` et `role_permissions`. La regle : **une cle posee par le nouveau code n'est jamais ecrasee ni retiree par l'ancien**. L'ancien code ne peut modifier qu'une cle absente, ou une cle dont la valeur actuelle est exactement celle qu'il avait lui-meme produite.

```sql
-- p_actuel       : reglage actuel au nouveau format (permission_overrides ou poste_permissions.permissions)
-- p_ancien_avant : ancienne colonne avant l'ecriture (NULL a l'insertion)
-- p_ancien_apres : ancienne colonne apres l'ecriture (NULL ou '{}' a la suppression)
CREATE OR REPLACE FUNCTION private.fusion_anciens_droits(p_actuel jsonb, p_ancien_avant jsonb, p_ancien_apres jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = '' AS $function$
  WITH t AS (
    SELECT coalesce(p_actuel, '{}'::jsonb) AS actuel,
           coalesce(private.droits_depuis_anciens(p_ancien_avant), '{}'::jsonb) AS avant,
           coalesce(private.droits_depuis_anciens(p_ancien_apres), '{}'::jsonb) AS apres
  )
  SELECT nullif(
    ( t.actuel
      -- cles que l'ancien code retire : seulement si la valeur actuelle est la sienne
      - coalesce((SELECT array_agg(a.key) FROM jsonb_each(t.avant) AS a
                  WHERE NOT (t.apres ? a.key) AND (t.actuel -> a.key) = a.value), '{}'::text[]) )
    -- cles que l'ancien code pose ou change : seulement si absentes, ou si la valeur actuelle est la sienne
    || coalesce((SELECT jsonb_object_agg(n.key, n.value) FROM jsonb_each(t.apres) AS n
                 WHERE n.value IS DISTINCT FROM (t.avant -> n.key)
                   AND (NOT (t.actuel ? n.key)
                        OR (t.actuel -> n.key) IS NOT DISTINCT FROM (t.avant -> n.key))), '{}'::jsonb),
    '{}'::jsonb)
  FROM t;
$function$;
REVOKE ALL ON FUNCTION private.fusion_anciens_droits(jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.fusion_anciens_droits(jsonb, jsonb, jsonb) TO authenticated, service_role;
```

Exemple (le scenario de l'audit) : le proprietaire retire `menu.price` a un chef avec le nouveau code (`{"menu.price": false}`). Un onglet reste sur l'ancien deploiement et enregistre `custom_permissions = {"menu.edit": true}`. Traduction : `menu.edit: true, menu.price: true`. `menu.edit` est absente, elle est posee ; `menu.price` est presente avec une valeur que l'ancien code n'avait pas produite, elle est conservee. Le retrait tient. Le grant a `authenticated` est necessaire : le declencheur de `role_permissions` est en SECURITY INVOKER (E.1) ; la fonction est pure, elle ne lit aucune table.

### B.6 Resolution des lignes `admin` pendant la transition

- Base : `postes = {manager}` plus `permission_overrides."billing.manage" = true`. Tout ce que l'administrateur pouvait faire reste possible, sauf les trois actes reserves au proprietaire, qu'il n'avait deja pas (reglages de droits par role et par personne : `verifyOwner` et `actions/admin.ts:248`).
- TypeScript : le type `Poste` ne contient pas `admin`. Le code lit `postes`, jamais `role`.
- Ancien code encore deploye : il lit `role = 'admin'`, toujours present.
- Fin du lot 4 : la ligne devient un gerant ordinaire (retrait du reglage `billing.manage`), `role` et la valeur `admin` disparaissent (E, MIG5).

---

## C. Fonctions de resolution

Ordre de decision, identique en SQL et en TypeScript :

1. code hors catalogue : refus, pour tout le monde ;
2. double authentification non satisfaite : refus ;
3. poste `owner` : `full` ;
4. reglage par personne (`permission_overrides`) present pour ce code : il tranche, dans les deux sens ;
5. sinon, pour chaque poste de la personne : le reglage du restaurant pour ce poste (`poste_permissions`) s'il existe pour ce code, sinon la case de la matrice ; puis **on garde le niveau le plus haut** entre les postes (cumul).

Consequence voulue du point 5 : retirer `orders.pay` au poste Serveur ne le retire pas a une personne qui est aussi Caissier. Pour retirer un droit a une personne precise, on utilise le reglage par personne.

```sql
CREATE OR REPLACE FUNCTION public.tenant_permission_level(p_tenant uuid, p_perm text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT CASE
    WHEN p_perm IS NULL OR NOT (p_perm = ANY (private.codes_droits())) THEN NULL
    WHEN NOT public.mfa_satisfait() THEN NULL
    ELSE (
      SELECT n.niveau
      FROM public.admin_users AS au
      CROSS JOIN LATERAL (
        SELECT CASE
          WHEN 'owner' = ANY (au.postes) THEN 'full'
          WHEN au.permission_overrides ? p_perm THEN
            CASE WHEN (au.permission_overrides -> p_perm) = 'true'::jsonb THEN 'full' END
          ELSE (
            SELECT CASE max(CASE x.niveau WHEN 'full' THEN 2 WHEN 'limited' THEN 1 ELSE 0 END)
                     WHEN 2 THEN 'full' WHEN 1 THEN 'limited' END
            FROM (
              SELECT CASE
                       WHEN pp.permissions ? p_perm THEN
                         CASE WHEN (pp.permissions -> p_perm) = 'true'::jsonb THEN 'full' END
                       ELSE m.niveau
                     END AS niveau
              FROM unnest(au.postes) AS p(poste)
              LEFT JOIN public.poste_permissions AS pp
                     ON pp.tenant_id = au.tenant_id AND pp.poste = p.poste
              LEFT JOIN private.matrice_postes() AS m
                     ON m.poste = p.poste AND m.droit = p_perm
            ) AS x
          )
        END AS niveau
      ) AS n
      WHERE au.user_id = (SELECT auth.uid())
        AND au.tenant_id = p_tenant
        AND au.is_active IS TRUE
        AND au.deleted_at IS NULL
        AND n.niveau IS NOT NULL
      ORDER BY (n.niveau = 'full') DESC
      LIMIT 1
    )
  END;
$function$;

CREATE OR REPLACE FUNCTION public.has_tenant_write_permission(p_tenant uuid, p_perm text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT coalesce(public.tenant_permission_level(p_tenant, p_perm) = 'full', false);
$function$;

-- Autorite d'argent du lot 1 : les quatre droits sensibles ensemble. Par defaut
-- proprietaire et gerant, comme l'ancienne liste owner/admin/manager. Accorder UN
-- seul de ces droits a une personne n'ouvre pas le lot entier. Le lot 3 decoupe
-- par acte (rembourser, offrir, annuler avec argent, supprimer).
CREATE OR REPLACE FUNCTION public.has_tenant_money_permission(p_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT public.has_tenant_write_permission(p_tenant, 'orders.pay')
     AND public.has_tenant_write_permission(p_tenant, 'orders.refund')
     AND public.has_tenant_write_permission(p_tenant, 'orders.cancel')
     AND public.has_tenant_write_permission(p_tenant, 'orders.discount');
$function$;

-- Plan de salle, zones, affectations : "Reglages du restaurant" (tables, espaces).
CREATE OR REPLACE FUNCTION public.has_tenant_floor_permission(p_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT public.has_tenant_write_permission(p_tenant, 'settings.edit');
$function$;

CREATE OR REPLACE FUNCTION public.is_tenant_owner(p_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT public.mfa_satisfait() AND EXISTS (
    SELECT 1 FROM public.admin_users AS au
    WHERE au.user_id = (SELECT auth.uid())
      AND au.tenant_id = p_tenant
      AND au.is_active IS TRUE
      AND au.deleted_at IS NULL
      AND 'owner' = ANY (au.postes));
$function$;

REVOKE ALL ON FUNCTION public.tenant_permission_level(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_tenant_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_permission_level(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_owner(uuid) TO anon, authenticated, service_role;
```

Lectures (M8). Une politique SELECT qui appelle `has_tenant_write_permission(tenant_id, ...)` est evaluee a chaque ligne, et chaque appel enchaine quatre fonctions que le planificateur ne peut pas integrer. Pour les tables qui se lisent en masse, la politique compare `tenant_id` a un tableau calcule **une seule fois par requete** (sous-requete sans reference a la ligne, donc initplan) :

```sql
CREATE OR REPLACE FUNCTION public.tenants_avec_droit(p_perm text, p_niveau_min text DEFAULT 'full')
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT coalesce(array_agg(au.tenant_id), '{}'::uuid[])
  FROM public.admin_users AS au
  WHERE au.user_id = (SELECT auth.uid())
    AND au.is_active IS TRUE
    AND au.deleted_at IS NULL
    AND CASE p_niveau_min
          WHEN 'full' THEN public.tenant_permission_level(au.tenant_id, p_perm) = 'full'
          WHEN 'limited' THEN public.tenant_permission_level(au.tenant_id, p_perm) IS NOT NULL
          ELSE false
        END;
$function$;
REVOKE ALL ON FUNCTION public.tenants_avec_droit(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenants_avec_droit(text, text) TO anon, authenticated, service_role;
```

Forme de politique : `USING (tenant_id = ANY ((SELECT public.tenants_avec_droit('audit.view'))))`. La double parenthese autour du SELECT est ce qui fait l'initplan ; sans elle la fonction serait rappelee a chaque ligne. Un niveau inconnu rend un tableau vide (refus).

Notes de durcissement :

- `search_path = ''` et noms tous qualifies (les trois anciennes gardes avaient `public, pg_temp`). `SECURITY DEFINER` reste necessaire : la fonction lit `admin_users` et `poste_permissions` pour un appelant dont la RLS dependrait d'elle-meme.
- Grants : `CREATE OR REPLACE` conserve les grants existants des trois anciennes gardes. Les deux nouvelles fonctions gardent EXECUTE pour `anon` et `authenticated` (lecon du projet : une fonction d'aide de RLS sans EXECUTE casse la RLS). Pour `anon`, `auth.uid()` est NULL : aucune ligne, donc NULL ou faux.
- `private.matrice_postes()`, `codes_droits()`, `postes_depuis_role()`, `role_depuis_postes()`, `droits_depuis_anciens()` : aucun grant, ils ne sont appeles que depuis des fonctions SECURITY DEFINER. `REVOKE ALL ... FROM PUBLIC` sur chacun.
- Performance : `(SELECT auth.uid())` (initplan) ; une lecture indexee de `admin_users` par `user_id`, puis `unnest` (11 postes au plus) contre 86 lignes constantes et une recherche par cle unique dans `poste_permissions`. Les politiques d'ECRITURE passent `tenant_id` de la ligne : la fonction est evaluee par ligne, comme aujourd'hui, sur peu de lignes. Les politiques de LECTURE nouvelles ou repointees utilisent `tenants_avec_droit` (une evaluation par requete). Mesure obligatoire sur le banc, avant et apres, avec `EXPLAIN (ANALYZE, BUFFERS)` : SELECT sur `audit_log` avec 50 000 lignes inserees pour un restaurant (le plan doit montrer un `InitPlan` et un seul appel de fonction), UPDATE de `menu_items`, SELECT de `ingredients`. Les deux plans et les deux durees sont joints a la PR.
- Privileges par defaut (F5) : `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated` (`schema.sql:16019-16022`) fait qu'un `REVOKE ... FROM PUBLIC` ne retire rien a ces deux roles pour une fonction creee dans `public`. C'est voulu pour les aides de RLS. Pour ne rien supposer, le test `privileges_fonctions_droits.test.sql` (F.1) verifie par `has_function_privilege` l'etat attendu de CHAQUE nouvelle fonction, schema `private` compris, pour `anon`, `authenticated` et `service_role`.
- `is_active IS TRUE` partout (la colonne est NOT NULL) : fin de l'ecart `IS NULL OR true` contre `= true` (inventaire F.3.7).

`record_refund` : recopier le corps de `schema.sql:4828-4970` a l'identique et remplacer uniquement le bloc `ELSE` de l'etape 2, de `SELECT a.id, a.role, a.custom_permissions` (4856) jusqu'a la fin du controle `orders.pay` (4918), par :

```sql
    SELECT a.id INTO v_actor
    FROM public.admin_users AS a
    WHERE a.user_id = (SELECT auth.uid())
      AND a.tenant_id = p_tenant_id
      AND a.is_active IS TRUE
      AND a.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'access denied: no active membership for tenant %', p_tenant_id
        USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_tenant_money_permission(p_tenant_id) THEN
      RAISE EXCEPTION 'access denied: refund requires the money permission'
        USING ERRCODE = '42501';
    END IF;
```

Supprimer les variables `v_role`, `v_custom`, `v_tenant_ovr`, `v_allowed`. Garder l'en-tete (`SECURITY DEFINER`, `search_path`), le `REVOKE ... FROM PUBLIC` et les grants de `schema.sql:14348-14350`. `record_refund` appartient a `payment.service` ; ce n'est pas un fichier protege, mais c'est une fonction d'argent : la migration qui la touche passe par le panel d'auditeurs (regle 10).

Miroir TypeScript, `src/lib/permissions.ts` (remplace le contenu) :

```ts
export interface MemberRights {
  postes: readonly Poste[];
  permission_overrides: PermissionMap | null;
}
export type PosteOverrides = Partial<Record<StaffPoste, PermissionMap>>;

export function permissionLevel(
  member: MemberRights,
  perm: PermissionCode,
  posteOverrides?: PosteOverrides | null,
): PermissionLevel | null {
  if (!PERMISSION_CODES.includes(perm)) return null;
  if (member.postes.includes('owner')) return 'full';
  const own = member.permission_overrides?.[perm];
  if (own !== undefined) return own ? 'full' : null;
  let best: PermissionLevel | null = null;
  for (const poste of member.postes) {
    if (poste === 'owner') continue;
    const tenant = posteOverrides?.[poste]?.[perm];
    const level =
      tenant !== undefined ? (tenant ? 'full' : null) : (POSTE_MATRIX[poste]?.[perm] ?? null);
    if (level === 'full') return 'full';
    if (level === 'limited') best = 'limited';
  }
  return best;
}
export const hasPermission = (m: MemberRights, p: PermissionCode, o?: PosteOverrides | null) =>
  permissionLevel(m, p, o) === 'full';
export function getEffectiveLevels(m: MemberRights, o?: PosteOverrides | null) {
  return Object.fromEntries(PERMISSION_CODES.map((c) => [c, permissionLevel(m, c, o)])) as Record<
    PermissionCode,
    PermissionLevel | null
  >;
}
```

Exigence composee pour les gardes : `type PermissionRequirement = PermissionCode | readonly PermissionCode[] | { anyOf: readonly PermissionCode[] } | { atLeastLimited: PermissionCode }`. Un tableau veut dire TOUS (comportement actuel de `enforceTenantPermission`), `anyOf` veut dire au moins un, `atLeastLimited` accepte `limited`. Une seule fonction `meetsRequirement(levels, requirement)` dans `permissions.ts`, utilisee par `enforceTenantPermission`, `resolveAdminPermission`, `isAdminRouteDenied`, `canOpenAdminSubPath`, `RoleGuard` et `PermissionsContext.can`.

---

## D. Sites a modifier, lot par lot

### D.1 Lot 1, base de donnees

| Objet                                                                                       | Reference                                                       | Changement                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `has_tenant_write_permission`, `has_tenant_money_permission`, `has_tenant_floor_permission` | `schema.sql:3621-3712`                                          | corps de la section C                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `record_refund`                                                                             | `schema.sql:4856-4918`                                          | bloc de la section C                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `assert_tenant_reports_view`                                                                | `schema.sql:659`                                                | `'reports.view'` devient `'reports.money'`                                                                                                                                                                                                                                                                                                                                                                                                              |
| `reassign_order_table`                                                                      | `schema.sql:4621`                                               | `'orders.manage'` devient `'orders.take'`                                                                                                                                                                                                                                                                                                                                                                                                               |
| `get_my_inventory_tenant_ids`                                                               | `schema.sql:2811-2820`                                          | ajoute `OR has_tenant_write_permission(au.tenant_id, 'suppliers.manage')` et les filtres `is_active IS TRUE AND deleted_at IS NULL`. Effet a connaitre (F12) : cette fonction ouvre la lecture des 6 tables de stock, donc une personne a qui l'on donne `suppliers.manage` seul lit aussi le stock. Sans effet par defaut (chef et gerant ont deja `inventory.view`) ; assume, car commander chez un fournisseur sans voir les niveaux n'a pas de sens |
| `get_my_tenant_ids`, `get_my_tenant_ids_array`                                              | `schema.sql:2829,2847` (derniere definition : `20261124210700`) | ajoute `AND au.deleted_at IS NULL` (F.1.8)                                                                                                                                                                                                                                                                                                                                                                                                              |
| `accept_invitation_membership`                                                              | `schema.sql:169-175`                                            | l'INSERT ajoute `postes, permission_overrides` copies de l'invitation                                                                                                                                                                                                                                                                                                                                                                                   |
| `audit_log_auteur_session`                                                                  | `schema.sql:694-717`                                            | `user_role` recoit `array_to_string(au.postes, '+')`                                                                                                                                                                                                                                                                                                                                                                                                    |
| orders UPDATE, order_items UPDATE, order_notes INSERT                                       | `schema.sql:12308, 12297, 12290`                                | `'orders.manage'` devient `(has(..., 'orders.take') OR has(..., 'kitchen.track'))` dans USING et WITH CHECK, le reste de l'expression recopie tel quel                                                                                                                                                                                                                                                                                                  |
| coupons INSERT, UPDATE, DELETE                                                              | `schema.sql:12076, 12139, 12202`                                | `'menu.edit'` devient `'orders.discount'`                                                                                                                                                                                                                                                                                                                                                                                                               |
| ads, announcements INSERT, UPDATE, DELETE                                                   | `schema.sql:12055, 12125, 12181, 12062, 12132, 12188`           | `'menu.edit'` devient `'settings.edit'`                                                                                                                                                                                                                                                                                                                                                                                                                 |
| suppliers INSERT, UPDATE, DELETE                                                            | `schema.sql:11839, 11881, 11797`                                | `'inventory.edit'` devient `'suppliers.manage'`                                                                                                                                                                                                                                                                                                                                                                                                         |
| item_price_variants INSERT, UPDATE, DELETE                                                  | `schema.sql:12118, 12174, 12244`                                | `'menu.edit'` devient `'menu.price'`                                                                                                                                                                                                                                                                                                                                                                                                                    |
| menu_items INSERT                                                                           | `schema.sql:12671`                                              | `menu.edit` ET `menu.price` (creer un plat, c'est fixer son prix)                                                                                                                                                                                                                                                                                                                                                                                       |
| audit_log SELECT                                                                            | `schema.sql:11512`                                              | `USING (tenant_id = ANY ((SELECT public.tenants_avec_droit('audit.view'))))`                                                                                                                                                                                                                                                                                                                                                                            |
| flutterwave_payments SELECT                                                                 | `schema.sql:12331`                                              | `TO authenticated USING (tenant_id = ANY ((SELECT public.tenants_avec_droit('billing.manage', 'limited'))))`                                                                                                                                                                                                                                                                                                                                            |
| invitations SELECT ; INSERT et UPDATE                                                       | `schema.sql:13267` ; `13249, 13258`                             | SELECT : `USING (tenant_id = ANY ((SELECT public.tenants_avec_droit('team.manage'))))` ; les deux autres supprimees                                                                                                                                                                                                                                                                                                                                     |
| declencheur de prix                                                                         | nouveau                                                         | voir ci-dessous                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| declencheur du proprietaire                                                                 | nouveau                                                         | voir D.4                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Pourquoi coupons, publicites et annonces changent de droit au lot 1 : le chef gagne `menu.edit` au lot 1. Sans ce changement, il gagnerait aussi la creation de codes promo et de publicites, que sa fiche metier ne lui donne pas. Le cahier des charges ne range les publicites, annonces et supports dans aucun droit (F11) : `settings.edit` est le choix le plus ferme parmi les 22 codes, il est soumis a confirmation en G.

**Garde par colonne du prix (decision : oui, au lot 1).** Sans elle, retirer `menu.price` a un chef ne ferait que masquer un champ : la politique UPDATE de `menu_items` laisse ecrire toutes les colonnes.

```sql
CREATE OR REPLACE FUNCTION public.garder_prix_carte() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  -- SECURITY INVOKER voulu : current_user doit etre celui de l'appelant.
  -- service_role, postgres, taches planifiees : hors de cette garde.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.price IS NOT DISTINCT FROM OLD.price
     AND NEW.prices IS NOT DISTINCT FROM OLD.prices THEN
    RETURN NEW;
  END IF;
  IF NOT public.has_tenant_write_permission(NEW.tenant_id, 'menu.price') THEN
    RAISE EXCEPTION 'changing a price requires the menu.price permission'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_menu_items_prix BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.garder_prix_carte();
CREATE TRIGGER trg_item_modifiers_prix BEFORE INSERT OR UPDATE ON public.item_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.garder_prix_carte();
```

Avant d'ecrire le declencheur, confirmer que `item_modifiers` porte bien `tenant_id` (la politique `schema.sql:12083` l'utilise). Pour `item_modifiers` en INSERT, la garde ne s'applique que si `coalesce(NEW.price, 0) <> 0 OR NEW.prices IS NOT NULL` : ajouter cette condition dans la branche INSERT.

### D.2 Lot 1, TypeScript

Methode, en deux passes parce que la premiere ne voit pas tout (M9) :

1. Changer `PermissionCode`, retirer `role` et `custom_permissions` du type `AdminUser`, ajouter `postes` et `permission_overrides`, puis corriger chaque erreur de compilation avec la table ci-dessous.
2. Balayage texte obligatoire : le compilateur ne voit ni les filtres en chaine (`.eq('role', 'owner')`, `.in('role', [...])`) ni les types locaux (`maybeSingle<{ id: string; role: string }>()`). Sites deja connus de ce genre : `account-deletion.service.ts:208`, `api/permissions/route.ts:47-52`, `plan-enforcement.service.ts:105`, `api/invitations/route.ts:79,205`, `actions/orders.ts:171`.

Critere de fin de lot, a coller dans la PR avec sa sortie :

```bash
# 1. Lectures de role : ne doit rendre que les sites de transition justifies.
rg -n "\brole\b" src scripts --glob '!**/__tests__/**' --glob '!src/messages/**' \
  --glob '!src/types/database.generated.ts'
# 2. Anciennes constantes : 0 ligne a la PR du lot 1.
rg -n "ROLE_RANK|ALL_ADMIN_ROLES|ORDER_MONEY_ROLES|ASSIGNMENT_MANAGER_ROLES|ORDER_PAY_PERMISSIONS" src scripts tests
# 3. Anciennes colonnes : 0 ligne a la PR du lot 1 HORS types generes ; 0 ligne
#    partout a la PR de MIG4, une fois les types regeneres.
rg -n "custom_permissions|role_permissions" src scripts tests --glob '!src/types/database.generated.ts'
# 4. Anciens codes : 0 ligne hors table de traduction et son test.
rg -n "'(orders\.manage|orders\.view|reports\.view|pos\.use|settings\.view)'" src tests \
  --glob '!src/lib/permissions-legacy.ts' --glob '!src/lib/__tests__/permission-migration.test.ts'
```

Fichiers exclus et pourquoi (N3) : `src/types/database.generated.ts` est genere depuis la base et contient les anciennes colonnes tant que MIG4 n'est pas appliquee ; `src/lib/permissions-legacy.ts` porte la table de traduction B.5 (`legacyToNew`), qui cite les anciens codes par construction, avec son test. Ces deux derniers fichiers sont supprimes dans la PR de MIG4, ou la commande 4 se relance sans exclusion.

La commande 1 ne doit plus rendre que les sites de transition, chacun justifie par une ligne dans la PR : reconnaissance du super administrateur (`role === 'super_admin'`), `signup.service.ts:109` (protege, ecrit `role: 'owner'`), le role PostgREST (`auth.role()`), l'attribut ARIA `role=`, et les libelles.

Temoins positifs, obligatoires, pour qu'un 0 veuille dire quelque chose :

- lancer les quatre commandes AVANT de coder et noter les comptes (ils doivent etre superieurs a 0) ;
- apres le travail, relancer les commandes 3 et 4 SANS leurs exclusions : elles doivent rendre uniquement des lignes des fichiers exclus. Si elles rendent 0, l'exclusion masque un fichier qui n'existe pas ou la commande ne cherche rien.

Les numeros de ligne viennent de l'inventaire section C.

Regle de traduction par site :

| Ancien controle                                                                                                                                                                                                        | Nouveau controle                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `menu.view`                                                                                                                                                                                                            | `menu.view`                                                                                                                                                                                                                                 |
| `menu.edit` (carte, categories, menus, modificateurs sans prix, suggestions, photos)                                                                                                                                   | `menu.edit`                                                                                                                                                                                                                                 |
| `menu.edit` sur les imports de carte (`api/menu-import/route.ts:40`, `api/menu-import-pdf/route.ts:76`)                                                                                                                | `['menu.edit', 'menu.price']`, verifie AVANT toute ecriture (M6) : un import cree des plats et fixe des prix. Sans cela, un membre sans `menu.price` obtiendrait un import a moitie applique (categories creees, plats refuses par la base) |
| `menu.edit` sur la mise a jour d'un plat quand le payload contient `price` ou `prices` (`actionUpdateMenuItem`, `menu-item.service.ts:87`)                                                                             | `['menu.edit', 'menu.price']` ; sans ces deux champs, `menu.edit` seul                                                                                                                                                                      |
| `menu.edit` sur `actionUpdateMenuItemPrice` (`menu-items.ts:320`), variantes de prix, prix de modificateur                                                                                                             | `menu.price`                                                                                                                                                                                                                                |
| `menu.edit` sur la creation d'un plat (`menu-items.ts`, action de creation)                                                                                                                                            | `['menu.edit', 'menu.price']`                                                                                                                                                                                                               |
| `menu.edit` sur coupons (`coupons.ts:23`, route `/coupons`, `coupons/page.tsx:18`)                                                                                                                                     | `orders.discount`                                                                                                                                                                                                                           |
| `menu.edit` sur publicites, annonces, supports (`ads.ts:43`, `announcements.ts:30`, `supports/export:126`, routes et pages `/ads`, `/announcements`, `/supports`)                                                      | `settings.edit`                                                                                                                                                                                                                             |
| `orders.view` (`/orders`, `orders/page.tsx:35`, `orders/[id]:21`, `actionGetPaymentSummary`, `actionListOrderNotes`)                                                                                                   | `{ anyOf: ['orders.take', 'kitchen.track', 'orders.pay'] }`                                                                                                                                                                                 |
| `orders.manage` (statuts, notes, `actionSetCourseHeld`, `table-release.ts:36`)                                                                                                                                         | `{ anyOf: ['orders.take', 'kitchen.track'] }`                                                                                                                                                                                               |
| `orders.manage` sur `table-reassign.ts:52`, `orders/[id]/claim:66`                                                                                                                                                     | `orders.take`                                                                                                                                                                                                                               |
| `['owner','admin','manager']` + `orders.manage` (`tables.ts:36-40`, `assignments.ts:24`, `useCanManageFloor`)                                                                                                          | `settings.edit`                                                                                                                                                                                                                             |
| `ORDER_PAY_PERMISSIONS` (payer, tender, ardoise, annulation)                                                                                                                                                           | `orders.pay`                                                                                                                                                                                                                                |
| `ORDER_MONEY_ROLES` + `ORDER_PAY_PERMISSIONS` (`actionRefundOrder`, `actionCompOrder`, `actionCreateHouseAccount`, `actionSettleHouseAccount`, `HouseAccountsClient:70`, `OrderPaymentPanel:74`, `useOrderDetails:44`) | `MONEY_PERMISSIONS = ['orders.pay','orders.refund','orders.cancel','orders.discount']` (tous)                                                                                                                                               |
| `['owner','admin']` + `orders.pay` (`actionDeleteOrders:171`, `OrdersBulkActionBar:41`)                                                                                                                                | `MONEY_PERMISSIONS` (alignement sur la base, F.3.2)                                                                                                                                                                                         |
| `pos.use` (`/pos`, `pos/page.tsx:16`, `api/orders/pos:53`, `CommandPalette:105`)                                                                                                                                       | `orders.take`                                                                                                                                                                                                                               |
| `reports.view` (pages rapports, `page.tsx:414`, `DashboardClient:62`, `useDashboardData:68`)                                                                                                                           | `reports.money`                                                                                                                                                                                                                             |
| `inventory.view`, `inventory.edit`                                                                                                                                                                                     | inchanges                                                                                                                                                                                                                                   |
| `inventory.edit` sur `suppliers.ts:60`, `supplier-import:38`, `SuppliersClient:66`                                                                                                                                     | `suppliers.manage`                                                                                                                                                                                                                          |
| route `/suppliers`, `suppliers/page.tsx:19`                                                                                                                                                                            | `{ anyOf: ['inventory.view', 'suppliers.manage'] }`                                                                                                                                                                                         |
| `team.view`                                                                                                                                                                                                            | `team.view`                                                                                                                                                                                                                                 |
| `['owner','admin']` + `team.manage` (`checkTenantAdminPermissions`, 4 routes `invitations`, `email-change.service:37`, `useUsersData:142`)                                                                             | `team.manage` plus la regle d'autorite D.3                                                                                                                                                                                                  |
| `settings.view` sur `/settings`, `settings/page.tsx:31`, `settings/espaces:21`, `settings/tables:20`, `FeatureUpgradeWall:55`                                                                                          | `settings.edit`                                                                                                                                                                                                                             |
| `settings.view` sur `/audit-logs`, `audit-logs/page.tsx:18` et `:43`                                                                                                                                                   | `audit.view`                                                                                                                                                                                                                                |
| `settings.view` et `['owner','admin']` sur `/invoices`, `invoices/page.tsx:18`, `api/invoices:76,82`, `/subscription`, `subscription/page.tsx:30`                                                                      | `{ atLeastLimited: 'billing.manage' }`                                                                                                                                                                                                      |
| `['owner','admin']` sur `update-subscription:88`, `billing-portal:68`, `checkout-tenant.ts:28,37`, `SubscriptionBanners:28`                                                                                            | `billing.manage` (full)                                                                                                                                                                                                                     |
| `settings.edit`                                                                                                                                                                                                        | `settings.edit`                                                                                                                                                                                                                             |
| `role === 'owner'`, `.eq('role','owner')`, `ONBOARDING_COMPLETE_ROLES`, `RoleGuard roles={['owner']}`, `verifyOwner`                                                                                                   | `isOwner(member)` = `postes.includes('owner')` ; en requete : `.contains('postes', ['owner'])`                                                                                                                                              |
| `ALL_ADMIN_ROLES` et le parametre `allowedRoles` de `getAuthenticatedUserForTenant` et `checkTenantAdminPermissions`                                                                                                   | supprimes : la permission decide seule                                                                                                                                                                                                      |

Sites qui ne sont pas des droits mais lisaient `role` (F.2.5), tous au lot 1 parce que le cumul les rend faux des qu'il existe :

| Site                                                                                                                                                                                       | Nouvelle regle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/orders/pos/route.ts:514` (auto-affectation du serveur)                                                                                                                                | `postes` contient l'un de `SERVICE_POSTES = ['waiter','bartender','crew']`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `service-manager.service.ts:64` (qui peut etre affecte a une table)                                                                                                                        | droits EFFECTIFS, pas la matrice seule (F10) : lire les membres actifs du restaurant (`postes`, `permission_overrides`) et les reglages `poste_permissions`, puis garder ceux pour qui `permissionLevel(membre, 'orders.take', reglages) === 'full'`. Un serveur a qui l'on a retire `orders.take` n'est plus proposable                                                                                                                                                                                                                                                                                                                                                                                      |
| `KitchenClient.tsx:23,35` (vue chef)                                                                                                                                                       | `can('kitchen.track') && can('menu.edit')`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `reminders/rules.ts:35,39` (`managersOf`)                                                                                                                                                  | membres dont les postes contiennent `owner` ou `manager`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `reminders/rules.ts:137`                                                                                                                                                                   | `postes` contient `chef` ou `cook`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `reminder.service.ts:414` (coach hebdomadaire, contient du chiffre d'affaires)                                                                                                             | postes contenant `owner` ou `manager` (les deux postes qui ont `reports.money`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `flutterwave-renewal.service.ts:73`, `trigger-emails.service.ts:251`, `api/orders/route.helpers.ts:157`, `layout.tsx:180`                                                                  | `.contains('postes', ['owner'])` ; l'index unique garantit une seule ligne, `maybeSingle()` devient sur                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `audit` : `categories.ts:105`, `menus.ts:112,173,211` (`userRole`)                                                                                                                         | `postes.join('+')`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `email.templates.ts:243-249`                                                                                                                                                               | libelles des 10 postes invitables, l'email liste tous les postes de l'invitation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `role-config.ts`, `UsersTable`, `PendingInvitations`, `use-service-labels.ts:81`, `segment-terms.ts:59-60`                                                                                 | une pastille par poste ; `buildRoleConfig` couvre les 11 postes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `layout.tsx:237` (`?? 'admin'`)                                                                                                                                                            | pas de membre : `postes: []`, donc aucun droit (F.1.5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `layout.tsx:125`, `resolve-admin-permission.ts:82,88`, `get-session.ts:209,216`                                                                                                            | super admin virtuel : `postes: ['owner']` ; reconnaissance par `is_super_admin === true                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |     | role === 'super_admin'` partout (F.1.9) |
| `get-session.ts:312-318`                                                                                                                                                                   | ajoute `.is('deleted_at', null)` (F.1.8)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `plan-enforcement.service.ts:26,105,136`                                                                                                                                                   | la regle de comptage ne change PAS au lot 1 tant que le proprietaire n'a pas tranche (P4, decision G.a). Une constante unique `MANAGER_SEAT: 'staff' \| 'admin'` dans ce fichier, valeur initiale `'staff'` : c'est la regle d'aujourd'hui (le gerant compte comme personnel ; le proprietaire, et l'ancien administrateur tant qu'il existe, comptent comme administrateurs). Siege administrateur = postes contenant `owner`, plus `manager` si la constante vaut `'admin'`, plus toute ligne dont `role = 'admin'` pendant la transition. Les tests couvrent les deux valeurs. Le controle ne se fait qu'a la prise d'un nouveau siege : aucun restaurant existant n'est bloque, quelle que soit la valeur |
| `account-deletion.service.ts:219,277`, `session-admin-user.ts:126`, `post-login-destination.ts:142-186`, `api/admin/reset:45`, `api/restaurants/create:59`, `admin/tenants/page.tsx:49-52` | `isOwner`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Ecriture des postes et des reglages :

| Site                                                                                                                                                                  | Changement                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invitation.schema.ts:5,23`                                                                                                                                           | `postes: z.array(z.enum(INVITABLE_POSTES)).min(1).max(10)` sans doublon ; `permission_overrides: z.partialRecord(z.enum(PERMISSION_CODES), z.boolean())`                    |
| `admin-user.schema.ts:24,30-36`                                                                                                                                       | meme forme ; `owner` retire de la liste (F.1.6)                                                                                                                             |
| `invitation.service.ts:255-256`                                                                                                                                       | insere `postes` et `permission_overrides` (plus de `role`, le declencheur le projette)                                                                                      |
| `actions/admin.ts:206-360`                                                                                                                                            | payload `postes`, `permission_overrides` ; regles D.3                                                                                                                       |
| `api/permissions/route.ts:14,41-56,118-129,192`                                                                                                                       | table `poste_permissions`, cle `poste`, `VALID_POSTES` = 10 postes, garde `isOwner`                                                                                         |
| `get-session.ts:63-88`, `resolve-admin-permission.ts`, `layout.tsx:247-252`, `users/page.tsx:93`                                                                      | lisent `poste_permissions` pour TOUS les postes du membre (`.in('poste', postes)`), echec ferme conserve                                                                    |
| `PermissionsClient.tsx:28,124-138`, `use-permission-overrides.ts`, `UserPermissionsDialog.tsx`                                                                        | 10 postes, 22 droits ; les 5 droits limitables affichent leur etat par defaut ("avec code", "QR marchand", "factures") en texte                                             |
| `UserForm.tsx:46-57`, `UsersClient.tsx:310-314`, `useUsersData.ts:129,223`                                                                                            | cases a cocher des 10 postes (au moins une), defaut `['waiter']`. C'est le minimum pour verifier le cumul a l'ecran ; la refonte de l'ecran Equipe reste au lot 4           |
| `i18n fr-FR.json`, `en-US.json`                                                                                                                                       | `permissions.perm.*` pour les 22 codes, `permissions.role.*` et `users.role*` pour les 11 postes, suppression des cles des 13 anciens codes et de `roleAdmin`               |
| `scripts/manage-super-admin.js`, `scripts/security-super-admin.sql:16`                                                                                                | voir D.2 bis (F.2.6, M4)                                                                                                                                                    |
| `scripts/seed-demo.ts:260-290`, `seed-qa.ts:289-329`, `tests/journeys/fixtures/seed.ts:195-199,383-393`, `personas.ts:9-59`, `scripts/repeter-migration-rls.sh:90-91` | ecrivent `postes` ; le type n'accepte plus `'admin'`. Nettoyage des deux seeds : voir D.2 bis                                                                               |
| `src/lib/admin-roles.ts`                                                                                                                                              | ne garde que `MONEY_PERMISSIONS`, `SERVICE_POSTES` ; `ALL_ADMIN_ROLES`, `ORDER_MONEY_ROLES`, `ASSIGNMENT_MANAGER_ROLES`, `ORDER_PAY_PERMISSIONS`, `isRoleAllowed` supprimes |
| `src/lib/auth/role-hierarchy.ts`                                                                                                                                      | supprime, remplace par `src/lib/auth/poste-authority.ts` (D.3)                                                                                                              |
| `src/lib/auth/admin-route-permissions.ts:18-41`                                                                                                                       | table de D.2 ; `/settings/permissions` : `settings.edit` conserve, la page garde son controle `isOwner`                                                                     |

Fichiers proteges : aucun n'est modifie au lot 1 (`proxy.ts`, `rate-limit.ts`, `order.service.ts`, `signup.service.ts`, `CartContext.tsx`, webhook Stripe). `signup.service.ts:109` continue d'ecrire `role: 'owner'` ; le declencheur en deduit `postes = {owner}`. Il sera modifie avec accord explicite au lot 4, quand `role` disparait.

### D.2 bis Scripts : super administrateur et seeds (M2, M4)

**`scripts/manage-super-admin.js`.** Defauts actuels, lus aux lignes 96-120 et 160-186 : les trois requetes filtrent sur `email` seul (un email peut exister dans plusieurs restaurants) ; la revocation ecrit `role = 'admin'` ; l'activation ecrit `role = 'super_admin'` sur n'importe quelle ligne, donc aussi sur une ligne de proprietaire ; la suppression efface toutes les lignes de cet email puis le compte.

Correctif :

- Nouvelle variable obligatoire `SUPER_ADMIN_TENANT_SLUG`. Le script s'arrete avec un message clair si elle manque. Toutes les requetes ciblent UNE ligne : `WHERE email = $1 AND tenant_id = (SELECT id FROM tenants WHERE slug = $2)`. Chaque UPDATE ou DELETE verifie `rowCount === 1`, sinon il annule et le dit.
- Declencheur existant (N1). `prevent_super_admin_elevation` (`schema.sql:4354-4439`, declencheur `schema.sql:10150`) refuse tout changement de `is_super_admin` sauf si la session porte `request.jwt.claim.role = 'service_role'` ou si l'appelant est deja super administrateur d'apres `auth.uid()`. Le script se connecte en direct par `pg` : aucune des deux conditions n'est vraie, donc l'activation et la revocation echouent deja aujourd'hui. Correctif : chaque operation tourne dans UNE transaction qui commence par ce reglage, local a la transaction, et le declencheur n'est jamais desactive :

```js
await pgClient.query('BEGIN');
try {
  await pgClient.query("SELECT set_config('request.jwt.claim.role', 'service_role', true)");
  const res = await pgClient.query(/* la requete ciblee de l'operation */);
  if (res.rowCount !== 1) throw new Error(`lignes touchees : ${res.rowCount}, attendu 1`);
  await pgClient.query('COMMIT');
} catch (err) {
  await pgClient.query('ROLLBACK');
  throw err;
}
```

Le troisieme argument `true` limite le reglage a la transaction : il disparait au COMMIT ou au ROLLBACK, la connexion ne le garde pas.

- Le script ne reecrit plus jamais `role`.
- Revocation : si la ligne porte `role = 'super_admin'` (ligne de plateforme pure, sans poste) : `SET is_super_admin = false, is_active = false`. Sinon (membre ordinaire qui portait le drapeau, par exemple un proprietaire) : `SET is_super_admin = false` seulement. Le proprietaire d'un restaurant n'est jamais desactive par ce script. `deleted_at` n'est pas touche : la reactivation reste un simple retour.
- Activation : `SET is_super_admin = true`, et pour une ligne `role = 'super_admin'` en plus `is_active = true, deleted_at = NULL`. Revoquer puis reactiver rend donc la console plateforme, ce que le correctif de la version 1 cassait.
- Suppression : refusee si la ligne porte le poste `owner` (message : supprimer ou transferer le restaurant d'abord). Sinon elle efface la ligne ciblee, puis le compte `auth.users` seulement s'il ne reste aucune ligne `admin_users` pour ce `user_id`.
- `scripts/security-super-admin.sql:16` : meme regle, commentaire corrige.
  Preuve sur le banc, faisable grace au reglage de session ci-dessus : cycle activer, revoquer, reactiver sur une ligne de plateforme (`select public.is_super_admin()` vrai, faux, vrai sous le jeton de ce compte) ; temoin du declencheur : la meme requete d'activation lancee SANS le `set_config` leve toujours l'erreur "Only super_admin users can grant super_admin privileges" (le declencheur est donc toujours en place) ; meme cycle sur un proprietaire portant le drapeau (il reste proprietaire actif tout du long) ; lancement sans `SUPER_ADMIN_TENANT_SLUG` (arret) ; email present dans deux restaurants (une seule ligne touchee).

**`scripts/seed-demo.ts:360-380` et `scripts/seed-qa.ts:374-390`.** Aujourd'hui le nettoyage supprime les comptes `auth.users` trouves par email AVANT le restaurant. La suppression du compte du proprietaire cascade vers sa ligne `admin_users` (`schema.sql:10562`), que la garde du proprietaire refuse tant que le restaurant existe : le seed echouerait.

Correctif, meme ordre dans les deux scripts :

1. Lire le restaurant par son slug (`lepicurien`, `attabl-qa`).
2. S'il existe : lire les `user_id` de ses membres (`admin_users` filtre par `tenant_id`), supprimer les fichiers, supprimer le restaurant (la cascade efface les membres, proprietaire compris), puis supprimer chaque compte `auth.users` de cette liste qui n'a plus AUCUNE ligne `admin_users` dans un autre restaurant.
3. S'il n'existe pas : pour chaque email du seed, supprimer le compte seulement s'il n'a aucune ligne `admin_users`. Un compte qui porte le meme email mais appartient a un autre restaurant n'est jamais supprime : le script s'arrete et nomme le restaurant.
   Jamais de suppression decidee sur l'email seul. Preuve sur le banc : lancer chaque seed deux fois de suite (la seconde execute le nettoyage) ; avant le second lancement, creer un restaurant temoin dont le proprietaire porte un email du seed, et verifier que le seed s'arrete sans rien supprimer.

Autres chemins de suppression physique d'un compte proprietaire : voir D.4.

### D.3 Autorite sur l'equipe (remplace `ROLE_RANK`)

`src/lib/auth/poste-authority.ts`, deux fonctions pures, memes regles dans l'action, les routes d'invitation et le service de changement d'email :

- `canGrantPostes(actorLevels, postes, posteOverrides)` : faux si `postes` contient `owner`. Sinon vrai si, pour chacun des 22 droits, le niveau que donneraient ces postes (matrice plus reglages du restaurant) est inferieur ou egal au niveau effectif de l'acteur. "On ne donne pas un droit qu'on n'a pas."
- `canActOnMember(actor, target)` (modifier, desactiver, retirer, reinitialiser le mot de passe, changer l'email) : faux si la cible est le proprietaire, faux si la cible est l'acteur. Vrai si l'acteur est le proprietaire. Sinon vrai seulement si les droits effectifs de la cible sont un sous-ensemble **strict** de ceux de l'acteur. Un gerant n'agit donc pas sur un autre gerant (meme regle qu'avant : rang strictement inferieur), ce qui evite la prise de controle d'un compte de meme niveau.
- Les reglages par personne (`permission_overrides`) et par poste restent reserves au proprietaire (decision du 2026-11-09 conservee).

### D.4 Protections du proprietaire en base

Aujourd'hui aucune garde en base (inventaire A.4). Trois verrous au lot 1 :

1. Index unique `admin_users_un_proprietaire` (A.4) : un seul proprietaire vivant par restaurant.
2. Schemas et CHECK : `owner` n'est ni invitable ni attribuable (A.6, D.2).
3. Declencheur, qui s'applique a tout le monde, `service_role` compris (les actions d'equipe ecrivent en `service_role`, la RLS ne les couvre pas) :

```sql
CREATE OR REPLACE FUNCTION private.garder_proprietaire() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ('owner' = ANY (OLD.postes)) IS DISTINCT FROM ('owner' = ANY (NEW.postes)) THEN
      RAISE EXCEPTION 'the owner poste cannot be granted or removed' USING ERRCODE = '42501';
    END IF;
    IF 'owner' = ANY (OLD.postes)
       AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
      RAISE EXCEPTION 'the owner row cannot be reassigned' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  -- DELETE : interdit tant que le restaurant existe et n'est pas ferme. La
  -- suppression en cascade depuis tenants passe (la ligne tenants n'existe plus),
  -- delete_my_account sur un restaurant ferme passe aussi.
  IF 'owner' = ANY (OLD.postes) AND EXISTS (
       SELECT 1 FROM public.tenants AS t WHERE t.id = OLD.tenant_id AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'the owner of a live restaurant cannot be removed' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$function$;
CREATE TRIGGER garder_proprietaire_trg BEFORE UPDATE OR DELETE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION private.garder_proprietaire();
```

`SECURITY DEFINER` est ici sans danger : la regle ne depend pas de l'appelant (elle vaut pour tous), elle n'a donc pas besoin de `current_user`. La desactivation ou le blocage d'un proprietaire par la plateforme (`platform-admin.service.ts:370,432`, colonnes `is_active`, `banned_at`, `deleted_at`) reste possible : la ligne n'est ni supprimee ni privee de son poste. Cote restaurant, `canActOnMember` refuse toute action sur le proprietaire.

Chemins touches par cette garde (M2). La version 1 disait "compatibilite verifiee" en ne couvrant qu'un cas sur deux ; voici la liste complete.

| Chemin                                                                                           | Effet de la garde                                                                                                                    | Traitement                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `delete_admin_user_atomic`, dernier membre (`schema.sql:1341-1347`)                              | supprime le restaurant d'abord, la cascade passe                                                                                     | rien a changer. A PROUVER sur le banc (P1), voir ci-dessous                                                                                                                                                                       |
| `delete_admin_user_atomic`, proprietaire avec d'autres membres (branche ELSE, `schema.sql:1370`) | desormais refuse (42501), toute la fonction est annulee                                                                              | voulu : c'est la protection du dernier proprietaire. L'application n'atteint pas ce cas (`actions/admin.ts:124`). Test ajoute                                                                                                     |
| `delete_my_account` (`schema.sql:1430-1438`)                                                     | refuse deja le proprietaire unique d'un restaurant ouvert ; avec l'index unique, tout proprietaire d'un restaurant ouvert est unique | rien a changer                                                                                                                                                                                                                    |
| suppression physique d'un compte `auth.users` de proprietaire (cascade `schema.sql:10562`)       | refusee tant que le restaurant est ouvert                                                                                            | voulu. Chemins a corriger : `scripts/seed-demo.ts:376`, `scripts/seed-qa.ts:387`, `scripts/manage-super-admin.js:172,182` (D.2 bis), `tests/integration/reminders/engine.test.ts:104` (supprimer le restaurant avant les comptes) |
| `signup.service.ts:231` (annulation d'une inscription ratee)                                     | sans effet : la creation est atomique, la ligne de membre n'existe pas quand le compte est supprime                                  | rien a changer ; fichier protege, non modifie                                                                                                                                                                                     |
| `supabase/tests/rls/un_essai_par_proprietaire.test.sql:76,90,102,136`                            | quatre `delete from admin_users` sur le proprietaire avant son restaurant : 42501                                                    | corriger les donnees du test : supprimer le restaurant d'abord (categorie 2 de B.4)                                                                                                                                               |
| `supabase/tests/rls/flutterwave_anomalies.test.sql:33-36`                                        | deux lignes `owner` dans le meme restaurant : violation de l'index unique                                                            | le super administrateur du test devient une ligne de plateforme (`role = 'super_admin'`, `is_super_admin = true`), plus de second proprietaire                                                                                    |

Preuve de la cascade sur le banc (P1), avant toute application. Le raisonnement ("la ligne `tenants` n'est plus visible du declencheur quand la cascade arrive") est le comportement attendu de PostgreSQL, mais tout le chemin "le dernier membre supprime son restaurant" en depend. Le test `proprietaire_protege` doit donc passer par la vraie fonction, pas par un simple `DELETE FROM tenants` : creer un restaurant avec son seul proprietaire, appeler `select public.delete_admin_user_atomic(<id membre>, <id utilisateur>)` en `service_role`, puis verifier que la fonction ne leve rien, que le restaurant a disparu et qu'il reste 0 ligne `admin_users` pour lui. Temoin dans le meme fichier : le meme appel sur un proprietaire accompagne d'un serveur leve 42501 et ne supprime rien (compter restaurants et membres avant et apres). Si le premier cas echoue sur le banc, la garde est corrigee avant d'aller plus loin, **sans** se fier a la profondeur des declencheurs (N2) : `pg_trigger_depth() > 1` est vrai aussi pour la cascade qui part de `auth.users`, et laisserait donc repasser la suppression physique du compte d'un proprietaire, que le plan de tests exige de refuser. Le repli retenu reprend le motif deja present dans la base (`attabl.purge_legale`, `schema.sql:300-308`, lu par `schema.sql:1696`) : un drapeau local a la transaction, qui nomme LE restaurant en cours de suppression.

```sql
-- Dans delete_admin_user_atomic, autour de la suppression du restaurant (schema.sql:1347) :
PERFORM pg_catalog.set_config('attabl.suppression_restaurant', v_tenant_id::text, true);
DELETE FROM tenants WHERE id = v_tenant_id;
PERFORM pg_catalog.set_config('attabl.suppression_restaurant', '', true);

-- Dans private.garder_proprietaire, branche DELETE, avant le RAISE :
IF coalesce(current_setting('attabl.suppression_restaurant', true), '') = OLD.tenant_id::text THEN
  RETURN OLD;
END IF;
```

Le drapeau ne laisse passer que les lignes de ce restaurant, et seulement pendant cette transaction. Une suppression qui part de `auth.users` ne le pose pas : elle reste refusee. Si ce repli est active, toute autre fonction qui supprime un restaurant doit poser le meme drapeau ; les recenser avec `rg -n -i "delete from (public\.)?tenants" supabase/schema.sql supabase/migrations` et `rg -n "from\('tenants'\)" src scripts | rg delete`, et ajouter un cas de test par chemin. Un employe ne peut pas poser ce drapeau lui-meme : `set_config` n'est pas expose par l'API de la base, et la garde ne s'applique de toute facon qu'a des suppressions qu'il n'a pas le droit de faire (aucun grant DELETE sur `admin_users` pour `authenticated`, a confirmer dans le test `employe_ne_s_eleve_pas`).

Transfert de propriete : aucune fonction ne le permet au lot 1 (aucun lot du cahier des charges ne le demande). Le jour ou il est demande, il passera par une fonction dediee qui desactive ce declencheur pour sa transaction.

### D.5 Reporte aux lots 2, 3 et 4, avec le correctif prevu

| Sujet                                                              | Lot                | Correctif concret                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rapports de la carte et d'argent                                   | 2                  | Deux gardes `assert_tenant_reports_menu` (`reports.menu`) et `assert_tenant_reports_money` (`reports.money`). Carte : `get_category_breakdown`, `get_top_items`, `get_dish_margins`, `get_venue_top_items`, `get_stock_losses_report`. Argent : `get_daily_revenue`, `get_order_summary`, `get_server_performance`, `get_payment_method_report`, `get_period_comparison`, `get_sales_heatmap`, `get_venue_report`. Routes et pages repointees. Au lot 1 tout reste sur `reports.money` : les ECRANS et les fonctions de rapport sont fermes au chef. Cela ne suffit pas a tenir la decision 1 du proprietaire, voir D.5 bis. |
| Ses propres ventes                                                 | 2                  | RPC `get_my_sales` filtree sur `auth.uid()`, droit `reports.own`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Lectures d'argent ouvertes a tout membre (F.1.7, H1)               | 2                  | Voir D.5 bis : `payments`, `house_accounts`, `table_sessions`, et aussi `orders` et `order_items`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Annuler, remiser, rembourser avec le code d'un responsable (F.3.5) | 3                  | Code responsable hache, RPC de validation qui journalise l'employe et le responsable. `refuser_argent_sans_orders_pay` (`schema.sql:5043`) passe de `orders.pay` a `orders.cancel`. `claim_coupon_usage` et `unclaim_coupon_usage` passent a `orders.discount`. `has_tenant_money_permission` est decoupee par acte. Au lot 1, annuler et appliquer un coupon restent sur `orders.pay` : le caissier garde ce qu'il a, le serveur ne gagne rien.                                                                                                                                                                             |
| Encaissement du serveur limite au QR marchand                      | 3                  | `garder_ecriture_registre_paiements` et la politique `payments_tenant_insert` acceptent le niveau `limited` de `orders.pay` uniquement pour les moyens marques "compte marchand".                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Cloture et comptage a l'aveugle                                    | 3                  | Fonctions nouvelles, droits `cash.close` et `cash.count` deja au catalogue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Compte de paiement du restaurant, reserve au proprietaire          | 3 (avec Ligdicash) | Les colonnes du compte marchand sont ecrites par une action `isOwner` et gardees par un declencheur de colonnes. `enabled_payment_methods` reste sur `settings.edit`.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Questions d'onboarding et postes de depart                         | 4                  | Deux questions, puis les postes proposes dans l'ecran Equipe selon le tableau de la section 6 du cahier des charges.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Ecran Equipe (cumul, reglages par personne)                        | 4                  | Refonte de l'ecran ; le lot 1 ne livre que les cases a cocher.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Retrait de `admin`, de `role`, de `invitations.role`               | fin du lot 4       | Migration MIG5 (E). Reecrit les fonctions qui lisent `role`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Role `platform` inexistant (F.3.10)                                | sans objet         | La plateforme repose sur `is_super_admin`. MIG5 convertit `role = 'super_admin'` en `is_super_admin = true` avant de supprimer `role`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### D.5 bis Lectures d'argent : l'etat reel, et le correctif complet du lot 2 (H1)

**Etat reel, aujourd'hui et apres le lot 1.** En base, tout membre actif d'un restaurant lit `orders`, `order_items`, `payments`, `house_accounts` et `table_sessions` en entier (`schema.sql:11569, 11560, 12884, 12991, 12754, 13236` : appartenance seule). Un chef, un cuisinier ou un poste Fabrication qui interroge l'API de la base avec son propre jeton peut lire les totaux des commandes et les paiements, et recalculer le chiffre d'affaires. Le lot 1 ne change rien a cela : il ferme les ecrans et les fonctions de rapport, pas ces tables. **Tant que le lot 2 n'est pas livre, la decision 1 du proprietaire ("le chef ne voit pas le chiffre d'affaires") est tenue par l'interface seulement, pas par la base.** Aucun compte rendu ne doit dire le contraire. Ce n'est pas une regression (l'acces existe deja), mais le lot 1 ajoute trois postes qui en heritent (`cook`, `production`, et `chef` reste concerne). C'est dit au proprietaire en G.

**Qui a besoin de quoi.** Les montants d'une commande sont dans `orders` (`subtotal`, `total`, `tax_amount`, `service_charge_amount`, `discount_amount`, `tip_amount`, `comp_amount`) et dans les colonnes de prix de `order_items` (liste exacte a relever par `\d public.order_items` au debut du lot 2).

| Qui                                                                                                               | Besoin reel                                                                  | Lecture accordee au lot 2                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| a `reports.money`, ou `orders.pay` en `full` (proprietaire, gerant, caissier, barman, reception, equipier, vente) | encaisser, cloturer, controler                                               | toutes les lignes, toutes les colonnes de `orders`, `order_items`, `payments`, `house_accounts`, `table_sessions`                                                                                                                                                                                                                                            |
| a `orders.take` sans `orders.pay` en `full` (serveur)                                                             | ses tables : prendre la commande, la suivre, presenter l'addition            | `orders` et `order_items` en entier, mais seulement pour les commandes qu'il sert : `server_id` = sa ligne de membre, ou table qui lui est affectee (`table_assignments`), ou commande qu'il a creee, plus les commandes ouvertes sans serveur (pour les prendre en charge). `payments` : les siens seulement (avec `reports.own`). Rien de `house_accounts` |
| a `kitchen.track` seul (chef, cuisinier, fabrication)                                                             | les lignes a produire : plat, quantite, options, notes, table, statut, heure | aucune lecture directe des tables. Une vue `kitchen_orders` et une vue `kitchen_order_items` SANS aucune colonne de montant, limitees aux commandes en production et recentes, filtrees par `tenants_avec_droit('kitchen.track')`                                                                                                                            |
| aucun de ces droits                                                                                               | rien                                                                         | rien                                                                                                                                                                                                                                                                                                                                                         |

**Mise en oeuvre au lot 2.**

1. Politiques SELECT reecrites sur ces cinq tables selon le tableau, avec la forme a une evaluation par requete (`tenants_avec_droit`).
2. Deux vues de cuisine, proprietaire `postgres`, sans colonnes d'argent, `GRANT SELECT` a `authenticated` seulement (jamais `anon`). L'ecran cuisine et l'ecran bar lisent ces vues. **Exigence (N7)** : une vue dont le proprietaire est `postgres` ne passe PAS par la RLS des tables qu'elle lit. L'isolation entre restaurants repose donc entierement sur le filtre ecrit dans la vue : chaque vue porte en dur `WHERE tenant_id = ANY ((SELECT public.tenants_avec_droit('kitchen.track')))`, et ce filtre est la seule garde. Test obligatoire sur les vues elles-memes, `vues_cuisine_isolation.test.sql` : deux restaurants A et B avec chacun des commandes ; sous le jeton du cuisinier de A, `kitchen_orders` et `kitchen_order_items` ne rendent aucune ligne de B (compte exact attendu, egal au nombre de lignes de A) ; sous le jeton d'un caissier de A sans `kitchen.track`, 0 ligne ; sous `anon`, refus ; aucune colonne de montant dans `information_schema.columns` pour ces deux vues. Temoin : la meme vue recreee sans son filtre dans le test rend les lignes de B, ce qui prouve que le test detecte l'oubli.
3. Temps reel : l'ecran cuisine recoit aujourd'hui les changements de `orders` par abonnement, et un abonnement ne livre que les lignes que la politique SELECT autorise. Une fois la table fermee aux postes de cuisine, l'ecran ne recevrait plus rien. Le lot 2 doit donc diffuser les changements utiles a la cuisine sur un canal par restaurant, sans montants (declencheur de diffusion), et l'ecran s'y abonne. C'est le point le plus delicat du lot 2 ; il se prouve sur le banc avec deux navigateurs (un serveur envoie, un cuisinier voit arriver) avant toute application.
4. `get_house_account_balances` exige `orders.pay`. `get_staff_stock_report` exige `inventory.view`.
5. Tests pgTAP du lot 2, avec temoin : sous le jeton d'un chef, `select count(*) from payments` rend 0 et `select total from orders` rend 0 ligne, alors que les memes requetes sous le jeton du caissier du meme restaurant rendent des lignes ; le chef lit `kitchen_order_items` ; un serveur lit ses tables et pas celles d'un autre serveur.

Pourquoi pas au lot 1 : fermer `orders` sans avoir livre les vues et la diffusion couperait l'ecran cuisine en plein service. C'est un retrait d'acces, qui ne passe qu'apres le code qui sait s'en passer.

### D.6 Affectation de chaque point de l'inventaire F

| Point                                                 | Lot          | Ou            |
| ----------------------------------------------------- | ------------ | ------------- |
| F.1.1 ELSE ouvert                                     | 1            | C, B.3 test 2 |
| F.1.2 anciennes cles, prix par colonne                | 1            | A.2, B.5, D.1 |
| F.1.3 DEFAULT `'admin'`                               | 1            | A.5           |
| F.1.4 invitations et reglages `admin`                 | 1, puis MIG5 | A.6, E.0      |
| F.1.5 `?? 'admin'`                                    | 1            | D.2           |
| F.1.6 promotion en proprietaire                       | 1            | D.2, D.4      |
| F.1.7 lectures d'argent                               | 2            | D.5           |
| F.1.8 `deleted_at`                                    | 1            | D.1, D.2      |
| F.1.9 super admin par `role`                          | 1            | D.2           |
| F.2.1 listes de roles en SQL, jointure a un seul role | 1            | C, D.1        |
| F.2.2 gardes owner/admin dans l'application           | 1            | D.2           |
| F.2.3 `ROLE_RANK`                                     | 1            | D.3           |
| F.2.4 quotas                                          | 1            | D.2           |
| F.2.5 logique metier sur `role`                       | 1            | D.2           |
| F.2.6 `manage-super-admin.js`                         | 1            | D.2           |
| F.2.7 tests et fixtures `'admin'`                     | 1            | F.1           |
| F.3.1 ecarts TS et SQL                                | 1            | B.3           |
| F.3.2 suppression de commandes                        | 1            | D.2           |
| F.3.3 journal d'audit                                 | 1            | D.1, D.2      |
| F.3.4 plan de salle                                   | 1            | C, D.2        |
| F.3.5 annulation                                      | 3            | D.5           |
| F.3.6 copie dans `record_refund`                      | 1            | C             |
| F.3.7 `is_active`                                     | 1            | C             |
| F.3.8 politiques mortes d'invitations                 | 1            | A.6           |
| F.3.9 hierarchie sans sens                            | 1            | D.3           |
| F.3.10 role `platform`                                | sans objet   | D.5           |

---

## E. Plan de migration

Notation : les migrations sont nommees MIG1 a MIG5. Les sigles H, M, F, P suivis d'un chiffre designent les constats de l'audit.

Derniere migration du depot : `20261127120000_publicites_stockage_et_lecture_publique.sql`. Avant de numeroter, comparer `supabase_migrations.schema_migrations` aux fichiers (collisions de numeros entre sessions deja rencontrees).

### E.0 Controles prealables (lecture seule, sur une sauvegarde fraiche puis sur la production)

```sql
-- 1. Plusieurs proprietaires vivants dans un restaurant : doit rendre 0 ligne.
SELECT tenant_id, count(*) FROM admin_users
WHERE role = 'owner' AND deleted_at IS NULL GROUP BY 1 HAVING count(*) > 1;
-- 2. Plusieurs lignes vivantes pour une meme personne dans un restaurant : 0 ligne.
SELECT tenant_id, user_id, count(*) FROM admin_users
WHERE deleted_at IS NULL GROUP BY 1, 2 HAVING count(*) > 1;
-- 3. Restaurants vivants sans proprietaire : a connaitre (information).
SELECT t.id, t.slug FROM tenants t WHERE t.deleted_at IS NULL AND NOT EXISTS (
  SELECT 1 FROM admin_users a WHERE a.tenant_id = t.id AND a.role = 'owner' AND a.deleted_at IS NULL);
-- 4. Reglages stockes : cles et valeurs reelles (temoin : la requete doit lister
--    au moins les colonnes meme vides).
SELECT 'admin_users' AS src, role, k.key, k.value FROM admin_users, jsonb_each(custom_permissions) k
UNION ALL SELECT 'invitations', role, k.key, k.value FROM invitations, jsonb_each(custom_permissions) k
UNION ALL SELECT 'role_permissions', role, k.key, k.value FROM role_permissions, jsonb_each(permissions) k;
-- 5. Invitations en attente par role.
SELECT role, count(*) FROM invitations WHERE status = 'pending' GROUP BY 1;
-- 6. Gerants ou administrateurs portant un refus qui ne se traduit pas tout seul (F3).
SELECT a.id, a.tenant_id, a.role, a.custom_permissions FROM admin_users a
WHERE a.role IN ('manager', 'admin') AND a.deleted_at IS NULL
  AND (a.custom_permissions -> 'orders.manage' = 'false'::jsonb
    OR a.custom_permissions -> 'settings.view' = 'false'::jsonb);
-- 7. Toutes les lignes admin et super_admin, avec leur restaurant (P3). Une ligne
--    revoquee par l'ancien script porte role = 'admin' : elle deviendrait gerant
--    avec le paiement de l'abonnement dans ce restaurant.
SELECT a.id, a.email, a.role, a.is_super_admin, a.is_active, a.deleted_at, t.slug
FROM admin_users a JOIN tenants t ON t.id = a.tenant_id
WHERE a.role IN ('admin', 'super_admin') OR a.is_super_admin IS TRUE ORDER BY t.slug;
```

Si 1 ou 2 rend des lignes : arret, question au proprietaire (G). Si 6 rend des lignes : appliquer la regle de B.5 (ajout de `settings.edit: false` a ces personnes). Pour chaque ligne `admin` du controle 7 : le proprietaire dit si c'est un vrai membre du restaurant (elle devient gerant avec le paiement de l'abonnement, comme prevu) ou un ancien compte de plateforme revoque (elle est desactivee avant MIG1, pour ne pas lui donner un poste de gerant par accident). Les resultats de 4, 6 et 7 sont archives : c'est la preuve que la reprise a ete appliquee aux bonnes donnees.

### E.1 Migrations

Chaque fichier : une transaction, idempotent (`ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS` avant `CREATE`, `CREATE OR REPLACE`), delimiteurs `$function$` (le test de parite s'en sert).

**MIG1 `20261128100000_postes_colonnes_et_reprise.sql`** (additive)

1. Fonctions qui ne lisent aucune colonne nouvelle : `private.codes_droits`, `matrice_postes`, `droits_valides`, `postes_depuis_role`, `role_depuis_postes`, `postes_normalises`, `droits_depuis_anciens`, `fusion_anciens_droits`.
2. `admin_users` : `DROP DEFAULT` sur `role` ; CHECK de `role` elargi ; colonnes `postes`, `permission_overrides`.
3. `invitations` : CHECK de `role` elargi ; colonnes `postes`, `permission_overrides`.
   3 bis. `public.is_tenant_owner`, ICI et pas avant (constat M1 de l'audit) : PostgreSQL valide le corps d'une fonction SQL a sa creation, et ce corps lit `admin_users.postes`. Elle doit exister avant les politiques de l'etape 4.
4. Table `poste_permissions` et ses 4 politiques.
5. Reprise : `UPDATE admin_users SET postes = private.postes_depuis_role(role), permission_overrides = private.droits_depuis_anciens(custom_permissions) WHERE postes = '{}'` ; pour `role = 'admin'`, ajout de `billing.manage: true` si absent. Meme reprise sur `invitations`. `INSERT INTO poste_permissions (tenant_id, poste, permissions, updated_by) SELECT tenant_id, role, coalesce(private.droits_depuis_anciens(permissions), '{}'::jsonb), updated_by FROM role_permissions WHERE role <> 'admin' ON CONFLICT (tenant_id, poste) DO NOTHING`. Les lignes `role = 'admin'` de `role_permissions` ne sont PAS reprises : le role disparait, et un reglage d'administrateur ne doit pas devenir le reglage du poste Gerant (0 ligne en production ; la migration leve une NOTICE avec leur nombre pour que ce soit visible).
6. Declencheurs de synchronisation `aa_admin_users_sync_postes`, `aa_invitations_sync_postes`, et `role_permissions_vers_postes` (corps complets ci-dessous).
7. Contraintes `admin_users_postes_check`, `admin_users_postes_non_vide`, `admin_users_overrides_check`, `invitations_postes_check`, `invitations_overrides_check`, puis les deux index uniques de A.4.
8. `accept_invitation_membership` (copie des deux nouvelles colonnes).
   Retour arriere : supprimer declencheurs, index, contraintes, table, colonnes, fonctions ; retablir les deux CHECK de `role` ; retablir le DEFAULT `'admin'` n'est pas souhaite (laisser sans defaut). Aucune donnee ancienne n'est modifiee par MIG1.

Corps du declencheur de synchronisation de `admin_users` :

```sql
CREATE OR REPLACE FUNCTION private.sync_postes_admin_users() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  NEW.postes := private.postes_normalises(NEW.postes);
  IF TG_OP = 'INSERT' THEN
    IF NEW.permission_overrides IS NULL AND NEW.custom_permissions IS NOT NULL THEN
      NEW.permission_overrides := private.fusion_anciens_droits(NULL, NULL, NEW.custom_permissions);
    END IF;
    IF cardinality(NEW.postes) = 0 THEN
      NEW.postes := private.postes_depuis_role(NEW.role);
      IF NEW.role = 'admin' AND NOT (coalesce(NEW.permission_overrides, '{}'::jsonb) ? 'billing.manage') THEN
        NEW.permission_overrides := coalesce(NEW.permission_overrides, '{}'::jsonb) || '{"billing.manage": true}'::jsonb;
      END IF;
    ELSIF NEW.role IS DISTINCT FROM 'super_admin' THEN
      NEW.role := private.role_depuis_postes(NEW.postes);
    END IF;
    RETURN NEW;
  END IF;

  -- Ecriture de l'ancien code : FUSION, jamais remplacement (M5). Une cle posee
  -- par le nouveau code n'est ni ecrasee ni retiree.
  IF NEW.custom_permissions IS DISTINCT FROM OLD.custom_permissions
     AND NEW.permission_overrides IS NOT DISTINCT FROM OLD.permission_overrides THEN
    NEW.permission_overrides := private.fusion_anciens_droits(
      OLD.permission_overrides, OLD.custom_permissions, NEW.custom_permissions);
  END IF;
  IF NEW.postes IS DISTINCT FROM OLD.postes THEN
    IF NEW.role IS DISTINCT FROM 'super_admin' AND cardinality(NEW.postes) > 0 THEN
      NEW.role := private.role_depuis_postes(NEW.postes);
    END IF;
  ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.postes := private.postes_depuis_role(NEW.role);
    IF NEW.role = 'admin' AND NOT (coalesce(NEW.permission_overrides, '{}'::jsonb) ? 'billing.manage') THEN
      NEW.permission_overrides := coalesce(NEW.permission_overrides, '{}'::jsonb) || '{"billing.manage": true}'::jsonb;
    ELSIF OLD.role = 'admin' THEN
      NEW.permission_overrides := nullif(coalesce(NEW.permission_overrides, '{}'::jsonb) - 'billing.manage', '{}'::jsonb);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER aa_admin_users_sync_postes BEFORE INSERT OR UPDATE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION private.sync_postes_admin_users();
```

```sql
CREATE OR REPLACE FUNCTION private.postes_normalises(p text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  -- Ordre canonique, sans doublon. Une valeur inconnue est conservee en fin de
  -- tableau pour que le CHECK la refuse (elle ne doit pas disparaitre en silence).
  SELECT coalesce(array_agg(x.poste ORDER BY x.rang, x.poste), '{}'::text[])
  FROM (
    SELECT DISTINCT u.poste,
           coalesce(array_position(ARRAY['owner','manager','chef','cashier','bartender','reception',
                                         'waiter','cook','crew','sales','production'], u.poste), 99) AS rang
    FROM unnest(coalesce(p, '{}'::text[])) AS u(poste)
  ) AS x;
$function$;
```

Le declencheur d'`invitations` (`private.sync_postes_invitations`, `aa_invitations_sync_postes`) a le meme corps, sans les deux tests `super_admin`.

**Declencheur de `role_permissions` (H3), corps complet.** Choix et raisons :

- **SECURITY INVOKER.** `authenticated` a `GRANT ALL` sur `role_permissions` (`schema.sql:15434`) ; seule la politique `owner_can_manage_role_permissions` le retient. En DEFINER, toute ecriture admise un jour dans l'ancienne table deviendrait une ecriture dans `poste_permissions` sans passer par sa garde. En INVOKER, le report est soumis a la RLS de `poste_permissions` (`is_tenant_owner`) : celui qui n'a pas le droit d'ecrire la nouvelle table voit son ecriture dans l'ancienne echouer en entier. Le client de service passe, comme partout.
- **La ligne `admin` n'est jamais reportee**, ni en ecriture ni en suppression. `admin` et `manager` visent le meme poste : reporter `admin` ecraserait le reglage du Gerant, et supprimer la ligne `admin` l'effacerait.
- **Fusion, jamais remplacement** (`private.fusion_anciens_droits`) : un reglage pose par le nouveau code sur `menu.price`, `cash.close` ou toute autre cle n'est ni ecrase ni retire par une ecriture de l'ancien code.
- Une suppression dans l'ancienne table ne supprime jamais la ligne de `poste_permissions` : elle ne retire que les cles que l'ancien code avait lui-meme posees.

```sql
CREATE OR REPLACE FUNCTION public.role_permissions_vers_postes() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role IN ('manager', 'cashier', 'chef', 'waiter') THEN
      UPDATE public.poste_permissions AS pp
         SET permissions = coalesce(
               private.fusion_anciens_droits(pp.permissions, OLD.permissions, '{}'::jsonb), '{}'::jsonb),
             updated_at = now()
       WHERE pp.tenant_id = OLD.tenant_id AND pp.poste = OLD.role;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.role NOT IN ('manager', 'cashier', 'chef', 'waiter') THEN
    RETURN NEW;   -- 'admin' : jamais reporte
  END IF;

  INSERT INTO public.poste_permissions AS pp (tenant_id, poste, permissions, updated_by)
  VALUES (NEW.tenant_id, NEW.role,
          coalesce(private.fusion_anciens_droits(NULL, NULL, NEW.permissions), '{}'::jsonb),
          NEW.updated_by)
  ON CONFLICT (tenant_id, poste) DO UPDATE
    SET permissions = coalesce(private.fusion_anciens_droits(
                        pp.permissions,
                        CASE WHEN TG_OP = 'UPDATE' THEN OLD.permissions END,
                        NEW.permissions), '{}'::jsonb),
        updated_at = now(),
        updated_by = EXCLUDED.updated_by;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.role_permissions_vers_postes() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER role_permissions_vers_postes AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.role_permissions_vers_postes();
```

La fonction est dans `public` parce qu'un declencheur INVOKER execute son corps avec les droits de l'appelant ; elle n'est appelable par personne en direct (une fonction de declencheur ne s'appelle pas hors declencheur, et le `REVOKE` le confirme). Un UPDATE qui changerait `role` ou `tenant_id` d'une ligne de `role_permissions` n'existe pas dans l'ancien code (upsert par `(tenant_id, role)`, `api/permissions/route.ts:118-129`) ; s'il arrivait, l'ancienne cle resterait telle quelle dans `poste_permissions`, ce qui est le sens sur.

A prouver sur le banc avant application : les six cas du test `transition_anciens_roles` (F.1) qui portent sur ce declencheur.

Le declencheur du proprietaire (`garder_proprietaire_trg`) passe apres celui-ci (ordre alphabetique) : il voit les postes definitifs. Un ancien code qui tenterait `role = 'owner'` par UPDATE est donc refuse.

**MIG2 `20261128100100_resolution_par_postes_et_politiques.sql`** (H2 : un seul fichier, une seule transaction)
Contenu, dans cet ordre : `tenant_permission_level`, `tenants_avec_droit`, les trois gardes reecrites, `record_refund`, `assert_tenant_reports_view`, `reassign_order_table`, `get_my_inventory_tenant_ids`, `get_my_tenant_ids`, `get_my_tenant_ids_array`, `audit_log_auteur_session`, grants ; puis TOUTES les politiques de D.1 (un `DROP POLICY IF EXISTS` puis `CREATE POLICY` par politique) et la suppression des deux politiques mortes d'invitations.

Pourquoi un seul fichier : des que le nouveau resolveur est valide, `'orders.manage'` n'est plus un code du catalogue et il est refuse a tout le monde, proprietaire compris. Si les politiques de `orders`, `order_items` et `order_notes` etaient repointees dans une autre transaction, aucune commande ne pourrait avancer entre les deux, sans la moindre erreur (un UPDATE refuse par la RLS touche 0 ligne). L'ordre inverse ne vaut pas mieux : `'orders.take'` tomberait dans l'ancien ELSE et serait refuse aux caissiers et aux serveurs. Le fichier commence par `BEGIN;` et finit par `COMMIT;`, et le script d'application l'execute avec `--single-transaction` et `ON_ERROR_STOP=1`.

Derniere instruction du fichier, avant le COMMIT : un bloc `DO` qui execute le balayage du test `catalogue_droits_codes_connus` (litteraux passes a `has_tenant_write_permission`, `tenant_permission_level`, `tenants_avec_droit` dans `pg_policies` et `pg_proc`) et leve une exception s'il reste un seul litteral hors catalogue. La migration s'annule alors d'elle-meme au lieu de laisser une politique morte.

**Retour arriere de MIG2 (M7).** Fichier `supabase/retour-arriere/20261128100100_retour_resolution_par_roles.sql`, ecrit et teste sur le banc dans la meme PR que MIG2. Regle : **permis seulement AVANT la fusion du code.** Une fois le nouveau code servi, les reglages vivent dans `permission_overrides` et `poste_permissions` et rien ne les reporte vers les anciennes colonnes ; rejouer les anciens corps rendrait a chacun les droits de son ancien role, et un retrait pose par le proprietaire disparaitrait. Apres la fusion on corrige en avant. Le retour arriere du CODE seul (deploiement precedent sur Vercel) reste toujours possible : la base garde le nouveau resolveur et les declencheurs traduisent les ecritures de l'ancien code. Le script refuse de lui-meme de tourner si le nouveau code a ecrit :

```sql
BEGIN;

-- 1. Garde : rien de ce que le nouveau code sait ecrire ne doit differer de la
--    traduction de l'ancien. Sinon le nouveau code a ecrit, et ce retour ferait
--    perdre des reglages, un cumul de postes ou une invitation.
DO $garde$
DECLARE
  v_personnes int; v_cumuls int; v_postes int; v_invitations int;
BEGIN
  -- 1a. reglages par personne
  SELECT count(*) INTO v_personnes FROM public.admin_users AS a
  WHERE coalesce(a.permission_overrides, '{}'::jsonb)
          - CASE WHEN a.role = 'admin' THEN 'billing.manage' ELSE '' END
        IS DISTINCT FROM coalesce(private.droits_depuis_anciens(a.custom_permissions), '{}'::jsonb);
  -- 1b. postes : un cumul, ou un poste que l'ancien role ne donne pas (N4)
  SELECT count(*) INTO v_cumuls FROM public.admin_users AS a
  WHERE a.postes IS DISTINCT FROM private.postes_normalises(private.postes_depuis_role(a.role));
  -- 1c. reglages par poste
  SELECT count(*) INTO v_postes FROM public.poste_permissions AS pp
  WHERE NOT EXISTS (
    SELECT 1 FROM public.role_permissions AS rp
    WHERE rp.tenant_id = pp.tenant_id AND rp.role = pp.poste
      AND coalesce(private.droits_depuis_anciens(rp.permissions), '{}'::jsonb) = pp.permissions);
  -- 1d. invitations en attente : postes et reglages (N4)
  SELECT count(*) INTO v_invitations FROM public.invitations AS i
  WHERE i.status = 'pending'
    AND ( i.postes IS DISTINCT FROM private.postes_normalises(private.postes_depuis_role(i.role))
       OR coalesce(i.permission_overrides, '{}'::jsonb)
            - CASE WHEN i.role = 'admin' THEN 'billing.manage' ELSE '' END
          IS DISTINCT FROM coalesce(private.droits_depuis_anciens(i.custom_permissions), '{}'::jsonb) );
  IF v_personnes > 0 OR v_cumuls > 0 OR v_postes > 0 OR v_invitations > 0 THEN
    RAISE EXCEPTION 'retour arriere refuse : % reglage(s) par personne, % cumul(s) de postes, % reglage(s) par poste, % invitation(s) ecrits au nouveau format',
      v_personnes, v_cumuls, v_postes, v_invitations;
  END IF;
END
$garde$;

-- 2. Fonctions : copies mot pour mot de supabase/schema.sql (instantane
--    20261124210700), `CREATE FUNCTION` devenu `CREATE OR REPLACE FUNCTION`. Les
--    grants existants sont conserves par CREATE OR REPLACE.
-- schema.sql:3668-3712
CREATE OR REPLACE FUNCTION "public"."has_tenant_write_permission"("p_tenant" "uuid", "p_perm" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT public.mfa_satisfait() AND EXISTS (
    SELECT 1
    FROM public.admin_users au
    LEFT JOIN public.role_permissions rp
      ON rp.tenant_id = au.tenant_id AND rp.role = au.role
    WHERE au.user_id = (SELECT auth.uid())
      AND au.tenant_id = p_tenant
      AND (au.is_active IS NULL OR au.is_active = true)
      AND au.deleted_at IS NULL
      AND (
        au.role = 'owner'
        OR CASE
             -- Surcharge individuelle de l'employe: elle tranche, dans les
             -- deux sens, pour n'importe quel role.
             WHEN au.custom_permissions ? p_perm
               THEN (au.custom_permissions -> p_perm) = 'true'::jsonb
             -- Puis la surcharge de role posee par le proprietaire.
             WHEN rp.permissions ? p_perm
               THEN (rp.permissions -> p_perm) = 'true'::jsonb
             -- Sans surcharge: DEFAULT_PERMISSIONS (src/types/permission.types.ts).
             ELSE CASE p_perm
                    WHEN 'orders.manage'
                      THEN au.role = ANY (ARRAY['admin', 'manager', 'cashier', 'chef', 'waiter'])
                    WHEN 'orders.pay'
                      THEN au.role = ANY (ARRAY['admin', 'manager', 'cashier'])
                    WHEN 'settings.edit'
                      THEN au.role = 'admin'
                    WHEN 'menu.edit'
                      THEN au.role = ANY (ARRAY['admin', 'manager'])
                    WHEN 'inventory.edit'
                      THEN au.role = ANY (ARRAY['admin', 'manager'])
                    -- B127: DEFAULT_PERMISSIONS donne aussi la lecture du stock
                    -- au chef (permission.types.ts), pas au caissier ni au serveur.
                    WHEN 'inventory.view'
                      THEN au.role = ANY (ARRAY['admin', 'manager', 'chef'])
                    ELSE au.role = ANY (ARRAY['admin', 'manager'])
                  END
           END
      )
  );
$$;

-- schema.sql:3644-3659
CREATE OR REPLACE FUNCTION "public"."has_tenant_money_permission"("p_tenant" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = (SELECT auth.uid())
      AND au.tenant_id = p_tenant
      AND (au.is_active IS NULL OR au.is_active = true)
      AND au.deleted_at IS NULL
      AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
  )
  AND public.has_tenant_write_permission(p_tenant, 'orders.manage')
  AND public.has_tenant_write_permission(p_tenant, 'orders.pay');
$$;

-- schema.sql:3621-3635
CREATE OR REPLACE FUNCTION "public"."has_tenant_floor_permission"("p_tenant" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = (SELECT auth.uid())
      AND au.tenant_id = p_tenant
      AND (au.is_active IS NULL OR au.is_active = true)
      AND au.deleted_at IS NULL
      AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
  )
  AND public.has_tenant_write_permission(p_tenant, 'orders.manage');
$$;

-- schema.sql:4828-4970
CREATE OR REPLACE FUNCTION "public"."record_refund"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" numeric, "p_method" "text", "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_client_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total      numeric;
  v_tip        numeric;
  v_net        numeric;
  v_payment_id uuid;
  v_actor      uuid;
  v_role       text;
  v_custom     jsonb;
  v_tenant_ovr jsonb;
  v_allowed    boolean;
BEGIN
  -- (1) APPARTENANCE, avant toute autre chose. Leve 42501 si l'appelant n'est
  -- pas membre du restaurant. Laisse passer service_role et les super-admins.
  PERFORM public.assert_tenant_member(p_tenant_id);

  -- (2) HABILITATION. service_role (webhooks, cron) et super-admin agissent
  -- sans ligne de membre: pour eux `created_by` reste celui fourni, car ils
  -- agissent au nom de quelqu'un d'autre et n'ont pas d'id de membre propre.
  IF auth.role() = 'service_role' OR public.is_super_admin() THEN
    v_actor := p_created_by;
  ELSE
    -- La ligne de membre de l'APPELANT, jamais un parametre. `is_active` et
    -- `deleted_at` sont verifies ici: un compte suspendu ou retire ne doit pas
    -- pouvoir sortir de l'argent de la caisse.
    SELECT a.id, a.role, a.custom_permissions
      INTO v_actor, v_role, v_custom
    FROM admin_users a
    WHERE a.user_id = auth.uid()
      AND a.tenant_id = p_tenant_id
      AND a.is_active = true
      AND a.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'access denied: no active membership for tenant %', p_tenant_id
        USING ERRCODE = '42501';
    END IF;

    -- Le role doit figurer dans la MEME liste que celle de l'action serveur
    -- `actionRefundOrder`: ['owner','admin','manager']. Elle est plus stricte
    -- que la permission seule - par defaut `orders.manage` est aussi vrai pour
    -- `cashier` et `chef` (src/types/permission.types.ts) - et c'est la regle
    -- reellement appliquee en production aujourd'hui. On la reproduit telle
    -- quelle: une migration de securite n'est pas le lieu pour ELARGIR un
    -- acces.
    IF v_role NOT IN ('owner', 'admin', 'manager') THEN
      RAISE EXCEPTION 'access denied: role % cannot record refunds', v_role
        USING ERRCODE = '42501';
    END IF;

    -- Resolution de `orders.manage` dans l'ordre de src/lib/permissions.ts
    -- (hasPermission): owner toujours autorise, puis la derogation
    -- individuelle, puis la derogation du restaurant, puis le defaut du role.
    IF v_role = 'owner' THEN
      v_allowed := true;
    ELSIF v_custom ? 'orders.manage' THEN
      v_allowed := coalesce((v_custom -> 'orders.manage')::boolean, false);
    ELSE
      SELECT rp.permissions
        INTO v_tenant_ovr
      FROM role_permissions rp
      WHERE rp.tenant_id = p_tenant_id
        AND rp.role = v_role;

      IF v_tenant_ovr ? 'orders.manage' THEN
        v_allowed := coalesce((v_tenant_ovr -> 'orders.manage')::boolean, false);
      ELSE
        -- Defaut du role. Seul `waiter` a false, et il est de toute facon
        -- deja ecarte par la liste de roles ci-dessus.
        v_allowed := v_role IN ('owner', 'admin', 'manager', 'cashier', 'chef');
      END IF;
    END IF;

    IF NOT v_allowed THEN
      RAISE EXCEPTION 'access denied: orders.manage denied for role %', v_role
        USING ERRCODE = '42501';
    END IF;

    -- (3) ARGENT. Rembourser fait sortir de l'argent de la caisse: il faut en
    -- plus `orders.pay`, resolu par la meme fonction que la RLS (owner
    -- toujours, puis surcharge individuelle, puis surcharge de role, puis
    -- defaut). Ajoute par 20261109200000: un gerant a qui le proprietaire
    -- retire l'argent ne rembourse plus, meme en appelant la RPC en direct.
    IF NOT public.has_tenant_write_permission(p_tenant_id, 'orders.pay') THEN
      RAISE EXCEPTION 'access denied: orders.pay denied for role %', v_role
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ------------------------------------------------------------------------
  -- A partir d'ici, logique de caisse INCHANGEE (recopiee a l'identique).
  -- ------------------------------------------------------------------------
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit etre superieur a zero'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rejeu: la meme cle renvoie la ligne deja ecrite, sans second mouvement de
  -- caisse. Fait AVANT le verrou, un rejeu ne doit pas attendre.
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_payment_id
    FROM payments
    WHERE tenant_id = p_tenant_id
      AND client_request_id = p_client_request_id;
    IF FOUND THEN
      RETURN v_payment_id;
    END IF;
  END IF;

  -- Le verrou porte sur la COMMANDE: il serialise tous les mouvements de caisse
  -- de cette commande, remboursements comme encaissements.
  SELECT total, COALESCE(tip_amount, 0)
    INTO v_total, v_tip
  FROM orders
  WHERE id = p_order_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable' USING ERRCODE = 'no_data_found';
  END IF;

  -- Net recalcule DANS la transaction, apres le verrou: c'est ce qui ferme le
  -- TOCTOU. Le second remboursement concurrent lit ici un net deja reduit.
  SELECT COALESCE(SUM(CASE WHEN status = 'refunded' THEN -amount ELSE amount END), 0)
    INTO v_net
  FROM payments
  WHERE order_id = p_order_id AND tenant_id = p_tenant_id;

  IF p_amount > v_net THEN
    RAISE EXCEPTION 'Le montant du remboursement depasse le montant encaisse'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO payments (tenant_id, order_id, amount, method, status, created_by, client_request_id)
  VALUES (p_tenant_id, p_order_id, p_amount, p_method, 'refunded', v_actor, p_client_request_id)
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;

-- schema.sql:647-663
CREATE OR REPLACE FUNCTION "public"."assert_tenant_reports_view"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  IF auth.role() = 'service_role' OR public.is_super_admin() THEN
    RETURN;
  END IF;
  -- Meme resolution que l'application: role, surcharge du role, surcharge
  -- individuelle (has_tenant_write_permission, DEFAULT_PERMISSIONS).
  IF NOT public.has_tenant_write_permission(p_tenant_id, 'reports.view') THEN
    RAISE EXCEPTION 'Reports require the reports.view permission'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- schema.sql:4602-4729
CREATE OR REPLACE FUNCTION "public"."reassign_order_table"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_new_table_number" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_old_table_number text;
  v_old_session_id uuid;
  v_service_type text;
  v_status text;
  v_new_session_id uuid;
  v_pending_count integer;
BEGIN
  -- Tenant-isolation guard: a member cannot reassign another tenant's order.
  PERFORM public.assert_tenant_member(p_tenant_id);

  -- A15: meme droit que l'action serveur (`orders.manage`). Sans ce controle,
  -- un membre sans ce droit deplacait une commande par l'API directe.
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.is_super_admin()
     AND NOT public.has_tenant_write_permission(p_tenant_id, 'orders.manage') THEN
    RAISE EXCEPTION 'access denied: reassigning an order requires orders.manage'
      USING ERRCODE = '42501';
  END IF;

  -- Load the order, scoped to the tenant.
  SELECT table_number, session_id, service_type, status
    INTO v_old_table_number, v_old_session_id, v_service_type, v_status
    FROM orders
    WHERE id = p_order_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- Only dine-in orders live on a table / session.
  IF v_service_type IS DISTINCT FROM 'dine_in' THEN
    RAISE EXCEPTION 'Only dine-in orders can be reassigned' USING ERRCODE = 'check_violation';
  END IF;

  -- A cancelled order is terminal; moving it would resurrect it onto a table.
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot reassign a cancelled order' USING ERRCODE = 'check_violation';
  END IF;

  -- Destination table must be a real, non-empty label.
  IF p_new_table_number IS NULL OR btrim(p_new_table_number) = '' THEN
    RAISE EXCEPTION 'Destination table number is required' USING ERRCODE = 'check_violation';
  END IF;

  -- B133: la destination doit etre une table de CE restaurant (meme valeur
  -- que l'ecran envoie: `table_number`). Sans ce controle, une commande
  -- partait vers une etiquette inexistante et ouvrait une session fantome.
  IF NOT EXISTS (
    SELECT 1 FROM tables t
     WHERE t.tenant_id = p_tenant_id
       AND t.table_number = p_new_table_number
  ) THEN
    RAISE EXCEPTION 'Destination table not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- No-op: already on the destination table.
  IF v_old_table_number IS NOT DISTINCT FROM p_new_table_number THEN
    RETURN;
  END IF;

  -- Lock both table sessions in a deterministic (sorted) order so two concurrent
  -- reassigns touching the same pair of tables cannot deadlock. If the order has no
  -- old table, only the destination needs locking.
  IF v_old_table_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_new_table_number));
  ELSIF v_old_table_number < p_new_table_number THEN
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || v_old_table_number));
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_new_table_number));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_new_table_number));
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || v_old_table_number));
  END IF;

  -- A reassign always targets a FREE table (the UI only offers free tables). Under
  -- the advisory lock, re-check the destination is still free: if it gained an open
  -- session between the picker load and now (a concurrent order / QR scan), reject
  -- instead of silently merging the moved order onto that other party's check.
  IF EXISTS (
    SELECT 1 FROM table_sessions
    WHERE tenant_id = p_tenant_id
      AND table_number = p_new_table_number
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Destination table is now occupied' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO table_sessions (tenant_id, table_number)
  VALUES (p_tenant_id, p_new_table_number)
  RETURNING id INTO v_new_session_id;

  -- Move the order onto the destination table + session.
  UPDATE orders
    SET table_number = p_new_table_number,
        session_id = v_new_session_id
    WHERE id = p_order_id AND tenant_id = p_tenant_id;

  -- Close the OLD session if nothing unsettled remains on it. A14: meme regle
  -- que close_table_session_if_settled (20261115200000, p_require_served = true,
  -- delai de 2 h): une commande impayee OU partiellement payee, ou pas encore
  -- servie, garde la table occupee. L'ancienne regle ne comptait que 'pending':
  -- un acompte laissait la table liberee avec une addition ouverte. The order we
  -- just moved no longer references the old session, so it is excluded.
  IF v_old_session_id IS NOT NULL AND v_old_session_id IS DISTINCT FROM v_new_session_id THEN
    SELECT count(*) INTO v_pending_count
      FROM orders
      WHERE tenant_id = p_tenant_id
        AND session_id = v_old_session_id
        AND status <> 'cancelled'
        AND (
          coalesce(payment_status, 'pending') IN ('pending', 'partial')
          OR (
            status NOT IN ('delivered', 'served')
            AND created_at > now() - interval '2 hours'
          )
        );

    IF v_pending_count = 0 THEN
      UPDATE table_sessions
        SET status = 'closed', closed_at = now()
        WHERE id = v_old_session_id AND status = 'open';
    END IF;
  END IF;
END;
$$;

-- schema.sql:2811-2820
CREATE OR REPLACE FUNCTION "public"."get_my_inventory_tenant_ids"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(array_agg(DISTINCT au.tenant_id), '{}')
  FROM public.admin_users au
  WHERE au.user_id = (SELECT auth.uid())
    AND (public.has_tenant_write_permission(au.tenant_id, 'inventory.view')
         OR public.has_tenant_write_permission(au.tenant_id, 'inventory.edit'));
$$;

-- schema.sql:2829-2838
CREATE OR REPLACE FUNCTION "public"."get_my_tenant_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select tenant_id
  from admin_users
  where user_id = auth.uid()
    and coalesce(is_active, true) = true
    and public.mfa_satisfait()
$$;

-- schema.sql:2847-2856
CREATE OR REPLACE FUNCTION "public"."get_my_tenant_ids_array"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(array_agg(tenant_id), '{}')
  from admin_users
  where user_id = auth.uid()
    and coalesce(is_active, true) = true
    and public.mfa_satisfait()
$$;

-- schema.sql:694-717
CREATE OR REPLACE FUNCTION "public"."audit_log_auteur_session"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_email text;
  v_role text;
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    SELECT au.email, au.role INTO v_email, v_role
      FROM public.admin_users au
     WHERE au.user_id = (SELECT auth.uid())
       AND au.tenant_id = NEW.tenant_id
       AND coalesce(au.is_active, true)
       AND au.deleted_at IS NULL
     ORDER BY au.created_at
     LIMIT 1;
    NEW.user_id := (SELECT auth.uid());
    NEW.user_email := coalesce(nullif((SELECT auth.jwt()) ->> 'email', ''), v_email);
    NEW.user_role := v_role;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Politiques : copies mot pour mot de supabase/schema.sql, chacune precedee
--    de son DROP. Les deux politiques d'invitations supprimees par MIG2 (INSERT
--    et UPDATE) sont recreees pour revenir exactement a l'etat d'avant.
-- schema.sql:12308
DROP POLICY IF EXISTS "Order managers can update own tenant orders" ON "public"."orders";
CREATE POLICY "Order managers can update own tenant orders" ON "public"."orders" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'orders.manage'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'orders.manage'::"text"));

-- schema.sql:12297
DROP POLICY IF EXISTS "Order managers can update own tenant order items" ON "public"."order_items";
CREATE POLICY "Order managers can update own tenant order items" ON "public"."order_items" FOR UPDATE USING (("public"."has_tenant_write_permission"("tenant_id", 'orders.manage'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = "order_items"."tenant_id")))))) WITH CHECK (("public"."has_tenant_write_permission"("tenant_id", 'orders.manage'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = "order_items"."tenant_id"))))));

-- schema.sql:12290
DROP POLICY IF EXISTS "Order managers can insert own tenant order_notes" ON "public"."order_notes";
CREATE POLICY "Order managers can insert own tenant order_notes" ON "public"."order_notes" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'orders.manage'::"text"));

-- schema.sql:12076
DROP POLICY IF EXISTS "Menu managers can delete own tenant coupons" ON "public"."coupons";
CREATE POLICY "Menu managers can delete own tenant coupons" ON "public"."coupons" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12139
DROP POLICY IF EXISTS "Menu managers can insert own tenant coupons" ON "public"."coupons";
CREATE POLICY "Menu managers can insert own tenant coupons" ON "public"."coupons" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12202
DROP POLICY IF EXISTS "Menu managers can update own tenant coupons" ON "public"."coupons";
CREATE POLICY "Menu managers can update own tenant coupons" ON "public"."coupons" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12055
DROP POLICY IF EXISTS "Menu managers can delete own tenant ads" ON "public"."ads";
CREATE POLICY "Menu managers can delete own tenant ads" ON "public"."ads" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12125
DROP POLICY IF EXISTS "Menu managers can insert own tenant ads" ON "public"."ads";
CREATE POLICY "Menu managers can insert own tenant ads" ON "public"."ads" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12181
DROP POLICY IF EXISTS "Menu managers can update own tenant ads" ON "public"."ads";
CREATE POLICY "Menu managers can update own tenant ads" ON "public"."ads" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12062
DROP POLICY IF EXISTS "Menu managers can delete own tenant announcements" ON "public"."announcements";
CREATE POLICY "Menu managers can delete own tenant announcements" ON "public"."announcements" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12132
DROP POLICY IF EXISTS "Menu managers can insert own tenant announcements" ON "public"."announcements";
CREATE POLICY "Menu managers can insert own tenant announcements" ON "public"."announcements" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12188
DROP POLICY IF EXISTS "Menu managers can update own tenant announcements" ON "public"."announcements";
CREATE POLICY "Menu managers can update own tenant announcements" ON "public"."announcements" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:11839
DROP POLICY IF EXISTS "Inventory managers can insert own tenant suppliers" ON "public"."suppliers";
CREATE POLICY "Inventory managers can insert own tenant suppliers" ON "public"."suppliers" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));

-- schema.sql:11881
DROP POLICY IF EXISTS "Inventory managers can update own tenant suppliers" ON "public"."suppliers";
CREATE POLICY "Inventory managers can update own tenant suppliers" ON "public"."suppliers" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));

-- schema.sql:11797
DROP POLICY IF EXISTS "Inventory managers can delete own tenant suppliers" ON "public"."suppliers";
CREATE POLICY "Inventory managers can delete own tenant suppliers" ON "public"."suppliers" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'inventory.edit'::"text"));

-- schema.sql:12118
DROP POLICY IF EXISTS "Menu managers can delete own tenant price variants" ON "public"."item_price_variants";
CREATE POLICY "Menu managers can delete own tenant price variants" ON "public"."item_price_variants" FOR DELETE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12174
DROP POLICY IF EXISTS "Menu managers can insert own tenant price variants" ON "public"."item_price_variants";
CREATE POLICY "Menu managers can insert own tenant price variants" ON "public"."item_price_variants" FOR INSERT WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12244
DROP POLICY IF EXISTS "Menu managers can update own tenant price variants" ON "public"."item_price_variants";
CREATE POLICY "Menu managers can update own tenant price variants" ON "public"."item_price_variants" FOR UPDATE USING ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text")) WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:12671
DROP POLICY IF EXISTS "atfood_insert_menu_items" ON "public"."menu_items";
CREATE POLICY "atfood_insert_menu_items" ON "public"."menu_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_tenant_write_permission"("tenant_id", 'menu.edit'::"text"));

-- schema.sql:11512
DROP POLICY IF EXISTS "Admins can read audit logs" ON "public"."audit_log";
CREATE POLICY "Admins can read audit logs" ON "public"."audit_log" FOR SELECT USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE (("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"])) AND COALESCE("au"."is_active", true) AND ("au"."deleted_at" IS NULL)))));

-- schema.sql:12331
DROP POLICY IF EXISTS "Proprietaires et admins lisent les paiements Flutterwave" ON "public"."flutterwave_payments";
CREATE POLICY "Proprietaires et admins lisent les paiements Flutterwave" ON "public"."flutterwave_payments" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE (("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (COALESCE("au"."is_active", true) = true) AND ("au"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

-- schema.sql:13267
DROP POLICY IF EXISTS "tenant_admins_can_view_invitations" ON "public"."invitations";
CREATE POLICY "tenant_admins_can_view_invitations" ON "public"."invitations" FOR SELECT USING (("tenant_id" IN ( SELECT "au"."tenant_id"
   FROM "public"."admin_users" "au"
  WHERE (("au"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND COALESCE("au"."is_active", true) AND ("au"."deleted_at" IS NULL)))));

-- schema.sql:13249
DROP POLICY IF EXISTS "tenant_admins_can_insert_invitations" ON "public"."invitations";
CREATE POLICY "tenant_admins_can_insert_invitations" ON "public"."invitations" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

-- schema.sql:13258
DROP POLICY IF EXISTS "tenant_admins_can_update_invitations" ON "public"."invitations";
CREATE POLICY "tenant_admins_can_update_invitations" ON "public"."invitations" FOR UPDATE USING (("tenant_id" IN ( SELECT "admin_users"."tenant_id"
   FROM "public"."admin_users"
  WHERE (("admin_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("admin_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

-- 4. Objets crees par MIG2, apres que plus aucune politique ne les appelle.
DROP FUNCTION IF EXISTS public.tenants_avec_droit(text, text);
DROP FUNCTION IF EXISTS public.tenant_permission_level(uuid, text);

COMMIT;
```

Comment ces copies ont ete faites : par un script d'extraction (`roles-map/gen_rollback.py`), pas a la main. Il prend dans `supabase/schema.sql` les 10 fonctions par leur nom et les 24 politiques par leur ligne, jusqu'a leur delimiteur de fin. Sorties : `roles-map/rollback_fonctions.sql` (438 lignes) et `roles-map/rollback_politiques.sql` (110 lignes). Controles faits sur les sorties : 10 fonctions et 24 politiques extraites, chacune terminee par son delimiteur, et les anciens codes `orders.manage` et `reports.view` bien presents (temoin : la copie contient l'etat d'avant, pas le nouveau). Ce qui n'a PAS ete fait : le script n'a jamais ete execute sur une base. Le retour arriere de MIG3 (suppression des deux declencheurs de garde) se lance avant celui-ci.

Preuve exigee sur le banc avant d'appliquer MIG2 en production : appliquer MIG1 a MIG3, lancer le retour arriere de MIG3 puis ce script, puis relancer la suite pgTAP **du commit d'avant le lot 1** : elle doit repasser entierement. Temoins de la garde, un par branche : ecrire un `permission_overrides` au nouveau format ; donner deux postes a un membre ; poser un reglage dans `poste_permissions` ; creer une invitation en attente avec deux postes. Dans les quatre cas, relancer le script et constater le refus, avec le bon compteur a 1.

**MIG3 `20261128100200_gardes_prix_et_proprietaire.sql`**
`garder_prix_carte` et ses deux declencheurs ; `garder_proprietaire` et son declencheur.
Retour arriere : `DROP TRIGGER`, `DROP FUNCTION`.

MIG1 a MIG3 sont appliquees ensemble, AVANT le deploiement du code. Pourquoi c'est sur avec l'ancien code encore en service : pour chaque ancien role, les droits que donne la nouvelle base contiennent ceux que l'ancien code suppose (B.4 : aucune ligne "perd"), et l'ancien code ne passe jamais de code de droit a la base (les codes sont des litteraux dans les politiques). Les ecritures de l'ancien code (`role`, `custom_permissions`, `role_permissions`) sont traduites par les declencheurs.

**MIG4 `20261128110000_contraction_anciens_reglages.sql`** (retire un acces de lecture a l'ancien code : seulement APRES que le nouveau code est servi et verifie)
Supprime `admin_users.custom_permissions`, `invitations.custom_permissions`, la table `role_permissions` et ses politiques, le declencheur `role_permissions_vers_postes`, les branches `custom_permissions` des deux declencheurs de synchronisation. Reecrit `delete_admin_user_atomic` et `delete_my_account` sans leurs lignes `UPDATE role_permissions ...` (`schema.sql:1361-1362` et `1445`) : `poste_permissions.updated_by` est en `ON DELETE SET NULL`, il n'y a rien a remettre a NULL a la main. `accept_invitation_membership` ne copie plus `custom_permissions`.
Prealable : sauvegarde ; `rg -n "custom_permissions|role_permissions" src scripts tests` doit rendre 0 ligne sur `origin/main`.
Retour arriere : restauration depuis la sauvegarde (suppression de colonnes).
Delai (constat M5 de l'audit) : cette contraction se fait des que `/api/version` confirme le nouveau code et que la verification a l'ecran est faite, pas des jours apres. Tant qu'elle n'est pas appliquee, un onglet reste sur l'ancien deploiement peut encore ecrire dans les anciennes colonnes ; la fusion protege les reglages du nouveau code, mais la fenetre doit rester courte.

**MIG5 (fin du lot 4) `..._retrait_admin_et_colonne_role.sql`**
Prealables : 0 ligne `role = 'admin'` dans `admin_users` et `invitations` apres conversion ; `rg -n "\brole\b" ` sur les lectures de `admin_users.role` rend 0. Contenu : `is_super_admin = true` la ou `role = 'super_admin'` ; reecriture de `is_super_admin`, `prevent_super_admin_elevation`, `delete_my_account`, `delete_admin_user_atomic`, `anonymize_closed_tenants`, `closed_tenant_auth_users`, `request_account_deletion`, `provision_signup_tenant`, `provision_group_restaurant`, `accept_invitation_membership`, de la politique `Block super_admin escalation` ; retrait du reglage `billing.manage` de l'ancien administrateur ; suppression des declencheurs de synchronisation, puis de `admin_users.role` et `invitations.role`. `signup.service.ts` (protege) est modifie dans la meme livraison, avec accord explicite.

### E.2 Deroule de mise en production du lot 1

1. Sauvegarde (procedure `reference_sauvegarde_prod_procedure`), controles E.0, resultats archives.
2. Repetition complete sur le banc local : `schema.sql`, MIG1 a MIG3, suite pgTAP, script de retour arriere de MIG2 rejoue, puis l'ANCIEN code (`origin/main` avant la PR) lance contre cette base pour les parcours `03-staff-permissions`, `04-service-and-ordering`, `08-bola`.
3. Pause obligatoire : accord du proprietaire avant d'appliquer en production (regle 10).
4. Appliquer MIG1 a MIG3 par `scripts/appliquer-migrations-ciblees.sh`. Jamais `supabase db push` ni `pnpm db:migrate:prod`. Atomicite : le script lance `psql -1 -v ON_ERROR_STOP=1` (`appliquer-migrations-ciblees.sh:121`), mais chaque fichier porte ses propres `BEGIN` et `COMMIT` : **l'atomicite est par fichier, pas par lot**. Un echec de MIG3 laisse donc MIG1 et MIG2 appliquees. C'est sans danger (l'ancien code est compatible avec MIG1 et MIG2, et MIG2 est complete a elle seule), mais il faut le savoir : dans ce cas on corrige MIG3 et on la relance seule, on ne rejoue pas MIG1 ni MIG2. Apres chaque fichier, verifier sa presence dans `supabase_migrations.schema_migrations` ET l'existence d'un objet qu'il cree (le suivi seul n'est pas fiable).
5. Verifier en base par le corps STOCKE des fonctions (`pg_get_functiondef`), pas par le nom de la migration : `tenant_permission_level` existe, `has_tenant_write_permission` ne contient plus `ELSE au.role`, chaque ligne `admin_users` vivante a des postes. Puis lancer en production, en lecture seule, la requete de balayage du test `catalogue_droits_codes_connus` : elle doit rendre 0 litteral hors catalogue (H2). Temoin : la meme requete, lancee AVANT l'application, doit rendre `orders.manage` et `reports.view` ; si elle rend 0 avant, elle ne cherche rien et ne prouve rien apres.
   5 bis. Fenetre de retour arriere de la base : elle se ferme a l'etape 6. Avant : script de retour de MIG2 autorise. Apres : correction en avant seulement.
6. Fusionner la PR du code (une seule fusion en cours), attendre le resultat du workflow `promote-prod`, verifier `/api/version`.
7. Verification a l'ecran de chaque poste sur telephone et ordinateur (critere d'acceptation du cahier des charges), en clair et en sombre.
8. Regenerer `supabase/schema.sql` et les types, avancer le marqueur `SCHEMA_SNAPSHOT_MIGRATION`.
9. **MIG4, contraction. Etape datee, pas une intention.** Soit J le jour de l'etape 6 (fusion du code), a ecrire en clair dans la PR de MIG4 avec la date reelle.
   - Condition de declenchement, toutes requises : (a) `/api/version` rend le SHA de la fusion ; (b) le workflow `promote-prod` est vert sur ce commit ; (c) la verification a l'ecran de l'etape 7 est faite et archivee ; (d) la commande 3 de D.2 rend 0 ligne sur `origin/main` hors types generes ; (e) aucune ecriture dans les anciennes colonnes depuis la fusion, verifie par la requete de la garde du retour arriere lancee en lecture seule (elle compte les reglages ecrits au nouveau format : c'est attendu) et par `select count(*) from role_permissions` inchange depuis J.
   - Date limite : **J, le jour meme ; au plus tard J + 1 jour ouvre.** Si la condition n'est pas remplie a J + 1, le travail s'arrete et le proprietaire est prevenu : on ne laisse pas la fenetre ouverte sans decision.
   - Ordre : sauvegarde ; MIG4 sur le banc avec la suite pgTAP ; accord du proprietaire (suppression de colonnes, regle 10) ; MIG4 en production ; types et `schema.sql` regeneres ; fusion de la PR qui supprime `permissions-legacy.ts` et son test ; relance des commandes 3 et 4 de D.2 sans exclusion (0 ligne).
   - Pourquoi ce delai compte (limite ecrite a la demande de l'auditeur) : tant que MIG4 n'est pas appliquee, un ancien deploiement encore joignable (un onglet reste ouvert) decide ses gardes TypeScript sur des reglages perimes. La base reste la garde pour tout ce qui passe par le client de session. Pour les actions de l'ancien code en role de service (equipe, invitations, abonnement), la garde est le role projete (`owner`, `admin`), qui reste juste. Le risque residuel est etroit, et il n'est borne que par cette date.

`tests/journeys/fixtures/schema.sql` (copie gelee, marqueur 20260628000000) : les migrations MIG1 a MIG3 doivent s'appliquer par-dessus sans erreur ; le verifier avec `scripts/run-journeys-local.sh` a l'etape 2.

---

## F. Plan de tests

Regle pour chaque garde : un test positif, un test negatif, et un **temoin** qui echoue si la garde est retiree. Chaque fichier pgTAP l'indique en commentaire d'en-tete, avec la commande qui prouve le temoin (retirer la garde sur le banc, relancer, constater le rouge).

### F.1 pgTAP (`supabase/tests/rls/`)

| Fichier                                                  | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Temoin                                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `postes_matrice_par_poste.test.sql`                      | 10 postes plus le proprietaire, un membre par poste, les 22 droits : `tenant_permission_level` attendu pour chacune des 242 cases (assertions generees par une boucle sur une table d'attendus ecrite dans le test, pas lue dans `matrice_postes`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | une case volontairement fausse dans la table d'attendus fait echouer ; verifie une fois puis retiree                                   |
| `postes_ecritures_reelles.test.sql`                      | par poste, une ecriture permise ET une refusee, par vraie requete sous `set local role authenticated` : `menu_items` UPDATE (chef oui, cook non), `ingredients` INSERT (chef oui, cashier non), `suppliers` INSERT (chef oui, cook non), `orders` UPDATE statut (waiter oui, chef oui par `kitchen.track`), `coupons` INSERT (manager oui, chef non), `ads` INSERT (manager oui, chef non), `venues` UPDATE (manager oui, cashier non), `tables` INSERT (manager oui, waiter non), `payments` INSERT (cashier oui, waiter non au lot 1), `record_refund` (manager oui, cashier non)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | chaque refus compte les lignes touchees (un UPDATE refuse par la RLS ne leve pas d'erreur)                                             |
| `postes_cumul.test.sql`                                  | `{waiter, cashier}` encaisse ; `{cook, sales}` suit la cuisine et encaisse ; reglage du restaurant `waiter.orders.take = false` : le membre `{waiter}` ne prend plus de commande, le membre `{waiter, cashier}` si ; `limited` plus `full` donne `full`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | membre `{waiter}` seul refuse la ou `{waiter, cashier}` passe                                                                          |
| `postes_reglage_par_personne.test.sql`                   | `permission_overrides` gagne sur tout, dans les deux sens : chef avec `menu.price: false` ; waiter avec `orders.pay: true` ; gerant avec `settings.edit: false` malgre un reglage de poste a `true` ; le proprietaire ignore un `false`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | le meme membre sans reglage donne le resultat inverse                                                                                  |
| `catalogue_droits_codes_connus.test.sql`                 | code inconnu refuse pour gerant ET proprietaire (`'orders.manage'`, `'reports.view'`, `'pos.use'`, `'nimporte.quoi'`, NULL) ; balayage de `pg_policies` et `pg_proc` : aucun litteral hors catalogue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | une politique temporaire avec `'menu.edti'` creee dans le test doit etre trouvee par le balayage, puis supprimee                       |
| `postes_isolation_restaurants.test.sql`                  | gerant du restaurant A : `tenant_permission_level(B, ...)` NULL pour les 22 codes ; ne lit ni n'ecrit `poste_permissions` de B ; un reglage de poste pose dans B ne change rien dans A ; `is_tenant_owner(B)` faux pour le proprietaire de A                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | le meme gerant passe dans A                                                                                                            |
| `poste_permissions_rls.test.sql`                         | SELECT membre oui, etranger non, anon non ; INSERT, UPDATE, DELETE : proprietaire oui, gerant non ; WITH CHECK : le proprietaire de A ne peut pas inserer une ligne pour B ; cle inconnue ou valeur non booleenne refusee par le CHECK                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | compte de lignes avant et apres                                                                                                        |
| `proprietaire_protege.test.sql`                          | UPDATE qui ajoute `owner` aux postes d'un gerant : refuse, y compris en `service_role` ; UPDATE qui retire `owner` : refuse ; `role = 'owner'` par UPDATE (ancien code) : refuse ; DELETE du proprietaire d'un restaurant vivant : refuse ; second proprietaire par INSERT : refuse (index) ; `delete_admin_user_atomic` sur le seul membre proprietaire : passe, restaurant et membre disparus (P1) ; `delete_admin_user_atomic` sur un proprietaire accompagne : 42501, rien n'est supprime ; `delete from auth.users` sur le compte du proprietaire d'un restaurant ouvert : refuse, compte et ligne intacts (test manquant 3) ; restaurant ferme (`deleted_at`) : DELETE passe ; invitation avec `owner` : refusee par le CHECK                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | chaque refus verifie `42501` ou `23505` avec `throws_ok`, et le cas "cascade" prouve que la garde ne bloque pas tout                   |
| `prix_carte_garde.test.sql`                              | chef avec `menu.price: false` : UPDATE de `description` passe, UPDATE de `price` ou `prices` refuse, INSERT d'un plat refuse, `item_price_variants` refuse, `item_modifiers` avec prix refuse ; chef par defaut : tout passe ; `service_role` : passe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | meme requete, deux membres, deux resultats                                                                                             |
| `transition_anciens_roles.test.sql`                      | INSERT a l'ancienne (`role`, `custom_permissions`) : `postes` et `permission_overrides` deduits ; `admin` : gerant plus `billing.manage` ; UPDATE de `role` seul : postes suivent ; UPDATE de `postes` : `role` projete ; INSERT sans role ni postes : refuse (plus de DEFAULT) ; chaque ligne de la table B.5, dont "le refus gagne" et les deux abandons ; invitation `admin` acceptee : gerant, jamais `admin`. Report depuis `role_permissions` (H3, test manquant 4), sept cas : (1) INSERT `chef` SOUS LE JETON DU PROPRIETAIRE (pas en role de service) : reporte. Ce cas constate deux choses qu'on ne suppose pas : le proprietaire execute le corps du declencheur alors que la fonction lui est retiree par `REVOKE`, et l'ecriture reportee passe les politiques de `poste_permissions` avec son jeton (N5) ; (2) INSERT `admin` non reporte, le reglage du poste `manager` est inchange ; (3) DELETE de la ligne `admin` ne touche pas le poste `manager` ; (4) reglage `menu.price: false` pose au nouveau format pour `chef`, puis ancienne ecriture `menu.edit: true` : `menu.price` reste `false` ; (5) DELETE de l'ancienne ligne `chef` : seules les cles que l'ancien code avait posees partent, la ligne reste ; (6) un gerant (non proprietaire) qui ecrit dans `role_permissions` avec son jeton : refuse, rien dans `poste_permissions` (ce cas est arrete par l'ancienne politique, il ne prouve pas le choix INVOKER) ; (6 bis) LA preuve du choix INVOKER : un proprietaire protege par un facteur verifie, avec un jeton aal1, ecrit dans `role_permissions`. L'ancienne politique le laisse passer (elle ne regarde pas la double authentification), mais le report est soumis a `is_tenant_owner`, qui la regarde : toute l'ecriture echoue, 0 ligne dans les deux tables. Si le declencheur passait en SECURITY DEFINER, ce cas passerait au vert a tort : c'est le temoin. Le test verifie aussi `prosecdef = false` dans `pg_proc` pour `role_permissions_vers_postes`. Meme regle sur les personnes (M5) : `permission_overrides = {"menu.price": false}` puis ancienne ecriture `custom_permissions = {"menu.edit": true}` : le retrait tient ; `billing.manage: true` d'un ancien administrateur survit a une ancienne ecriture | INSERT `role = 'admin'` ne donne aucun droit reserve au proprietaire (`is_tenant_owner` faux)                                          |
| `gardes_anciennes_listes.test.sql`                       | `audit_log` : gerant lit, caissier non, gerant avec `audit.view: false` non ; `flutterwave_payments` : gerant lit (factures), chef non ; `invitations` : gerant lit, caissier non ; `has_tenant_money_permission` : gerant oui, caissier a qui l'on donne `orders.refund: true` seul non ; `has_tenant_floor_permission` : gerant oui, serveur non                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | pour l'argent : le caissier avec les quatre droits passe                                                                               |
| `membres_retires.test.sql`                               | membre avec `deleted_at` ou `is_active = false` : `tenant_permission_level` NULL, `get_my_tenant_ids_array` ne rend pas le restaurant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | le meme membre reactive passe                                                                                                          |
| `employe_ne_s_eleve_pas.test.sql` (test manquant 1)      | sous le jeton d'un serveur, sur SA ligne : `update admin_users set postes = '{owner}'`, `set postes = '{manager}'`, `set permission_overrides = '{"orders.pay": true}'`, `set role = 'manager'` : chacun leve 42501 (grant de colonne absent) et la ligne est inchangee. C'est la preuve de l'argument central de A.1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | sur la meme ligne, `update ... set full_name = 'x'` passe : le refus vient bien de la colonne, pas d'un blocage general                |
| `double_auth_et_proprietaire.test.sql` (test manquant 2) | proprietaire protege par un facteur verifie, jeton aal1 : `is_tenant_owner` faux, INSERT, UPDATE et DELETE dans `poste_permissions` refuses, `tenant_permission_level` NULL, `tenants_avec_droit` vide                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | le meme proprietaire en aal2 passe partout                                                                                             |
| `privileges_fonctions_droits.test.sql` (test manquant 5) | `has_function_privilege` pour chaque nouvelle fonction (`public` et `private`) et chacun de `anon`, `authenticated`, `service_role`, compare a un tableau d'attendus ecrit dans le test : EXECUTE voulu pour les aides de RLS et pour `droits_valides` et `fusion_anciens_droits` ; non voulu pour `matrice_postes`, `codes_droits`, `postes_depuis_role`, `role_depuis_postes`, `postes_normalises`, `droits_depuis_anciens`, `garder_proprietaire`, les fonctions de synchronisation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | une fonction dont l'attendu est "non" et une dont l'attendu est "oui" : le test ne peut pas passer en rendant toujours la meme reponse |
| `lectures_une_fois_par_requete.test.sql` (M8)            | les trois politiques de lecture ont la forme `= ANY ((SELECT public.tenants_avec_droit(...)))` (lecture de `pg_policies.qual`) ; gerant lit `audit_log`, caissier non ; gerant lit `flutterwave_payments` (niveau limite), chef non                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | une politique ecrite sans la sous-requete fait echouer la verification de forme                                                        |

Recensement des tests existants a adapter (M3, P2). La liste ci-dessous est une ESTIMATION faite a la lecture : deux casses ont ete prouvees par l'audit pour une raison que la version 1 n'avait pas prevue (`flutterwave_anomalies`, `un_essai_par_proprietaire`), et 17 instructions des tests inserent plusieurs proprietaires sans avoir ete relues une a une. La liste reelle se dresse sur le banc AVANT d'ecrire le code de l'application :

1. charger `schema.sql`, appliquer MIG1 a MIG3 seules, lancer `scripts/run-pgtap.sh`, sortie dans un fichier ;
2. pour chaque fichier rouge, ecrire une ligne : assertion, cause, categorie 1 ou 2 de B.4 ;
3. ce tableau est joint a la PR. Un fichier rouge qui n'entre dans aucune des deux categories arrete le travail : c'est une regression de la conception.
   Recherche preparatoire des donnees contraires aux nouvelles contraintes : `rg -n "'owner'" supabase/tests tests/integration tests/journeys` puis, pour chaque fichier, verifier qu'un meme restaurant ne recoit pas deux proprietaires et qu'aucun `delete` ne vise un proprietaire ou son compte avant son restaurant.

Tests existants a adapter (estimation, categorie 1 de B.4) : `garde_delegation`, `garde_argent`, `argent_orders_pay`, `argent_write_roles`, `catalogue_write_roles`, `lot3_write_roles`, `lot4_write_roles`, `verification-ecritures-roles-sans-pgtap.sql`, `record_refund_tenant_guard`, `rapports_par_espace`, `rapports_avances`, `registre_stock_lecture_inventaire`, `stock_rpc_inventory_edit`, `rappels_intelligents`, `intrusion_isolation_lot1`, `double_auth_exigee_par_la_base`. Categorie 2, prouves : `flutterwave_anomalies.test.sql:33-36`, `un_essai_par_proprietaire.test.sql:76,90,102,136`, `tests/integration/reminders/engine.test.ts:104`. `revue_lot_b2a.test.sql:59-69` et `flutterwave_payments.test.sql:390` : les membres `'admin'` deviennent `'manager'` (le cas `admin` est couvert une fois, dans `transition_anciens_roles`). La double authentification doit rester testee : un compte protege en aal1 obtient NULL de `tenant_permission_level`.

### F.2 Vitest

| Fichier                                                                                                                                                                                                                                                        | Contenu                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/__tests__/permission-defaults-sql.test.ts` (reecrit)                                                                                                                                                                                                  | parite exacte TS et SQL de la matrice et du catalogue, dans les deux sens ; temoin : le test verifie qu'il a bien lu 86 triplets et 22 codes ; aucune ligne `owner` ; `has_tenant_write_permission` ne contient plus de `ELSE au.role`                           |
| `src/lib/__tests__/permissions.test.ts` (reecrit)                                                                                                                                                                                                              | `permissionLevel` : les 242 cases, cumul, ordre de priorite, code inconnu, proprietaire ; memes cas que les fichiers pgTAP `cumul` et `reglage_par_personne` (une table de cas partagee en JSON, `tests/fixtures/permission-cases.json`, lue par les deux cotes) |
| `src/lib/__tests__/permission-migration.test.ts` (nouveau)                                                                                                                                                                                                     | la table B.5 ecrite en TS (`legacyToNew`) donne les memes resultats que les cas de `transition_anciens_roles`                                                                                                                                                    |
| `src/lib/auth/__tests__/poste-authority.test.ts` (remplace `role-hierarchy.test.ts`)                                                                                                                                                                           | `canGrantPostes` : jamais `owner` ; un gerant ne donne pas `manager` plus un reglage qu'il n'a pas ; `canActOnMember` : jamais le proprietaire, jamais soi, pas un pair. Temoin : le proprietaire passe sur les memes cibles                                     |
| `src/lib/auth/__tests__/role-access-matrix.test.ts` (reecrit)                                                                                                                                                                                                  | chaque route croisee avec les 11 postes, plus `anyOf` et `atLeastLimited`                                                                                                                                                                                        |
| `src/app/actions/__tests__/admin-takeover.action.test.ts` (adapte)                                                                                                                                                                                             | promotion en proprietaire refusee ; gerant qui se donne `permission_overrides` refuse ; reinitialisation du mot de passe d'un pair refusee                                                                                                                       |
| `src/app/api/__tests__/invitations.test.ts`, `invitation.schema.test.ts`, `admin-user.schema.test.ts`                                                                                                                                                          | `postes` vide refuse, `owner` refuse, poste inconnu refuse, doublon refuse, code de droit inconnu refuse                                                                                                                                                         |
| `src/app/api/__tests__/permissions-route.test.ts`                                                                                                                                                                                                              | table `poste_permissions`, non proprietaire refuse                                                                                                                                                                                                               |
| `src/app/actions/__tests__/money-gates.action.test.ts`, `orders-delete.action.test.ts`, `house-accounts.action.test.ts`                                                                                                                                        | `MONEY_PERMISSIONS` : gerant oui, caissier non, caissier avec un seul des quatre droits non                                                                                                                                                                      |
| `src/app/actions/__tests__/menu-item-price.action.test.ts`                                                                                                                                                                                                     | `menu.price` exige ; `menu.edit` seul refuse                                                                                                                                                                                                                     |
| `src/app/api/__tests__/menu-import.test.ts`, nouveau `menu-import-pdf.test.ts` (test manquant 7)                                                                                                                                                               | membre avec `menu.edit` sans `menu.price` : 403 AVANT toute ecriture (le client de base simule ne recoit aucun `insert` ni `update`) ; avec les deux droits : passe. Temoin : meme fichier importe, deux membres, deux resultats                                 |
| `src/app/actions/__tests__/menu-items-update.action.test.ts` (nouveau)                                                                                                                                                                                         | mise a jour d'un plat sans `price` ni `prices` : `menu.edit` suffit ; avec `price` : `menu.price` exige                                                                                                                                                          |
| `src/app/actions/__tests__/admin-owner-protected.action.test.ts` (nouveau, F9)                                                                                                                                                                                 | desactiver, retirer, changer l'email, reinitialiser le mot de passe du proprietaire : refuses pour un gerant ; le proprietaire ne peut pas se desactiver lui-meme. Temoin : les memes actions sur un serveur passent                                             |
| `scripts/__tests__/manage-super-admin.test.sh` (nouveau, M4)                                                                                                                                                                                                   | cycle activer, revoquer, reactiver ; variable de restaurant absente ; email present dans deux restaurants ; proprietaire portant le drapeau jamais desactive                                                                                                     |
| `src/app/api/__tests__/invoices.test.ts`, `billing-portal.test.ts`, `update-subscription.test.ts`, `src/lib/billing/__tests__/checkout-tenant.test.ts`                                                                                                         | gerant : factures oui, paiement non ; gerant avec `billing.manage: true` : paiement oui                                                                                                                                                                          |
| `src/app/api/__tests__/orders-pos.test.ts`                                                                                                                                                                                                                     | auto-affectation pour `{waiter}`, `{cashier, waiter}`, pas pour `{cashier}`                                                                                                                                                                                      |
| `src/services/__tests__/plan-enforcement.service.test.ts`                                                                                                                                                                                                      | les deux valeurs de `MANAGER_SEAT` (G.a), y compris une ligne `role = 'admin'` de transition                                                                                                                                                                     |
| `reminders/__tests__/rules.test.ts`, `reminder.service.test.ts`, `assignment.service.test.ts`, nouveau `service-manager.service.test.ts`                                                                                                                       | nouvelles regles de D.2 ; serveur prive de `orders.take` non proposable a une table (F10)                                                                                                                                                                        |
| composants : `role-ui-gates`, `RoleGuard`, `OrderPaymentPanel`, `POSClient.money-gate`, `AdminBottomNav.permissions`, `SubscriptionBanners`, `ServiceTableCard.permissions`, `UsersTable`, `UserPermissionsDialog`, `CommandPalette`, `SettingsForm.read-only` | memes attendus que la matrice, par poste                                                                                                                                                                                                                         |
| `src/__tests__/proxy.test.ts`                                                                                                                                                                                                                                  | inchange dans sa forme : les routes repointees refusent et acceptent les bons postes                                                                                                                                                                             |

Parcours Playwright : `tests/journeys/03-staff-permissions.spec.ts` etendu a un chef (modifie un prix, ne voit pas les rapports d'argent) et a une personne `{waiter, cashier}` (prend une commande et encaisse).

Fin de lot : les 5 portes (`typecheck`, `lint --max-warnings 0`, `format:check`, `test`, `build`), `scripts/run-pgtap.sh`, recherche des tirets longs, puis contre-audit independant (regle 10) avec trois angles : exactitude de la matrice, securite, regression.

---

## G. Decisions du proprietaire

**TRANCHEES par le proprietaire le 2026-11-28 ("Oui, les 5"), elles s'imposent a l'implementation :**

- G.a : `MANAGER_SEAT = 'staff'` (le gerant compte comme personnel).
- G.b : valeurs "en attendant" conservees. G.b.1 : `waiter` / `orders.pay` = `limited` jusqu'au lot 3. G.b.2 : annulation et coupons restent ouverts a `orders.pay` sans code jusqu'au lot 3.
- G.c : le lot 2 se fait juste apres le lot 1, avant les lots 3 et 4.
- G.d : publicites, annonces et supports dans `settings.edit`.
- G.f : l'ancien administrateur devient gerant SIMPLE des que le nouveau code est servi (retrait de `billing.manage` dans MIG4, etape 9).
- G.e : reste conditionnel aux controles prealables.

Aucune de ces decisions n'est prise dans ce document. Chacune est un parametre a un seul endroit du code ; la valeur indiquee comme "en attendant" est celle qui ne change rien a ce qui se passe aujourd'hui.

### G.a Le gerant compte-t-il comme administrateur ou comme personnel dans la formule ?

Rappel des formules (`src/lib/plans/features.ts`) : Starter 1 administrateur et 3 membres du personnel, Pro 2 administrateurs, formules superieures sans limite d'administrateurs.

| Choix                                                        | Effet                                                                                                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MANAGER_SEAT = 'staff'` (en attendant, regle d'aujourd'hui) | le gerant prend une place de personnel. En Starter : le proprietaire plus 3 personnes, dont autant de gerants qu'il veut. La limite "administrateurs" ne compte plus que le proprietaire une fois `admin` supprime |
| `MANAGER_SEAT = 'admin'`                                     | le gerant prend une place d'administrateur. En Starter : aucun gerant possible sans passer en Pro. En Pro : un seul gerant en plus du proprietaire                                                                 |

Parametre : constante `MANAGER_SEAT` dans `src/services/plan-enforcement.service.ts`. Dans les deux cas, aucun restaurant existant n'est bloque : la limite ne se verifie qu'au moment d'ajouter ou de reactiver quelqu'un.

### G.b Encaissement du serveur, annulation et coupons du caissier, d'ici le lot 3

Le cahier des charges dit : le serveur encaisse par defaut sur le QR marchand ; le caissier annule et remise avec le code d'un responsable. Les deux mecanismes (limite au QR marchand, code du responsable) sont livres au lot 3. D'ici la, deux reglages sont a choisir.

| Parametre                             | Choix "en attendant" (rien ne change)                                                                          | Autre choix                                                                     | Effet de l'autre choix                                                                                                                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G.b.1 Serveur et encaissement         | case `waiter` / `orders.pay` = `limited` : le serveur n'encaisse pas avant le lot 3, comme aujourd'hui         | case = `full` des le lot 1                                                      | le serveur encaisse tout de suite, especes et carte comprises, sans la limite au QR marchand. Il peut aussi annuler une commande non reglee et appliquer un coupon, car ces deux gestes dependent de `orders.pay` jusqu'au lot 3 |
| G.b.2 Caissier, annulation et coupons | ces deux gestes restent ouverts a qui a `orders.pay`, sans code, jusqu'au lot 3 : le caissier garde ce qu'il a | les fermer des le lot 1 (exiger `orders.cancel` et `orders.discount` en `full`) | le caissier ne peut plus annuler ni appliquer un coupon tant que le lot 3 n'est pas livre : il appelle le gerant, qui le fait depuis son propre compte                                                                           |

Parametres : G.b.1 est une seule case de la matrice (TypeScript et SQL, gardee par le test de parite). G.b.2 est le droit exige par `refuser_argent_sans_orders_pay` (`schema.sql:5043`), `claim_coupon_usage`, `unclaim_coupon_usage` et leurs actions.

### G.c A savoir : le chef et le chiffre d'affaires

Le lot 1 ferme au chef les ecrans et les rapports d'argent. Il ne ferme pas la base : aujourd'hui tout membre d'un restaurant, chef compris, peut lire les commandes et les paiements en interrogeant directement la base avec son compte. C'est deja le cas avant ce chantier. La fermeture reelle est au lot 2 (D.5 bis). Question : ce delai est-il acceptable, ou le lot 2 doit-il passer avant le reste ?

### G.d Publicites, annonces et supports

Le cahier des charges ne les range dans aucun droit. La conception les met dans "Reglages du restaurant" (`settings.edit` : proprietaire et gerant), pour que le chef ne les obtienne pas avec "Modifier la carte". A confirmer.

### G.e Seulement si les controles prealables trouvent quelque chose

- Un restaurant avec plusieurs proprietaires (controle E.0 numero 1) : lequel reste proprietaire, l'autre devenant gerant ?
- Une ligne `admin` qui serait un ancien compte de plateforme revoque (controle 7) : vrai membre du restaurant, ou compte a desactiver ?

### G.f L'ancien administrateur garde-t-il le paiement de l'abonnement jusqu'au lot 4 ?

Ecart au cahier des charges, a connaitre. La section 8 dit : "Administrateur : supprime. Le compte de test qui l'utilise devient Gerant." La conception en fait un gerant **qui garde le paiement de l'abonnement** (`billing.manage: true`) jusqu'a la fin du lot 4, et applique la meme regle a une invitation `admin` encore en attente. Raison technique : tant que l'ancien code est en service, il traite ce compte comme un administrateur ; lui retirer le paiement en base avant de deployer le nouveau code serait un retrait d'acces fait dans le mauvais ordre.

| Choix                                                                         | Effet                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gerant avec le paiement jusqu'a la fin du lot 4 (ce que la conception decrit) | le compte ne perd rien pendant la transition ; il redevient un gerant ordinaire quand `admin` est supprime. Pendant ce temps, une personne qui n'est pas le proprietaire peut changer de formule et payer |
| Gerant simple des que le nouveau code est servi (etape 9, avec MIG4)          | conforme au cahier des charges plus tot : le compte voit les factures et ne paie plus, des la fin du lot 1. L'invitation `admin` en attente donne un gerant simple. Une ligne de plus dans MIG4           |

Parametre : la presence de `"billing.manage": true` dans la reprise de MIG1 (maintenue dans les deux cas, pour la compatibilite avec l'ancien code) et son retrait soit dans MIG4, soit dans MIG5. En production il s'agit d'un seul compte, de test.

## Notes d'implementation issues du contre-audit v3 (verdict ACCEPT)

- N8 : MIG2 garde le nom exact de chaque politique qu'elle remplace. Preuve : comparer `pg_policies` (nom, table, commande) avant MIG2, apres MIG2 et apres retour arriere sur le banc.
- N9 : la comparaison programmee des 10 fonctions et 24 politiques du retour arriere avec `schema.sql` devient un test du depot, relance le jour de l'application en production.
