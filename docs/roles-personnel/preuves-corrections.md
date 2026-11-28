# Lot 1 des roles, tour de corrections : preuves

Date : 2026-11-28. Branche `feat/roles-postes-lot1`, partie de `origin/main` `00151177`. References : `ecarts-corrections.md`, `deroule-production.md`.

Chaque preuve porte un temoin : un cas ou la mesure DOIT repondre non. Une verification qui ne peut que confirmer ne prouve rien.

## 0. Ou cela a ete joue

Rien n'a ete joue contre la production, et aucun identifiant n'a ete lu dans un fichier `.env`.

| Banc                           | Usage                                                                                     | Etat a la fin                      |
| ------------------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------- |
| Pile `bancattabl` (57322)      | bases JETABLES `roles_lot1_c_*` creees sur son serveur pour pgTAP, puis supprimees        | intacte, aucune autre base touchee |
| Pile `roles-lot1-corr`         | pile a part, creee pour ce tour (ports 58321 a 58329), pour les parcours et l'ancien code | arretee et supprimee               |
| Piles `lot4-rapports` et `web` | aucune                                                                                    | intactes, ni arretees ni relancees |

La pile `roles-lot1-corr` a ete chargee comme le fait `scripts/run-journeys-local.sh` : instantane gele des parcours (`tests/journeys/fixtures/schema.sql`, marqueur 20260628000000), droits des tables alignes sur la production (`authenticated` ne peut pas ecrire `admin_users` en entier : mesure `false`), puis les 180 migrations posterieures, dont les cinq du lot. Elles s'appliquent toutes sans erreur par-dessus l'instantane gele : c'etait une preuve manquante des deux phases.

## 1. Portes de qualite

| Porte                        | Resultat                              |
| ---------------------------- | ------------------------------------- |
| `pnpm typecheck`             | 0 erreur                              |
| `pnpm lint --max-warnings 0` | 0 erreur, 0 avertissement             |
| `pnpm format:check`          | conforme                              |
| `pnpm test`                  | 480 fichiers, 5680 tests, tous passes |
| `pnpm build`                 | code de retour 0                      |

Avant ce tour : 478 fichiers, 5584 tests. 96 tests de plus, 2 fichiers de plus, aucun test retire.

## 2. Suite pgTAP

Commande : `createdb roles_lot1_c_final` sur le serveur du banc, puis `bash scripts/run-pgtap.sh --db-url ...`. Base vide, `supabase/schema.sql`, puis les migrations posterieures.

| Etat              | Fichiers | Assertions | Resultat                  |
| ----------------- | -------- | ---------- | ------------------------- |
| fin de la phase B | 79       | 2030       | `pgtap: 2030/2030 passed` |
| apres ce tour     | 80       | 2083       | `pgtap: 2083/2083 passed` |

Les 53 assertions de plus :

| Fichier                          | Avant | Apres | Ce qui est ajoute                                                                                   |
| -------------------------------- | ----- | ----- | --------------------------------------------------------------------------------------------------- |
| `statut_cuisine_garde` (nouveau) | 0     | 22    | caissier, serveur et equipier sans `kitchen.track` refuses ; cuisinier admis ; le serveur sert      |
| `prix_carte_garde`               | 24    | 32    | suppression d'un supplement payant, par `price` et par `prices` ; suppression en cascade d'un plat  |
| `proprietaire_protege`           | 31    | 35    | `is_active = false` seul refuse ; bannir, retirer et restaurant ferme admis                         |
| `transition_anciens_roles`       | 61    | 65    | l'ancien administrateur perd `billing.manage` par les deux chemins ; un choix du proprietaire reste |
| `privileges_fonctions_droits`    | 68    | 71    | la nouvelle fonction de declencheur n'est appelable par personne                                    |
| `postes_cas_partages`            | 42    | 54    | 12 cas partages de plus                                                                             |

