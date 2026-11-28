# Lot 1 des roles, phase A (base de donnees) : preuves du banc

Date : 2026-11-28. Branche `feat/roles-postes-lot1`, partie de `origin/main` `00151177`.

Tout a ete joue sur le banc local, jamais ailleurs : serveur PostgreSQL 17.6 de la pile `bancattabl` (`127.0.0.1:57322`), dans des bases JETABLES creees pour l'occasion (`roles_lot1_*`) et supprimees a la fin. Aucune autre base n'a ete touchee, aucun conteneur arrete ou relance, aucune commande pointee vers la production, aucun identifiant lu dans un fichier `.env`.

Chaque preuve porte un temoin : un cas ou la mesure DOIT repondre non. Une verification qui ne peut que confirmer ne prouve rien.

Notation des commandes : `$U` vaut `postgresql://supabase_admin:postgres@127.0.0.1:57322`. Le role `supabase_admin` est le superutilisateur du banc ; le role `postgres` du banc ne l'est pas et ne peut pas rejouer `supabase/tests/bootstrap.sql` (`"service_role" is a reserved role, only superusers can modify it`).

## P1. Suite pgTAP : avant et apres

Commande, la meme dans les deux cas, sur une base vide :

```bash
createdb -h 127.0.0.1 -p 57322 -U supabase_admin <base>
bash scripts/run-pgtap.sh --db-url "$U/<base>"
```

| Etat du depot                                      | Fichiers | Assertions | Resultat                  |
| -------------------------------------------------- | -------- | ---------- | ------------------------- |
| `origin/main` `00151177`, sans aucune modification | 62       | 1365       | `pgtap: 1365/1365 passed` |
| branche, MIG1 a MIG3 et tous les tests             | 78       | 1988       | `pgtap: 1988/1988 passed` |

Aucun test n'etait rouge avant le lot : il n'y a pas d'echec preexistant a signaler. Les 623 assertions nouvelles viennent de 16 fichiers :

| Fichier                         | Assertions |
| ------------------------------- | ---------- |
| `postes_matrice_par_poste`      | 245        |
| `privileges_fonctions_droits`   | 68         |
| `transition_anciens_roles`      | 61         |
| `proprietaire_protege`          | 31         |
| `prix_carte_garde`              | 24         |
| `catalogue_droits_codes_connus` | 22         |
| `postes_ecritures_reelles`      | 21         |
| `double_auth_et_proprietaire`   | 20         |
| `poste_permissions_rls`         | 20         |
| `gardes_anciennes_listes`       | 19         |
| `postes_cumul`                  | 17         |
| `lectures_une_fois_par_requete` | 17         |
| `membres_retires`               | 16         |
| `employe_ne_s_eleve_pas`        | 16         |
| `postes_isolation_restaurants`  | 14         |
| `postes_reglage_par_personne`   | 12         |

## P2. Recensement des tests existants (conception F.1), avant toute adaptation

Methode de la conception : charger `schema.sql`, appliquer MIG1 a MIG3 seules, lancer la suite existante, classer chaque fichier rouge. Resultat : 16 fichiers rouges sur 62. Categorie 1 = ligne du tableau B.4 de la conception ; categorie 2 = donnees du test contraires a une nouvelle contrainte.

