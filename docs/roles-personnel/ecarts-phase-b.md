# Lot 1 des roles, phase B (code de l'application) : ecarts, decisions et preuves

Date : 2026-11-28. Branche `feat/roles-postes-lot1`. Reference : `conception-lot1.md` (version 3), `audit-conception-lot1.md`, `ecarts-phase-a.md`, `preuves-phase-a.md`.

Regle suivie, la meme qu'en phase A : la ou la conception etait fausse, impossible ou muette, la variante la plus sure a ete codee, et elle est ecrite ici avec sa raison. Aucun site d'appel n'a ete abandonne en silence.

## 1. Decision sur la performance de la garde d'ecriture (constat C1 de la phase A)

### Ce qui etait demande

Evaluer la variante mesuree a 446 ms en phase A (resolveur en plpgsql, et `private.matrice_postes()` sans `SET search_path`), et ne l'adopter que si elle garde toutes les garanties.

### Mesures du 2026-11-28, banc local, base jetable

Meme scenario que la phase A : un gerant, sous le role `authenticated` et son jeton, met a jour la description de 500 plats (la garde est appelee deux fois par ligne, 1001 appels). Trois lancements par variante.

| Variante                                                                           | UPDATE de 500 plats | Suite pgTAP complete                                                                       |
| ---------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| Etat de la phase A (deux fonctions en LANGUAGE sql)                                | 1226 a 1598 ms      | verte                                                                                      |
| Resolveur en plpgsql seul                                                          | 497 a 653 ms        | non rejouee                                                                                |
| Variante dite "446 ms" : resolveur en plpgsql, `matrice_postes()` sans search_path | 191 a 210 ms        | ROUGE : `privileges_fonctions_droits`, assertion 64 "chaque fonction fixe son search_path" |
| Variante retenue : resolveur ET matrice en plpgsql, `SET search_path = ''` partout | 200 a 239 ms        | verte, 2030 sur 2030                                                                       |

Les chiffres absolus different de ceux de la phase A (autre charge de la machine ce jour-la). L'ordre des variantes est le meme.

### Decision

La variante "446 ms" est ECARTEE. Elle retire a `private.matrice_postes()` le reglage `search_path` que la conception exige pour toutes les fonctions du lot, et elle fait echouer un test de la suite. L'adopter aurait demande d'affaiblir ce test.

Une troisieme variante, que la phase A n'avait pas mesuree, donne presque le meme gain sans rien retirer : passer AUSSI `matrice_postes()` en plpgsql. La cause du cout n'etait pas le `search_path` lui-meme : PostgreSQL 17 replanifie a chaque appel une fonction en LANGUAGE sql non integrable, donc les 86 lignes de VALUES etaient replanifiees 1001 fois. En plpgsql le plan est garde en memoire par session.

Cette variante est ADOPTEE, dans une migration nouvelle : `supabase/migrations/20261128100300_resolution_plus_rapide.sql`. MIG1 a MIG3 ne sont pas modifiees.

Garanties verifiees une par une :

| Garantie                                                         | Preuve                                                                                                                                                                           |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memes resultats sur toute la suite pgTAP                         | 2030 sur 2030, 79 fichiers, sur une base jetable neuve avec les quatre migrations                                                                                                |
| Chemin du proprietaire, double authentification, cumul, reglages | `postes_matrice_par_poste` 245, `double_auth_et_proprietaire` 20, `postes_cumul` 17, `postes_reglage_par_personne` 12, `postes_cas_partages` 42                                  |
| Code hors catalogue refuse                                       | `catalogue_droits_codes_connus` 22, et `postes_cas_partages` (8 codes, proprietaire et gerant)                                                                                   |
| `search_path` fixe sur chaque fonction, memes privileges         | `privileges_fonctions_droits` 68 sur 68 (CREATE OR REPLACE conserve les privileges)                                                                                              |
| Meme requete                                                     | le corps de la requete est recopie mot pour mot ; les 86 triplets sont recopies par programme                                                                                    |
| Parite TypeScript et SQL                                         | `permission-defaults-sql.test.ts` lit la DERNIERE definition, donc ce fichier                                                                                                    |
| Retour arriere                                                   | `supabase/retour-arriere/20261128100300_retour_resolution_plus_rapide.sql`, joue sur le banc : les 7 fichiers pgTAP de la resolution repassent, la duree remonte a 827 a 1241 ms |
| Note N9                                                          | le test `retour-arriere-roles-copies.test.ts` reste vert : la nouvelle migration ne touche aucune des 10 fonctions ni des 24 politiques qu'il surveille                          |

