# Lot 1 des roles : deroule de mise en production

Date : 2026-11-28. Ce document est la consigne d'application. Il complete la section E.2 de `conception-lot1.md` et la remplace la ou les deux different : il connait les CINQ migrations du lot, la conception d'origine n'en connaissait que trois.

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

Les sept controles E.0 de la conception restent requis. Les audits du 2026-11-28 en ajoutent trois.

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

## 4. Le deroule

1. Sauvegarde (procedure habituelle), les sept controles E.0 et les trois controles de la section 3. Resultats archives.
2. Repetition sur le banc : instantane, les migrations, suite pgTAP, script de retour arriere rejoue, puis l'ancien code lance contre cette base. Deja joue le 2026-11-28 : voir `preuves-corrections.md`. A rejouer si `origin/main` a bouge entre-temps.
3. Pause obligatoire : accord ecrit du proprietaire avant d'appliquer en production.
4. Appliquer les QUATRE premieres migrations (100000, 100100, 100200, 100300), dans cet ordre, avec les verifications par objet.
5. Verifier par le corps STOCKE des fonctions, pas par le nom de la migration. Lancer le balayage `private.droits_hors_catalogue()` : 0 ligne. Temoin : la meme requete, lancee AVANT la migration 2 sur une copie, doit rendre `orders.manage` et `reports.view`.
6. La fenetre de retour arriere de la base se ferme ici. Fusionner la PR du code (une seule fusion en cours), attendre le workflow `promote-prod`, verifier `/api/version` trois minutes apres, pas avant.
   6 bis. Des que `/api/version` rend le commit de la fusion : appliquer la CINQUIEME migration (100400), puis verifier ses deux declencheurs. Le jour meme. Tant qu'elle manque, l'application refuse deja ces gestes ; seule la base ne les refuse pas encore a qui l'appellerait avec son propre jeton.
7. Verification a l'ecran de chaque poste, telephone et ordinateur, clair et sombre.
8. Regenerer `supabase/schema.sql` et les types, avancer le marqueur `SCHEMA_SNAPSHOT_MIGRATION`.
9. MIG4 (contraction), le jour de la fusion ou au plus tard le jour ouvre suivant, aux conditions ecrites dans son en-tete. Relancer le controle 3.2 juste avant.

## 5. Retour arriere

Permis seulement AVANT la fusion du code (etape 6). Apres : correction en avant. Seule exception : la cinquieme migration, appliquee apres la fusion, se retire seule et sans risque (son retour ne supprime qu'une garde ; l'application continue de refuser ces gestes).

Ordre, du plus recent au plus ancien :

1. `supabase/retour-arriere/20261128100400_retour_garde_statut_cuisine.sql` (si elle est appliquee)
2. `supabase/retour-arriere/20261128100300_retour_resolution_plus_rapide.sql` (optionnel : les deux retours suivants suppriment de toute facon ces fonctions)
3. `supabase/retour-arriere/20261128100200_retour_gardes_prix_et_proprietaire.sql`
4. `supabase/retour-arriere/20261128100100_retour_resolution_par_roles.sql`
5. `supabase/retour-arriere/20261128100000_retour_postes_colonnes.sql`

Les retours 1 et 3 doivent passer avant le 4 : leurs gardes appellent des codes de droit (`kitchen.track`, `menu.price`) que l'ancienne resolution par roles ne connait pas.

## 6. Ce qui change pour le personnel le jour de la fusion

A dire au proprietaire avant de fusionner, parce que ce sont des refus nouveaux :

- Le caissier, le serveur, la reception et la vente n'ouvrent plus l'ecran de cuisine, et n'ont plus les boutons "En preparation" et "Pret" sur une commande. Ils gardent "Servir". Le proprietaire peut donner "Suivre en cuisine ou au bar" a un poste ou a une personne depuis l'ecran des droits.
- Liberer une table est un geste de salle : un cuisinier seul ne le fait plus.
- Supprimer un supplement payant demande le droit "Modifier les prix".
- Le gerant voit l'abonnement et les factures, sans les boutons de paiement.
- Le bilan hebdomadaire avec le chiffre d'affaires part a qui a le droit "Rapports d'argent", plus selon le nom du poste.
