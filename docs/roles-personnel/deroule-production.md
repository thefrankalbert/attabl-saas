# Lot 1 des roles : deroule de mise en production

Date : 2026-11-28. Etat au 2026-11-28 : les cinq migrations sont appliquees et verifiees en production, le code du lot 1 est fusionne (PR #514, commit `542f7452`) et servi. Il reste la contraction (MIG4, section 7), puis la regeneration de `supabase/schema.sql` et des types.

Ce document est la consigne d'application. Il complete la section E.2 de `conception-lot1.md` et la remplace la ou les deux different : il connait les CINQ migrations du lot, la conception d'origine n'en connaissait que trois.

## 1. La regle d'ordre, a lire avant tout

**Quatre migrations s'appliquent en production AVANT la fusion du code (20261128100000 a 20261128100300). La cinquieme (20261128100400) s'applique APRES, des que le nouveau code est servi. Jamais dans un autre ordre.**

Pourquoi les quatre premieres avant. Le nouveau code lit `postes` partout : a la connexion (`src/app/api/login/route.ts`), dans le proxy et dans chaque garde (`src/lib/auth/resolve-admin-permission.ts`, `src/lib/auth/get-session.ts`). Si le code est fusionne avant les migrations, la colonne `postes` n'existe pas : toute l'equipe de tous les restaurants est refusee. Et le workflow `promote-prod` sert un commit fusionne en trois minutes environ : il n'y a pas de delai pour se rattraper. Rien ne l'empeche a part cette consigne.

Dans l'autre sens, l'ordre est sans danger : l'ancien code tourne sur la nouvelle base (preuve dans `preuves-corrections.md`, "Ancien code contre nouvelle base").

Pourquoi la cinquieme apres. Elle RETIRE un geste : poser "en preparation" ou "pret" sans le droit `kitchen.track`. L'ancien code offre encore ces deux boutons au serveur et au caissier. Mesure du 2026-11-28, ancien code contre la nouvelle base avec cette migration : le serveur qui passe une commande "en preparation" recoit une erreur 500 ("Erreur lors de la mise a jour du statut"), que la file hors ligne de la tablette rejoue comme une panne passagere. Une migration qui retire un acces passe apres le code qui cesse de l'offrir, pas avant. Le nouveau code ne depend pas d'elle : il refuse deja ce geste lui-meme (parcours 03 joue SANS cette migration : 7 sur 7).

A ecrire en tete de la PR, mot pour mot : "NE PAS FUSIONNER avant que les quatre migrations 20261128100000 a 20261128100300 soient appliquees et verifiees en production. Appliquer 20261128100400 juste apres la mise en service du code."

## 2. Les cinq migrations, dans cet ordre

| Ordre | Fichier                                                  | Ce qu'il fait                                                                                                           |
| ----- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1     | `20261128100000_postes_colonnes_et_reprise.sql`          | colonnes `postes` et `permission_overrides`, table `poste_permissions`, reprise des donnees, declencheurs de transition |
| 2     | `20261128100100_resolution_par_postes_et_politiques.sql` | resolution des droits par postes et toutes les politiques repointees, dans une seule transaction                        |
| 3     | `20261128100200_gardes_prix_et_proprietaire.sql`         | garde du prix (modification, creation et suppression d'un supplement payant), protection du proprietaire                |
| 4     | `20261128100300_resolution_plus_rapide.sql`              | meme resolution, en plpgsql : sans elle la garde d'ecriture reste six fois plus lente (1,2 a 1,6 s pour 500 lignes)     |
| 5     | `20261128100400_garde_statut_cuisine.sql`                | poser "en preparation" ou "pret" sur une commande exige `kitchen.track`. APRES la mise en service du code (section 1)   |

| 6 | `20261128120000_contraction_anciens_reglages.sql` | MIG4 : retire `custom_permissions`, `role_permissions` et leurs traductions. En production AVANT la fusion de sa PR (section 7) |

Commande : `scripts/appliquer-migrations-ciblees.sh --confirmer <fichiers, dans l'ordre>`, en deux fois : les quatre premiers avant la fusion, le cinquieme apres. Jamais `supabase db push`, jamais `pnpm db:migrate:prod`.

Atomicite : chaque fichier porte son `BEGIN` et son `COMMIT`. L'atomicite est par fichier, pas par lot. Si un fichier echoue, les precedents restent appliques : on corrige ce fichier et on le relance seul. Les fichiers 1 et 2 doivent passer ensemble (le fichier 1 seul ne change pas la resolution ; le fichier 2 sans le 1 echoue).

Apres chaque fichier, verifier sa ligne dans `supabase_migrations.schema_migrations` ET l'existence d'un objet qu'il cree (le suivi seul n'est pas fiable sur ce projet) :

```sql
-- 1 : la colonne et la table
SELECT count(*) FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'admin_users' AND column_name = 'postes';   -- 1
SELECT to_regclass('public.poste_permissions') IS NOT NULL;                                  -- t
-- 2 : le resolveur, et plus aucun litteral hors catalogue
SELECT to_regprocedure('public.tenant_permission_level(uuid, text)') IS NOT NULL;            -- t
SELECT count(*) FROM private.droits_hors_catalogue();                                        -- 0
-- 3 : les deux gardes, dont la suppression d'un supplement
SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
 WHERE tgname IN ('trg_item_modifiers_prix', 'trg_menu_items_prix', 'garder_proprietaire_trg');
--     trg_item_modifiers_prix doit dire "BEFORE INSERT OR DELETE OR UPDATE"
-- 4 : la resolution est bien en plpgsql
SELECT l.lanname FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
 WHERE p.oid = 'private.matrice_postes()'::regprocedure;                                     -- plpgsql
-- 5 : la garde des statuts de cuisine
SELECT count(*) FROM pg_trigger
 WHERE tgname IN ('trg_orders_statut_cuisine', 'trg_order_items_statut_cuisine');            -- 2
```

## 3. Controles prealables (lecture seule, AVANT d'appliquer)

Les sept controles E.0 de la conception restent requis. Les audits et le contre-audit du 2026-11-28 en ajoutent cinq.

### 3.1 Reglages poses sur l'ancien role administrateur (audit de securite L2)

La reprise ne recopie PAS les lignes `role_permissions` du role `admin` : ce role disparait, et son reglage ne doit pas devenir celui du poste Gerant. Un proprietaire qui avait retire un droit a ses administrateurs les retrouverait gerants avec toute la matrice du gerant. A lister avant d'appliquer :

```sql
SELECT rp.tenant_id, t.slug, k.key AS droit, k.value AS valeur
FROM role_permissions rp
JOIN tenants t ON t.id = rp.tenant_id
CROSS JOIN LATERAL jsonb_each(rp.permissions) k
WHERE rp.role = 'admin'
ORDER BY t.slug, k.key;
```

Pour chaque ligne dont la valeur est `false` : apres la migration 1, reporter le refus a la main sur les personnes concernees (les anciens administrateurs de ce restaurant), dans `permission_overrides`, avec le code du nouveau catalogue. Si la requete ne rend aucune ligne : rien a faire, et le noter.

Meme chose pour les refus `orders.view: false` et `settings.view: false` d'un reglage par personne : ils n'ont pas d'equivalent dans le nouveau catalogue. Le controle E.0 numero 4 les liste ; le controle numero 6 couvre le cas du gerant.

### 3.2 Qui paie l'abonnement sans etre proprietaire (audits, decision G.f)

A lancer APRES la migration 1 et de nouveau juste AVANT MIG4 :

```sql
SELECT a.id, a.tenant_id, t.slug, a.role, a.postes, a.is_active
FROM admin_users a
JOIN tenants t ON t.id = a.tenant_id
WHERE NOT ('owner' = ANY (a.postes))
  AND a.deleted_at IS NULL
  AND (a.permission_overrides -> 'billing.manage') = 'true'::jsonb
ORDER BY t.slug;
```

Apres la migration 1, les seules lignes attendues sont les anciens administrateurs (`role = 'admin'`) : ils gardent le paiement tant que l'ancien code les sert. Toute autre ligne est a faire trancher par le proprietaire, une par une. MIG4 retire le reglage des lignes `role = 'admin'` et LISTE les autres dans sa sortie (`NOTICE`), sans y toucher.

Les deux chemins par lesquels un ancien administrateur gardait le paiement pour toujours sont fermes : ses postes changent (le declencheur retire le reglage), ou une invitation `admin` est acceptee (le reglage n'est plus copie).

### 3.3 Proprietaire desactive sans etre banni ni retire

La migration 3 refuse desormais `is_active = false` seul sur le proprietaire d'un restaurant ouvert. Les lignes deja dans cet etat ne sont pas touchees, mais il faut les connaitre :

```sql
SELECT a.id, a.tenant_id, t.slug FROM admin_users a
JOIN tenants t ON t.id = a.tenant_id
WHERE a.role = 'owner' AND a.is_active IS FALSE
  AND a.banned_at IS NULL AND a.deleted_at IS NULL AND t.deleted_at IS NULL;
```

### 3.4 Aucune migration du lot deja appliquee (contre-audit N6)

Trois corrections des audits ont ete faites DANS les fichiers `20261128100000` et `20261128100200`, parce qu'ils n'etaient appliques nulle part. Si l'un d'eux l'avait ete, la base porterait leur ancienne version et il faudrait les rejouer. A verifier avant l'etape 4 :

```sql
SELECT version FROM supabase_migrations.schema_migrations WHERE version LIKE '2026112810%' ORDER BY 1;
-- et, parce que ce suivi n'est pas fiable sur ce projet, par un objet :
SELECT to_regclass('public.poste_permissions') IS NOT NULL AS mig1_deja_la,
       to_regprocedure('public.garder_prix_carte()') IS NOT NULL AS mig3_deja_la;
```

Attendu : aucune ligne, puis `f` et `f`. Sinon : arret. Rejouer d'abord les fichiers concernes (ils sont idempotents), et verifier le corps stocke de `private.sync_postes_admin_users`, `public.accept_invitation_membership`, `public.garder_prix_carte` et `private.garder_proprietaire`.

### 3.5 Restaurants ou personne d'autre que le proprietaire et le gerant ne suit la cuisine (contre-audit N6)

Apres la fusion, seul qui detient `kitchen.track` passe une commande "en preparation" ou "prete". Dans un restaurant sans chef, cuisinier, barman ni equipier, seuls le proprietaire et le gerant le pourront : le serveur et le caissier perdent ces deux boutons. A lancer APRES la migration 2 et AVANT la fusion, pour prevenir les bons proprietaires :

```sql
SELECT t.id, t.slug, t.name
FROM tenants t
WHERE t.deleted_at IS NULL AND t.is_active
  AND NOT EXISTS (
    SELECT 1
    FROM admin_users a
    LEFT JOIN poste_permissions pp ON pp.tenant_id = a.tenant_id AND pp.poste = ANY (a.postes)
    WHERE a.tenant_id = t.id AND a.is_active AND a.deleted_at IS NULL
      AND NOT (a.postes && ARRAY['owner', 'manager'])
      AND (
        (a.permission_overrides -> 'kitchen.track') = 'true'::jsonb
        OR (NOT (coalesce(a.permission_overrides, '{}'::jsonb) ? 'kitchen.track')
            AND a.postes && ARRAY['chef', 'cook', 'bartender', 'crew', 'production']
            AND (pp.permissions -> 'kitchen.track') IS DISTINCT FROM 'false'::jsonb)
      )
  )
ORDER BY t.slug;
```

La requete est volontairement large : elle liste un restaurant des qu'aucun autre membre ne tient le droit par son poste ou par son reglage. Pour chaque restaurant rendu : dire au proprietaire, avant la fusion, que le serveur et le caissier ne passeront plus une commande "en preparation" ni "prete", et qu'il peut donner "Suivre en cuisine ou au bar" au poste ou a la personne de son choix depuis l'ecran des droits. La cinquieme migration (etape 6 bis) ne change rien de plus pour eux : l'application refuse deja ces gestes des la fusion.

## 4. Le deroule

1. Sauvegarde (procedure habituelle), les sept controles E.0 et les cinq controles de la section 3 (3.2 et 3.5 se lancent apres les premieres migrations, comme ils le disent). Resultats archives.
2. Repetition sur le banc : instantane, les migrations, suite pgTAP, script de retour arriere rejoue, puis l'ancien code lance contre cette base. Deja joue le 2026-11-28 : voir `preuves-corrections.md`. A rejouer si `origin/main` a bouge entre-temps.
3. Pause obligatoire : accord ecrit du proprietaire avant d'appliquer en production.
4. FAIT le 2026-11-28. Appliquer les QUATRE premieres migrations (100000, 100100, 100200, 100300), dans cet ordre, avec les verifications par objet.
5. Verifier par le corps STOCKE des fonctions, pas par le nom de la migration. Lancer le balayage `private.droits_hors_catalogue()` : 0 ligne. Temoin : la meme requete, lancee AVANT la migration 2 sur une copie, doit rendre `orders.manage` et `reports.view`.
6. FAIT le 2026-11-28 (PR #514, commit `542f7452`, servi). La fenetre de retour arriere de la base se ferme ici. Fusionner la PR du code (une seule fusion en cours), attendre le workflow `promote-prod`, verifier `/api/version` trois minutes apres, pas avant.
   6 bis. FAIT le 2026-11-28. Des que `/api/version` rend le commit de la fusion : appliquer la CINQUIEME migration (100400), puis verifier ses deux declencheurs. Le jour meme. Tant qu'elle manque, l'application refuse deja ces gestes ; seule la base ne les refuse pas encore a qui l'appellerait avec son propre jeton.
7. Verification a l'ecran de chaque poste, telephone et ordinateur, clair et sombre.
8. Regenerer `supabase/schema.sql` et les types, avancer le marqueur `SCHEMA_SNAPSHOT_MIGRATION`. Reporte APRES l'application de MIG4 en production, pour ne le faire qu'une fois (section 7).
9. MIG4 (contraction), le jour de la fusion ou au plus tard le jour ouvre suivant, aux conditions ecrites dans son en-tete. Relancer le controle 3.2 juste avant. La PR est prete : voir la section 7.

## 5. Retour arriere

La fenetre est fermee depuis la fusion du code (etape 6) : correction en avant seulement. Les scripts de `supabase/retour-arriere/` et le test qui verifiait leurs copies (`retour-arriere-roles-copies.test.ts`) sont supprimes par la PR de MIG4 : ils retablissaient l'ancienne resolution par roles, que plus aucun code servi ne sait lire, et les rejouer apres la contraction casserait la base.

Pour MIG4 elle-meme, le seul retour est la restauration depuis la sauvegarde prise juste avant (colonnes et table supprimees).

## 6. Ce qui change pour le personnel le jour de la fusion

A dire au proprietaire avant de fusionner, parce que ce sont des refus nouveaux :

- Le caissier, le serveur, la reception et la vente n'ouvrent plus l'ecran de cuisine, et n'ont plus les boutons "En preparation" et "Pret" sur une commande. Ils gardent "Servir". Le proprietaire peut donner "Suivre en cuisine ou au bar" a un poste ou a une personne depuis l'ecran des droits.
- Liberer une table est un geste de salle : un cuisinier seul ne le fait plus.
- Supprimer un supplement payant demande le droit "Modifier les prix".
- Le gerant voit l'abonnement et les factures, sans les boutons de paiement.
- Le bilan hebdomadaire avec le chiffre d'affaires part a qui a le droit "Rapports d'argent", plus selon le nom du poste.

## 7. MIG4, la contraction : consigne, preuves, ecarts

Fichier : `supabase/migrations/20261128120000_contraction_anciens_reglages.sql` (l'ancien `migrations-differees/20261128110000_...`, renomme avec un horodatage posterieur a `20261128100400`).

### 7.1 L'ordre, a lire avant tout

**MIG4 s'applique en production AVANT la fusion de sa PR.** Le code servi (PR #514) ne lit plus et n'ecrit plus les objets retires ; l'ancien code, qui les lisait, n'est plus servi. Dans l'autre sens rien ne casse non plus, mais la PR porte les tests adaptes et l'instantane des parcours regenere : les fusionner avant d'appliquer laisserait le depot decrire une base qui n'existe pas encore.

1. Sauvegarde, accord ecrit du proprietaire (suppression de colonnes).
2. Controle 3.2. Chaque ligne dont `role` n'est pas `admin` est tranchee par le proprietaire AVANT (MIG4 les liste en `NOTICE` et n'y touche pas).
3. `scripts/appliquer-migrations-ciblees.sh --confirmer supabase/migrations/20261128120000_contraction_anciens_reglages.sql`.
4. Verifier par objet, puis relancer le controle 3.2 :

```sql
SELECT count(*) FROM information_schema.columns
 WHERE table_schema = 'public' AND column_name = 'custom_permissions';                       -- 0
SELECT to_regclass('public.role_permissions') IS NULL;                                       -- t
SELECT to_regprocedure('private.fusion_anciens_droits(jsonb, jsonb, jsonb)') IS NULL;        -- t
-- controle 3.2 : plus aucune ligne `role = 'admin'`
```

5. Fusionner la PR de MIG4.
6. Regenerer `supabase/schema.sql` et `src/types/database.generated.ts` depuis la production, avancer `SCHEMA_SNAPSHOT_MIGRATION` a `20261128120000` (etape 8 du deroule), dans un commit a part. Puis relancer `rg -n "custom_permissions|role_permissions" src scripts tests` SANS exclusion : 0 ligne.

MIG4 ne se rejoue pas : sa garde compare l'empreinte de trois fonctions a celle d'avant, et refuse un second passage sans rien changer.

### 7.2 Preuves (banc local, 2026-11-28, rien contre la production)

Bases jetables `mig4_*` creees sur le serveur de la pile `bancattabl` (57322), supprimees a la fin. Pile a part `roles-mig4` (ports 59321 a 59329) pour l'instantane des parcours, arretee et supprimee a la fin. Les piles `bancattabl`, `lot4-rapports` et `web` n'ont ete ni arretees ni modifiees.

| Mesure                                                                                    | Resultat                                                                                     |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Garde de l'etape 0, sur une base portant toutes les migrations jusqu'a `20261128100400`   | les trois empreintes sont celles du fichier : rien a regenerer                               |
| Suite pgTAP avant MIG4 (temoin)                                                           | 80 fichiers, `pgtap: 2083/2083 passed`                                                       |
| Suite pgTAP avec MIG4 et les tests adaptes                                                | 80 fichiers, `pgtap: 2040/2040 passed`                                                       |
| Temoin negatif : le test `transition_anciens_roles` adapte, joue sur la base d'AVANT MIG4 | rouge, 9 assertions sur 31 (les suppressions et le retrait de `billing.manage` n'y sont pas) |
| MIG4 sur une base dans l'etat de la production, avec des lignes semees                    | appliquee sans erreur                                                                        |
| Controle 3.2 avant, puis apres                                                            | 2 lignes (`role = 'admin'`, dont une inactive), puis 0 ligne                                 |
| Un `billing.manage: false` pose par le proprietaire sur un ancien administrateur          | conserve                                                                                     |
| Invitation `admin` en attente                                                             | son `billing.manage: true` est retire                                                        |
| Second passage de MIG4                                                                    | refuse par la garde ("fonction(s) modifiee(s)"), base inchangee                              |

Les 43 assertions de moins : 34 dans `transition_anciens_roles` (sections B, D et E, qui prouvaient la traduction des anciens reglages), 9 dans `privileges_fonctions_droits` (trois fonctions supprimees, trois roles), 1 dans `employe_ne_s_eleve_pas` (l'ancienne colonne), et 1 de plus dans `garde_delegation` (la base refuse maintenant d'enregistrer une valeur non booleenne).

### 7.3 L'instantane des parcours

`tests/journeys/fixtures/schema.sql` portait les anciens objets par construction (marqueur 20260628000000). Il est regenere, pas corrige a la main : l'ancien instantane et les 181 migrations posterieures sur une pile vierge, puis `supabase db dump --local --schema public,private`. Son marqueur passe a `20261128120000` dans les deux scripts qui le chargent.

Un dump ne suffit pas. Trois ajouts, ecrits dans l'en-tete du fichier : le retrait des droits par defaut en tete (sans lui, plus de 150 fonctions redeviennent appelables par `anon` sur le banc), les objets hors des schemas `public` et `private` (deux declencheurs sur `auth.users`, huit politiques et deux espaces de stockage, deux tables publiees), et la ligne `__platform`.

Preuve : le nouvel instantane recharge sur une pile vierge, compare a la base d'origine par `pg_dump` de tous les schemas, droits compris, et par les donnees. Il ne reste que l'ordre de quelques `GRANT` et l'ecriture d'une contrainte (`orders_payment_status_check`, meme sens). Temoin : le dump seul, sans les ajouts, laissait 426 lignes d'ecart.

Parcours joues avec ce nouvel instantane (`08-bola|04-service|03-staff|09-casse`, le jeu de la CI), sur la pile a part : 40 passes, 2 echecs, 1 saute. Tous les parcours 03, 04 et 08 passent. Les 2 echecs sont dans 09 (inventaire sur tablette, cuisine sur telephone) et viennent du banc, pas de l'instantane : la politique de securite du navigateur n'autorise en developpement que `127.0.0.1:54321` (`src/lib/csp.ts`), et la pile a part ecoute sur 59321 parce que 54321 appartient a une autre pile. Le journal du serveur le dit (`CSP violation ... bloque: http://127.0.0.1:59321/rest/v1/suppliers`). La CI, qui tourne sur 54321, tranche.

### 7.4 Ecarts avec l'en-tete d'origine de MIG4

- L'en-tete demandait de regenerer `supabase/schema.sql` et les types dans la meme PR. Ils se regenerent depuis la production, donc apres l'application : commit a part, etape 6 de 7.1.
- `supabase/retour-arriere/20261128100400_retour_garde_statut_cuisine.sql` est supprime avec les quatre autres. La section 5 d'origine le gardait comme seule exception ; il retirait une garde que l'application double de toute facon. S'il fallait un jour la retirer, ce serait par une migration.
- `transition_anciens_roles.test.sql` est reduit, pas supprime : la synchronisation entre `role` et `postes` reste vraie jusqu'a MIG5. Une section F y verrouille la contraction.