Le script de retour de cette migration est optionnel : les retours de MIG2 et de MIG1 suppriment de toute facon ces deux fonctions. L'ordre d'un retour complet reste MIG3, MIG2, MIG1. Un test Vitest verifie que les deux corps du script de retour sont identiques a leur definition d'origine.

Ce qui reste vrai : une ecriture en masse coute encore environ 1,4 fois ce qu'elle coutait avant le lot (153 ms mesures en phase A, 200 a 239 ms ici). La voie complete (une evaluation par requete pour les politiques d'ecriture) touche une centaine de politiques et reste hors du lot 1.

## 2. La conception etait fausse ou impossible

### B1. Table de traduction TypeScript `permissions-legacy.ts` : non creee

- Conception : D.2 et F.2 prevoient `src/lib/permissions-legacy.ts` (`legacyToNew`) et son test `permission-migration.test.ts`.
- Constat : aucun code de l'application n'a besoin de cette table. La traduction des anciens reglages est faite par la base (`private.droits_depuis_anciens`, `private.fusion_anciens_droits`) et testee par pgTAP (`transition_anciens_roles`, 61 assertions). Une copie TypeScript sans appelant serait du code mort, et une seconde table a tenir egale a la premiere.
- Code : les deux fichiers n'existent pas. Consequence sur le balayage 4 : il n'a plus d'exclusion a faire pour eux, voir section 5.

### B2. Mise a jour d'un plat : refus seulement si le prix CHANGE

- Conception : D.2, "quand le payload contient `price` ou `prices`, exiger `['menu.edit', 'menu.price']`".
- Constat : le formulaire d'un plat renvoie toujours `price` et `prices`, meme inchanges. Appliquee a la lettre, la regle empechait un membre sans `menu.price` de corriger une description ou une photo.
- Code : `actionUpdateMenuItem` exige `menu.edit`. Sans `menu.price`, il lit le prix stocke, refuse AVANT toute ecriture si le prix change, et retire les champs de prix de l'ecriture sinon. C'est la regle du declencheur `garder_prix_carte` de la base. Tests : `menu-items-update.action.test.ts`.

### B3. `FeatureUpgradeWall` : `billing.manage` (niveau borne compris), pas `settings.edit`

- Conception : D.2 range `FeatureUpgradeWall:55` avec les pages de reglages (`settings.edit`).
- Constat : le bouton mene a `/subscription`, qui s'ouvre avec `billing.manage` au niveau borne. Avec `settings.edit`, un membre a qui l'on a retire `billing.manage` voyait un bouton menant a `/unauthorized`.
- Code : meme exigence que la page (`BILLING_READ`).

### B4. `scripts/repeter-migration-rls.sh` : inchange

- Conception : D.2 le liste parmi les fichiers qui "ecrivent `postes`".
- Constat : ce script charge un instantane de schema qui peut dater d'avant le lot, ou la colonne `postes` n'existe pas. Y ecrire `postes` le casserait.
- Code : il continue d'ecrire `role`, que le declencheur de synchronisation traduit quand le lot est applique.

### B5. `tests/integration/reminders/engine.test.ts:104` : deja dans le bon ordre

Le nettoyage supprime deja les restaurants avant les comptes (`teardownTenantBySlug` puis `deleteUser`). Aucun changement n'etait necessaire. Verifie par lecture ; non rejoue, voir section 6.