| Fichier                            | Ce qui casse                       | Cause                                                                                                    | Categorie | Correctif                                                                                                     |
| ---------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| `argent_orders_pay`                | 2 assertions sur `'orders.manage'` | code retire du catalogue                                                                                 | 1         | `orders.take`                                                                                                 |
| `garde_argent`                     | 5 assertions                       | `orders.manage` retire ; le chef gagne `menu.edit` et `inventory.edit` ; le gerant gagne `settings.edit` | 1         | codes traduits ; chaque assertion garde un refus (le chef n'encaisse pas, le gerant ne paie pas l'abonnement) |
| `garde_delegation`                 | 1 assertion                        | le chef gagne `menu.edit`                                                                                | 1         | le temoin de non-elargissement porte sur `orders.pay`                                                         |
| `argent_write_roles`               | 1 assertion                        | le gerant gagne `settings.edit` (il change la TVA)                                                       | 1         | attendu inverse                                                                                               |
| `revue_lot_b2a`                    | 2 assertions                       | meme cause ; et quatre membres `admin`                                                                   | 1         | les `admin` deviennent `manager` (conception F.1), attendus ajustes                                           |
| `rapports_avances`                 | 1 assertion                        | message `reports.view` devenu `reports.money`                                                            | 1         | motif du message                                                                                              |
| `rapports_par_espace`              | 4 assertions                       | meme cause                                                                                               | 1         | motif du message                                                                                              |
| `flutterwave_anomalies`            | interrompu                         | deux proprietaires dans un restaurant                                                                    | 2         | le super administrateur devient une ligne de plateforme                                                       |
| `battement_et_reglages_plateforme` | interrompu                         | meme cause                                                                                               | 2         | idem                                                                                                          |
| `double_auth_exigee_par_la_base`   | interrompu                         | meme cause                                                                                               | 2         | idem                                                                                                          |
| `intrusion_isolation_lot1`         | interrompu                         | meme cause (deux lignes)                                                                                 | 2         | idem                                                                                                          |
| `reste_donnees_lecture_publique`   | interrompu                         | meme cause                                                                                               | 2         | idem                                                                                                          |
| `flutterwave_payments`             | interrompu a la section 8          | un second proprietaire (desactive) ; un membre `admin`                                                   | 2 et 1    | gerant desactive ; `admin` devient `manager`                                                                  |
| `un_essai_par_proprietaire`        | interrompu                         | quatre `delete from admin_users` sur le proprietaire avant son restaurant                                | 2         | lignes retirees, le restaurant est supprime d'abord                                                           |
| `verrou_plan_commandes`            | interrompu                         | membres inseres avec les declencheurs coupes : ligne sans poste                                          | 2         | le test ecrit `postes`                                                                                        |
| `verrous_plan_suite`               | interrompu                         | meme cause                                                                                               | 2         | idem                                                                                                          |

Aucun fichier rouge hors de ces deux categories. Apres adaptation, les 16 repassent, sans changer leur nombre d'assertions.

Controle contre les assertions creuses : avec un catalogue ferme, `NOT has_tenant_write_permission(..., 'orders.manage')` est vrai pour tout le monde et ne prouve plus rien. Les cinq appels des tests qui passaient encore un code retire ont ete recenses (`grep "permission(.*'(orders.manage|reports.view|orders.view|pos.use|settings.view)'"`) et traduits, y compris celui qui serait reste vert a tort (`garde_argent`, "un gerant a qui on retire orders.manage").

## P3. Retour arriere rejoue, et note N8 (noms des politiques)

Etat compare : pour le schema `public`, toutes les politiques (table, nom, commande, mode, roles, USING, WITH CHECK) et le texte complet (`pg_get_functiondef`) des 11 fonctions que le lot reecrit. Trois instantanes : avant le lot, apres MIG1 a MIG3, apres retour.

N8, noms des politiques avant et apres MIG2 (`diff` des triplets table, nom, commande) :

```
< invitations|tenant_admins_can_insert_invitations|INSERT
< invitations|tenant_admins_can_update_invitations|UPDATE
> poste_permissions|poste_permissions_delete|DELETE
> poste_permissions|poste_permissions_insert|INSERT
> poste_permissions|poste_permissions_select|SELECT
> poste_permissions|poste_permissions_update|UPDATE
```

Seules differences : les deux politiques mortes supprimees (voulu) et les quatre de la nouvelle table. Les 22 politiques repointees ont garde leur nom.

Retour, dans l'ordre, sur une copie de la base ou MIG1 a MIG3 sont appliquees :

```bash
createdb -h 127.0.0.1 -p 57322 -U supabase_admin -T roles_lot1_test roles_lot1_rb
psql "$U/roles_lot1_rb" -X -v ON_ERROR_STOP=1 -f supabase/retour-arriere/20261128100200_retour_gardes_prix_et_proprietaire.sql
psql "$U/roles_lot1_rb" -X -v ON_ERROR_STOP=1 -f supabase/retour-arriere/20261128100100_retour_resolution_par_roles.sql
psql "$U/roles_lot1_rb" -X -v ON_ERROR_STOP=1 -f supabase/retour-arriere/20261128100000_retour_postes_colonnes.sql
```

