# Lot 1 des roles, tour de corrections : ecarts et choix

Date : 2026-11-28. Branche `feat/roles-postes-lot1`. Ce tour corrige les constats de trois audits (securite, regression, conformite) et les cinq points decides par le responsable. References : `ecarts-phase-a.md`, `ecarts-phase-b.md`, `preuves-corrections.md`, `deroule-production.md`.

Regle suivie, la meme que dans les deux phases : la ou une decision etait ambigue, impossible telle quelle ou muette, la variante la plus sure est codee, et elle est ecrite ici avec sa raison. Trois points demandent une confirmation du responsable : C1, C2 et C12.

## 1. Constat par constat

Identifiants : S = audit de securite, R = audit de regression, C = audit de conformite, H = constats hors audit.

| Constat                                                          | Etat                        | Ce qui a ete fait                                                                                                                                                             |
| ---------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-M1 supplement payant rendu gratuit sans `menu.price`           | corrige                     | declencheur `garder_prix_carte` etendu au DELETE, meme regle dans `actionDeleteModifier`                                                                                      |
| S-M2 et R-M1 l'ancien administrateur garde le paiement           | corrige                     | le declencheur retire `billing.manage` quand ses postes changent ; l'acceptation d'une invitation `admin` ne le copie plus ; MIG4 liste les autres membres qui le portent     |
| S-L1 un gerant peut creer un gerant                              | conserve                    | decision du responsable (cahier des charges 3.6, conception D.3). Aucun changement                                                                                            |
| S-L2 restrictions de l'ancien role `admin` perdues               | corrige                     | controle prealable 3.1 de `deroule-production.md`, avec sa requete et la consigne de report                                                                                   |
| S-L3 la garde du proprietaire ne couvre pas la desactivation     | corrige                     | la base refuse `is_active = false` seul sur le proprietaire d'un restaurant ouvert (voir C4)                                                                                  |
| S-L4 changer un prix sans toucher la colonne prix                | non corrige, justifie       | limite inherente a une garde par colonne (echanger deux noms, supprimer un plat). L'audit la classe "a savoir, pas a corriger au lot 1". Le journal d'audit en garde la trace |
| S-P1 et H5 liberer une table avec `kitchen.track` seul           | corrige                     | confirme par lecture, puis `actionReleaseTable` et son bouton exigent `orders.take`                                                                                           |
| R-H1 aucune verification a l'ecran                               | corrige, sauf appareil reel | 80 cas en developpement puis 230 cas sur le build de production servi, un defaut trouve et corrige (voir C9 et C16)                                                           |
| R-H2 parcours et ancien code contre nouvelle base                | corrige                     | parcours 03 etendu et joue, parcours 04 et 08, tests d'integration, ancien code contre la nouvelle base (`preuves-corrections.md`)                                            |
| R-M2 le gerant voit des boutons de paiement refuses              | corrige                     | `SubscriptionManager` recoit `canPay` (droit entier) : sans lui, ni formules ni portail, une phrase le dit                                                                    |
| R-M3 invitation qu'on peut envoyer mais pas annuler              | corrige                     | annuler ou renvoyer suit la regle pour donner ; boutons par ligne avec la meme regle                                                                                          |
| R-M4 et C-M3 protections affichees qui n'existent pas            | corrige                     | quatre droits "a venir" (interrupteur inactif), mentions vraies, une phrase sous Annuler, Remise et Rembourser                                                                |
| R-M5 le coach hebdomadaire part selon le nom du poste            | corrige                     | il part a qui detient `reports.money`, reglages compris ; echec ferme si les reglages ne se lisent pas                                                                        |
| R-M6 et H2 mode lecture seule mort de `SettingsForm`             | corrige                     | `canEdit` retire du formulaire et du panneau des rappels, test renomme `SettingsForm.garde-settings-edit`                                                                     |
| R-M7 le deroule ignore la quatrieme migration                    | corrige                     | `deroule-production.md` cree, section E.2 de la conception mise a jour (cinq migrations)                                                                                      |
| R-B1 double conversion `as unknown as AdminUser[]`               | corrige                     | type `FloorServer`                                                                                                                                                            |
| R-B2 libelles de poste en trois exemplaires                      | corrige                     | une seule source, `users.role<Poste>` (voir C6)                                                                                                                               |
| R-B3 et C-B2 cles i18n mortes, message qui cite l'administrateur | corrige                     | 10 cles et le bloc `permissions.poste` retires dans les deux langues, `orders.cancelNeedsMoneyAuthority` reecrit                                                              |
| R-B4 commentaires perimes                                        | corrige                     | `reports.view`, `orders.view`, `orders.manage`, `settings.view` remplaces dans 9 fichiers                                                                                     |
| R-B5 groupe de cases sans nom accessible                         | corrige                     | `aria-labelledby` vers le libelle visible                                                                                                                                     |
| R-B6 la console de plateforme affiche les codes                  | corrige                     | libelles des postes                                                                                                                                                           |
| R-B7 `scripts/create-superadmin.ts` livre sans preuve            | corrige                     | prouve casse sur le banc, donc supprime (voir C7)                                                                                                                             |
| R-B8 et C-B1 barre du bas en cumul                               | corrige                     | union des onglets des postes, filtree par les droits, 5 au plus                                                                                                               |
| R-B9 balayage aveugle aux guillemets doubles                     | corrige                     | commande 4 de la conception corrigee, relancee : 0 ligne                                                                                                                      |
| C-M1 un droit borne ne se retire pas depuis l'ecran              | corrige                     | eteindre une case bornee ecrit `false` ; "defaut" ramene au niveau borne                                                                                                      |
| C-M2 et H3 `kitchen.track` ne ferme rien                         | corrige                     | route `/kitchen`, statuts "en preparation" et "pret", en base et dans les actions (voir C2)                                                                                   |
| C-B3 le choix propose les 10 postes a tout invitant              | corrige                     | seuls les postes que l'acteur peut donner sont proposes                                                                                                                       |
| C-B4 cas manquants dans la fixture partagee                      | corrige en partie, justifie | 12 cas ajoutes (points 1 a 6). Point 7 non exprimable (voir C8)                                                                                                               |
| H1 exigence facultative de `getAuthenticatedUserForTenant`       | corrige                     | exigence obligatoire, `MEMBER_ONLY` nomme pour les notifications, temoin de type                                                                                              |
| H4 un gerant peut creer un gerant                                | conserve                    | decision du responsable                                                                                                                                                       |