### B6. Passe-droit du super administrateur : non etendu

- Conception : elle renvoie plusieurs routes a `resolveAdminPermission`.
- Constat : cette fonction accorde tout a un super administrateur de la plateforme, meme non membre. Les routes d'abonnement, de factures, d'invitations et de prise en charge d'une commande exigeaient jusqu'ici une vraie ligne de membre. Les brancher telles quelles aurait donne a la plateforme le portail de facturation d'un client.
- Code : une fonction `resolveLiveMember` (meme fichier) ne rend que le membre vivant du restaurant, sans passe-droit. Ces routes l'utilisent. Aucun acces n'est elargi.

### B7. Balayages : deux exclusions que la conception ne prevoyait pas

Voir section 5 : `tests/journeys/fixtures/schema.sql` (instantane gele) et `retour-arriere-roles-copies.test.ts` (test N9 de la phase A).

## 3. La conception etait muette : choix faits

### B8. Annuler ou renvoyer une invitation

La conception donne la regle pour un membre (`canActOnMember`), pas pour une invitation. Meme regle appliquee (`src/lib/auth/invitation-authority.ts`) : il faut `team.manage`, et les droits que l'invitation donnerait doivent etre strictement inclus dans ceux de l'appelant. Un gerant ne touche pas a l'invitation d'un autre gerant ; le proprietaire agit sur toutes.

### B9. Echec ferme avec plusieurs postes

L'ancienne regle ("refuser si la lecture des reglages du role echoue et que ce reglage decide") ne se transpose pas mot pour mot au cumul. Regle codee (`getFailClosedLevels`) : si la lecture de `poste_permissions` echoue, seuls le proprietaire et le reglage par personne a `true` decident ; tout le reste est refuse. Une panne ne rend jamais un droit que le restaurant a retire.

### B10. Barre du bas sur telephone

Elle etait choisie par role. Avec le cumul : les onglets du premier poste dans l'ordre canonique, filtres ensuite par les droits effectifs. Les 6 nouveaux postes ont leur liste.

### B11. Boutons "ajouter un plat"

Creer un plat exige `menu.edit` et `menu.price` cote serveur. Les deux boutons d'ajout (liste des plats, palette de commandes) exigent maintenant les deux, pour ne pas mener a un refus.

### B12. Libelles

- Le proprietaire s'affiche "Proprietaire" (libelle du cahier des charges) au lieu de "Administrateur general".
- Les libelles par segment (`segment.*.roleChef`, `roleWaiter`) ne sont pas touches : ce sont des mots de metier, pas des droits. La conception les citait.
- La console de la plateforme affiche les postes d'un membre, et la valeur `role` seulement pour une ligne de plateforme sans poste.

### B13. Script `manage-super-admin.js`

Les regles de D.2 bis sont dans `scripts/lib/super-admin-ops.cjs`, separees du script pour etre testees. L'adresse visee peut etre changee par `SUPER_ADMIN_EMAIL` (defaut inchange). Le script rend maintenant un code d'erreur non nul en cas d'echec.

### B14. `scripts/create-superadmin.ts`

Il ecrit `role: 'super_admin'`, `is_super_admin: true`, `postes: []` au lieu de la valeur invalide `'superadmin'`. Limite connue, non verifiee : le script ecrit par l'API de la base, et le declencheur `prevent_super_admin_elevation` ne lit que le reglage `request.jwt.claim.role`. Selon la version de l'API, ce reglage peut manquer et l'insertion etre refusee. Aucune pile Supabase n'etait disponible pour le prouver. Le chemin sur est `manage-super-admin.js`.

### B15. Document du proprietaire et Prettier

