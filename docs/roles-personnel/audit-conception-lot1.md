# Contre-audit de la conception du lot 1 (postes, 22 droits, cumul)

Date : 2026-11-28. Lecture seule : aucun fichier du depot, aucune base, aucun serveur touche.
Base lue : worktree `.claude/worktrees/roles-lot1`, HEAD `729e2150`, `supabase/schema.sql` (marqueur `20261124210700`) et la migration posterieure `20261127120000`.
Documents audites : `conception-lot1.md`, `docs/roles-personnel/cahier-des-charges.html`, `inventaire.md`.

Methode : chaque affirmation de la conception a ete confrontee au code. "CONFIRME" veut dire que j'ai lu la ligne citee. "PLAUSIBLE" veut dire que le raisonnement tient mais que la preuve demande un banc (que je n'avais pas le droit de lancer).

Limites de cet audit, a connaitre avant de s'y fier :

- Rien n'a ete execute. Les constats sur l'ordre d'application (H2, M1) sont deduits des regles de PostgreSQL, pas observes.
- Les quelque 250 sites TypeScript n'ont pas ete relus un par un. J'ai verifie les gardes (`getAuthenticatedUserForTenant`, `checkTenantAdminPermissions`), les ecritures de prix, les suppressions de comptes et un balayage des litteraux de role.
- Les 63 fichiers pgTAP n'ont pas ete lus en entier : deux casses sont prouvees (M3), d'autres sont possibles.

---

## Verdict : ACCEPT WITH FIXES

Le coeur de la conception est sain : resolution fermee sur un catalogue, refus des codes inconnus pour tous, cumul par niveau le plus haut, isolation par restaurant, double authentification conservee, garde du prix par colonne, protection du proprietaire en base. Je n'ai trouve aucune voie par laquelle un employe obtient, avec cette conception, un droit d'ecriture qu'il n'a pas aujourd'hui sans decision du proprietaire.

Mais la conception ne peut pas etre codee telle quelle : 3 constats eleves et 9 moyens doivent etre corriges dans le document avant le premier commit. Aucun n'exige de changer de modele.

---

## 1. Constats CONFIRMES

### ELEVE

**H1. La decision 1 du proprietaire (le chef ne voit pas le chiffre d'affaires) n'est PAS tenue par la base, ni au lot 1 ni apres le lot 2 tel que prevu.**

- Conception : D.5 ligne "Rapports" ("Au lot 1 tout reste sur `reports.money`, pour que le chef ne voie pas le chiffre d'affaires"), D.5 ligne F.1.7, D.6.
- Code : inventaire F.1.7 (SELECT de `orders`, `order_items`, `payments`, `house_accounts`, `table_sessions` ouverts a tout membre) ; D.5 ecrit en toutes lettres que `orders` et `order_items` "restent lisibles par tout membre".
- Scenario : un chef, ou un des nouveaux postes `cook` et `production`, appelle PostgREST avec son jeton : `GET /rest/v1/orders?select=total,created_at` puis `GET /rest/v1/payments?select=amount,method`. Il recalcule le chiffre d'affaires du jour. `reports.money` ne cache que les ecrans.
- Ce n'est pas une regression (l'acces existe deja), mais la conception affirme le contraire, et le critere d'acceptation du cahier des charges est "les memes regles dans l'application et dans la base". Le correctif du lot 2 laisse `orders` ouvert, donc le trou reste.
- Correctif : (a) corriger la phrase de D.5 et le dire au proprietaire dans G ; (b) au lot 2, fermer aussi les colonnes d'argent de `orders` et `order_items` (grants de colonnes ou vue sans montants pour qui n'a ni `orders.pay`, ni `orders.take`, ni `reports.money`), et `table_sessions` ; (c) ajouter un test pgTAP "chef : SELECT payments rend 0 ligne" des que la politique existe. Tant que ce n'est pas fait, ne pas ecrire "le chef ne voit pas le chiffre d'affaires" dans un compte rendu.

**H2. M2 et M3 sont deux transactions : entre les deux, plus personne ne peut faire avancer une commande, proprietaire compris.**

- Conception : E.1 ("Chaque fichier : une transaction"), M2 (nouveau resolveur qui refuse tout code hors catalogue), M3 (politiques repointees).
- Code : `schema.sql:12290, 12297, 12299, 12308` (politiques `order_notes` INSERT, `order_items` UPDATE, `orders` UPDATE sur `'orders.manage'`), `schema.sql:4621` (`reassign_order_table`), `schema.sql:658` (`'reports.view'`).
- Scenario : M2 est validee. `'orders.manage'` n'est plus dans `private.codes_droits()` : `has_tenant_write_permission` rend faux pour tout le monde. Jusqu'a la validation de M3, tout UPDATE de `orders` touche 0 ligne sans erreur (RLS), en plein service. Inverser l'ordre ne regle rien : M3 avant M2 ferait tomber `'orders.take'` dans l'ancien ELSE (admin et gerant seulement), donc caissiers et serveurs bloques.
- Correctif : le resolveur, les fonctions repointees et TOUTES les politiques repointees dans le MEME fichier, donc la meme transaction. Ajouter au deroule E.2 un controle apres application : la requete du test `catalogue_droits_codes_connus` lancee en production doit rendre 0 litteral hors catalogue.

**H3. Le declencheur `role_permissions_vers_postes` n'a pas de corps, alors qu'il ecrit dans la table qui porte les droits de tous les postes.**

- Conception : E.1 M1 etape 6 (une ligne de description, aucun SQL), alors que les trois autres declencheurs sont ecrits.
- Code : `schema.sql:15434` (`GRANT ALL ON role_permissions TO authenticated`), `schema.sql:12947` (politique proprietaire), CHECK `role_permissions_role_check` (admin, manager, cashier, chef, waiter).
- Scenarios non tranches : (a) SECURITY INVOKER ou DEFINER ? En DEFINER, toute ecriture admise un jour dans `role_permissions` devient une ecriture dans `poste_permissions` sans passer par `is_tenant_owner` ; (b) `admin` et `manager` visent tous deux le poste `manager` : la suppression de la ligne `admin` par l'ancien code efface-t-elle le reglage du poste Gerant ? une ligne `admin` ecrase-t-elle une ligne `manager` posee par le nouveau code ? (c) une ecriture de l'ancien code ecrase un reglage pose par le nouveau code avec des cles que l'ancien ne connait pas (`menu.price`, `cash.close`).
- Correctif : ecrire le corps. Regles proposees : SECURITY INVOKER (la RLS de `poste_permissions` reste la garde) ; la ligne `admin` n'est JAMAIS reportee (0 ligne en production, role supprime) ; le report fusionne (`permissions || traduction`) au lieu de remplacer ; DELETE reporte seulement pour `manager, cashier, chef, waiter`. Ajouter les cas au test `transition_anciens_roles`.