## 2. Choix a connaitre

### C1. Les corrections de base sont faites dans MIG1 et MIG3, pas dans une migration nouvelle

- Consigne : "SQL changes go into new migration(s) after 20261128100300 unless the bug is inside a not-yet-applied migration where editing is cleaner".
- Constat : trois corrections touchent des fonctions definies par MIG1 et MIG3 (`sync_postes_admin_users`, `accept_invitation_membership`, `garder_prix_carte`, `garder_proprietaire`). Ces migrations ne sont appliquees nulle part : ni en production, ni sur le banc commun. Les corriger dans une migration nouvelle aurait demande de recopier quatre corps de fonctions une troisieme fois, plus une quatrieme dans le script de retour, avec un test de copie de plus.
- Code : MIG1 et MIG3 sont corrigees en place. La seule chose reellement nouvelle, la garde des statuts de cuisine, est dans une migration nouvelle : `20261128100400_garde_statut_cuisine.sql`, avec son script de retour.
- Consequence : MIG4 compare l'empreinte de `accept_invitation_membership` a celle du jour de sa redaction. L'empreinte attendue est mise a jour (`ea53f83f...`), et MIG4 a ete rejouee sur le banc avec la nouvelle valeur.
- A confirmer : si ces migrations ont ete appliquees quelque part que j'ignore, il faut les y rejouer.

### C2. "Servi" reste ouvert a la salle ET a la cuisine

