# Lot 1 des roles, phase A (base de donnees) : ecarts a la conception

Date : 2026-11-28. Branche `feat/roles-postes-lot1`. Reference : `conception-lot1.md` (version 3) et `audit-conception-lot1.md`.

Regle suivie : la ou la conception etait fausse, impossible ou muette, la variante la plus sure a ete codee, et elle est ecrite ici avec sa raison. Rien n'a ete change en silence. Les preuves citees sont dans `preuves-phase-a.md`.

## 1. La conception etait impossible ou fausse

### E1. La forme `= ANY ((SELECT f()))` ne compile pas

- Conception : C et D.1, "la double parenthese autour du SELECT est ce qui fait l'initplan".
- Constat sur le banc : `ERROR: operator does not exist: uuid = uuid[]`. Avec un SELECT entre parentheses, PostgreSQL lit une sous-requete de lignes, pas un tableau.
- Code : `tenant_id = ANY ((SELECT public.tenants_avec_droit('audit.view'))::uuid[])`. C'est la forme deja utilisee dans `supabase/schema.sql` pour `get_my_inventory_tenant_ids`. L'effet voulu est bien obtenu : le plan montre un `InitPlan` et un seul appel de fonction (preuve P7).
- Portee : les trois politiques de lecture de MIG2, et la politique de lecture de `poste_permissions` (MIG1), que la conception ecrivait sans sous-requete (`tenant_id = ANY (public.get_my_tenant_ids_array())`, donc un appel par ligne). Elle a recu la meme forme : meme resultat, une evaluation par requete.

### E2. Le retour arriere de MIG2 seul ne rend pas l'ancienne suite verte

- Conception : E.1, "appliquer MIG1 a MIG3, lancer le retour arriere de MIG3 puis ce script, puis relancer la suite pgTAP du commit d'avant le lot 1 : elle doit repasser entierement".
- Constat sur le banc : apres ces deux retours, 8 fichiers de l'ancienne suite restent rouges (1216 assertions passees, 8 fichiers interrompus). Cause : MIG1 est encore en place, et ses contraintes refusent les donnees de ces anciens tests (deux proprietaires dans un restaurant, lignes inserees avec les declencheurs coupes). Ce n'est pas un defaut du script de retour : politiques et fonctions sont revenues a l'identique.
- Code : la conception ne donnait le retour arriere de MIG1 et de MIG3 qu'en une phrase. Les deux scripts ont ete ecrits (`supabase/retour-arriere/20261128100000_retour_postes_colonnes.sql` et `20261128100200_retour_gardes_prix_et_proprietaire.sql`). Apres les TROIS retours : 1365 sur 1365, et le schema est identique a celui d'avant le lot a une ligne pres, voulue (le DEFAULT `'admin'` de `admin_users.role` n'est pas retabli). Preuve P3.
- Consequence pour le deroule (E.2) : un retour complet de la base demande les trois scripts, dans l'ordre MIG3, MIG2, MIG1.

### E3. Le recensement des tests a adapter : une troisieme cause

- Conception : B.4 et F.1 autorisent deux raisons de changer un test (categorie 1 : ligne du tableau B.4 ; categorie 2 : donnees contraires a une nouvelle contrainte), et citent deux fichiers de categorie 2.
- Constat sur le banc (MIG1 a MIG3 seules, avant toute adaptation) : 16 fichiers rouges sur 62. Le detail complet est dans `preuves-phase-a.md` (P2). Deux ecarts a l'estimation :
  - categorie 2, cinq fichiers de plus que les deux prevus : `battement_et_reglages_plateforme`, `double_auth_exigee_par_la_base`, `intrusion_isolation_lot1`, `reste_donnees_lecture_publique` (un super administrateur insere comme second proprietaire), et `flutterwave_payments` (un second proprietaire desactive) ;
  - une forme de categorie 2 que la conception ne nomme pas : `verrou_plan_commandes` et `verrous_plan_suite` inserent leurs membres avec `session_replication_role = replica`, donc sans le declencheur de synchronisation. La ligne nait sans poste et la contrainte `admin_users_postes_non_vide` la refuse. Correctif : ces deux tests ecrivent `postes` eux-memes. La contrainte n'a pas ete touchee.
- Aucun fichier rouge n'est sorti de ces deux categories : pas de regression de conception.
- Sept fichiers que la conception estimait a adapter sont restes verts sans changement (`catalogue_write_roles`, `lot3_write_roles`, `lot4_write_roles`, `record_refund_tenant_guard`, `registre_stock_lecture_inventaire`, `stock_rpc_inventory_edit`, `rappels_intelligents`). Ils continuent d'ecrire `role`, `custom_permissions` et `role_permissions` : ils exercent donc la traduction de l'ancien format, ce qui est utile tant que la transition dure.

### E4. `postes_ecritures_reelles` : deux cas de la conception ne sont pas faisables tels quels

- "orders UPDATE statut (waiter oui, chef oui)" ne donne aucun refus a mesurer : chaque poste a par defaut `orders.take` ou `kitchen.track`. Le refus est donc prouve avec un serveur a qui le proprietaire a retire `orders.take` (0 ligne touchee), et le meme UPDATE passe pour un serveur ordinaire.
- La colonne modifiee est `status`, pas `notes` : `notes` est gardee par `refuser_argent_sans_orders_pay` (changer la note d'une table exige le droit d'encaisser), ce qui aurait mesure une autre garde.

## 2. La conception etait muette : choix faits

### E5. Emplacement de MIG4 et de MIG5

- Conception : MIG4 est nommee `20261128110000_contraction_anciens_reglages.sql`, sans dossier. Or `scripts/run-pgtap.sh` et la CI appliquent TOUT fichier de `supabase/migrations/` posterieur au marqueur de l'instantane : placee la, la contraction serait jouee avec les migrations additives.
- Code : `supabase/migrations-differees/`, un dossier qu'aucun outil ne lit (verifie : aucune reference dans `scripts/`, `.github/`, `package.json`). L'en-tete de chaque fichier dit de ne pas le deplacer avant ses conditions, et lesquelles.
- MIG5 s'appelle `A_DATER_retrait_admin_et_colonne_role.sql` : la conception ne lui donne pas d'horodatage, et un faux horodatage serait trompeur.
- Garde ajoutee aux deux fichiers (meme esprit que la note N9) : ils reecrivent des fonctions a partir de leur corps du 2026-11-28. Si une autre migration modifie l'une d'elles d'ici la, le fichier compare l'empreinte (`md5(prosrc)`) et s'annule au lieu d'ecraser la version plus recente.

### E6. Decision G.f appliquee dans MIG4

Le proprietaire a tranche : l'ancien administrateur devient un gerant simple des que le nouveau code est servi. MIG4 retire donc `billing.manage: true` des lignes `role = 'admin'` (membres et invitations en attente), et les declencheurs de synchronisation reecrits par MIG4 ne le reposent plus. Seule la valeur `true` est retiree : un `false` pose par le proprietaire est conserve (le retirer rendrait au compte la lecture des factures).

### E7. MIG5 garde une normalisation des postes

La conception dit "suppression des declencheurs de synchronisation". Sans eux, plus rien ne range `postes` dans l'ordre canonique ni ne retire les doublons (constat F7 de l'audit). MIG5 les remplace donc par un declencheur qui ne fait que normaliser. A confirmer a la revue du lot 4 ; c'est ecrit dans l'en-tete du fichier.