### MOYEN

**M1. M1 echoue a l'application : `is_tenant_owner` est creee avant la colonne qu'elle lit.**

- Conception : E.1 M1, etape 1 (cree `public.is_tenant_owner`) puis etape 2 (ajoute `admin_users.postes`). Corps en C : `'owner' = ANY (au.postes)`, `LANGUAGE sql`.
- PostgreSQL valide le corps d'une fonction SQL a sa creation (`check_function_bodies` actif par defaut) : "column au.postes does not exist". Echec bruyant sur le banc, pas un danger en production, mais l'ordre ecrit est faux.
- Correctif : creer `is_tenant_owner` apres l'etape 2 et avant l'etape 4 (politiques de `poste_permissions`).

**M2. La garde du proprietaire casse des chemins existants que la conception dit compatibles.**

- Conception : D.4 ("Compatibilite verifiee avec les fonctions existantes").
- Code :
  - `delete_admin_user_atomic` ne supprime le restaurant que si `tenant_members_total <= 1` (`schema.sql:1341-1347`). Dans la branche ELSE (`schema.sql:1370`), un proprietaire avec d'autres membres est supprime par `DELETE FROM admin_users` : desormais refuse. L'application ne l'atteint pas (`actions/admin.ts:124`, `canActOnUser`), donc pas de panne en service, mais l'affirmation "verifiee" ne couvre qu'un cas sur deux.
  - `admin_users.user_id` est en `ON DELETE CASCADE` vers `auth.users` (`schema.sql:10562`). Toute suppression PHYSIQUE du compte d'un proprietaire d'un restaurant ouvert est maintenant refusee par le declencheur : `scripts/seed-demo.ts:376`, `scripts/seed-qa.ts:387`, `scripts/manage-super-admin.js:172,182`, `tests/integration/reminders/engine.test.ts:104`.
  - `supabase/tests/rls/un_essai_par_proprietaire.test.sql:76,90,102,136` : `delete from admin_users where user_id = ...` sur le proprietaire AVANT de supprimer le restaurant. Ces quatre blocs leveront 42501.
- Correctif : lister ces chemins dans D.4 ; dans les seeds et les tests, supprimer le restaurant d'abord ; ajouter au test `proprietaire_protege` les cas "suppression physique du compte auth du proprietaire d'un restaurant ouvert : refusee" et "`delete_admin_user_atomic` sur un proprietaire avec d'autres membres : refusee, rien n'est supprime". Verifier que `signup.service.ts:231` reste sur (il l'est : la RPC de creation est atomique, la ligne n'existe pas quand on supprime le compte).

**M3. La liste "tests existants a adapter (seulement selon B.4)" est fausse : au moins deux fichiers cassent pour une autre raison.**

- Conception : F.1 dernier paragraphe, et B.4 ("Une assertion qui change sans y figurer est une regression").
- Code : `supabase/tests/rls/flutterwave_anomalies.test.sql:33-36` insere DEUX lignes `role = 'owner'` dans le meme restaurant `f5555555...` (le patron et un super administrateur) : violation de l'index `admin_users_un_proprietaire`. Et `un_essai_par_proprietaire.test.sql` (M2 ci-dessus). Aucun des deux n'est dans la liste.
- Correctif : avant de coder, lancer la suite pgTAP sur M1 a M4 seules et dresser la liste reelle ; ajouter a B.4 une deuxieme categorie autorisee "donnees de test contraires aux nouvelles contraintes (un proprietaire, une ligne vivante par personne, proprietaire non supprimable)".

**M4. `manage-super-admin.js` : le correctif propose rend la reactivation impossible et peut desactiver un proprietaire.**

- Conception : D.2 (la revocation met `is_super_admin=false, is_active=false, deleted_at=now()` et laisse `role='super_admin'`).
- Code : `scripts/manage-super-admin.js:96-104` (revocation) et `:112-120` (activation : `SET is_super_admin = true, role = 'super_admin'`, sans toucher `is_active` ni `deleted_at`) ; `is_super_admin()` exige `is_active` et `deleted_at IS NULL`. Les deux requetes filtrent sur `email` seul.
- Scenarios : (a) revoquer puis reactiver : la ligne reste inactive et retiree, la console plateforme reste fermee ; (b) le compte plateforme porte `role='owner'` avec `is_super_admin=true` dans un restaurant (cette forme existe : `flutterwave_anomalies.test.sql:35`) : la revocation retire le proprietaire de ce restaurant ; l'activation fait passer `role` a `super_admin`, le declencheur de synchronisation vide `postes`, la garde du proprietaire refuse.
- Correctif : l'activation remet `is_active=true, deleted_at=NULL` ; les deux requetes ne touchent que les lignes `role='super_admin'` ; pour une ligne de membre ordinaire, seul le drapeau `is_super_admin` change. Meme correction dans `scripts/security-super-admin.sql`.

**M5. Une ecriture de l'ancien code dans `custom_permissions` ECRASE `permission_overrides`, y compris les retraits poses par le nouveau code.**

- Conception : E.1, corps de `sync_postes_admin_users`, branche UPDATE (`NEW.permission_overrides := private.droits_depuis_anciens(NEW.custom_permissions)`).
- Scenario : le nouveau code est servi, le proprietaire retire `menu.price` a un chef (`permission_overrides = {"menu.price": false}`). Un onglet reste sur l'ancien deploiement (le decalage d'assets est documente dans la regle 11) et enregistre un reglage a l'ancienne : `custom_permissions` change, `permission_overrides` est remplace par la traduction d'une valeur perimee, le retrait disparait. Meme effet sur le `billing.manage: true` d'un ancien administrateur. C'est une restauration de droit silencieuse.
- Correctif : fusionner au lieu de remplacer, sur les seules cles touchees par la traduction (`coalesce(NEW.permission_overrides,'{}') || traduction`), et faire vider `custom_permissions` par le nouveau code quand il ecrit `permission_overrides`. Raccourcir la fenetre : M5 des que `/api/version` confirme le nouveau code.

