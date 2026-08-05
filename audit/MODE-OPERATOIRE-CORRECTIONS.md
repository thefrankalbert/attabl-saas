# MODE OPERATOIRE : COMMENT EXECUTER LE DOSSIER DE TRAVAUX

**A garder ouvert pendant toute la duree des corrections.**
Document de reference : `DOSSIER-TRAVAUX-ATTABL.md`
Derniere mise a jour : 26 juillet 2026

---

## AVERTISSEMENT PRELIMINAIRE

Tu n'es pas developpeur. Tu ne pourras pas relire le code produit par Claude Code et reperer une erreur. Le projet est commercial, avec de vrais clients dans la base.

Cela change une chose fondamentale dans la facon de travailler : **le danger principal n'est pas que Claude Code rate un probleme, c'est qu'il corrige un probleme qui n'existe pas, et casse au passage du code qui marchait.** Une correction inutile ne se voit pas. Elle passe la revue, elle passe la CI, et elle casse en production trois semaines plus tard.

Trois protections ont ete mises en place contre ca :

1. **Section 0.A du dossier** : chaque constat porte un niveau de preuve. `PROD` et `OUTIL` sont prouves. `CODE` est un raisonnement a reconfirmer avant toute correction.
2. **Section 0.B du dossier** : le protocole de contestation. Claude Code doit coller le code reel avant de le modifier, et declarer CONFIRME, PARTIELLEMENT EXACT, OBSOLETE ou FAUX.
3. **La section 4 de ce document** : ce que tu verifies toi-meme apres chaque lot, en cliquant, sans lire une ligne de code.

Si tu ne devais retenir qu'une chose : **apres chaque lot, fais les verifications de la section 4 avant de merger.** C'est ton seul filet.

---

## REGLE ZERO : ce qui ne se negocie pas

1. **Un lot = une branche = une PR.** Jamais deux lots dans la meme session. Si Claude Code propose d'enchainer, refuse.
2. **Aucune migration n'est appliquee en production tant qu'elle n'a pas tourne en vert sur la base de test locale.** Le LOT 1 touche la base qui contient tes 4 clients reels.
3. **Apres chaque lot, les 5 portes doivent etre vertes** avant de merger :
   ```
   pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage && pnpm build
   ```
4. **Sauvegarde de la base avant le LOT 1.** Tableau de bord Supabase, backup manuel, noter l'horodatage.
5. **Si Claude Code desactive un test pour faire passer sa correction, refuse et fais annuler.** C'est le signal d'alerte numero un.

---

## ETAT D'AVANCEMENT