Cinq fichiers existants adaptes a la regle des statuts (meme nombre d'assertions) : `postes_ecritures_reelles`, `garde_argent`, `paid_exige_registre`, `revue_lot_b2b1` (le serveur ou le caissier y "avance" une commande : il la sert, au lieu de la passer en preparation), et `membres_retires` (le proprietaire y est desactive par le geste de la plateforme, qui date la ligne).

### Temoins negatifs (base jetable copiee de la base verte, puis supprimee)

| Ce qui est retire sur la copie                                              | Test rejoue                   | Resultat attendu et obtenu                 |
| --------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------ |
| les deux declencheurs de `20261128100400`                                   | `statut_cuisine_garde`        | ROUGE, 8 assertions sur 22                 |
| MIG3 remise a son etat d'avant ce tour (commit `9edea232`)                  | `prix_carte_garde`            | ROUGE, 4 sur 32 (les suppressions passent) |
| meme copie                                                                  | `proprietaire_protege`        | ROUGE, 1 sur 35 (la desactivation passe)   |
| `sync_postes_admin_users` et `accept_invitation_membership` d'avant ce tour | `transition_anciens_roles`    | ROUGE, 2 sur 65 (le reglage survit)        |
| script de retour de `20261128100400` joue en entier                         | `privileges_fonctions_droits` | ROUGE (la fonction n'existe plus)          |

Le script de retour arriere de `20261128100400` a donc ete joue deux fois, sur le banc de pgTAP et sur la pile des parcours, puis la migration rejouee par-dessus sans erreur.

### MIG4 (contraction) avec la nouvelle empreinte

Sur une copie de la base verte, avec un proprietaire, un ancien administrateur et un gerant a qui le proprietaire a donne le paiement : MIG4 s'applique (`COMMIT`). Sa sortie liste le gerant (`NOTICE : contraction : membre non proprietaire avec billing.manage entier ...`, puis `1 membre(s)`), sans y toucher. L'ancien administrateur perd son reglage, le gerant garde le sien. Temoin : avec l'ancienne empreinte de `accept_invitation_membership`, la garde de MIG4 aurait annule le fichier ; la nouvelle valeur est `ea53f83f1de59578786b5882d1ce3441`, lue sur la base.

## 3. Temoins negatifs des tests Vitest

Chaque garde retiree a la main, le test relance, puis le fichier remis par `git checkout`.

| Garde retiree                                                     | Tests relances                                    | Resultat         |
| ----------------------------------------------------------------- | ------------------------------------------------- | ---------------- |
| exigence de `getAuthenticatedUserForTenant` rendue facultative    | `pnpm exec tsc --noEmit`                          | erreur TS2578    |
| `actionReleaseTable` remise sur `orders.take` OU `kitchen.track`  | `table-release.action`                            | 1 rouge sur 3    |
| "preparing" et "ready" remis sur `orders.take` OU `kitchen.track` | `money-gates.action`, `role-ui-gates.component`   | 8 rouges sur 76  |
| controle du supplement payant retire de `actionDeleteModifier`    | `menu-items-update.action`                        | 2 rouges sur 20  |
| regle du droit borne retiree de `nextOverride`                    | catalogue, ecran des droits, reglage par personne | 3 rouges sur 66  |
| coach hebdomadaire remis sur le nom du poste                      | `reminder.service`                                | 1 rouge sur 6    |
| ligne `/kitchen` retiree de la table des routes                   | `role-access-matrix`, `proxy`                     | 7 rouges sur 325 |

## 4. Parcours Playwright, nouveau code

Pile `roles-lot1-corr`, application du depot lancee par `pnpm dev` contre cette pile.

| Parcours                        | Tests | Resultat |
| ------------------------------- | ----- | -------- |
| `03-staff-permissions` (etendu) | 7     | 7 passes |
| `04-service-and-ordering`       | 5     | 5 passes |
| `08-bola`                       | 4     | 4 passes |

Les cinq tests ajoutes au parcours 03 (conception F.2), chacun avec son temoin dans le meme test :

1. Le chef change un prix avec sa propre session, par la base (RLS et declencheur). Temoin : la meme ecriture par le serveur laisse le prix intact.
2. Le chef est renvoye de `/reports` (307 vers `/unauthorized`). Temoin : le gerant l'ouvre (200).
3. Le serveur seul prend une commande a la caisse (200, impayee) et ne l'encaisse pas (403).
4. La personne qui cumule serveur et caissier prend une commande et l'encaisse (200, `paid`).
5. Le serveur ne passe pas une commande "en preparation" (422, statut inchange). Temoin : le chef le fait (200). Puis le serveur la sert (200).

Parcours 03 rejoue SANS la migration `20261128100400` (son script de retour joue sur la pile) : 7 sur 7. Le nouveau code refuse donc lui-meme le statut de cuisine au serveur, sans dependre de la garde en base. C'est ce qui permet d'appliquer cette migration apres le code.

## 5. Ancien code contre nouvelle base

`origin/main` `00151177`, dans une copie de travail temporaire avec ses propres dependances, lance par `pnpm dev` contre la pile `roles-lot1-corr` qui porte les cinq migrations. Ce sont les parcours et les fixtures de `origin/main` : le seed ecrit `role`, pas `postes`, et la base en deduit les postes.

| Preuve                                 | Resultat                          |
| -------------------------------------- | --------------------------------- |
| parcours 03, 04 et 08 de `origin/main` | 11 passes sur 11                  |
| tests d'integration de `origin/main`   | 91 passes sur 94 (voir section 6) |

Mesure de ce que la cinquieme migration change pour l'ancien code (un test temporaire, non garde) :

| Geste, par l'ancien code                      | Reponse                                        | Statut en base       |
| --------------------------------------------- | ---------------------------------------------- | -------------------- |
| le serveur passe la commande "en preparation" | 500, "Erreur lors de la mise a jour du statut" | `pending` (inchange) |
| le chef passe la commande "en preparation"    | 200                                            | `preparing`          |
| le serveur marque la commande servie          | 200                                            | `delivered`          |

Conclusion : les quatre premieres migrations ne retirent rien a l'ancien code. La cinquieme lui retire un geste, et l'ancien code le signale comme une panne : elle s'applique APRES la mise en service du nouveau code (`deroule-production.md`, section 1).

## 6. Tests d'integration (`tests/integration`, vraie base)

| Code, heure du lancement | Passes | Echecs |
| ------------------------ | ------ | ------ |
| branche, 13:01 UTC       | 92     | 2      |
| branche, 12:12 UTC       | 91     | 3      |
| `origin/main`, 12:36 UTC | 91     | 3      |

Un echec venait du lot et il est corrige : le bilan du lundi etait attendu "au proprietaire seulement" ; il va au proprietaire et au gerant, qui detiennent `reports.money`. Le test est mis a jour.

Les deux echecs qui restent sur la branche existent aussi avec le code de `origin/main`, pour la meme cause, et ne viennent pas du lot :

| Test                                                              | Cause mesuree                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `comp-house-account`, "settle marks status"                       | le test solde une ardoise qui porte encore une commande impayee ; la garde `guard_house_account_settle` (migration `20261121200100`, deja sur `origin/main`) le refuse. Elle ne lit aucun droit |
| `recipe-supplier-import`, "inserts new suppliers and updates ..." | l'import rend 0 ligne mise a jour avant toute ecriture ; rejoue a la main en SQL, l'insertion et la mise a jour d'un fournisseur passent. Le test ne correspond plus a l'analyseur du fichier   |

Le troisieme echec des lancements de 12:12 et 12:36 n'est pas un defaut du code : le test du bilan du lundi attend "300 commandes en moyenne le samedi de 13 h a 14 h", et les commandes creees par les etapes precedentes du meme test tombent dans ce creneau quand la suite est lancee un samedi entre 13 h et 14 h, heure de Douala. Le 2026-11-28 est un samedi : a 12:12 et 12:36 UTC le test lisait 301 ; relance a 13:01 UTC, il passe. Il echoue de la meme facon avec le code de `origin/main`.

Ces tests ne font pas partie des cinq portes (`pnpm test:db` les lance a part). Ils ne sont pas corriges ici : ils ne touchent ni les postes ni les droits.

## 7. Verification a l'ecran

Vrai navigateur (Chromium de Playwright), application en mode developpement contre la pile `roles-lot1-corr`, restaurant de test avec six membres (proprietaire, gerant, chef, serveur, caissier, et une personne a quatre postes) et trois invitations en attente.

80 cas : 4 personnes, 8 ecrans, 5 largeurs (375, 768, 1024, 1280, 1440), clair et sombre. Pour chaque cas : une capture, et des mesures lues dans la page.

| Mesure                                                        | Resultat sur les 80 cas |
| ------------------------------------------------------------- | ----------------------- |
| debordement horizontal de la page                             | 0                       |
| element visible hors de l'ecran (hors zone qui defile expres) | 0                       |
| theme rendu = theme demande (classe et couleur de fond)       | 80 sur 80               |
| erreur de chargement                                          | 0                       |

Ecrans : equipe, droits par poste, fenetre d'ajout d'un membre, reglage des droits d'une personne (proprietaire) ; equipe et abonnement (gerant) ; commandes (serveur) ; accueil (personne a quatre postes).

Constats lus sur les captures et dans la page :

- Equipe : la personne a quatre postes porte quatre pastilles, sur deux lignes a 375 et a 1024, sans rien pousser hors de la carte.
- Droits par poste : le tableau fait 1382 px de large a 375 et 1513 px a 1280. Il defile dans son propre cadre, la colonne des droits reste fixe, la page ne deborde pas. 242 interrupteurs, 40 inactifs (les 4 droits "a venir" sur 10 postes), 4 mentions "a venir", 3 phrases sous Annuler, Remise et Rembourser.
- Gerant, invitations : "Renvoyer" et "Annuler" sur l'invitation d'un serveur et sur celle d'un gerant ; aucun bouton sur l'invitation de gerant a laquelle le proprietaire a ajoute le paiement.
- Gerant, abonnement : la formule en cours et la phrase "Seul le proprietaire paie l'abonnement et change de formule." Aucun bouton.
- Fenetre d'ajout : les 10 postes pour le proprietaire et pour le gerant, groupe nomme "Postes". A 375 et a 1024 la liste defile dans la fenetre, et le bouton d'envoi s'atteint sans etre couvert.
- Cuisine : le serveur est renvoye vers `/unauthorized` ; la personne a quatre postes entre.
- Barre du bas a 375 : serveur "Accueil, Commandes, Caisse, Service, Organisation" (pas de cuisine) ; caissier "Accueil, Commandes, Caisse, Organisation" ; chef "Accueil, Commandes, Cuisine, Organisation, Analyse" ; personne a quatre postes "Accueil, Commandes, Caisse, Cuisine, Service" ; proprietaire inchange.

Un defaut trouve a l'ecran et corrige : a 375 px, sur une invitation en attente, le bouton "Annuler" sortait de la carte et se lisait "A". Les boutons passent sous le texte sur telephone. Mesure apres correction : 0 bouton hors de sa carte. Ce defaut existait deja sur `origin/main` (memes classes).

Limites, a lire comme non verifie :

- Mode developpement, pas le build de production, et pas d'appareil reel. La regle 8 du depot demande aussi `pnpm build && pnpm start` pour un changement de mise en page : le build passe, il n'a pas ete servi ni regarde.
- La pile locale est sur un port que la politique de securite du navigateur ne connait pas : les lectures faites par le navigateur vers la base sont bloquees (cloche de notifications, plan de salle). Les ecrans verifies ici recoivent leurs donnees du serveur et ne sont pas concernes. L'ecran de cuisine et la caisse, eux, n'ont pas ete regardes pleins.
- Deux pastilles flottantes visibles sur les captures (en bas a gauche et en bas a droite) sont des outils de developpement, absents en production.
- 28 cas signalent deux liens "coupes" a 375 et 768 : ce sont le premier et le dernier onglet de la barre du bas, fixee a l'ecran, que ma mesure compare a tort a un cadre parent. Verifie sur les captures : les cinq onglets sont entiers.

## 8. Balayages de fin de lot

| Commande (conception D.2)                                        | Resultat                                                          |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| 2. anciennes constantes                                          | 0 ligne                                                           |
| 3. anciennes colonnes, hors types generes                        | 1 fichier, `tests/journeys/fixtures/schema.sql` (instantane gele) |
| 4. anciens codes, guillemets simples ET doubles, avec exclusions | 0 ligne                                                           |
| 4. sans exclusion (temoin)                                       | 8 lignes, dans les deux fichiers exclus (5 et 3)                  |

## 9. `scripts/create-superadmin.ts`

Lance contre la pile `roles-lot1-corr` : il cree le compte et un restaurant, puis echoue a creer la ligne de plateforme (`Only super_admin users can create a super_admin row`). Cause lue en base : le declencheur `prevent_super_admin_elevation` ne reconnait un appel de service que par le reglage `request.jwt.claim.role`, que l'API de la base ne pose plus. Il laisse en plus un restaurant sans proprietaire, avec une formule `premium` qui n'existe pas. Le script est supprime. Le chemin qui fonctionne est `scripts/manage-super-admin.js` (16 controles sur 16 en phase B).

## 10. Nettoyage

Bases jetables creees puis supprimees sur le serveur du banc : `roles_lot1_c_test`, `roles_lot1_c_mig4`, `roles_lot1_c_temoin` (deux fois), `roles_lot1_c_final`. Pile `roles-lot1-corr` arretee et supprimee. Copie de travail temporaire de `origin/main` retiree par `git worktree remove`. Aucun fichier du depot deplace : le banc lisait les migrations en place.