**M6. Import de carte : la garde applicative (`menu.edit`) et la base (`menu.edit` ET `menu.price`) divergent, avec un risque d'import partiel.**

- Conception : D.2 ("import de carte ... `menu.edit`") contre D.1 (`menu_items` INSERT exige les deux droits, declencheur sur `price` et `prices`).
- Code : `src/app/api/menu-import/route.ts:40`, `src/app/api/menu-import-pdf/route.ts:76` (client de session, donc la garde de base s'applique) ; `src/lib/menu-bulk-import.ts:231-251` (insertions par lots puis mises a jour plat par plat).
- Scenario : un chef a qui le proprietaire a retire `menu.price` importe un fichier. Les categories passent, les nouveaux plats sont refuses par la RLS, les mises a jour de plats existants dont le prix change levent 42501 une par une : import a moitie applique, message technique. Pas une faille (la base refuse), une regression de fonctionnement.
- Correctif : les deux routes d'import, `actionUpdateMenuItem` quand le payload contient `price` ou `prices`, et les ecritures de variantes exigent `['menu.edit','menu.price']` AVANT toute ecriture. Test Vitest correspondant.

**M7. Retour arriere de M2 : script non ecrit, et dangereux apres la mise en service.**

- Conception : E.1 M2 ("script de retour a ecrire").
- Probleme : une fois le nouveau code servi, les reglages vivent dans `permission_overrides` et `poste_permissions` ; rien ne les reporte vers `custom_permissions` et `role_permissions`. Rejouer les anciens corps de fonctions rend a chacun les droits de son ancien role : un retrait pose par le proprietaire disparait.
- Correctif : ecrire et tester le script avec la migration (regle zero dette), et ecrire dans E.2 que le retour arriere de la base n'est permis qu'AVANT la fusion du code ; apres, on corrige en avant. Le retour arriere du CODE seul (Vercel) reste sur : la base garde le nouveau resolveur.

**M8. Cout par ligne : trois nouvelles politiques SELECT appellent la chaine de resolution pour chaque ligne.**

- Conception : D.1 (`audit_log` SELECT, `flutterwave_payments` SELECT, `invitations` SELECT) et C "Performance".
- Code : les politiques actuelles (`schema.sql:11512, 12331, 13267`) sont de la forme `tenant_id IN (SELECT ...)`, evaluee une fois par requete. La nouvelle forme `has_tenant_write_permission(tenant_id, 'audit.view')` est evaluee par ligne, et chaque appel enchaine quatre fonctions non integrables (`has_tenant_write_permission`, `tenant_permission_level`, `mfa_satisfait`, `matrice_postes`). `audit_log` est la table qui grossit le plus.
- Correctif : garder la forme a sous-requete pour les lectures : une fonction `public.tenants_avec_droit(p_perm text, p_niveau_min text) RETURNS uuid[]` et `tenant_id = ANY ((SELECT public.tenants_avec_droit('audit.view','full')))`. Mesurer avec `EXPLAIN (ANALYZE)` sur 50 000 lignes d'audit, pas seulement sur `menu_items`.

**M9. La methode "le compilateur enumere les sites" ne voit pas les lectures de `role` non typees.**

- Conception : D.2, premier paragraphe.
- Code : `src/services/account-deletion.service.ts:208` (`maybeSingle<{ id: string; role: string }>()`), `src/app/api/permissions/route.ts:47-52` (`.eq('role','owner')`), `src/services/plan-enforcement.service.ts:105` (`.in('role', [...])`), `src/app/api/invitations/route.ts:79,205`, `src/app/actions/orders.ts:171`. Ces sites portent leur propre type ou un filtre en chaine : retirer `role` du type `AdminUser` ne produit aucune erreur. La conception les cite presque tous, mais par la liste de l'inventaire, pas par la methode annoncee.
- Correctif : critere de fin de lot ecrit : `rg -n "\brole\b" src --glob '!**/__tests__/**'` ne rend plus que les sites documentes de la transition (super admin, projection), chacun justifie dans la PR.

### FAIBLE

- **F1. Contradiction interne sur `role = 'admin'`.** A.4 dit que la valeur n'est pas reecrite tant que les postes ne changent pas. Mais a l'acceptation d'une invitation `admin` (role `admin`, postes `{manager}`), la branche INSERT du declencheur execute `NEW.role := role_depuis_postes(NEW.postes)` : la ligne nait `manager`. Sans danger (moins de droits pour l'ancien code), a ecrire dans A.4.
- **F2. B.4 dit que le chef ne perd rien : il perd `reassign_order_table` et la prise en charge d'une commande** (`schema.sql:4621` et `table-reassign.ts:52`, `orders/[id]/claim:66` passent de `orders.manage` a `orders.take`). Raisonnable pour un chef, a ajouter au tableau, sinon le test correspondant sera lu comme une regression.
- **F3. Legere ouverture sur donnees anciennes.** Un gerant portant `orders.manage: false` n'avait pas le plan de salle ; la traduction ne produit pas de `settings.edit: false`, il le gagne. `settings.view: false` est abandonne alors que le gerant gagne `settings.edit`. Le controle E.0 numero 4 doit lister ces deux cles et la decision se prend sur les lignes reelles.
- **F4. Colonnes d'`invitations`.** Les SELECT sont accordes colonne par colonne a `authenticated` (`schema.sql:14857-14920`) : `postes` et `permission_overrides` ne seront pas lisibles par un client de session. Sans effet aujourd'hui (tout passe par le client de service, `invitation.service.ts`), a decider et a ecrire.
- **F5. Privileges par defaut.** `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated` (`schema.sql:16019-16022`) : un `REVOKE ... FROM PUBLIC` ne retire rien a ces roles. Voulu pour les deux aides de RLS ; a verifier par `has_function_privilege` dans un test pour toutes les nouvelles fonctions, `private` compris.
- **F6. `private.droits_valides`** : `jsonb_typeof(p) = 'object' AND NOT EXISTS (... jsonb_each(p))` ne garantit pas l'ordre d'evaluation ; sur un tableau JSON, `jsonb_each` leve une erreur au lieu de rendre faux. Refus dans les deux cas ; ecrire un `CASE` pour un message propre.
- **F7. `postes` accepte doublons et ordre libre** (`{waiter,waiter}`). Normaliser dans le declencheur (tri canonique, sans doublon), sinon `IS DISTINCT FROM` voit des changements qui n'en sont pas.
- **F8. `invitations_postes_non_vide`** ne peut pas recopier le CHECK de A.4 (pas de colonne `is_super_admin`) : ecrire `cardinality(postes) >= 1`.
- **F9. La protection du proprietaire ne couvre pas la desactivation.** `is_active=false` ou `deleted_at` sur la ligne du proprietaire reste possible en `service_role` ; seule `canActOnMember` (TypeScript) le refuse cote restaurant. Acceptable si c'est ecrit, avec un test d'action "desactiver le proprietaire : refuse".
- **F10. `service-manager.service.ts:64`** (`postesGranting('orders.take')`) lit la matrice seule : un serveur a qui l'on a retire `orders.take` reste proposable a une table.
- **F11. Publicites, annonces et supports sur `settings.edit`** : le cahier des charges ne les range nulle part (section 4 : "Tables, TVA, imprimantes, horaires, espaces"). Choix defendable, a faire confirmer.
- **F12. `get_my_inventory_tenant_ids` elargi a `suppliers.manage`** : qui n'a que ce droit lit tout le stock. Sans effet par defaut (chef et gerant ont `inventory.view`), a ecrire.