| Etape                                           | Statut                                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Depot GitHub en prive                           | **FAIT le 26/07.** Verifie : clone anonyme echoue, 0 fork survivant                                               |
| Miroir GitLab non public                        | **VERIFIE le 26/07.** Mais il tourne toujours (run #684 a 05:51). A confirmer cote GitLab : Private, pas Internal |
| Etat de la CI                                   | **VERIFIE le 26/07.** `security.yml` vert jusqu'au 20/07, rouge depuis le 21/07 sur `Dependency Audit` uniquement |
| Mot de passe `[MOT-DE-PASSE-PURGE-VOIR-PR-299]` | **A FAIRE**                                                                                                       |
| Sauvegarde manuelle Supabase                    | **A FAIRE**                                                                                                       |
| Etape 2 et suivantes                            | **A FAIRE**                                                                                                       |

---

## ORDRE REEL D'EXECUTION

L'ordre des lots dans le dossier est un ordre de **gravite**. L'ordre ci-dessous est un ordre d'**execution**, qui tient compte des dependances techniques. La difference : **la base de test doit exister avant tout ce qui touche a la base de donnees.**

| #   | Etape                                          | Qui         | Duree   | Prerequis           |
| --- | ---------------------------------------------- | ----------- | ------- | ------------------- |
| 1   | Fin du LOT 0 : mot de passe, sauvegarde        | **Toi**     | 15 min  | aucun               |
| 2   | LOT 7.1 + 7.2 : base de test locale qui tourne | Claude Code | 0,5 j   | Docker installe     |
| 3   | LOT 5 : montee Next 16.2.12 + overrides        | Claude Code | 0,5 j   | aucun               |
| 4   | LOT 1 : fuites RLS                             | Claude Code | 1 j     | etape 2             |
| 5   | LOT 2 : integrite financiere                   | Claude Code | 2 a 3 j | etape 2             |
| 6   | LOT 3 : perte de commandes hors ligne          | Claude Code | 2 a 3 j | aucun               |
| 7   | LOT 4 : controle d'acces applicatif            | Claude Code | 2 j     | etape 2             |
| 8   | LOT 7.3 : cablage CI                           | Claude Code | 0,5 j   | etapes 2 a 7        |
| 9   | **Porte de sortie pilote**                     | **Toi**     | 0,5 j   | tout ce qui precede |
| 10  | LOT 6 : integrite stock et base                | Claude Code | 1 a 2 j | apres pilote        |
| 11  | LOT 8 : dette et configuration                 | Claude Code | 2 j     | apres pilote        |

**Total avant premier utilisateur reel : environ 10 a 12 jours de travail effectif.**

---

## ETAPE 1 : CE QUI TE RESTE, AUJOURD'HUI (15 minutes)

### 1.1 Changer le mot de passe de demonstration

`[MOT-DE-PASSE-PURGE-VOIR-PR-299]` est publie en clair dans `docs/DEMO-PRESENTATION.md`. Le depot est prive maintenant, mais **cela ne defait pas les mois pendant lesquels il etait lisible.** L'identifiant reste valide tant que tu ne le changes pas.

Tableau de bord Supabase, projet `nqufpobuozrzwpeijkxt`, Authentication, Users. Comptes `owner@demo.attabl.com` a `serveur2@demo.attabl.com`.

**Verification** : la connexion avec `[MOT-DE-PASSE-PURGE-VOIR-PR-299]` echoue.

### 1.2 Sauvegarder la base

Supabase, Database, Backups. Sauvegarde manuelle. Note la date et l'heure.

### 1.3 Verifier le miroir GitLab

Va sur `gitlab.com/odcsupportagency/odc-support-agency-project`, Settings, General, Visibility. Le projet doit etre **Private**. S'il est en **Internal**, tout membre de l'instance GitLab peut le lire : passe-le en Private.

---

## ETAPE 2 : PREPARER LE TERRAIN

### 2.1 Mettre le dossier dans le depot

Copier les fichiers dans le depot, dans un dossier `audit/` :

```
audit/DOSSIER-TRAVAUX-ATTABL.md
audit/MODE-OPERATOIRE-CORRECTIONS.md
audit/ANNEXE-A-AUDIT-BASE-DE-DONNEES.md
audit/ANNEXE-B-AUDIT-DEPENDANCES-CONFIG.md
```

Committer. Claude Code pourra les lire directement a chaque session, au lieu que tu les colles.

Le depot etant prive, les garder versionnes ne pose plus de probleme.

### 2.2 Verifier que les outils sont installes

Dans un terminal :

```bash
docker --version
supabase --version
psql --version
```

Les trois doivent repondre par un numero de version. Si `supabase` manque : `brew install supabase/tap/supabase`. Si Docker manque : installer Docker Desktop et le lancer.

C'est le prerequis de la base de test. Sans elle, on ne peut ni tester les migrations RLS ni faire tourner les parcours, et le LOT 1 devient dangereux.

---

## ETAPE 3 : LA BOUCLE DE TRAVAIL AVEC CLAUDE CODE

Une session propre par lot. Le prompt d'ouverture est toujours ce squelette :

```
Lis audit/DOSSIER-TRAVAUX-ATTABL.md en entier avant de commencer.

Lis en priorite absolue :
- la section 0.A (niveau de confiance de chaque constat)
- la section 0.B (protocole de contestation, obligatoire)
- la section 3 (ce qui est deja correct, a ne pas casser)

Contexte a garder en tete : le proprietaire de ce projet n'est pas
developpeur. Il ne peut pas relire ton code. Le projet est commercial
avec de vrais clients en base. Une correction appliquee a tort est plus
dangereuse qu'un probleme non corrige, parce que personne ne la verra.

Tu travailles UNIQUEMENT sur le <LOT N>. Tu ne touches a aucun autre lot.
Tu ne refactorises rien qui ne soit pas cite dans un constat de ce lot.

Cree une branche `fix/lot-N-<nom-court>`.

Pour chaque constat du lot, dans l'ordre du document :

1. Produis d'abord le bloc de contestation de la section 0.B :
   ouvre le fichier cite, colle le code reel, declare CONFIRME /
   PARTIELLEMENT EXACT / OBSOLETE / FAUX.
2. Si CONFIRME : applique la correction decrite.
   Si PARTIELLEMENT EXACT : propose et ATTENDS ma reponse.
   Si OBSOLETE ou FAUX : n'applique rien, explique, passe au suivant.
3. Ecris le test decrit dans le critere d'acceptation.
4. Execute ce test et colle la sortie.
5. Un commit par constat, avec l'ID du constat dans le message.

A la fin du lot :
- Lance `pnpm typecheck && pnpm lint && pnpm format:check &&
  pnpm test:coverage && pnpm build`, colle les 5 sorties.
- Fais un tableau : constat / verdict / corrige oui-non / test ecrit.
- Liste separement tout ce que tu as remarque en passant et que tu
  n'as PAS corrige parce que hors perimetre.
- Dis-moi en francais simple ce que je dois cliquer dans l'application
  pour verifier moi-meme que rien n'est casse.

Si tu dois desactiver un test existant pour faire passer une correction,
ARRETE-TOI et explique le conflit. Ne desactive jamais un test.
```

Remplace `<LOT N>` par le lot du jour. Les particularites lot par lot sont ci-dessous.

---

## LES PROMPTS, LOT PAR LOT

### Prompt LOT 7.1 + 7.2 (base de test, a faire en premier)

```
[squelette ci-dessus]

LOT : sections 7.1 et 7.2 uniquement.

Objectif concret : que `bash scripts/run-journeys-local.sh` tourne et
produise un premier resultat vert de reference.

Le harnais n'est pas casse, il n'est jamais invoque avec un
environnement. Les 10 correctifs prealables de la section 7.1 suffisent.
Le plus important est le numero 2 (drift de nommage des prix Stripe :
ci.yml injecte ESSENTIEL/PREMIUM, le code exige STARTER/PRO/BUSINESS).

Ne cable RIEN en CI dans ce lot.

A la fin, dis-moi combien de tests passent sur les 35, et lesquels
restent skippes et pourquoi.
```

### Prompt LOT 5 (montee de dependances)

```
[squelette ci-dessus]

LOT : 5 en entier.

Attention : next, react, react-dom et eslint-config-next sont EPINGLES
en version exacte dans package.json. Un `pnpm update` ne les bougera
pas, il faut editer package.json.

Apres la montee, lance en priorite
`pnpm test -- src/__tests__/proxy.test.ts` avant tout le reste. C'est la
suite qui couvre l'isolation multi-tenant, et la CVE fermee est
justement un contournement de middleware.

Rappel du dossier section 2.A : `security.yml` etait VERT jusqu'au
20 juillet et n'est rouge que depuis le 21, sur le seul job
Dependency Audit. La porte fonctionne. Ne la desactive pas, ne la
rends pas non bloquante : remets-la au vert.

Ne deploie pas. Je verifierai moi-meme les 6 points manuels de la
section 5.1 sur une preview Vercel.
```

### Prompt LOT 1 (fuites RLS)

```
[squelette ci-dessus]

LOT : 1 en entier.

CONTRAINTE ABSOLUE : aucune migration n'est appliquee en production
dans cette session. Tu ecris les migrations dans supabase/migrations/,
tu les testes sur la base de test locale, tu ecris les tests pgTAP, et
tu t'arretes la. C'est moi qui declenche le deploiement.

DB-02 et DB-06 sont PROUVES EN PRODUCTION (requetes HTTP citees en
section 2). Pas besoin de les reconfirmer, corrige-les.
DB-01, DB-03, DB-07, DB-08, DB-12, DB-13 sont LU DANS LE CODE :
applique le protocole de contestation de la section 0.B avant de
toucher a quoi que ce soit.

Cree le dossier supabase/tests/ s'il n'existe pas. Chaque migration
doit avoir son test pgTAP.

Point de vigilance sur DB-03 : le COALESCE(is_active, true) est
indispensable, des lignes historiques peuvent avoir is_active a NULL.
Un simple `AND is_active` couperait l'acces a des utilisateurs
legitimes. Le test de non-regression sur le membre actif est
obligatoire.

Point de vigilance sur DB-02 : apres avoir revoque les colonnes,
le storefront va probablement casser (il lit peut-etre tenants
directement). C'est ATTENDU. La solution est de passer par
get_tenant_by_slug, PAS de reouvrir les grants.

A la fin, donne-moi la liste exacte des migrations creees, dans
l'ordre d'application, et dis-moi precisement quelles pages de
l'application je dois ouvrir pour verifier que rien n'est casse.
```

### Prompt LOT 2 (argent)

```
[squelette ci-dessus]

LOT : 2 en entier. Commence par F1 et F2, les deux critiques.

Tous les constats de ce lot sont LU DANS LE CODE. Protocole de
contestation obligatoire sur chacun.

Sur F1, avant de coder : compte combien de tenants ont aujourd'hui
subscription_status='pending' et stripe_subscription_id IS NULL.
Ecris-moi le chiffre. La migration corrective de donnees en depend.

Sur F2, avant de coder : compte combien de commandes existantes ont
un display_currency different de la devise de leur tenant. Si le cas
s'est deja produit, il faudra une migration corrective des donnees,
et il faudra me dire quelles commandes sont concernees.

Sur F5, la partie remboursement est un TOCTOU : summarize est lu
AVANT l'insertion. Ne te contente pas d'ajouter un plafond, il faut
une RPC avec SELECT FOR UPDATE.
```

### Prompt LOT 3 (hors ligne)

```
[squelette ci-dessus]

LOT : 3 en entier.

OFF-01 est la correction de plus fort impact du dossier entier et
elle tient en une ligne : ajouter `mutations: { networkMode:
'offlineFirst' }` dans makeQueryClient(). Fais-la en premier,
isolement, avec son test.

Attention sur OFF-03 : ne purge PAS l'outbox aveuglement a la
deconnexion, ca ferait perdre des commandes payees. Le bon
comportement est de drainer d'abord, et de bloquer la deconnexion
si la file n'est pas vide.

Attention sur RUNTIME_DOC_CACHES : les noms de cache actuels sont
CORRECTS, verifies contre @serwist/next@9.5.11. Tu ajoutes
'cross-origin' a la liste, tu ne touches pas aux autres.

Ecris tests/e2e/pos-offline.spec.ts. C'est le test qui manque et
qui a laisse passer OFF-01.
```

### Prompt LOT 4 (controle d'acces)

```
[squelette ci-dessus]

LOT : 4 en entier.

Sur HDR-REFERER, l'option 1 (ne jamais reinjecter le slug depuis le
Referer) est la bonne mais peut casser des appels existants.
Commence par cartographier toutes les routes /api/ qui dependent de
cette branche, liste-les moi, et propose l'option 1 ou 2 en fonction
de ce que tu trouves. Ne te lance pas sans m'avoir montre la liste.

Sur SESSION-FALLBACK, verifie bien le cas super_admin : il n'a pas
de ligne admin_users sur les tenants clients, le layout lui fabrique
un owner virtuel. Si tu leves une erreur sans traiter ce cas, tu
casses la console plateforme.

CSP-CUSTOM-DOMAIN est trivial (une ligne), fais-le en premier.
```

### Prompt LOT 7.3 (cablage CI)

```
[squelette ci-dessus]

LOT : section 7.3 uniquement.

Le job journeys-critical doit lancer les trois filtres en UNE SEULE
invocation de run-journeys-local.sh, pas en trois. Trois invocations
redemarrent la stack Supabase trois fois, soit 6 a 10 minutes perdues.

Ce job ne doit avoir besoin d'AUCUN secret. Tout est local.

Les jobs Stripe restent en nocturne, jamais sur PR, a cause de la
limite du nombre de Test Clocks actives par compte Stripe.
```

---

## ETAPE 4 : COMMENT TU VERIFIES TOI-MEME, SANS LIRE DE CODE

**C'est la section la plus importante de ce document pour toi.**

Apres chaque lot, avant de merger, fais les manipulations ci-dessous. Elles ne demandent aucune competence technique. Si l'une echoue, ne merge pas : redonne le resultat a Claude Code.

Pour toutes ces verifications, travaille sur la **preview Vercel de la branche**, pas sur la production. Claude Code peut te donner l'URL de preview, ou tu la trouves dans la PR GitHub.

### Apres le LOT 5 (montee Next)

| #   | Ce que tu fais                                                        | Ce que tu dois voir                                                  |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Ouvrir la page d'accueil                                              | La page s'affiche normalement, sans page blanche ni message d'erreur |
| 2   | Ouvrir `/login` et te connecter                                       | Tu arrives sur le tableau de bord                                    |
| 3   | Ouvrir la carte d'un restaurant (`radisson.attabl.com` ou equivalent) | Le menu s'affiche avec les photos et les prix                        |
| 4   | Onglet GitHub Actions apres le merge                                  | `Security Scan` repasse au **vert**                                  |

Si l'un des trois premiers echoue : la montee de version a casse quelque chose. Ne merge pas.

### Apres le LOT 1 (fuites RLS) : le plus delicat

**D'abord, le test de la fuite.** Ouvre un terminal et colle exactement ceci, en remplacant `LA_CLE` par la cle anon (Claude Code peut te la donner, ou elle est dans Supabase, Settings, API, `anon public`) :

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: LA_CLE" -H "Authorization: Bearer LA_CLE" \
  "https://nqufpobuozrzwpeijkxt.supabase.co/rest/v1/tenants?select=stripe_customer_id&limit=1"
```

Le terminal affiche un nombre. **Tu veux voir `401` ou `403`.** Si tu vois `200`, la fuite est toujours ouverte.

Puis la meme commande en remplacant `stripe_customer_id` par `slug`. **La tu veux voir `200`** : c'est la preuve que le storefront peut encore lire ce dont il a besoin.

**Ensuite, le parcours client complet**, sur la preview :

| #   | Ce que tu fais                           | Ce que tu dois voir                                             |
| --- | ---------------------------------------- | --------------------------------------------------------------- |
| 1   | Ouvrir la vitrine d'un restaurant        | Le nom, le logo et les couleurs du restaurant s'affichent       |
| 2   | Parcourir le menu                        | Les categories et les plats s'affichent avec les prix           |
| 3   | Ajouter au panier et commander           | La commande passe, tu vois l'ecran de confirmation              |
| 4   | Te connecter en admin, ecran cuisine     | La commande que tu viens de passer apparait                     |
| 5   | Ouvrir les parametres de l'etablissement | Les reglages s'affichent, tu peux en modifier un et sauvegarder |
| 6   | Ouvrir la page equipe                    | La liste des membres s'affiche                                  |

**Le point 1 est le plus important.** C'est exactement ce que DB-02 revoque. Si le nom ou le logo du restaurant ne s'affiche plus, la correction est trop large.

### Apres le LOT 2 (argent)

| #   | Ce que tu fais                                                                   | Ce que tu dois voir                                                                |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Creer un compte tout neuf, puis creer un etablissement                           | Le plan affiche est l'**essai** ou **Starter**, jamais Business                    |
| 2   | Depuis ce compte d'essai, ouvrir la page Inventaire                              | Elle est bloquee ou propose de passer a un plan superieur                          |
| 3   | Passer une commande de 5 000 XAF                                                 | Le total affiche a l'ecran de paiement est bien **5 000 XAF**, pas 500 000, pas 50 |
| 4   | Encaisser cette commande, puis cliquer une deuxieme fois tres vite sur Encaisser | Le systeme refuse le deuxieme encaissement, ou n'enregistre qu'un seul paiement    |
| 5   | Ouvrir l'historique des paiements de cette commande                              | **Une seule ligne**, pas deux                                                      |
| 6   | Si tu as un coupon de test, l'appliquer                                          | La remise correspond bien au montant annonce                                       |

Le point 3 est le test de F2. Le point 5 est le test de F5. Ce sont les deux qui touchent directement a ta caisse.

### Apres le LOT 3 (hors ligne) : le test le plus important du projet

Ce test se fait sur une **vraie tablette ou un vrai telephone**, pas sur un simulateur.

| #   | Ce que tu fais                                                                | Ce que tu dois voir                                                                                                       |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ouvrir la caisse (POS) sur la tablette, connecte au wifi                      | L'ecran de caisse s'affiche normalement                                                                                   |
| 2   | **Couper le wifi** (mode avion) sans fermer l'application                     | Un bandeau "mode hors ligne" apparait                                                                                     |
| 3   | Composer une commande et cliquer Encaisser                                    | Un message apparait : commande **mise en file d'attente**. Pas une erreur rouge, pas rien du tout                         |
| 4   | Recommencer 5 fois avec des commandes differentes                             | A chaque fois, le message de mise en file. Le compteur de commandes en attente monte : 1, 2, 3, 4, 5, 6                   |
| 5   | **Remettre le wifi**                                                          | Le compteur redescend a zero                                                                                              |
| 6   | Ouvrir l'ecran cuisine sur un autre appareil                                  | **Exactement 6 commandes.** Ni 0, ni 12                                                                                   |
| 7   | Se deconnecter de la tablette, puis rouvrir l'application sans se reconnecter | Aucune donnee de la session precedente ne s'affiche : pas de chiffre d'affaires, pas de commandes, pas de noms de clients |

**Si le point 3 affiche une erreur rouge, ou si rien ne se passe du tout, la correction OFF-01 n'a pas fonctionne.** C'est le scenario exact qui fait perdre un client en un service. Ne merge pas.

**Si le point 6 affiche autre chose que 6, arrete tout et redonne le chiffre a Claude Code.** Moins de 6 : des commandes sont perdues. Plus de 6 : des doublons. Les deux sont bloquants.

### Apres le LOT 4 (controle d'acces)

Ce test demande deux comptes. Cree un compte serveur dans ton restaurant de test.

| #   | Ce que tu fais                                                               | Ce que tu dois voir                           |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | Te connecter avec le compte serveur                                          | Tu accedes a la caisse et aux commandes       |
| 2   | Essayer d'ouvrir les parametres de l'etablissement                           | **Refuse**                                    |
| 3   | Essayer d'ouvrir la page equipe                                              | **Refuse**                                    |
| 4   | Avec le compte proprietaire, noter l'adresse d'une commande (l'URL complete) | Tu la copies                                  |
| 5   | Te connecter sur un **autre** etablissement et coller cette adresse          | **Refuse**, ou page introuvable               |
| 6   | Toujours avec le compte proprietaire, tout doit fonctionner comme avant      | Parametres, equipe, rapports, tout accessible |

Le point 5 est le test d'isolation entre restaurants. Le point 6 est le test de non-regression : une correction de securite trop stricte casse les usages legitimes.

### Apres le LOT 7.3 (CI)

| #   | Ce que tu fais                       | Ce que tu dois voir                                        |
| --- | ------------------------------------ | ---------------------------------------------------------- |
| 1   | Ouvrir la PR sur GitHub              | Un job `Journeys (BOLA + commande + permissions)` apparait |
| 2   | Attendre qu'il finisse               | **Vert**, en 8 a 12 minutes                                |
| 3   | Cliquer dessus et regarder le detail | Les tests BOLA passent, pas skippes                        |

---

## SIGNAUX D'ALARME : quand arreter et demander

Ces cinq situations demandent un arret, pas une insistance.

1. **Claude Code desactive un test, le marque `skip`, ou baisse un seuil de couverture** pour faire passer sa correction. C'est toujours le mauvais choix. Fais annuler.
2. **Claude Code modifie un fichier qui n'est cite dans aucun constat du lot en cours.** Demande pourquoi. Si la reponse est "pour faire propre", fais annuler.
3. **Une verification de la section 4 echoue et Claude Code te dit que c'est normal.** Ce n'est jamais normal, sauf pour le cas explicitement prevu du LOT 1 point 1 (le storefront a corriger via `get_tenant_by_slug`). Demande la preuve.
4. **Claude Code n'arrive pas a faire tourner la base de test locale et propose de tester sur la production.** Refus categorique. C'est un probleme d'environnement (Docker, CLI supabase, port occupe), pas une raison de toucher a la base des clients.
5. **Un constat est declare FAUX sans que le code soit colle.** Le protocole de la section 0.B exige le code reel. Sans code colle, la declaration ne vaut rien, dans un sens comme dans l'autre.

---

## RYTHME REALISTE

- **Cette semaine** : etape 1 (15 minutes), puis etapes 2 et 3 (base de test, montee Next). Tu finis la semaine avec un harnais qui tourne, le contournement de middleware ferme, et `security.yml` de nouveau vert.
- **Semaine 2** : LOT 1 et LOT 2. Les deux qui touchent aux donnees et a l'argent. A faire reposes.
- **Semaine 3** : LOT 3 et LOT 4, puis cablage CI.
- **Semaine 4** : porte de sortie, verifications manuelles, premier restaurant pilote.

Un mois. C'est le delai realiste entre aujourd'hui et un premier utilisateur reel dans de bonnes conditions.

---

## SI TU BLOQUES

Trois situations frequentes et leur reponse :

1. **La base de test locale ne demarre pas.** C'est Docker, la CLI supabase, ou un port occupe. Ne laisse pas contourner en pointant sur la production.
2. **Une correction du LOT 1 casse le storefront.** C'est prevu et documente : DB-02 revoque des colonnes que le storefront lisait peut-etre directement. La solution est `get_tenant_by_slug`, pas de reouvrir les grants.
3. **Un constat te parait faux.** Ils citent tous un fichier et une ligne. Si Claude Code dit qu'un constat n'est plus exact, exige le code colle, pas l'affirmation. Un constat ecarte avec preuve est une bonne nouvelle.