- Decision du responsable : "preparing/ready transitions require kitchen.track, served/delivered stay on orders.take".
- Constat : l'ecran de cuisine porte un bouton "Termine" sur un ticket pret (`kds-ticket.config.ts`, `ready` vers `delivered`). Reserver "servi" a `orders.take` seul aurait retire ce bouton au cuisinier et au chef, qui n'ont pas ce droit : les tickets prets seraient restes dans leur colonne jusqu'a ce qu'un serveur les marque servis. Ce serait une regression, et aucune preuve demandee ne l'exigeait (les preuves demandees : caissier et serveur refuses sur "en preparation", serveur autorise sur "servi").
- Code : "servi" garde l'exigence d'avant ce tour, `orders.take` OU `kitchen.track`. Le serveur sert, comme demande ; le cuisinier garde son bouton.
- A confirmer par le responsable : si "servi" doit vraiment etre ferme a la cuisine, c'est une ligne dans `orderStatusRequirement` et une dans le declencheur, plus le retrait du bouton "Termine" pour qui n'a pas `orders.take`.

### C3. `pending` et l'envoi d'un service ne changent pas

Remettre une commande "en attente" et retenir ou envoyer un service (`actionSetCourseHeld`) gardent `orders.take` OU `kitchen.track`. La decision ne les citait pas ; l'envoi d'un service n'est appele que depuis l'ecran de cuisine, desormais ferme a qui n'a pas `kitchen.track`.

### C4. Le "drapeau de plateforme" est la date posee sur la ligne

L'audit proposait de refuser la desactivation du proprietaire "sauf drapeau de plateforme". La plateforme et les actions d'equipe ecrivent toutes deux en service_role, par l'API de la base : un reglage de session n'est pas posable de la. Les deux gestes de la plateforme se reconnaissent a ce qu'ils datent la ligne dans la meme ecriture (`banned_at` pour bannir, `deleted_at` pour retirer), ce que le geste d'equipe ne fait jamais. La garde refuse donc `is_active = false` quand ni l'une ni l'autre date n'est posee, et seulement pour un restaurant ouvert (l'anonymisation d'un restaurant ferme reste possible).

### C5. MIG4 liste, elle ne bloque pas

Le controle prealable de MIG4 imprime chaque membre non proprietaire, hors ancien administrateur, qui porte `billing.manage` entier, puis leur nombre. Il ne fait pas echouer la migration : ce reglage peut etre un choix du proprietaire. La meme requete est dans `deroule-production.md` (controle 3.2), a lancer avant.

### C6. Une seule source pour le nom des postes, et les e-mails prennent des accents

`permissions.poste.*` et la table en dur de `email.templates.ts` sont supprimees. Tout lit `users.role<Poste>`. L'e-mail d'invitation lit ces cles dans `fr-FR.json` : il ecrit maintenant "Gérant" et "Réception" avec leurs accents, alors que le reste de l'e-mail est sans accent. C'est l'orthographe correcte ; harmoniser tout l'e-mail est hors de ce tour.

### C7. `scripts/create-superadmin.ts` est supprime

L'audit demandait de le prouver ou de le retirer. Lance contre la pile locale, il cree le compte et un restaurant, puis echoue a creer la ligne de plateforme : le declencheur `prevent_super_admin_elevation` ne reconnait un appel de service que par un reglage que l'API de la base ne pose plus. Il laisse derriere lui un restaurant sans proprietaire, avec une formule `premium` qui n'existe pas. Il etait deja casse avant le lot (valeur de role refusee). Le fichier et ses quatre variables de `.env.example` sont retires. Le chemin qui fonctionne reste `scripts/manage-super-admin.js`.

### C8. Membre inactif, retire, ou sans double authentification : pas de cas partage

La fixture partagee decrit ce que lit la fonction de resolution : des postes, un reglage par personne, des reglages par poste. Un membre retire ou une session sans double authentification ne sont pas des entrees de cette fonction cote TypeScript : ils sont ecartes avant, par le filtre de la requete et par `getAuthenticatedUser`. Les ajouter a la fixture aurait demande d'inventer une seconde fonction a tester. Ils restent couverts de chaque cote : `membres_retires.test.sql` et `double_auth_et_proprietaire.test.sql` en base, `get-session-tenant-scope.test.ts` (membre retire refuse, avec son temoin) cote serveur.

### C9. Verification a l'ecran : faite dans un vrai navigateur, pas sur un appareil

Le navigateur integre a la session ne rendait pas la page de facon fiable (volet masque : captures figees, mise en page non terminee). La verification est donc faite avec le Chromium de Playwright, qui regle de vraies largeurs et le theme : 80 cas, detail dans `preuves-corrections.md` section 7.