---

## 2. Constats PLAUSIBLES (a prouver sur le banc)

- **P1 (moyen). Cascade depuis `tenants`.** La garde du proprietaire laisse passer la cascade parce que la ligne `tenants` n'est plus visible du declencheur. C'est le comportement attendu de PostgreSQL pour les cles etrangeres, mais tout le chemin "le dernier membre supprime son restaurant" en depend : le test "cascade" de `proprietaire_protege` doit passer par `delete_admin_user_atomic`, pas seulement par un `DELETE FROM tenants`.
- **P2 (moyen). D'autres tests pgTAP cassent sur les deux index uniques.** 17 instructions inserent plusieurs proprietaires ; un seul cas dans le meme restaurant est prouve (M3). Le reste n'a pas ete lu.
- **P3 (faible). Donnees de production.** Une ligne revoquee par l'ancien script porte `role='admin'` : elle deviendra gerant avec `billing.manage: true` dans son restaurant. Le controle E.0 doit sortir toutes les lignes `admin` et `super_admin` avec leur restaurant.
- **P4 (faible). Sieges d'abonnement.** Question G.2 posee a juste titre ; tant qu'elle n'est pas tranchee, `plan-enforcement.service.ts` ne doit pas changer de regle.

---

## 3. Affirmations verifiees et exactes

- Matrice par defaut : comparee case par case au tableau de la section 5 du cahier des charges, pour les 8 postes du tableau et les 3 postes derives (`crew`, `sales`, `production`). 86 cases, aucun ecart. Chef sans `reports.money` ni `reports.own`. Serveur : encaissement `limited`. Gerant : `billing.manage` `limited`, `full` par reglage du proprietaire.
- Seuls 7 codes sont appeles en SQL, et les 8 occurrences de `'orders.manage'` plus l'unique `'reports.view'` sont toutes repointees (D.1). Aucun appel avec un code variable. La migration `20261127120000` n'en contient pas.
- Tous les sites SQL qui comparent `role` a un litteral sont traites ou restent justes par la projection (`delete_my_account`, `delete_admin_user_atomic`, politique `role_permissions`).
- Grants de `admin_users` : `authenticated` n'a que SELECT et UPDATE sur 5 colonnes (`schema.sql:14666-14702`), aucun INSERT : un employe ne peut pas ecrire `postes` ni `permission_overrides` par PostgREST.
- `USAGE` sur le schema `private` pour `anon`, `authenticated`, `service_role` (`schema.sql:13345-13347`) : les CHECK qui appellent `private.droits_valides` fonctionnent, y compris quand un membre met a jour `last_login`.
- Resolveur : `search_path = ''`, noms qualifies, NULL refuse, code inconnu refuse pour tous, proprietaire en premier, membres inactifs ou retires exclus, `mfa_satisfait()` conservee, filtre `tenant_id` sur le membre et sur `poste_permissions`. EXECUTE garde pour `anon` et `authenticated`.
- Aucun appel de `getAuthenticatedUserForTenant` ou `checkTenantAdminPermissions` ne repose sur la liste par defaut `['owner','admin']` : supprimer le parametre `allowedRoles` n'ouvre rien d'autre que les sites listes en D.2.
- Prix : aucune fonction SQL n'ecrit `price` ou `prices` ; les ecritures applicatives passent par le client de session (`menu-item.service.ts:87`, `menu-items-query.ts:49`, `modifier.service.ts:34`, `menu-bulk-import.ts`), donc le declencheur et les politiques s'appliquent. L'import des fiches (`import_recipes_tx`) n'ecrit aucun prix. La caisse ne recoit pas de prix libre ; la remise vient d'un coupon valide cote serveur. `item_modifiers` porte bien `tenant_id`.
- Suppression de comptes cote application : le proprietaire n'est jamais la cible (`canActOnUser`), `delete_my_account` refuse le proprietaire d'un restaurant ouvert, `deleteStaffAccount` aussi, l'annulation d'inscription est sure.
- Promotion en proprietaire par l'ancien code : `role='owner'` par UPDATE, le declencheur de synchronisation pose `{owner}`, la garde refuse. Ordre des declencheurs correct (`aa_...` avant `garder_...` avant `prevent_...`). Pas de recursion entre declencheurs.
- Inventaire F : chaque point a une ligne en D.6. Deux sont reportes (F.1.7 au lot 2, F.3.5 au lot 3), avec un correctif nomme ; F.1.7 est incomplet (H1).

---

## 4. Plan de tests : ce qui manque