| Moment                            | Politiques et 11 fonctions, compare a "avant le lot"                                                               | Ancienne suite (tests de `origin/main`)                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| apres les retours de MIG3 et MIG2 | identiques, sauf ce qui releve de MIG1 : les 4 politiques de `poste_permissions` et `accept_invitation_membership` | 1216 assertions passees, 8 fichiers interrompus, tous par une contrainte de MIG1 (ecart E2) |
| apres le retour de MIG1           | `IDENTIQUE` (diff vide)                                                                                            | `1365/1365`, 0 fichier rouge                                                                |

Comparaison de schema complete apres les trois retours, `pg_dump --schema-only --no-owner -n public -n private` de la base d'avant et de la base revenue :

```
<     role text DEFAULT 'admin'::text NOT NULL,
>     role text NOT NULL,
```

Une seule ligne de difference sur tout le schema, droits compris. Elle est voulue : la conception ne retablit pas le DEFAULT `'admin'`.

Temoin : la meme comparaison, faite AVANT le retour de MIG1, rend des differences (ligne 1 du tableau). L'outil sait donc dire non.

Piege rencontre, a connaitre pour rejouer : deux anciens tests incluent une migration par chemin relatif (`\ir ../../migrations/...`). Copier les anciens tests seuls dans un autre dossier les fait echouer pour cette raison, sans rapport avec le lot. Il faut copier `supabase/tests` ET `supabase/migrations` de `origin/main` cote a cote (`git archive origin/main supabase/tests/rls supabase/migrations | tar -x -C <dossier>`).

## P4. Garde du retour arriere : les quatre branches et leur temoin

Pour chaque cas : copie de la base ou MIG1 a MIG3 sont appliquees, memes donnees de base ecrites A L'ANCIENNE (un proprietaire, un `admin` avec `custom_permissions`, un chef avec `custom_permissions`, deux lignes `role_permissions` dont une `admin`, deux invitations dont une `admin`), puis une seule ecriture au nouveau format, puis les retours de MIG3 et de MIG2.

| Cas                  | Ecriture au nouveau format                        | Resultat du retour de MIG2                                                                                         |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| temoin               | aucune                                            | PASSE, le resolveur par postes a disparu                                                                           |
| reglage par personne | `permission_overrides` recoit `menu.price: false` | `retour arriere refuse : 1 reglage(s) par personne, 0 cumul(s) de postes, 0 reglage(s) par poste, 0 invitation(s)` |
| cumul                | `postes = {chef,cashier}`                         | `... 0 reglage(s) par personne, 1 cumul(s) de postes, 0 ..., 0 ...`                                                |
| reglage par poste    | une ligne dans `poste_permissions`                | `... 0, 0, 1 reglage(s) par poste, 0 ...`                                                                          |
| invitation           | une invitation en attente a deux postes           | `... 0, 0, 0, 1 invitation(s)`                                                                                     |

Dans les quatre refus, le bon compteur vaut 1 et les trois autres 0, et le resolveur par postes est toujours en place (toute la transaction est annulee). Le temoin prouve que la garde ne refuse pas tout : des donnees a l'ancien format, `admin` compris, passent.

## P5. Protection du proprietaire et cascade (constat P1 de l'audit)

Fichier `supabase/tests/rls/proprietaire_protege.test.sql`, 31 assertions. Le chemin "le dernier membre supprime son restaurant" passe par la vraie fonction, en role de service :