`docs/roles-personnel/cahier-des-charges.html`, ajoute en phase A, faisait echouer `pnpm format:check` (la phase A n'avait pas lance cette porte). Il est ajoute a `.prettierignore` plutot que reformate : c'est le document valide par le proprietaire.

## 4. Fichiers proteges

Aucun fichier protege n'est modifie : `src/proxy.ts`, `src/app/globals.css`, `src/lib/supabase/admin.ts`, `src/lib/supabase/middleware.ts`, `src/lib/rate-limit.ts`, `src/app/api/webhooks/stripe/route.ts`, `src/services/order.service.ts`, `src/services/signup.service.ts`, `src/contexts/CartContext.tsx`, `next.config.mjs`, `src/components/ui/*`.

`signup.service.ts:109` continue d'ecrire `role: 'owner'` ; la base en deduit `postes = {owner}`. `proxy.ts` transmet sans la lire l'exigence rendue par `permissionForAdminSubPath`, dont le type s'est elargi : aucune ligne n'a eu a changer.

## 5. Balayages de fin de lot (conception D.2)

Comptes AVANT le travail (temoins positifs, tous superieurs a zero) : commande 1 : 659 lignes ; commande 2 : 91 ; commande 3 : 155 ; commande 4 : 171.

Apres le travail :

| Commande                                  | Resultat                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| 2. Anciennes constantes                   | 0 ligne                                                                                   |
| 3. Anciennes colonnes, hors types generes | 21 lignes, toutes dans `tests/journeys/fixtures/schema.sql`                               |
| 3. Sans aucune exclusion (temoin)         | deux fichiers : `src/types/database.generated.ts` et `tests/journeys/fixtures/schema.sql` |
| 4. Anciens codes, sans exclusion          | 3 lignes, toutes dans `src/lib/__tests__/retour-arriere-roles-copies.test.ts`             |
| 1. Lectures de `role`                     | 219 lignes, classees ci-dessous                                                           |

Deux exclusions a ajouter aux commandes de la conception, pour la meme raison que `database.generated.ts` :

- `tests/journeys/fixtures/schema.sql` est un instantane gele du schema (marqueur 20260628000000). Il decrit l'ancien etat par construction et se regenere, il ne se corrige pas a la main.
- `src/lib/__tests__/retour-arriere-roles-copies.test.ts` est le test N9 de la phase A. Il verifie que le script de retour retablit l'ancien etat, donc il cite `'orders.manage'` et `'reports.view'`.

Le temoin de la commande 3 tient : relancee sans exclusion, elle rend bien le fichier exclu.

Classement des 219 lignes de la commande 1. Aucune ne decide un droit de restaurant a partir de `role`.

| Categorie                                                                                                                                                                                   | Lignes | Fichiers principaux                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Attribut ARIA ou HTML `role=`, composants `src/components/ui`                                                                                                                               | 80     | composants                                                                                                                                                                                                   |
| Role technique de la base (`service_role`, role PostgREST)                                                                                                                                  | 24     | commentaires, scripts                                                                                                                                                                                        |
| Reconnaissance du super administrateur (`role = 'super_admin'`)                                                                                                                             | 37     | `get-session`, `resolve-admin-permission`, `require-super-admin`, `target-account-scope`, `post-login-destination`, `account-deletion.service`, pages `admin/tenants` et `admin/platform`, `revalidate-menu` |
| Scripts de seed et d'application (commentaires, journaux)                                                                                                                                   | 14     | `seed-demo.ts`, `seed-qa.ts`, `appliquer-rls-lot-20261108.sh`, `repeter-migration-rls.sh` (B4)                                                                                                               |
| Siege de l'ancien administrateur (`role = 'admin'`, transition jusqu'au lot 4)                                                                                                              | 8      | `plan-enforcement.service.ts`, `actions/admin.ts`                                                                                                                                                            |
| Ecriture protegee                                                                                                                                                                           | 1      | `signup.service.ts:109`                                                                                                                                                                                      |
| Commentaires, messages affiches ("Votre role ne permet pas"), nom du fichier `role-config`, autre sens du mot (message d'IA, contexte Stripe, sous-traitants de la page de confidentialite) | 55     | divers                                                                                                                                                                                                       |

## 6. Ce que la phase B n'a pas pu prouver

| Preuve demandee                                                                                                             | Etat                            | Raison                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Verification a l'ecran des ecrans modifies (Equipe, droits par poste, navigation), aux cinq largeurs, en clair et en sombre | NON FAITE                       | il faut l'application en marche sur une base qui porte les migrations du lot. La base du banc ne les porte pas et il etait interdit d'y toucher. La regle 11 du depot l'exige avant fusion |
| Parcours Playwright 03, 04, 08, et l'extension prevue de 03 (chef, serveur et caissier)                                     | NON FAITS, extension NON ECRITE | `scripts/run-journeys-local.sh` demarre et arrete une pile Supabase : interdit dans cette phase. Les fixtures des parcours ecrivent `postes` mais n'ont pas ete rejouees                   |
| Tests d'integration (`tests/integration`)                                                                                   | NON REJOUES                     | ils demandent l'API d'une pile Supabase                                                                                                                                                    |
| Ancien code lance contre la nouvelle base (E.2 etape 2)                                                                     | NON FAIT                        | meme raison                                                                                                                                                                                |
| MIG1 a MIG3 par-dessus l'instantane gele des parcours                                                                       | NON FAIT                        | meme raison (deja signale en phase A)                                                                                                                                                      |
| Les deux seeds lances deux fois de suite, avec le restaurant temoin                                                         | NON FAIT sur une base           | la logique de nettoyage est testee avec un client simule (`seed-accounts.test.ts`), pas contre une vraie pile                                                                              |
| Controles E.0 en production                                                                                                 | NON FAITS                       | aucune connexion a la production, par consigne                                                                                                                                             |
| Cycle du script du super administrateur                                                                                     | FAIT sur le banc                | `scripts/__tests__/manage-super-admin.test.sh`, 16 sur 16 avec la base jetable (11 sans base, en CI) ; le script lui-meme exige une connexion chiffree et n'a pas ete lance contre le banc |

## 7. Restes connus

- `SettingsForm` garde un mode lecture seule (champs desactives sans `settings.edit`) que plus personne n'atteint : la page et le garde du composant exigent tous deux `settings.edit`. Le retirer touche un composant enfant ; il est laisse comme defense, et signale ici.
- Decision G.c du proprietaire inchangee : tant que le lot 2 n'est pas livre, le chef ne voit pas le chiffre d'affaires a l'ecran, mais la base le laisse encore lire les commandes et les paiements.
- MIG4 et MIG5 restent dans `supabase/migrations-differees/`. La PR de MIG4 devra regenerer les types et l'instantane des parcours, puis relancer les commandes 3 et 4 sans exclusion.

## 8. Portes de qualite

| Porte                           | Resultat                                                         |
| ------------------------------- | ---------------------------------------------------------------- |
| `pnpm typecheck`                | 0 erreur                                                         |
| `pnpm lint --max-warnings 0`    | 0 erreur, 0 avertissement                                        |
| `pnpm format:check`             | conforme                                                         |
| `pnpm test`                     | 478 fichiers, 5584 tests, tous passes                            |
| `pnpm build`                    | code de retour 0                                                 |
| `scripts/run-pgtap.sh --db-url` | 79 fichiers, 2030 sur 2030                                       |
| Tests des scripts               | `manage-super-admin` 11 sur 11 sans base, 16 sur 16 avec le banc |

Temoins negatifs joues une fois : une case fausse dans `POSTE_MATRIX` fait echouer le test de parite (2 tests rouges) ; un attendu faux dans `tests/fixtures/permission-cases.json` fait echouer a la fois Vitest (1 test) et pgTAP (assertion 5 de `postes_cas_partages`).

Bases jetables creees puis supprimees sur le banc : `roles_lot1_b_test` (deux fois), `roles_lot1_b_perf` (deux fois). Aucune autre base touchee, aucun conteneur arrete, aucun fichier `.env` lu.