Les temoins prevus sont de vrais temoins (comptage de lignes, meme requete pour deux membres, case fausse volontaire). Il manque :

1. Un employe tente `update admin_users set postes = '{owner}'` et `set permission_overrides = '{"orders.pay":true}'` sur sa propre ligne : refus 42501. C'est la preuve de l'argument central de A.1.
2. `is_tenant_owner` et l'ecriture de `poste_permissions` par un proprietaire protege en aal1 : refus.
3. Les cas de M2 (suppression physique du compte, `delete_admin_user_atomic` sur un proprietaire accompagne).
4. Les cas de H3 et M5 (report depuis `role_permissions`, ecriture de l'ancien code apres un retrait pose par le nouveau).
5. `has_function_privilege` pour chaque nouvelle fonction et chaque role.
6. Apres application en production : 0 litteral hors catalogue (H2).
7. Import de carte par un membre sans `menu.price` : refus avant toute ecriture (M6).

---

## 5. Corrections a porter dans la conception avant de coder

1. H2 : un seul fichier pour le resolveur et les politiques.
2. H3 : corps de `role_permissions_vers_postes`.
3. H1 : phrase de D.5 corrigee, ligne ajoutee en G, perimetre du lot 2 etendu a `orders`, `order_items`, `table_sessions`.
4. M1 : ordre des etapes de M1.
5. M2, M3 : liste des scripts, seeds et tests touches par la garde du proprietaire et les index uniques.
6. M4 : script du super administrateur.
7. M5 : fusion au lieu de remplacement dans le declencheur.
8. M6 : garde des imports et de la mise a jour d'un plat.
9. M7 : script de retour arriere ecrit, regle "pas de retour arriere de la base apres la fusion".
10. M8 : forme a sous-requete pour les trois lectures.
11. M9 : critere `rg` de fin de lot.
12. F1 a F12 : une ligne chacune.

Verdict : **ACCEPT WITH FIXES**.

---

# Contre-audit v2

Date : 2026-11-28. Objet : la version 2 de `conception-lot1.md` (journal des revisions en tete), comparee ligne a ligne a `conception-lot1.v1.md`. Memes contraintes : lecture seule, rien n'a ete execute. Tout ce qui touche a l'execution de PostgreSQL ou de `psql` est deduit de la lecture, pas observe.

## Verdict v2 : ACCEPT WITH FIXES

Tous les constats de la v1 sont traites, la plupart reellement. Aucun constat eleve ne reste. Il reste 2 constats moyens nouveaux (N1, N2), 2 constats de la v1 partiellement regles (M4, M7) et 5 constats faibles. Ils se corrigent dans le document en quelques lignes ; aucun n'empeche de commencer le recensement sur le banc.

## 1. Suivi des constats de la v1

| Constat                            | Etat                                            | Raison                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 lectures d'argent               | CORRIGE (document)                              | D.5 bis dit vrai : tenu par l'interface seulement jusqu'au lot 2. Les six politiques citees existent (`schema.sql:11569, 11560, 12884, 12991, 12754, 13236`, appartenance seule). Perimetre du lot 2 etendu a `orders`, `order_items`, `table_sessions`, avec le point du temps reel. Question posee en G.c. Le trou reste ouvert en base au lot 1 : c'est maintenant une decision du proprietaire, plus une affirmation fausse |
| H2 deux transactions               | CORRIGE                                         | MIG2 unique, `BEGIN`/`COMMIT`, bloc `DO` final qui annule s'il reste un litteral hors catalogue, controle avec temoin en E.2 etape 5                                                                                                                                                                                                                                                                                            |
| H3 declencheur sans corps          | CORRIGE                                         | corps complet, SECURITY INVOKER, `admin` jamais reporte, fusion. Relu en section 2 : correct, une preuve a ajouter (N5)                                                                                                                                                                                                                                                                                                         |
| M1 ordre de MIG1                   | CORRIGE                                         | etape 3 bis, apres les colonnes, avant les politiques                                                                                                                                                                                                                                                                                                                                                                           |
| M2 chemins casses                  | CORRIGE                                         | tableau complet en D.4, seeds reordonnes en D.2 bis, tests ajoutes                                                                                                                                                                                                                                                                                                                                                              |
| M3 tests a adapter                 | CORRIGE                                         | deuxieme categorie dans B.4, recensement sur le banc avant de coder, arret si un rouge n'entre dans aucune categorie                                                                                                                                                                                                                                                                                                            |
| M4 script super administrateur     | PARTIEL                                         | le filtre par restaurant, le respect du proprietaire et la reactivation sont justes. Mais le cycle demande comme preuve echouera : voir N1                                                                                                                                                                                                                                                                                      |
| M5 ecrasement des reglages         | CORRIGE                                         | fusion verifiee sur cinq scenarios (section 2). Desaccord tranche en section 3                                                                                                                                                                                                                                                                                                                                                  |
| M6 imports                         | CORRIGE                                         | les deux droits avant toute ecriture, mise a jour d'un plat conditionnee au payload, tests avec temoin                                                                                                                                                                                                                                                                                                                          |
| M7 retour arriere de MIG2          | PARTIEL                                         | garde ecrite, regle "seulement avant la fusion du code" ecrite, preuve definie. Mais les sections 3 et 4 renvoient a `schema.sql` par numero de ligne (le document le dit lui-meme), et la garde a deux angles morts (N4)                                                                                                                                                                                                       |
| M8 cout par ligne                  | CORRIGE                                         | `tenants_avec_droit`, forme a sous-requete, mesure exigee sur 50 000 lignes, test de forme                                                                                                                                                                                                                                                                                                                                      |
| M9 lectures non typees             | CORRIGE                                         | deux passes et trois commandes `rg`. Deux des trois commandes sont insatisfiables telles qu'ecrites (N3)                                                                                                                                                                                                                                                                                                                        |
| F1 a F12                           | CORRIGES                                        | chacun a sa ligne ; F3 a une regle de decision sur les lignes reelles (controle E.0 numero 6), F7 a `postes_normalises` (les valeurs inconnues et NULL sont gardees pour que le CHECK les refuse : correct)                                                                                                                                                                                                                     |
| P1 cascade                         | CORRIGE, avec un defaut dans le plan de secours | preuve par la vraie fonction. Le repli `pg_trigger_depth() > 1` est dangereux : voir N2                                                                                                                                                                                                                                                                                                                                         |
| P2 autres tests                    | CORRIGE                                         | methode de recensement                                                                                                                                                                                                                                                                                                                                                                                                          |
| P3 lignes `admin` et `super_admin` | CORRIGE                                         | controle E.0 numero 7 et decision par ligne                                                                                                                                                                                                                                                                                                                                                                                     |
| P4 sieges                          | CORRIGE                                         | `MANAGER_SEAT = 'staff'`, verifie : c'est la regle actuelle (`plan-enforcement.service.ts:105` compte `owner` et `admin`, `:136` compte le personnel ; Starter 1 et 3, Pro 2 et 15)                                                                                                                                                                                                                                             |
| Tests manquants 1 a 7              | AJOUTES                                         | `employe_ne_s_eleve_pas` (avec temoin `full_name`), `double_auth_et_proprietaire`, cas 3 dans `proprietaire_protege`, six cas de report, `privileges_fonctions_droits`, controle en production, tests d'import                                                                                                                                                                                                                  |

## 2. Relecture du materiel nouveau

**`private.fusion_anciens_droits`.** Relue comme une premiere fois, sur cinq scenarios deroules a la main :

1. retrait pose par le nouveau code (`menu.price: false`), puis ancienne ecriture `menu.edit: true` : le retrait tient ;
2. `orders.pay: false` pose par le nouveau code sur une cle absente, puis ancienne ecriture `orders.pay: true` : refuse, le retrait tient ;
3. cle remise au defaut par le nouveau code, puis ancienne ecriture qui renvoie toute l'ancienne carte : la cle n'est pas reposee (valeur inchangee entre avant et apres) ;
4. ancien refus `orders.pay: false` (qui entraine remise et remboursement a faux), le nouveau code rend `orders.discount: true`, puis l'ancien code leve le refus : `orders.discount` reste a vrai, `orders.pay` repasse a vrai ;
5. `billing.manage: true` d'un ancien administrateur : jamais dans la traduction, donc jamais retire.
   Cas limites : tableau vide passe a l'operateur `-`, agregat sans ligne, `nullif` final. Corrects. Le grant a `authenticated` est necessaire et suffisant (declencheur INVOKER, schema `private` utilisable). Aucun defaut trouve.

**Declencheur `role_permissions_vers_postes`.** Correct. En INVOKER, l'ecriture reportee passe par les politiques de `poste_permissions` (insertion, lecture et mise a jour pour le `ON CONFLICT`), par le CHECK `droits_valides` (EXECUTE accorde) et par `is_tenant_owner`, donc aussi par la double authentification, que l'ancienne politique ne verifiait pas : c'est plus ferme qu'avant. L'ancien code ecrit par upsert avec le client de session (`api/permissions/route.ts`), donc un UPDATE declenche bien la branche de fusion.

**MIG2.** Correct. A noter : `scripts/appliquer-migrations-ciblees.sh:121` execute le lot avec `psql -1 -v ON_ERROR_STOP=1`. Un fichier qui porte ses propres `BEGIN` et `COMMIT` valide a son `COMMIT` : l'atomicite est par fichier, pas par lot. C'est suffisant pour H2 (MIG2 est un seul fichier), mais un echec de MIG3 laisse MIG1 et MIG2 appliquees. Sans danger (l'ancien code est compatible), a ecrire en E.2.

**`tenants_avec_droit`.** Correct : vide pour `anon`, code inconnu ou niveau inconnu donnent un tableau vide, double authentification heritee de `tenant_permission_level`, sous-requete sans reference a la ligne.

**Imports et seeds.** Corrects. Le second gestionnaire de `api/menu-import/route.ts:179` (sans droit) ne fait que servir le modele de fichier : rien a garder.

**Decisions en G.** Presentation neutre, effet de chaque option ecrit, y compris l'effet de bord de G.b.1 (un serveur en `full` pourrait aussi annuler et appliquer un coupon, verifie : ces gestes dependent de `orders.pay`). Les valeurs "en attendant" sont bien celles qui ne changent rien : serveur sans encaissement, caissier inchange, gerant compte comme personnel. Un manque : voir N6.

### Nouveaux constats

**N1 (moyen, lu dans le code). Le script du super administrateur est deja bloque par un declencheur existant, et le correctif ne le traite pas.**

- Document : D.2 bis, "Preuve sur le banc : cycle activer, revoquer, reactiver".
- Code : `prevent_super_admin_elevation` (declencheur `schema.sql:10150`, corps lu). Tout changement de `is_super_admin` exige soit `request.jwt.claim.role = 'service_role'`, soit un appelant deja super administrateur d'apres `auth.uid()`. `scripts/manage-super-admin.js` se connecte par `pg` en direct : aucun des deux n'est vrai, et le script ne pose aucun reglage de session.
- Effet : `SET is_super_admin = true` ou `false` leve "Only super_admin users can grant (ou revoke) super_admin privileges". Le cycle de preuve ne peut pas passer. Ce defaut existe avant ce chantier ; la v2 reecrit le script sans le voir.
- Correctif : chaque operation du script dans une transaction qui commence par `SELECT set_config('request.jwt.claim.role', 'service_role', true)`, et l'ecrire en D.2 bis. Ne pas desactiver le declencheur.

**N2 (moyen, conditionnel). Le plan de secours de la cascade rouvre ce que la garde ferme.**

- Document : D.4, derniere phrase (si la preuve echoue, la branche DELETE laisse passer quand `pg_trigger_depth() > 1`).
- Probleme : la suppression en cascade depuis `auth.users` arrive elle aussi a une profondeur superieure a 1, comme toute suppression lancee depuis un autre declencheur. Avec ce repli, la suppression physique du compte d'un proprietaire d'un restaurant ouvert repasserait, alors que le test manquant 3 exige son refus. Le repli contredit le plan de tests.
- Correctif : retirer ce repli. Si la preuve echoue, utiliser le motif deja present dans la base (`attabl.purge_legale`, `schema.sql:296`) : `delete_admin_user_atomic` pose un drapeau local a la transaction avec l'identifiant du restaurant, et la garde ne laisse passer que ce restaurant.

**N3 (faible). Deux criteres `rg` de fin de lot ne peuvent pas rendre 0.**

- Document : D.2, deuxieme et troisieme commande.
- `custom_permissions|role_permissions` : `src/types/database.generated.ts` les contient tant que MIG4 n'est pas appliquee et les types regeneres, donc apres la PR du lot 1. `'orders.manage'` et les autres anciens codes : la table de traduction TypeScript `legacyToNew` et son test (F.2, `permission-migration.test.ts`) les contiennent par construction.
- Correctif : exclure ces fichiers nommement, ou deplacer le critere "0 ligne" de la deuxieme commande a la PR de MIG4. Un critere impossible finit ignore.

**N4 (faible). La garde du script de retour arriere ne voit ni le cumul ni les invitations.**

- Document : E.1, bloc `$garde$`.
- Elle compare `permission_overrides` et `poste_permissions` a la traduction de l'ancien. Elle ne regarde pas `postes` (une ligne a deux postes ecrite par le nouveau code perdrait son cumul sans refus) ni `invitations.postes` et `invitations.permission_overrides`.
- Correctif : ajouter `postes IS DISTINCT FROM private.postes_depuis_role(role)` et les deux memes controles sur `invitations`. Et recopier pour de bon les sections 3 et 4 : tant qu'elles renvoient a des numeros de ligne, M7 reste partiel.

**N5 (faible). Le cas 6 du test de report ne prouve pas le choix INVOKER, et le cas 1 doit tourner sous le jeton du proprietaire.**

- Document : F.1, `transition_anciens_roles`, six cas.
- Le gerant du cas 6 est arrete par l'ancienne politique de `role_permissions` avant meme le declencheur : le test passerait aussi en DEFINER. Et si le cas 1 tourne en role de service, il ne prouve pas que le proprietaire, avec son jeton, peut executer le corps du declencheur alors que la fonction lui est retiree par `REVOKE` (PostgreSQL ne verifie pas ce droit au declenchement, mais c'est a constater, pas a supposer).
- Correctif : cas 1 sous le jeton du proprietaire ; cas 6 bis : proprietaire protege en aal1 qui ecrit dans `role_permissions` : toute l'ecriture echoue, rien dans les deux tables. Celui-la echoue si le declencheur passe en DEFINER.

**N6 (faible). Un ecart au cahier des charges n'est pas dans G.**

- Cahier des charges, section 8 : "Administrateur : supprime. Le compte de test qui l'utilise devient Gerant." La conception en fait un gerant qui garde le paiement de l'abonnement (`billing.manage: true`) jusqu'a la fin du lot 4, et applique la meme regle a une invitation `admin` en attente. Justifie par la compatibilite avec l'ancien code, mais c'est un choix : une ligne en G, avec l'autre option (gerant simple des le lot 1).

**N7 (faible, lot 2). Vues de cuisine.** Une vue dont le proprietaire est `postgres` contourne la RLS des tables : tout repose sur le filtre ecrit dans la vue. A ecrire comme exigence du lot 2, avec un test d'isolation entre deux restaurants sur les vues elles-memes.

## 3. Arbitrage du desaccord sur M5

Je donne raison a l'architecte, et je retire ma proposition de faire vider `custom_permissions` par le nouveau code. Sa raison (le code casserait a la contraction) est la plus faible des deux ; la plus forte est celle-ci : la fusion se sert de l'ancienne colonne comme point de comparaison ("avant"). Si le nouveau code la vidait, une ancienne ecriture qui renvoie toute l'ancienne carte ferait apparaitre chaque cle comme un changement, et la fusion deviendrait moins precise, pas plus sure. Garder la colonne intacte est donc le bon choix.

Une limite a ecrire, que ni ma proposition ni la sienne ne regle : tant que MIG4 n'est pas appliquee, un ancien deploiement encore joignable decide ses gardes TypeScript sur des reglages perimes. La base reste la garde pour tout ce qui passe par le client de session. Pour les actions en role de service de l'ancien code (equipe, invitations, abonnement), la garde est le role projete (`owner`, `admin`), qui reste juste. Le risque residuel est donc etroit et borne par le delai de MIG4, que la v2 fixe a "aussitot apres la verification". Condition de mon accord : ce delai est tenu, et E.2 l'ecrit comme une etape datee, pas comme une intention.

## 4. Ce qui reste a corriger avant de coder

1. N1 : reglage de session dans le script du super administrateur.
2. N2 : retirer le repli `pg_trigger_depth`, le remplacer par le drapeau de transaction.
3. N4 et M7 : garde completee, sections 3 et 4 du script recopiees et rejouees.
4. N3, N5, N6, N7 : une ligne chacune.
5. E.2 : atomicite par fichier ecrite, MIG4 comme etape datee.

Verdict v2 : **ACCEPT WITH FIXES**. Le recensement sur le banc (F.1) peut commencer tout de suite ; le code de l'application attend les points 1 a 3.

---

# Contre-audit v3

Date : 2026-11-28. Objet : la version 3 de `conception-lot1.md`, comparee a `conception-lot1.v2.md` (639 lignes ajoutees ou changees). Memes contraintes : lecture seule, rien n'a ete execute sur une base. Les comparaisons de texte, elles, ont ete faites par programme.

## Verdict v3 : ACCEPT

Tous les points du contre-audit v2 sont reellement corriges. Il reste deux remarques faibles (N8, N9), a integrer pendant la realisation ; elles ne bloquent pas le debut du code. Ce verdict porte sur la conception : il ne remplace aucune des preuves sur le banc que le document exige lui-meme (cascade, retour arriere rejoue, cycle du script, mesures de plan), et aucune n'a encore ete faite.

## 1. Suivi des points du contre-audit v2

| Point                                | Etat    | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M7, copies du retour arriere de MIG2 | CORRIGE | Controle par programme, pas a l'oeil : j'ai extrait du document les 10 fonctions et les 24 politiques du script (lignes 1269 a 1864) et cherche chaque bloc, caractere pour caractere, dans `supabase/schema.sql` (apres le seul remplacement `CREATE OR REPLACE FUNCTION` vers `CREATE FUNCTION`). Resultat : 10 fonctions identiques sur 10 (`has_tenant_write_permission` 45 lignes, `has_tenant_money_permission`, `has_tenant_floor_permission`, `record_refund` 143 lignes, `assert_tenant_reports_view`, `reassign_order_table` 128 lignes, `get_my_inventory_tenant_ids`, `get_my_tenant_ids`, `get_my_tenant_ids_array`, `audit_log_auteur_session`), 24 politiques identiques sur 24, 24 `DROP POLICY IF EXISTS` qui correspondent un pour un aux 24 `CREATE POLICY`. Temoin du controle : la recherche est une egalite stricte de chaine, un seul caractere different aurait donne "DIFFERENT". Les 24 politiques couvrent bien la liste de D.1 (3 de commandes, 9 de coupons, publicites et annonces, 3 de fournisseurs, 3 de variantes de prix, 1 d'insertion de plat, 1 d'audit, 1 de factures, 3 d'invitations) |
| N4, garde du retour arriere          | CORRIGE | quatre compteurs : reglages par personne, cumul ou poste hors ancien role (`postes` compare a la projection normalisee du role), reglages par poste, invitations en attente. Un temoin par branche est exige                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| N1, script du super administrateur   | CORRIGE | chaque operation dans une transaction qui commence par `set_config('request.jwt.claim.role', 'service_role', true)`. Le troisieme argument `true` rend le reglage local a la transaction : il disparait au COMMIT comme au ROLLBACK. Le nom de la cle est exactement celui que lit le declencheur (`current_setting('request.jwt.claim.role', true)`, corps relu). Le declencheur n'est pas desactive, et un temoin prouve qu'il reste en place (la meme requete sans le reglage doit toujours echouer). La suppression n'a pas besoin du reglage : le declencheur ne porte que sur INSERT et UPDATE                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| N2, repli de la cascade              | CORRIGE | `pg_trigger_depth` retire. Repli par drapeau local a la transaction qui nomme le restaurant, pose et retire autour de la suppression. Un appelant ordinaire ne peut pas le poser : les 3 appels a `set_config` de `schema.sql` ont tous un nom ecrit en dur (aucun nom variable), `set_config` n'est pas dans un schema expose par l'API, et `authenticated` n'a aucun droit DELETE sur `admin_users` (`schema.sql:14666` : SELECT seulement, plus 5 colonnes en UPDATE). Meme pose, le drapeau ne servirait donc a rien a un employe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| N3, criteres `rg`                    | CORRIGE | quatre commandes, exclusions nommees et justifiees, temoins positifs (comptes avant le travail, relance sans exclusion), critere "0 partout" deplace a la PR de MIG4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| N5, preuve du choix INVOKER          | CORRIGE | cas 1 sous le jeton du proprietaire ; cas 6 bis (proprietaire en aal1) qui passerait a tort en DEFINER ; controle `prosecdef = false`. Le document dit lui-meme que le cas 6 ne prouve pas ce choix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| N6, ancien administrateur            | CORRIGE | G.f, deux options avec leur effet, ecart au cahier des charges nomme. La valeur par defaut est celle qui ne change rien a aujourd'hui, comme pour les autres decisions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| N7, vues de cuisine                  | CORRIGE | exigence ecrite, filtre impose, test d'isolation avec temoin (la vue sans filtre doit rendre les lignes de l'autre restaurant), jamais de grant a `anon`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| E.2, atomicite et MIG4 datee         | CORRIGE | atomicite par fichier ecrite avec la conduite a tenir si MIG3 echoue ; MIG4 a J, au plus tard J + 1 jour ouvre, avec conditions et arret si elles ne sont pas remplies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Arbitrage M5                         | CLOS    | la limite que je demandais (ancien deploiement encore joignable) est ecrite en E.2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 2. Materiel nouveau, relu comme une premiere fois

Aucun defaut moyen ou eleve. Deux remarques faibles.

**N8 (faible). Le script de retour arriere suppose que MIG2 garde les noms des politiques.**

- Le script supprime les politiques par leur ANCIEN nom avant de les recreer. Le document ne dit nulle part que MIG2 recree chaque politique sous le meme nom. Si une politique est renommee dans MIG2 (par exemple pour ne plus s'appeler "Menu managers ..." alors qu'elle porte sur les remises), le retour arriere laisserait la nouvelle en place a cote de l'ancienne. Les politiques etant cumulatives, celle des deux qui autorise l'emporterait.
- La preuve prevue (rejouer la suite pgTAP du commit precedent) ne le verrait pas : elle teste des droits, pas la liste des politiques.
- Correctif : ecrire dans E.1 "MIG2 garde le nom de chaque politique", et ajouter a la preuve du retour arriere une comparaison de `pg_policies` (nom, table, commande, textes) et de `pg_get_functiondef` des 10 fonctions avant MIG1 et apres le retour : egalite exacte attendue.

**N9 (faible). Les copies du retour arriere sont justes aujourd'hui, pas forcement le jour de l'application.**

- Elles sont tirees de `schema.sql` a `729e2150`. Le document demande de rebaser sur `origin/main` avant de coder, et d'autres sessions livrent des migrations. Si l'une d'elles touche une des 10 fonctions ou des 24 politiques avant l'application de MIG2, le script restaurerait un corps perime sans rien signaler.
- Correctif : garder le controle par programme comme test du depot (extraction des blocs du script, egalite stricte avec l'etat courant de `schema.sql` plus les migrations posterieures au marqueur), lance par la CI et relance le jour de l'application. Temoin : modifier un caractere d'une copie doit faire echouer le test.

## 3. Ce qui reste a faire, et qui n'est pas de la conception

Ces preuves sont exigees par le document et aucune n'a ete faite ; le verdict ne les presume pas :

1. recensement des tests rouges sur le banc avec MIG1 a MIG3 seules (F.1) ;
2. preuve de la cascade par `delete_admin_user_atomic` (D.4) ;
3. retour arriere de MIG2 rejoue, avec ses quatre temoins de garde ;
4. cycle du script du super administrateur ;
5. plans d'execution avant et apres sur 50 000 lignes d'audit ;
6. ancien code lance contre la nouvelle base pour les trois parcours ;
7. controles E.0 en production, puis accord du proprietaire avant toute application (regle 10), et ses reponses aux points G.a a G.f.

Verdict v3 : **ACCEPT**.