- `select public.delete_admin_user_atomic(<ligne>, <compte>)` sur le SEUL membre, proprietaire : ne leve rien ; ensuite restaurant, ligne et compte comptent `0/0/0`. La garde laisse donc passer la cascade qui part de `tenants`. Le repli par drapeau de transaction prevu par la conception (D.4) n'a pas ete necessaire et n'a pas ete code.
- le meme appel sur un proprietaire accompagne : `42501 the owner of a live restaurant cannot be removed` ; ensuite `1/4/1`, rien n'a ete supprime.
- `delete from auth.users` sur le compte du proprietaire d'un restaurant ouvert : `42501`, compte et ligne intacts.
- temoins dans le meme fichier : les memes gestes passent sur un serveur et sur un gerant ; le restaurant ferme (`deleted_at`) laisse supprimer la ligne ; `delete from tenants` emporte la ligne du proprietaire.

Temoin de la garde elle-meme : sur une copie de la base, `drop trigger garder_proprietaire_trg on public.admin_users` puis le meme fichier : 15 assertions sur 31 passent au rouge. Le test detecte donc le retrait de la garde.

## P6. Script du super administrateur : le reglage de session, au niveau SQL

La conception (D.2 bis, constat N1) dit que `prevent_super_admin_elevation` refuse tout changement de `is_super_admin` sauf si la transaction pose `request.jwt.claim.role = 'service_role'`. Verifie par des requetes directes (connexion `psql`, comme le fera le script), sur une base ou MIG1 a MIG3 sont appliquees et qui porte une ligne de plateforme (`role = 'super_admin'`) et un proprietaire :

| Operation                                                                                                            | Resultat                                                                                                |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| etat initial, `public.is_super_admin()` sous le jeton de la ligne de plateforme                                      | `true`                                                                                                  |
| revocation dans une transaction qui commence par `select set_config('request.jwt.claim.role', 'service_role', true)` | passe ; `is_super_admin()` rend `false`                                                                 |
| valeur du reglage apres le COMMIT                                                                                    | vide : il ne survit pas a la transaction                                                                |
| temoin : reactivation SANS le reglage                                                                                | `ERROR: Only super_admin users can grant super_admin privileges` (le declencheur est toujours en place) |
| reactivation AVEC le reglage (`is_super_admin = true, is_active = true, deleted_at = null`)                          | passe ; `is_super_admin()` rend `true` ; la ligne porte toujours `role = super_admin`, `postes = {}`    |
| proprietaire : activer puis revoquer le drapeau seul                                                                 | `is_super_admin()` rend `true` puis `false` ; la ligne reste `owner {owner} actif=true` tout du long    |
| temoin : la requete de l'ANCIEN script (`role = 'super_admin'` sur la ligne du proprietaire)                         | `ERROR: the owner poste cannot be granted or removed`                                                   |

Le script JavaScript lui-meme n'est pas modifie dans cette phase (phase B). Cette preuve etablit que le correctif prevu est faisable et que les nouveaux declencheurs ne le genent pas.

## P7. Plans d'execution (conception C, "Performance")

Memes donnees dans une transaction annulee a la fin, sur la base d'avant le lot et sur la base d'apres : deux restaurants, 50 000 lignes d'audit chacun, 500 plats, 500 ingredients, un gerant. Requetes lancees sous le role `authenticated` et le jeton du gerant, avec `explain (analyze, buffers)`. Le nombre d'appels de fonctions vient de `pg_stat_xact_user_functions` (`track_functions = 'all'`).

Lecture de `audit_log`, apres le lot :

```
InitPlan 1
->  Seq Scan on audit_log (actual rows=50000 loops=1)
      Filter: (tenant_id = ANY ((InitPlan 1).col1))
      Rows Removed by Filter: 50000
Execution Time: 12.681 ms
```

| Requete                                 | Avant                                                                   | Apres                         |
| --------------------------------------- | ----------------------------------------------------------------------- | ----------------------------- |
| lecture de `audit_log` (100 000 lignes) | 9,1 et 16,5 ms (deux lancements), sous-requete hachee sur `admin_users` | 13,6 et 12,7 ms, `InitPlan 1` |
| UPDATE de 500 plats (description seule) | 153 ms                                                                  | 1190 ms                       |
| lecture de `ingredients` (500 lignes)   | 0,7 ms, `InitPlan`                                                      | 1,3 ms, `InitPlan`            |