Un defaut a ete trouve et corrige : a 375 px, le bouton "Annuler" d'une invitation en attente sortait de sa carte. Il existait deja sur `origin/main`, mais il est sur un ecran que ce lot modifie.

Au second tour, le build de production a ete servi et regarde (`pnpm build && pnpm start`, 230 cas, cuisine et caisse pleines) : `preuves-corrections.md` section 7 bis et C16 ci-dessous. Ce qui reste non verifie : un appareil reel.

### C10. Le banc des parcours : un script isole, pas `scripts/run-journeys-local.sh`

Le script du depot fixe les ports 54321 a 54324, deja pris sur cette machine par une pile `web` qui n'est pas la notre, et il deplace `supabase/migrations/*.sql` hors de l'arbre pendant qu'il tourne. J'ai donc monte une pile a part (identifiant `roles-lot1-corr`, ports 58321 a 58329) avec un script garde hors du depot, qui lit les migrations sans les deplacer et charge le meme instantane gele. Le script du depot n'est pas modifie. Les trois autres piles (`bancattabl`, `lot4-rapports`, `web`) n'ont ete ni arretees ni touchees.

### C11. Petits choix d'interface

- Poste que l'acteur ne peut pas donner : il n'est pas propose (au lieu d'etre grise). Un poste deja porte par la personne reste affiche, pour pouvoir le retirer.
- Droit "a venir" : l'interrupteur est inactif dans l'ecran par poste et dans le reglage par personne. Un test interdit qu'un de ces quatre codes soit lu ailleurs dans `src` : le jour ou il sert, le test echoue et il sort de la liste.
- Barre du bas : les onglets suivent un ordre fixe (accueil, commandes, caisse, cuisine, service, organisation, analyse). Les 11 listes d'un seul poste donnent le meme resultat qu'avant.
- Tableau de bord, action groupee "statut" : le bouton n'apparait que si au moins une commande choisie peut avancer avec les droits du membre.
- Reglage par poste : "Reinitialiser" remet tout le poste a son defaut. Reglage par personne : "Defaut des postes" remet un seul droit.

### C12. La garde des statuts de cuisine s'applique APRES le code, pas avant

- Consigne : "all 4 migrations incl. 20261128100300, BEFORE merge".
- Constat : la cinquieme migration, creee par ce tour, RETIRE un geste que l'ancien code offre encore au serveur et au caissier. Mesure, ancien code contre une base qui la porte : "en preparation" par un serveur rend une erreur 500, que la file hors ligne de la tablette rejoue comme une panne passagere. Entre l'application des migrations et la fusion, tout serveur ou caissier d'un restaurant sans cuisinier connecte verrait cette erreur.
- Choix : les quatre premieres migrations avant la fusion, comme demande. La cinquieme juste apres la mise en service du code (etape 6 bis de `deroule-production.md`), le jour meme. Le nouveau code ne depend pas d'elle : parcours 03 joue sans elle, 7 sur 7.
- A confirmer par le responsable. L'autre voie, tout appliquer avant, est possible si le proprietaire accepte cette erreur pendant la fenetre.

### C13. Tests d'integration : deux echecs anciens laisses, un corrige

`tests/integration` n'etait pas rejoue depuis le debut du lot. Un echec venait du lot (le bilan du lundi attendu "au proprietaire seulement") : le test est corrige. Deux autres existent aussi avec le code de `origin/main`, pour des causes sans rapport avec les postes (une garde des ardoises, un import de fournisseurs). Ils sont decrits dans `preuves-corrections.md` section 6 et ne sont pas corriges ici : chaque ligne modifiee de ce tour doit se rattacher aux roles.

## 3. Contre-audit du tour de corrections

Le contre-audit a rendu "ACCEPT WITH FIXES". Le responsable a accepte les ecarts C1, C2 et C12. Ses six constats :

| Constat                                                   | Etat                 | Ce qui a ete fait                                                                                                            |
| --------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| N1 `.gitleaks.toml` cite un fichier supprime              | corrige              | phrase retiree                                                                                                               |
| N2 commentaires perimes                                   | corrige              | les 7 endroits cites, plus 13 autres trouves par un balayage des anciens codes sans guillemets et des mentions "owner/admin" |
| N3 corbeille d'un supplement payant sans le droit de prix | corrige              | la corbeille n'est plus proposee ; tout refus de droit affiche une phrase precise, en francais et en anglais                 |
| N4 retirer un droit borne passait par le droit entier     | corrige              | decision du responsable : depuis le niveau borne, un seul clic ecrit `false`. L'ordre est borne, retire, entier              |
| N5 rendre indisponible puis creer un jumeau gratuit       | accepte comme limite | voir C14                                                                                                                     |
| N6 deux controles manquants au deroule                    | corrige              | controles 3.4 et 3.5 de `deroule-production.md`, requetes jouees sur le banc avec leurs temoins                              |
| F1 build de production servi, cuisine et caisse pleines   | fait                 | voir `preuves-corrections.md` section 7 bis, captures dans `docs/roles-personnel/captures/`                                  |

### C14. Limite acceptee : un supplement gratuit qui remplace un supplement payant (N5)

Decision du responsable : limite inherente, de la meme famille que L4.

Le detour : avec "Modifier la carte" seul, on rend "Fromage 500" indisponible, puis on cree un supplement "Fromage" a 0. Le client obtient le fromage sans le payer, et personne n'a touche a un prix.

Pourquoi ce n'est pas ferme par une garde. La garde du prix juge une COLONNE : elle refuse de changer un prix, de creer un supplement payant, de supprimer un supplement payant. Ici aucune de ces ecritures n'a lieu. Les deux gestes du detour sont des gestes ordinaires de la carte, que le droit "Modifier la carte" doit garder :

- rendre un supplement indisponible, c'est la rupture de stock en plein service. L'interdire sans "Modifier les prix" bloquerait la cuisine le jour ou il n'y a plus de fromage ;
- creer un supplement gratuit, c'est "sans oignon" ou "bien cuit". C'est de l'edition de carte, a n'importe quel prix que le droit de prix autorise, zero compris.

Pour le fermer il faudrait que la base sache que deux supplements sont "le meme", ce qu'un nom ne dit pas. C'est le meme constat que L4 (echanger les noms de deux plats, deplacer un supplement) : qui peut modifier la carte peut en changer le sens. La reponse n'est pas une garde de plus mais la trace : chaque ecriture de la carte est au journal d'audit, avec son auteur.

A savoir pour le proprietaire : retirer "Modifier les prix" a quelqu'un l'empeche de changer un prix affiche. Cela ne l'empeche pas de reorganiser la carte. S'il ne fait pas confiance a une personne pour la carte, c'est "Modifier la carte" qu'il faut lui retirer.

### C15. Le premier clic sur une case bornee la laisse eteinte (N4)

Consequence de la decision N4. Une case bornee par defaut s'affiche eteinte. Un clic ecrit `false` : l'interrupteur reste eteint, parce que le droit etait deja "non" a l'ecran. Pour que le geste se voie, la mention change : "factures seulement" (ou "bientot, ...") disparait et le mot "retire" apparait a la place de "modifie". Le clic suivant donne le droit entier. "Reinitialiser" (par poste) ou "Defaut des postes" (par personne) ramene au niveau borne.

### C16. Le build de production local passe par un mandataire

La CSP de production n'admet, pour les appels du navigateur, que l'origine de la page et `https://*.supabase.co`. Une base locale en `http://localhost:<port>` est donc refusee, quel que soit le nom d'hote (c'etait la cause de la cuisine et de la caisse vides au tour precedent ; en developpement la CSP n'ouvre que le port 54321, pris ici par une autre pile). Sans toucher `next.config.mjs` ni `src/lib/csp.ts` : un petit mandataire local, garde hors du depot, sert l'application et l'API de la base sur UNE origine, `http://localhost:3190`. Le build est fait avec cette adresse. Une doublure locale de l'API du limiteur de debit laisse passer les routes limitees, qui repondent 429 en production sans limiteur. Rien de cela n'est dans le depot.

## 4. Fichiers proteges

Aucun fichier protege n'est modifie.