### E8. Une fonction de plus : `private.droits_hors_catalogue()`

La conception demande le meme balayage a trois endroits : fin de MIG2, test `catalogue_droits_codes_connus`, controle en production. Plutot que trois copies d'une expression reguliere, une fonction les sert toutes. Elle n'est executable par aucun role d'API. Le retour arriere de MIG2 la supprime.

### E9. Privileges ecrits en clair pour chaque role

La conception ecrit `REVOKE ALL ... FROM PUBLIC` pour les fonctions internes. Les privileges par defaut du schema redonnent EXECUTE a la creation, et ils different entre la production, la CI et le banc local (constat F5 de l'audit). Chaque fonction nouvelle porte donc `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role`, puis seulement les `GRANT` voulus. L'etat attendu est celui du tableau de la conception ; le test `privileges_fonctions_droits` le verifie fonction par fonction (20 fonctions, 3 roles).

### E10. Details de MIG1 et MIG2

- Reprise : `permission_overrides` recoit NULL, pas `{}`, quand la traduction ne produit aucune cle. Meme effet pour la resolution, et c'est ce que produit deja le declencheur (`fusion_anciens_droits` finit par `nullif`).
- Messages d'erreur : `assert_tenant_reports_view` dit maintenant `reports.money` et `reassign_order_table` dit `orders.take`. Un message qui nomme un droit disparu envoie le lecteur au mauvais endroit. Aucun code de l'application ne lit ces messages (verifie par recherche) ; quatre assertions pgTAP qui les lisaient ont ete mises a jour.
- `record_refund` : le commentaire du bloc remplace a ete recrit pour decrire la garde commune. Le reste du corps est la copie programmee de `schema.sql`.

### E11. Le test Vitest de parite est restreint a l'ancienne garde, le temps de la phase A

- `src/lib/__tests__/permission-defaults-sql.test.ts` lit "la derniere migration qui definit `has_tenant_write_permission`" et la compare a `DEFAULT_PERMISSIONS`. Des que MIG2 existe dans le depot, il lit la nouvelle garde et echoue, alors que le TypeScript est encore l'ancien modele (il change en phase B).
- Le crochet de pre-commit lance toute la suite Vitest : sans correctif, aucun commit de la phase A n'etait possible sans contourner le crochet, ce qui est interdit.
- Code : le test ignore les migrations a partir de `20261128100000`, avec un temoin qui verifie qu'elles existent et sont bien ecartees. Il continue de verrouiller ce qu'il verrouillait. La phase B le reecrit comme prevu (parite exacte entre `POSTE_MATRIX` et `private.matrice_postes()`, conception B.3 et F.2). D'ici la, la matrice est verrouillee cote base par `postes_matrice_par_poste` (242 cases).

### E12. Les branches de la garde du retour arriere sont prouvees sur le banc, pas par un fichier pgTAP

La garde vit dans un script qui porte son `BEGIN` et son `COMMIT` : un test pgTAP (une transaction annulee a la fin) ne peut pas l'executer. Les quatre branches et leur temoin ont ete joues sur des copies jetables de la base (preuve P4), avec les commandes consignees.

### E13. `proprietaire_protege` donne un droit le temps du test

`delete_admin_user_atomic` efface le compte dans `auth.users` avec les droits du proprietaire de la fonction. Sur un banc ou la table `auth.users` de test appartient a un autre role, l'appel echouait sur un privilege du banc, pas sur la garde mesuree. Le test accorde ce droit dans sa transaction (annulee a la fin). Sans effet en CI, ou le role est superutilisateur.

## 3. Constats a connaitre, sans changement de code

### C1. Cout de la garde d'ecriture : environ 7 fois plus par appel

Mesure obligatoire de la conception (C, "Performance"), sur le banc, memes donnees avant et apres (preuve P7) :

| Requete                                                  | Avant le lot | Apres le lot                                                        |
| -------------------------------------------------------- | ------------ | ------------------------------------------------------------------- |
| Lecture de `audit_log` (100 000 lignes, 50 000 visibles) | 9 a 16 ms    | 13 ms, `InitPlan`, 2 appels de `tenants_avec_droit` pour 2 requetes |
| Lecture de `ingredients` (500 lignes)                    | 0,7 ms       | 1,3 ms                                                              |
| UPDATE de 500 plats par un gerant                        | 153 ms       | 1190 ms                                                             |

Les lectures sont bonnes : une evaluation par requete, comme voulu. L'ecriture en masse est plus lente : la garde est appelee deux fois par ligne (USING et WITH CHECK), et chaque appel coute environ 1,15 ms contre 0,15 ms. Cause : `tenant_permission_level` est une fonction SQL que PostgreSQL replanifie a chaque appel, et `private.matrice_postes()` n'est pas integrable dans la requete parce qu'elle porte `SET search_path`.

Effet reel : une ecriture d'une ligne (le cas courant) coute 1 a 5 ms de plus, sans effet visible. Un import de carte de 300 plats coute environ 0,7 seconde de plus.

Deux variantes ont ete mesurees sur le banc, sans changer aucun resultat :

| Variante                                                     | UPDATE de 500 plats |
| ------------------------------------------------------------ | ------------------- |
| conception (fonction SQL)                                    | 1157 a 1190 ms      |
| `tenant_permission_level` en plpgsql (plan garde en memoire) | 828 ms              |
| plpgsql, et `matrice_postes()` sans `SET search_path`        | 446 ms              |

Aucune n'a ete appliquee : la premiere gagne peu, la seconde retire a `matrice_postes()` un durcissement que la conception demande pour toutes les fonctions (la fonction ne lit aucun objet, le risque est nul, mais le controle "chaque fonction fixe son search_path" tomberait). C'est une decision a prendre a la revue de la phase B, pas un defaut de fonctionnement. La voie complete serait de donner aux politiques d'ecriture la meme forme a une evaluation par requete que les lectures, ce qui touche une centaine de politiques et sort du lot 1.

### C2. La garde du retour arriere peut refuser a tort dans un cas

Si l'ancien code supprime une ligne de `role_permissions`, le declencheur vide les cles correspondantes de `poste_permissions` mais garde la ligne (conception H3). La garde du retour arriere voit alors une ligne de `poste_permissions` sans ancienne ligne correspondante et refuse, alors que rien n'a ete ecrit au nouveau format. Le sens est le sens sur (refus). Le texte de la garde est celui de la conception, verifie par l'audit ; il n'a pas ete modifie.

### C3. Hors perimetre, vu en passant

`scripts/create-superadmin.ts:123` ecrit `role: 'superadmin'` (sans tiret bas), une valeur que le CHECK de `admin_users.role` refuse deja avant ce lot. Le script est donc deja casse. A traiter en phase B avec `manage-super-admin.js` (conception D.2 bis).

## 4. Ce que la phase A n'a pas pu prouver

| Preuve demandee par la conception                                              | Etat                               | Raison                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MIG1 a MIG3 par-dessus `tests/journeys/fixtures/schema.sql` (instantane gele)  | non faite                          | la chaine des migrations entre cet instantane et aujourd'hui exige une vraie pile Supabase (elle s'arrete a `20260716000000` sur `publication "supabase_realtime" does not exist` dans une base nue). A faire en phase B avec `scripts/run-journeys-local.sh` |
| Ancien code lance contre la nouvelle base, parcours 03, 04 et 08 (E.2 etape 2) | non faite                          | demande l'application en marche : phase B                                                                                                                                                                                                                     |
| Controles E.0 en production                                                    | non faits                          | aucune connexion a la production dans cette phase, par consigne                                                                                                                                                                                               |
| Cycle du script `manage-super-admin.js`                                        | faite au niveau SQL seulement (P6) | le script lui-meme est reecrit en phase B                                                                                                                                                                                                                     |