Appels de fonctions pour les quatre requetes, apres le lot : `tenants_avec_droit` 2 (une par lecture de `audit_log`, pour 100 000 lignes chacune), `get_my_inventory_tenant_ids` 1, `has_tenant_write_permission` 1001 (deux par plat mis a jour, comme avant le lot), `tenant_permission_level` 1003, `garder_prix_carte` 500.

Lecture : les politiques de LECTURE sont bien evaluees une fois par requete. L'ecriture en masse coute environ 7 fois plus par appel de garde ; le constat, ses causes et deux variantes mesurees sont dans `ecarts-phase-a.md` (C1).

Le meme controle est rejoue a chaque lancement de la suite par `lectures_une_fois_par_requete.test.sql` : forme des trois politiques lue dans `pg_policies`, presence de `InitPlan` dans le plan, et temoin (une politique ecrite sans la sous-requete est rejetee et son plan ne montre pas d'`InitPlan`).

## P8. Reprise des donnees et migrations rejouables

Sur une copie de la base d'AVANT le lot, des donnees a l'ancien format, puis MIG1 a MIG3 appliquees DEUX fois de suite (`psql --single-transaction -v ON_ERROR_STOP=1`).

Temoin du balayage, lance AVANT les migrations sur cette base : il rend `inventory.edit inventory.view menu.edit orders.manage orders.pay reports.view settings.edit`. Les deux codes que le lot retire (`orders.manage`, `reports.view`) sont bien vus : un "0 litteral hors catalogue" apres application a donc un sens.

Apres application :

| Ligne d'origine                                               | `postes`                         | `permission_overrides`                                                                                                           |
| ------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `owner`                                                       | `{owner}`                        | NULL                                                                                                                             |
| `admin`, `custom_permissions = {"menu.edit": false}`          | `{manager}`                      | `{"menu.edit": false, "menu.price": false, "billing.manage": true}`                                                              |
| `chef`, `{"orders.manage": false, "settings.view": true}`     | `{chef}`                         | les cinq refus (`orders.take`, `kitchen.track`, `orders.cancel`, `orders.refund`, `orders.discount`) ; `settings.view` abandonne |
| `super_admin`                                                 | `{}`                             | NULL                                                                                                                             |
| invitation `admin` en attente                                 | `{manager}`                      | `{"billing.manage": true}`                                                                                                       |
| invitation `waiter`, `{"pos.use": false}`                     | `{waiter}`                       | `{"orders.take": false}`                                                                                                         |
| invitation `chef` expiree                                     | `{chef}`                         | NULL                                                                                                                             |
| `role_permissions` du role `chef`, `{"inventory.edit": true}` | ligne `poste_permissions` `chef` | `{"inventory.edit": true, "suppliers.manage": true}`                                                                             |
| `role_permissions` du role `admin`                            | non reprise                      | `NOTICE: reprise des postes : 1 ligne(s) role_permissions du role admin non reprise(s)`                                          |

`private.droits_hors_catalogue()` rend 0 ligne. Apres la seconde passe : aucune erreur, et l'etat (politiques et 11 fonctions) est identique a celui de la base de test (`diff` vide). Les trois fichiers sont donc rejouables.

## P9. Temoins des gardes, joues une fois sur une copie

| Garde                   | Affaiblissement volontaire                                                  | Effet sur son test                                                                                           |
| ----------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| matrice                 | une case fausse dans le tableau d'attendus (`('chef','orders.pay','full')`) | `postes_matrice_par_poste` : 2 assertions rouges ; case remise, 245 sur 245                                  |
| prix                    | `alter function public.garder_prix_carte() security definer`                | `prix_carte_garde` : 9 assertions rouges sur 24 (en DEFINER la garde ne se declenche plus)                   |
| proprietaire            | `drop trigger garder_proprietaire_trg`                                      | `proprietaire_protege` : 15 assertions rouges sur 31                                                         |
| choix INVOKER du report | bascule en SECURITY DEFINER dans le test lui-meme, a chaque lancement       | `transition_anciens_roles`, cas 6 bis : la meme ecriture en aal1 passe alors, ce que le mode INVOKER empeche |
| balayage du catalogue   | politique et fonction temporaires portant un code faux, a chaque lancement  | `catalogue_droits_codes_connus` : le balayage les trouve et les nomme                                        |

## P10. Copies du retour arriere (note N9)

Test du depot : `src/lib/__tests__/retour-arriere-roles-copies.test.ts`, 41 cas, lance par `pnpm test` (donc par la CI et par le crochet de pre-commit).

- les 10 fonctions du retour de MIG2 et celle du retour de MIG1 sont identiques a `supabase/schema.sql`, caractere pour caractere ; les 24 politiques aussi ;
- temoin : un seul caractere change dans une copie fait echouer la comparaison ;
- aucune migration posterieure a l'instantane, hors les trois du lot, ne redefinit l'une de ces fonctions ni ne cite l'une de ces politiques (temoin : la detection voit bien MIG2) ;
- N8 : MIG2 recree exactement 22 politiques sous leur ancien nom et en supprime 2.

A relancer le jour de l'application en production.

## P11. Migrations differees, essayees sur le banc

Elles ne sont pas dans `supabase/migrations/` et ne sont jouees par aucun outil. Elles ont ete appliquees a la main sur une copie de la base de P8, dans l'ordre, pour verifier qu'elles tiennent debout.

MIG4 (`supabase/migrations-differees/20261128110000_contraction_anciens_reglages.sql`) : s'applique sans erreur. L'ancien administrateur perd `billing.manage` (il garde `{"menu.edit": false, "menu.price": false}`), l'invitation `admin` en attente n'a plus de reglage, la table `role_permissions` et les deux colonnes `custom_permissions` ont disparu. Sur cette base, 20 fichiers pgTAP sont rouges : ce sont ceux qui ecrivent encore `custom_permissions` ou `role_permissions`. C'est attendu, et l'en-tete du fichier dit de les adapter dans la PR de MIG4.

MIG5 (`A_DATER_retrait_admin_et_colonne_role.sql`), par-dessus MIG4 : s'applique sans erreur, les colonnes `role` ont disparu. Essai de fumee ensuite, dans une transaction annulee :

| Appel                                                                              | Resultat                                                   |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `provision_signup_tenant`                                                          | cree le restaurant, le proprietaire porte `{owner}`        |
| invitation ecrite `{waiter,cashier,waiter}`                                        | normalisee en `{cashier,waiter}`                           |
| `accept_invitation_membership`                                                     | le membre porte `{cashier,waiter}`, `orders.pay` en entier |
| `is_super_admin()` pour la ligne de plateforme (drapeau seul)                      | `true` ; pour le proprietaire : `false`                    |
| retirer `owner` au proprietaire                                                    | `the owner poste cannot be granted or removed`             |
| `delete_admin_user_atomic` sur un serveur, puis sur le dernier membre proprietaire | `true`, `true` ; il reste 0 restaurant                     |

Ces deux fichiers seront a rejouer le jour venu : d'autres migrations auront touche la base d'ici la, et leur garde d'empreinte s'en assurera.

## P12. Portes de qualite du depot

| Porte                                                                         | Resultat                              |
| ----------------------------------------------------------------------------- | ------------------------------------- |
| `pnpm typecheck`                                                              | rc 0                                  |
| `pnpm lint --max-warnings 0`                                                  | rc 0                                  |
| `pnpm test`                                                                   | 475 fichiers, 4938 tests, tous passes |
| `pnpm build`                                                                  | rc 0                                  |
| caracteres hors ASCII dans les fichiers SQL et TypeScript ajoutes ou modifies | aucun                                 |

## Nettoyage

Bases jetables creees puis supprimees : `roles_lot1_base`, `roles_lot1_test`, `roles_lot1_rb`, `roles_lot1_reprise`, `roles_lot1_g_*` (cinq), `roles_lot1_perf`, `roles_lot1_m4`, `roles_lot1_m5`, `roles_lot1_journeys`. Les douze roles que nomme `bootstrap.sql` existaient deja sur le serveur du banc (identifiants anterieurs a toutes ces bases), et `service_role` y portait deja `BYPASSRLS` : le bootstrap n'y a rien cree ni change.
