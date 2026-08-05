# DOSSIER DE TRAVAUX ATTABL SAAS

**Destinataire** : Claude Code, sur le depot `thefrankalbert/attabl-saas`
**Emis le** : 26 juillet 2026
**Base auditee** : commit `f2277231` (main, 21/07/2026), 908 commits
**Objectif** : rendre le produit apte a recevoir de premiers utilisateurs reels

---

## 0. COMMENT UTILISER CE DOCUMENT

### 0.1 Ce que ce document est

Un plan de travaux issu d'un audit en lecture seule execute le 26/07/2026. Chaque constat porte un identifiant stable, cite un fichier et une ligne, decrit le scenario d'incident concret, et donne un critere d'acceptation verifiable. Aucun constat n'est une opinion : tout provient soit d'une lecture de code, soit d'une commande dont la sortie est citee.

Quatre constats ont ete **verifies empiriquement contre la production** le 26/07/2026 (voir section 2). Ils ne sont pas theoriques.

### 0.2 Regles d'execution, non negociables

1. **Un lot = une branche = une PR.** Ne jamais melanger deux lots. Les lots sont ordonnes par dependance et par gravite.
2. **Ne jamais marquer une tache terminee sans avoir execute la commande de verification** indiquee dans le critere d'acceptation, et sans en coller la sortie dans le message de PR.
3. **Toute correction de securite ou de logique metier critique s'accompagne d'un test.** Si le test automatise n'est pas possible immediatement, decrire dans le commit le scenario manuel execute.
4. **Respecter les conventions du projet** telles qu'elles existent deja : `CLAUDE.md` et `.claude/rules/`. En particulier : ASCII strict en i18n, JSX et Zod ; kebab-case pour les fichiers ; PascalCase pour les composants ; logique metier dans `src/services/` ; validation Zod obligatoire ; jamais `any` ; jamais `console.*` hors `src/lib/logger.ts` et `src/lib/env.ts` ; 3 clients Supabase distincts.
5. **Ne rien casser de ce qui est liste en section 3.** Cette section existe pour empecher les regressions sur du code deja correct et souvent subtil.
6. **Les portes de qualite doivent rester vertes** apres chaque lot : `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage && pnpm build`.

### 0.3 Convention de commit

```
<type>(<portee>): <resume imperatif>

<corps: le probleme concret, pas la solution>

Constat: <ID du constat, ex. DB-02>
Verification: <commande executee et resultat>

Co-Authored-By: Claude <noreply@anthropic.com>
```

### 0.4 Ordre des lots

| Lot       | Titre                                         | Bloquant pilote               | Effort  |
| --------- | --------------------------------------------- | ----------------------------- | ------- |
| **LOT 0** | Rotation d'identifiants et fermeture du depot | **Oui**                       | 1 h     |
| **LOT 1** | Fuites de donnees confirmees en production    | **Oui**                       | 1 j     |
| **LOT 2** | Integrite financiere                          | **Oui**                       | 2 a 3 j |
| **LOT 3** | Perte de commandes hors ligne                 | **Oui**                       | 2 a 3 j |
| **LOT 4** | Controle d'acces applicatif                   | **Oui**                       | 2 j     |
| **LOT 5** | Montee de dependances                         | **Oui**                       | 0,5 j   |
| **LOT 6** | Integrite du stock et de la base              | Non, mais avant 2e client     | 1 a 2 j |
| **LOT 7** | Remise en service de la verification          | **Oui** (au moins 7.1 et 7.2) | 2 a 3 j |
| **LOT 8** | Dette, configuration, hygiene                 | Non                           | 2 j     |

---

### 0.A NIVEAU DE CONFIANCE DE CHAQUE CONSTAT (a lire absolument)

**Le proprietaire de ce projet n'est pas developpeur.** Il ne peut pas relire ton code et reperer une correction appliquee a tort. Cette section existe pour que tu saches, constat par constat, ce qui est prouve et ce qui ne l'est pas.

Les constats de ce dossier n'ont pas tous le meme statut. Trois niveaux :

| Niveau                   | Ce que ca veut dire                                                                                                                                                             | Ce que tu dois faire                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **PROUVE EN PRODUCTION** | Une requete HTTP reelle a ete envoyee et sa reponse est citee. Il n'y a pas de doute possible.                                                                                  | Corriger. La seule question est comment, pas si.             |
| **PROUVE PAR OUTIL**     | Une commande a ete executee et sa sortie est citee (`pnpm audit`, `pnpm knip`, `gitleaks`, `pnpm test:coverage`, API GitHub Actions).                                           | Corriger. Rejouer la commande pour confirmer avant et apres. |
| **LU DANS LE CODE**      | Un agent a lu le code source et en a deduit un comportement. Le raisonnement est solide et cite fichier plus ligne, mais **le comportement n'a pas ete observe a l'execution**. | **Confirmer d'abord, corriger ensuite.**                     |

**Liste exhaustive des constats PROUVES (les autres sont tous LU DANS LE CODE) :**

- **PROUVE EN PRODUCTION** : DB-02, DB-06 (requetes PostgREST citees en section 2). Absence de fuite sur `orders`, `order_items`, `admin_users` (meme methode).
- **PROUVE PAR OUTIL** : DEP-01 et DEP-02 (`pnpm audit --prod --json`), CI-01 (onglet GitHub Actions, runs #608 a #614), KNIP-01 et KNIP-RL (`pnpm knip`), DETTE-01 (`wc -l`), REPO-01 et REPO-03 (`git ls-files`, `git clone`), l'etat de la couverture et des 1475 tests (`pnpm test:coverage`), l'absence de secret dans l'historique (`gitleaks`), les en-tetes HTTP de production (`curl -I`).
- **LU DANS LE CODE** : tous les autres, notamment F1 a F10, OFF-01 a OFF-12, DB-01, DB-03 a DB-16, et l'ensemble du LOT 4.

Cela ne veut pas dire que les constats LU DANS LE CODE sont douteux. Ils citent tous un fichier et une ligne, et le raisonnement est explicite. Cela veut dire que **la premiere chose a faire pour chacun est de rouvrir le fichier cite et de verifier que le code est bien celui decrit**, avant d'y toucher.

### 0.B PROTOCOLE DE CONTESTATION (obligatoire)

Un constat peut etre faux. Le code a pu changer, ou l'agent a pu mal lire. **Le danger, pour un projet commercial pilote par quelqu'un qui ne relit pas le code, n'est pas le constat rate : c'est la correction appliquee a un probleme qui n'existe pas.** Elle casse du code qui marchait, et personne ne s'en apercoit avant la production.

Regle : **tu ne corriges jamais un constat que tu n'as pas d'abord reconfirme sur le HEAD actuel.**

Pour chaque constat, avant toute modification, produis ce bloc :

```
CONSTAT <ID>
Fichier cite : <chemin>:<ligne>
Code reellement present a cette ligne aujourd'hui :
<colle les 5 a 15 lignes reelles>
Verdict : CONFIRME / PARTIELLEMENT EXACT / OBSOLETE / FAUX
Justification : <une phrase, appuyee sur le code colle ci-dessus>
```

Puis :

- **CONFIRME** : applique la correction decrite.
- **PARTIELLEMENT EXACT** : dis precisement ce qui differe, propose la correction adaptee, et **attends une reponse** avant d'appliquer.
- **OBSOLETE** ou **FAUX** : n'applique rien. Ecris pourquoi, cite le code, passe au constat suivant. Un constat ecarte n'est pas un echec, c'est une bonne nouvelle a documenter.

Interdictions explicites :

1. **Ne jamais elargir le perimetre d'un lot.** Si tu vois un autre probleme en passant, note-le en fin de rapport, ne le corrige pas.
2. **Ne jamais refactoriser du code qui n'est pas cite dans un constat du lot en cours.** Le proprietaire n'a aucun moyen de distinguer une refactorisation utile d'une refactorisation qui casse.
3. **Ne jamais supprimer un commentaire de code qui explique un choix subtil.** Plusieurs mecanismes de ce projet ne s'expliquent que par leur commentaire (voir section 3).
4. **Ne jamais appliquer une migration en production.** Tu ecris les fichiers, le proprietaire declenche.
5. **Si une correction fait echouer un test existant, ne desactive jamais le test.** Arrete-toi et explique le conflit.

---

## 1. CONTEXTE TECHNIQUE

Attabl est un SaaS multi-tenant B2B pour restaurants et hotels. Chaque tenant vit sur un sous-domaine (`radisson.attabl.com`), reecrit vers `/sites/[site]/...` par `src/proxy.ts` (le middleware, nomme `proxy.ts` selon la convention Next.js 16), qui injecte l'en-tete `x-tenant-slug`.

**Stack** : Next.js 16.2.9 App Router, React 19.2.3, TypeScript 5.9 strict, Supabase (PostgreSQL 17, Auth, Storage, Realtime), Stripe, Tailwind v4, Radix UI, next-intl 4, TanStack Query 5, Serwist (PWA), Upstash Redis, Sentry, Resend, Vercel.

**Chiffres mesures le 26/07/2026** :

| Element                                     | Valeur                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| Fichiers `.ts` / `.tsx` dans `src/`         | 1076                                                                     |
| Tests unitaires Vitest                      | 1475, tous verts                                                         |
| Couverture                                  | 50,6 % instructions / 44,1 % branches / 54,0 % fonctions / 51,2 % lignes |
| Migrations Supabase                         | 138                                                                      |
| Parcours Playwright `tests/journeys/`       | 35 tests, dont **26 neutralises**                                        |
| Tenants en production                       | 4                                                                        |
| Articles de menu en production              | 336                                                                      |
| Vulnerabilites de dependances de production | 11 HIGH, 5 MODERATE, 2 LOW                                               |

**Infrastructure reelle** :

| Service                    | Identifiant                                                      |
| -------------------------- | ---------------------------------------------------------------- |
| Projet Supabase production | `nqufpobuozrzwpeijkxt`                                           |
| Projet Vercel              | `attabl-saas` (`prj_OOUWEUFyKahM0MhubD3ESdekq6xL`)               |
| Organisation Sentry        | `odc-digital-solub`, projet `attabl-saas`, region `de.sentry.io` |
| Depot GitHub               | `thefrankalbert/attabl-saas`, **PUBLIC**                         |
| Miroir                     | GitLab `odcsupportagency/odc-support-agency-project`             |

---

## 2. CE QUI A ETE VERIFIE CONTRE LA PRODUCTION

Quatre tests ont ete executes le 26/07/2026 contre `https://nqufpobuozrzwpeijkxt.supabase.co`, avec la **cle anon publique extraite du bundle JavaScript de `attabl.com`** (cette cle est publique par conception, elle est dans le navigateur de chaque visiteur). Aucune donnee client n'a ete lue au dela du comptage. Aucune ecriture.

```
tenants     select=stripe_customer_id,stripe_subscription_id   HTTP 200   1 ligne
coupons     select=code,discount_value                          HTTP 200   1 ligne
orders      select=customer_name,customer_phone                 HTTP 401   42501 (refuse, correct)
order_items select=*                                            HTTP 401   42501 (refuse, correct)
admin_users select=email,role                                   HTTP 200   0 ligne (RLS filtre, correct)
```

Colonnes de `tenants` reellement lisibles par un anonyme, une par une, toutes en HTTP 200 :

```
stripe_customer_id, stripe_subscription_id, subscription_plan, subscription_status,
subscription_current_period_end, trial_ends_at, phone, address,
max_admins, max_venues, last_active_at, activation_events
```

**Conclusion factuelle** : n'importe qui sur Internet peut aujourd'hui recuperer la liste complete des clients d'Attabl, avec pour chacun son identifiant client Stripe, son identifiant d'abonnement, son plan, son statut de paiement, sa date de fin de periode, son telephone et son adresse. Aujourd'hui cela represente 4 tenants. Le jour du lancement commercial, cela represente le fichier client entier.

Commande de reproduction, a executer pour verifier la correction (`$KEY` = cle anon du bundle) :

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  "https://nqufpobuozrzwpeijkxt.supabase.co/rest/v1/tenants?select=stripe_customer_id&limit=1"
# Attendu APRES correction: 401 ou 403. Actuellement: 200.
```

### 2.A Etat reel de la CI, verifie dans l'onglet GitHub Actions le 26/07/2026

| Run                       | Date                         | Resultat  |
| ------------------------- | ---------------------------- | --------- |
| Security Scan #608 a #612 | 18 au 20 juillet             | **VERT**  |
| Security Scan #613        | 21 juillet, commit `ee5dc7a` | **ROUGE** |
| Security Scan #614        | 21 juillet, commit `f227723` | **ROUGE** |

Detail du run #614, les trois jobs :

```
Static Analysis (Semgrep)   52s   VERT
Dependency Audit            26s   ROUGE   <-- pnpm audit --prod --audit-level=high
Secret Scanning             17s   VERT
```

**Lecture correcte de ce resultat.** La porte de securite n'est pas decorative et n'est pas ignoree : elle etait verte jusqu'au 20 juillet et a bascule le 21. La bascule correspond a la publication des avis de securite Next.js 16.2.11. Le systeme a donc fait exactement son travail : il signale un probleme reel apparu il y a cinq jours. Le LOT 5 le referme.

Corollaire pratique : une fois le LOT 5 fait, **un rouge sur `security.yml` redevient un signal fiable qu'il faut traiter le jour meme.**

### 2.B Etat du depot GitHub, verifie le 26/07/2026 apres action

Le passage en prive a ete execute. Verifications post-action :

```
git clone anonyme            -> echoue (demande des identifiants)
page du depot                -> "Private repository"
compteurs                    -> 0 stars, 0 forks, 0 watching
recherche GitHub "attabl"    -> 12 depots, aucun fork survivant
```

Les 12 depots trouves sont sans rapport : noms differents (`attable`, `attablee`, `attable-backend`), langages differents (CSS, HTML, Python, Java, Kotlin, Vue), dates de 2022 a 2025. Le seul en TypeScript, `rakesh-codex/PayATTable`, a ete mis a jour le 29 janvier, soit avant la creation de `attabl-saas` le 4 fevrier : ce n'est donc pas un fork.

**Point restant ouvert** : le miroir GitLab `odcsupportagency/odc-support-agency-project` n'est pas lisible publiquement (API 404, page 302), mais il continue de tourner (run #684 le 26/07 a 05:51). Il detient une copie complete et quotidienne du depot. A verifier cote GitLab que le projet est bien en **Private** et non en **Internal**.

---

## 3. CE QUI EST DEJA CORRECT, A NE PAS CASSER

Cette section n'est pas de la decoration. Plusieurs de ces mecanismes sont subtils et une refactorisation naive les detruirait. Toute PR qui touche a l'un de ces points doit le justifier explicitement.

### 3.1 Isolation multi-tenant

- **`src/proxy.ts:101-102`** : `request.headers.delete('x-tenant-slug')` est appele **avant** toute branche et avant l'extraction du sous-domaine. Un client ne peut donc pas injecter son propre `x-tenant-slug` sur les chemins sous-domaine et `/sites/<slug>`. Couvert par 5 tests dans `src/__tests__/proxy.test.ts:256-291`. **Ne jamais deplacer cette ligne apres une branche.**
- **`src/proxy.ts:86-88`** : rejet 403 de tout en-tete `x-middleware-subrequest` (blocage CVE-2025-29927).
- **`supabase/migrations/20260623000000_secdef_cross_tenant_guard.sql`** : la fonction `assert_tenant_member(uuid)` est appelee en tete de chaque RPC analytique, inventaire et caisse. Sans elle, `src/hooks/queries/useReportData.ts` laisserait un owner du tenant A lire le chiffre d'affaires de B depuis le navigateur.
- **`REVOKE SELECT ON public.orders FROM anon`** et idem sur `order_items` : verifie en production, renvoie bien 42501.
- **Triggers `prevent_super_admin_elevation`** (migrations `20260420010000` et `20260420020000`) sur INSERT et UPDATE de `admin_users`.
- **`src/lib/auth/role-hierarchy.ts`** : `canGrantRole` et `canActOnUser` sont appliquees de facon coherente dans toutes les actions de gestion d'equipe.
- **RLS activee sur les 46 tables**, sans exception. Aucun `DISABLE ROW LEVEL SECURITY` nulle part.

### 3.2 Argent

- **`src/app/api/webhooks/stripe/route.ts`** : le corps brut est utilise (`await request.text()`, ligne 92, jamais `request.json()`), `constructEvent` est appele avant tout acces base, signature absente renvoie 400.
- **Idempotence du webhook** : table `stripe_events` avec `id text PRIMARY KEY` (`20260420000000_stripe_events_idempotency.sql`). L'INSERT precede tout traitement, et **chaque chemin d'echec supprime la ligne d'idempotence** pour que le retry Stripe reprenne (lignes 233, 324, 373, 450, 481-489). C'est correct et rarement bien fait. Ne pas simplifier.
- **Prix recalcules serveur** : `previewOrderItems` (`src/services/order/order-validation.ts:100-191`) relit `menu_items.price`, `item_price_variants.price` et `item_modifiers.price` en base. Le prix envoye par le client ne sert qu'a detecter un ecart et rejeter.
- **`server_id` exclu du schema client** (`src/lib/validations/order.schema.ts:71-73`).
- **XAF a zero decimale** : `CURRENCIES.XAF.decimals = 0`, `toMinorUnits` utilise `10 ** decimals`, donc facteur 1. Aucune multiplication par 100 sur le franc CFA. Arithmetique en entiers via dinero.js et colonnes BIGINT.
- **Exploit d'extension d'essai deja bouche** : `create-checkout-session/route.ts:124-131` recalcule `trial_period_days` depuis `trial_ends_at` en base.
- **`claim_coupon_usage`** est atomique : `UPDATE ... WHERE current_uses < max_uses` en une seule instruction.
- **Registre `payments` append-only**, `payment_status` toujours derive par `recompute`. Une commande payee ne peut etre ni annulee ni supprimee.
- **Transitions de statut forward-only** avec `ORDER_STATUS_RANK` et concurrence optimiste `.eq('status', from)`.

### 3.3 Hors ligne

- **Idempotence de creation de commande de bout en bout** : cle UUID client, colonne `orders.client_request_id`, index unique partiel `uq_orders_tenant_client_request_id` (`20260628010000`), chemin rapide de deduplication **place avant** la garde `TABLE_ACTIVE_ORDER` dans la RPC (l'ordre est indispensable, le commentaire l'explique), rattrapage `WHEN unique_violation`.
- **`outbox-replay.ts:62-72`** : un echec reseau pur ne consomme pas le budget de tentatives. Une panne longue ne detruit donc pas les commandes. Ne pas "simplifier" ce classement.
- **`RUNTIME_DOC_CACHES`** (`src/app/sw.ts:51`) correspond desormais aux vrais noms de cache de `@serwist/next@9.5.11`. Verifie contre le paquet installe. Ne pas y toucher sans reverifier.
- **`useRealtimeSubscription.ts:110-111`** reconstruit le canal Supabase sur l'evenement `online`. Un WebSocket mort ne se retablit pas seul.
- **`assignmentLimiter` distinct de `orderLimiter`** : une rafale de rejeux a la reconnexion derriere l'IP NAT du restaurant ne bloque pas la prise de nouvelles commandes.

### 3.4 Surface HTTP et hygiene de code

- En-tetes de production verifies par `curl -I https://attabl.com` : CSP avec nonce et `object-src 'none'`, HSTS 2 ans `includeSubDomains; preload`, `X-Frame-Options: DENY`, COOP et CORP `same-origin`, `X-Content-Type-Options: nosniff`, Permissions-Policy restrictive.
- `https://attabl.com/.env` renvoie 404. `/admin` non authentifie renvoie 307 vers `/login`.
- Upload : whitelist de bucket, taille 5 Mo, whitelist MIME, **et verification des magic bytes** (`src/app/api/upload/route.ts:9-35`), chemin prefixe par `tenant_id`, `upsert: false`.
- **Zero `TODO` ou `FIXME` dans le code** (0 sur 1076 fichiers). **3 `any`** seulement. **7 `console.*`**, tous legitimes (bootstrap env et rate-limit) ou dans des tests. 70 `eslint-disable` presque tous justifies et dates.
- Gitleaks sur 837 commits, 19,82 Mo : `no leaks found`. Aucun `.env` reel dans l'historique.

---

## LOT 0 : ROTATION ET FERMETURE DU DEPOT

**Priorite : immediate. C'est le seul lot dont le risque augmente a chaque heure qui passe.**
**Aucun code applicatif n'est modifie dans ce lot.**

### 0.1 [REPO-01] Passer le depot en prive : **FAIT le 26/07/2026**

Statut : **execute et verifie.** Le clone anonyme echoue, la page affiche `Private repository`, les compteurs sont a 0 stars, 0 forks, 0 watching, et la recherche GitHub ne remonte aucun fork survivant. Detail en section 2.B.

La suite de cette section est conservee pour memoire, parce qu'elle documente **ce qui a ete expose pendant les mois ou le depot etait public**. Cette exposition ne se defait pas : elle justifie les sections 0.2, 0.3 et 0.4, qui restent a faire.

Ce qui a ete publiquement lisible :

- les **138 migrations** avec le texte exact de chaque policy RLS ;
- **23 documents PDF et DOCX a la racine**, 2,69 Mio, dont `AUDIT-SECURITE-ATTABL.pdf`, `BENCHMARK-PRICING-ATTABL.pdf`, `SCENARIOS-PENETRATION-V2.pdf`, `REPOSITIONNEMENT-FOOD-HOSPITALITY.pdf` ;
- le repertoire **`security/`, 13 fichiers**, dont `AUDIT-ATTABL-FINDINGS.md`, `AUDIT-EXECUTION-REPORT.md`, `01-CHECKLIST-ET-PLAN-DE-TESTS.md`, `scripts/rls_coverage.sql` et `generated-tests/security-bola.spec.ts`. C'est une cartographie publique des faiblesses de l'application et de leur etat de correction ;
- **19 fichiers `.md` d'audit a la racine** et `.claude/rules/` avec les dates d'incidents de production.

Un attaquant lit les policies pour trouver le trou, puis lit l'audit de securite pour savoir ou vous vous savez faible. Un concurrent lit la grille tarifaire et le plan de penetration.

**Acceptation, deja verifiee** : `git clone https://github.com/thefrankalbert/attabl-saas.git` sans jeton echoue. **Rien a faire sur ce point.**

### 0.2 [REPO-02] Rotation des identifiants publies en clair

| Identifiant                                     | Emplacement                                                                     | Action                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Mot de passe `[MOT-DE-PASSE-PURGE-VOIR-PR-299]` | `docs/DEMO-PRESENTATION.md:39-51`                                               | **Changer immediatement.** Comptes `owner@demo.attabl.com` a `serveur2@demo.attabl.com` sur `lepicurien.attabl.com`                   |
| Compte `superadmin@attabl.com`                  | `scripts/manage-super-admin.js:33`, `scripts/security-super-admin.sql` (3 fois) | Verifier le mot de passe, activer une authentification forte                                                                          |
| Ref Supabase `gjlztittszelfjubbksy`             | `migration-audit.md:485`                                                        | Projet distinct (RadissonMenu). Publie depuis le 28/02/2026. Auditer sa RLS ou le supprimer s'il est obsolete. Voir LOT 0 section 0.5 |
| URL du miroir GitLab                            | `.github/workflows/mirror.yml:29`, en dur                                       | Deplacer vers un secret de depot                                                                                                      |

**Attention** : gitleaks ne detecte aucun de ces cas. Le mot de passe est dans un tableau Markdown, et `docs/.*\.md$` est de toute facon dans l'allowlist. Le depot a un signal vert alors qu'il contient des identifiants fonctionnels publies. Ce point est corrige au LOT 8.

**Acceptation** : la connexion avec `[MOT-DE-PASSE-PURGE-VOIR-PR-299]` echoue sur tous les comptes de demonstration.

### 0.3 [REPO-03] Sortir du depot ce qui n'y a pas sa place

```bash
# Documents commerciaux (23 fichiers, 2,69 Mio)
git rm --cached *.pdf *.docx

# Parasites LibreOffice (12 fichiers, 1,42 Mio)
# Au moins 4 des lu*.tmp sont des copies octet pour octet de PDF deja versionnes
git rm --cached '.~lock.'*'#' lu*.tmp

# Journaux de build et de test (7 fichiers)
git rm --cached build_phase7.log coverage_phase6.log test_phase6.log \
  test_phase6_after.log test_new_phase6.log test_orange_callback.log lint_output.txt

# Configuration d'agents (83 fichiers suivis, dont 8 liens symboliques
# relatifs qui n'ont de sens que sur la machine d'origine)
git rm -r --cached .agent .agents .kiro .windsurf .claude/agents
# Conserver .claude/rules si elles font partie de la documentation d'ingenierie assumee

# Mettre a jour .gitignore
cat >> .gitignore <<'EOF'
/*.pdf
/*.docx
.~lock.*#
/*.tmp
/lint_output.txt
/coverage_phase6.log
EOF
```

**Piege a connaitre** : `.gitignore` contient deja `/build*.log`, `/test_*.log`, `.agents/`, `.claude/agents/`, `.kiro/`. Ces regles sont **sans effet** parce que les fichiers ont ete committes avant leur ajout. `git ls-files` prime sur `.gitignore`. Le `git rm --cached` est indispensable.

**Acceptation** : `git ls-files | grep -cE '\.(pdf|docx|tmp|log)$'` renvoie 0. `git ls-files | grep -cE '^\.(agent|agents|kiro|windsurf)/'` renvoie 0.

### 0.4 [REPO-04] Purger l'historique

Le `git rm --cached` retire les fichiers de la version courante, pas de l'historique. Les 908 commits contiennent toujours tout.

```bash
git filter-repo --path-glob '*.pdf' --path-glob '*.docx' --path-glob 'lu*.tmp' \
  --path-glob '.~lock.*#' --path-glob '*.log' --invert-paths
```

**Coordination obligatoire** : `mirror.yml` pousse en `--force` vers GitLab. Le miroir suivra, mais il faut le verifier apres coup. Prevenir toute personne ayant un clone local : les SHA changent, un `git pull` classique echouera.

**Acceptation** : `git count-objects -vH` montre une reduction du pack d'environ 4,4 Mio sur 21,1 Mio.

### 0.5 [REPO-05] Statuer sur le projet Supabase `gjlztittszelfjubbksy`

Ce projet, distinct de la production Attabl, sert `radisson-menu-app` et contient des donnees reelles : 4 restaurants, 249 articles, 321 commandes. Ses advisors Supabase remontent :

1. Deux buckets publics, `images` et `menu-items`, avec une policy SELECT large qui **permet de lister tous les fichiers du bucket**. Un bucket public n'en a pas besoin pour servir une URL d'objet. N'importe qui peut enumerer toutes les photos de tous les etablissements.
2. Cinq fonctions `SECURITY DEFINER` appelables par le role `anon` via `/rest/v1/rpc/` : `create_order`, `cancel_order`, `get_order`, `is_admin`, et **`handle_new_user`**. Cette derniere est une fonction de trigger : elle ne devrait jamais etre exposee en RPC.
3. Protection contre les mots de passe compromis (HaveIBeenPwned) desactivee.
4. 17 policies RLS re-evaluent `auth.<fn>()` par ligne au lieu de `(select auth.<fn>())`.

**Action** : decider si ce projet est encore en service. S'il l'est, appliquer les corrections. S'il ne l'est plus, le supprimer.

---

## LOT 1 : FUITES DE DONNEES CONFIRMEES EN PRODUCTION

**Ce lot corrige des fuites verifiees le 26/07/2026 contre la base de production.**
Toutes les migrations de ce lot sont a ecrire dans `supabase/migrations/`, jamais depuis le tableau de bord Supabase.

### 1.1 [DB-02] `tenants` : fichier client complet lisible par un anonyme

**Gravite : CRITIQUE. Verifie en production.**

Fichiers : `supabase/migrations/20260330000000_tighten_tenants_rls.sql:11-13`, grants dans `tests/journeys/fixtures/schema.sql:4675`.

```sql
-- Etat actuel
CREATE POLICY "Public can read active tenants" ON tenants
  FOR SELECT USING (is_active = true);
-- avec, cote grants:
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.tenants TO anon;
```

Contrairement a `orders` et `order_items`, qui ont recu un traitement colonne par colonne (`20260506155500_restrict_anon_pii_columns.sql:21-36`), `tenants` conserve un `GRANT SELECT` table complet pour anon.

Le commentaire de la migration justifie la policy par « No API route returns unbounded tenant lists, so enumeration risk is mitigated at the API layer ». **C'est faux** : PostgREST est joignable directement avec la cle anon, sans passer par les routes Next.js. La verification de la section 2 le prouve.

**Aggravant** : `20260716000000_realtime_menu_live.sql:38-43` ajoute `public.tenants` a la publication `supabase_realtime`. Or `20260623110000_order_status_broadcast.sql:6-9` documente explicitement que « Supabase does NOT apply column-level grants to the realtime payload ». Le vecteur qui a justifie la migration de `orders` vers Broadcast est donc reouvert sur `tenants`, en streaming temps reel.

```sql
-- supabase/migrations/20260726000100_tenants_anon_column_scope.sql
REVOKE ALL ON public.tenants FROM anon;

-- Seules les colonnes vitrine restent lisibles par anon (parite avec get_tenant_by_slug).
GRANT SELECT (
  id, slug, name, logo_url, primary_color, secondary_color, description,
  establishment_type, currency, tax_rate, service_charge_rate,
  enable_tax, enable_service_charge, enable_coupons, supported_currencies,
  opening_hours, default_locale, is_active, table_count, custom_domain
) ON public.tenants TO anon;

-- Le realtime ne respecte pas les grants colonne: retirer tenants de la publication.
ALTER PUBLICATION supabase_realtime DROP TABLE public.tenants;
```

Le storefront doit alors passer par `get_tenant_by_slug` et par un canal Broadcast pour le live, sur le modele deja applique a `orders`.

**Acceptation** :

```bash
# doit renvoyer 401 ou 403
curl -s -o /dev/null -w "%{http_code}\n" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  "$SUPABASE_URL/rest/v1/tenants?select=stripe_customer_id&limit=1"
# doit renvoyer 200
curl -s -o /dev/null -w "%{http_code}\n" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  "$SUPABASE_URL/rest/v1/tenants?select=slug,name&limit=1"
```

Test pgTAP : `supabase/tests/grants/tenants_anon_columns.test.sql`. `SET ROLE anon; SELECT stripe_customer_id FROM tenants;` doit lever `42501`. Idem pour `stripe_subscription_id`, `subscription_status`, `phone`, `address`. `SELECT slug, name FROM tenants WHERE is_active` doit reussir. Assertion que `pg_publication_tables` ne contient pas `public.tenants`.

### 1.2 [DB-06] `coupons` : toutes les campagnes promo enumerables par un anonyme

**Gravite : MAJEUR. Verifie en production (HTTP 200, 1 ligne).**

```sql
-- Etat actuel, sans clause TO, donc role public inclus
CREATE POLICY "Public can validate active coupons" ON public.coupons
  FOR SELECT USING (is_active = true);
-- avec GRANT ALL ON TABLE public.coupons TO anon
```

`GET /rest/v1/coupons?select=*` retourne `code`, `discount_type`, `discount_value`, `max_discount_amount`, `min_order_amount`, `max_uses`, `current_uses` pour tous les tenants (`fixtures/schema.sql:1348-1364`).

```sql
-- supabase/migrations/20260726000500_coupons_no_public_enumeration.sql
DROP POLICY IF EXISTS "Public can validate active coupons" ON public.coupons;
REVOKE ALL ON TABLE public.coupons FROM anon;
-- La validation d'un code passe deja par le serveur (couponService.validateCoupon
-- appele depuis /api/orders). Aucun acces direct anon n'est necessaire.
```

**Acceptation** : `GET /rest/v1/coupons?select=code` avec la cle anon renvoie 401. Le parcours `tests/journeys/07-edge-cases-security.spec.ts` test #4 (« un coupon valide reduit le total ») reste vert, ce qui prouve que la validation serveur fonctionne toujours.

### 1.3 [DB-01] `push_subscriptions` : credentials Web Push de tous les tenants

**Gravite : CRITIQUE en potentiel. Table vide en production aujourd'hui (0 ligne), donc corriger avant que quiconque active les notifications.**

Fichiers : `supabase/migrations/20260226000003_push_subscriptions.sql:27-29`.

```sql
CREATE POLICY "Service can read all push subscriptions"
  ON push_subscriptions FOR SELECT USING (true);
```

Pas de clause `TO`, donc role `public`, anon inclus. Le grant table est `GRANT ALL ... TO anon`. La table contient `endpoint`, `p256dh` et `auth`, c'est-a-dire le triplet complet necessaire pour chiffrer et envoyer une notification Web Push. Un attaquant pourrait envoyer des push arbitraires sur les tablettes de tous les restaurateurs de la plateforme (hameconnage « nouvelle commande, cliquez ici ») et correler `tenant_id` et `user_id` pour cartographier les effectifs.

**Aggravant a comprendre** : la migration `20260309000001_fix_rls_policies.sql:29-32` corrige exactement ce trou, mais la policy corrective est **absente des deux snapshots de schema** (celui du 19 juin et celui du 29 juin). La migration n'a donc jamais ete appliquee en production, ou a ete annulee hors bande. Les points 1 et 2 de cette meme migration ont ete recorriges par `20260403000000`, le point 3 est reste orphelin. **A verifier explicitement apres deploiement.**

```sql
-- supabase/migrations/20260726000000_fix_push_subscriptions_rls.sql
DROP POLICY IF EXISTS "Service can read all push subscriptions" ON public.push_subscriptions;

-- Le service_role bypasse la RLS: aucune policy de lecture n'est necessaire pour lui.
DROP POLICY IF EXISTS "Users can read own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can read own push subscriptions"
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;
```

**Acceptation** : test pgTAP `supabase/tests/rls/push_subscriptions.test.sql`. `SET ROLE anon` puis `SELECT * FROM push_subscriptions` renvoie 0 ligne ou leve. Un authentifie du tenant A voit uniquement ses propres lignes. `policies_are('public','push_subscriptions', ...)` verrouille l'absence de toute policy `USING (true)`.

### 1.4 [DB-03] Un employe desactive conserve tous ses droits en base

**Gravite : CRITIQUE.**

Fichiers : `supabase/migrations/20260227000002_rls_optimization.sql:15-25`, `20260209000001_fix_rls_recursion.sql:16-24`.

```sql
CREATE OR REPLACE FUNCTION public.get_my_tenant_ids_array()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(tenant_id), '{}')
  FROM admin_users
  WHERE user_id = auth.uid()      -- aucun filtre is_active
$$;
```

Ce helper est reference par environ **40 policies sur 22 tables**, et par `assert_tenant_member()` (`20260623000000:52`), qui garde a son tour toutes les RPC SECURITY DEFINER de stock, de reporting et de caisse.

Consequence : un employe licencie dont la ligne `admin_users` est passee a `is_active = false` (la desactivation ne supprime pas la ligne) conserve un acces complet en lecture **et en ecriture** a `orders`, `payments`, `menu_items`, `ingredients`, `stock_movements`, `settings`, `coupons`, via PostgREST et via les RPC, tant que son compte `auth.users` existe. Le filtrage `is_active` n'existe qu'en couche applicative.

Le projet a diagnostique exactement ce probleme et l'a corrige **pour une seule table** : `20260712000000_qr_designs_rls_active_member.sql:5-9`. Le correctif n'a pas ete generalise au helper.

```sql
-- supabase/migrations/20260726000200_tenant_helpers_active_only.sql
CREATE OR REPLACE FUNCTION public.get_my_tenant_ids_array()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(tenant_id), '{}')
  FROM admin_users
  WHERE user_id = auth.uid()
    AND COALESCE(is_active, true) = true
$$;

CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM admin_users
  WHERE user_id = auth.uid()
    AND COALESCE(is_active, true) = true
$$;
```

**`COALESCE(is_active, true)` est indispensable** : la policy `atfood_insert_categories` traite deja `is_active IS NULL` comme actif, donc des lignes historiques peuvent avoir `is_active` a NULL. Un simple `AND is_active` couperait l'acces a des utilisateurs legitimes.

**Acceptation** : test pgTAP `supabase/tests/rls/deactivated_member.test.sql`. Sous l'identite d'un membre `is_active = false` : `SELECT count(*) FROM orders` = 0, `INSERT INTO menu_items` refuse, `get_my_tenant_ids_array()` = `{}`, `assert_tenant_member('<tenant_A>')` leve `42501`. Sous l'identite d'un membre actif : tout passe (non-regression obligatoire, ce test est le garde-fou de la migration).

### 1.5 [DB-07] `ads` : policy SELECT `USING (true)`

**Gravite : MAJEUR. Table vide en production aujourd'hui (0 ligne).**

Le jumeau `announcements` a ete corrige par `20260702000000`, `ads` ne l'a pas ete. Meme correction : ajouter une clause `TO authenticated` et un filtre sur `tenant_id = ANY(get_my_tenant_ids_array())`.

### 1.6 [DB-12] Grants `anon` residuels : TRUNCATE, DELETE et INSERT sur une trentaine de tables

Les grants observes incluent `INSERT`, `DELETE`, `TRIGGER`, `TRUNCATE`, `MAINTAIN`, `REFERENCES` pour le role `anon` sur une trentaine de tables. Ces droits sont contenus par la RLS aujourd'hui, mais ils constituent une deuxieme ligne de defense inexistante : la moindre policy trop large devient immediatement une ecriture ou une destruction.

**Action** : ecrire une migration qui applique un `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon`, puis re-accorde explicitement `SELECT` (et rien d'autre) sur la liste courte des tables reellement publiques : `tenants` (colonnes de la section 1.1), `menu_items`, `categories`, `menus`, `item_options`, `item_price_variants`, `announcements`, `venues`, `zones`, `tables`. Verifier ensuite que le storefront fonctionne toujours.

**Acceptation** :

```sql
SELECT table_name, privilege_type FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND table_schema = 'public'
  AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER');
-- Attendu: 0 ligne
```

### 1.7 [DB-08] Policies storage non versionnees

Seul le bucket `tenant-sounds` a ses policies dans les migrations. Les buckets `logos` et `menu-items` n'en ont aucune de versionnee. L'upload passe par le service_role et prefixe par `tenant_id`, mais rien n'exclut qu'un tenant lise le dossier d'un autre via l'URL publique.

**Action** : exporter l'etat reel des policies `storage.objects` en production, le versionner dans une migration, puis restreindre la lecture au strict necessaire. Si un bucket doit rester public pour servir des URL d'objet, retirer la policy SELECT large qui permet de **lister** le contenu (c'est exactement le probleme constate sur le projet `gjlztittszelfjubbksy`, LOT 0 section 0.5).

### 1.8 [DB-13] `set_qr_designs_updated_at` sans `SET search_path`

Fonction `SECURITY DEFINER` sans `SET search_path` explicite. C'est un vecteur classique d'escalade de privileges : un attaquant qui controle le `search_path` de sa session peut faire executer sa propre fonction avec les droits du proprietaire.

**Action** : ajouter `SET search_path = public` a cette fonction, puis auditer toutes les autres fonctions `SECURITY DEFINER` avec :

```sql
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef AND p.proconfig IS NULL;
-- Attendu apres correction: 0 ligne
```

---

## LOT 2 : INTEGRITE FINANCIERE

### 2.1 [F1 / TENANT-FARM] Plan Business gratuit a vie, par le parcours produit normal

**Gravite : CRITIQUE. C'est le constat le plus grave du dossier sur le plan commercial.**

Fichiers :

- `src/lib/validations/restaurant.schema.ts:13`
- `src/app/api/restaurants/create/route.ts:29-35`, `:51`, `:65-73`
- `supabase/migrations/20260629030000_atomic_add_restaurant_rpc.sql:32-34`
- `src/lib/plans/features.ts:161-174`
- `src/proxy.ts:249-265`

```ts
// restaurant.schema.ts:13 - le plan est une entree client
export const PLAN_OPTIONS = ['trial', 'starter', 'pro', 'business'] as const;

// route.ts:29-35 - seule l'existence d'une session est verifiee, jamais le role
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

// route.ts:51 - le plan vient du BODY
const { name, type, slug: requestedSlug, plan } = parseResult.data;
```

```sql
-- 20260629030000:32-34 - la RPC ecrit ce plan tel quel
v_plan   := CASE WHEN p_plan = 'trial' THEN 'starter' ELSE p_plan END;
v_status := CASE WHEN p_plan = 'trial' THEN 'trial'   ELSE 'pending' END;
```

```ts
// features.ts:166-173 - 'pending' n'est pas 'trial', donc le plan stocke est rendu tel quel
if (isTrialActive(status, trialEndsAt)) return 'pro';
return plan && plan in PLAN_LIMITS ? plan : 'starter'; // 'pending' -> 'business'
```

**Chaine complete de l'exploitation.** N'importe quel compte connecte, y compris un `waiter` embauche pour une soiree dans un restaurant client, envoie :

```
POST https://attabl.com/api/restaurants/create
Origin: https://attabl.com
{"name":"Mon Resto","type":"restaurant","slug":"mon-resto","plan":"business"}
```

Il obtient un tenant dont il est `owner`, avec `subscription_plan='business'`, `subscription_status='pending'`, `is_active=true`, **sans client Stripe, sans abonnement, sans checkout**. Ensuite :

- `getEffectivePlan('business','pending',null)` renvoie `business` : POS, KDS, inventaire, recettes, multi-devises, rapports, personnalisation QR, pourboires, room service, livraison, IA, 10 espaces, staff illimite, 20 000 commandes par mois ;
- `proxy.ts:253` ne bloque que `frozen` et `is_active = false`. `pending` passe ;
- le cron `freeze-expired-trials` ne cible que `subscription_status = 'trial'` : ce tenant ne gelera jamais ;
- `'pending'` n'existe meme pas dans l'union `SubscriptionStatus` de `src/types/billing.ts`, donc aucun switch ne le traite ;
- `isSubscriptionUsable` existe (`features.ts:228`) mais n'est appelee **que** cote client, dans `src/contexts/SubscriptionContext.tsx:99`, pour l'affichage. Aucune garde serveur ;
- le limiteur `restaurantCreateLimiter` (5 par 10 minutes par IP) autorise environ 700 tenants gratuits par jour et par IP.

Perte : 149 000 XAF par mois et par tenant, sans aucune fraude technique, par le parcours produit normal.

**Corrections, dans cet ordre** :

1. `src/app/api/restaurants/create/route.ts` : apres `getUser()`, exiger que l'appelant soit `owner` d'au moins un tenant existant (`admin_users` avec `role='owner'`, `is_active=true`, `deleted_at IS NULL`), sinon 403. Le premier etablissement doit passer par le flux signup et onboarding.
2. Supprimer `plan` du corps accepte. Forcer `plan: 'trial'` cote serveur. Tout passage a un plan payant doit venir exclusivement de `checkout.session.completed` dans `src/app/api/webhooks/stripe/route.ts`.
3. `src/lib/plans/features.ts` : dans `getEffectivePlan`, renvoyer `'starter'` quand `!isSubscriptionUsable(status)`. Les statuts `pending`, `frozen` et `cancelled` ne doivent pas entitler.
4. Dans la RPC, remplacer `'pending'` par `'frozen'` tant qu'aucun `stripe_subscription_id` n'existe.
5. `src/proxy.ts:253` : ajouter `pending` a la liste bloquante, en defense en profondeur.
6. **Migration corrective de donnees** : `UPDATE tenants SET subscription_status='frozen' WHERE subscription_status='pending' AND stripe_subscription_id IS NULL;` Compter d'abord combien de lignes sont concernees en production.

**Acceptation** :

- `src/app/api/__tests__/restaurants-create.test.ts` : POST avec `plan:'business'` par un compte non-owner renvoie 403 ; par un owner legitime, le tenant cree a `subscription_plan='starter'` et un statut non entitlant.
- `src/lib/plans/__tests__/features.test.ts` : `getEffectivePlan('business','pending',null) === 'starter'`, idem pour `'frozen'` et `'cancelled'`.
- Test proxy : une requete `/sites/x/admin/orders` sur un tenant `pending` redirige vers `/admin/subscription`.

### 2.2 [F2] La devise d'affichage choisie par le client devient l'unite monetaire de la commande

**Gravite : CRITIQUE.**

Fichiers :

- `src/app/sites/[site]/(storefront)/cart/page.tsx:311`
- `src/services/order/order-creation.ts:77`, `:104-116`
- `src/app/api/orders/route.ts:163-173`
- `src/components/admin/PaymentModal.tsx:94-98`

```ts
// cart/page.tsx:311 - displayCurrency est une preference UI stockee en localStorage
body: { tableNumber, items: orderItems, display_currency: displayCurrency, ... }

// order-creation.ts:76-77 puis :104
const currency = input.display_currency;   // devise d'AFFICHAGE du client
p_total: toMinorUnits(input.total, currency),

// api/orders/route.ts:163 - or le montant est calcule dans la devise du TENANT
const pricing = calculateOrderTotal(validatedTotal, {...}, discountAmount, tenant?.currency);
```

**Scenario chiffre.** Tenant Pro, `currency='XAF'`, `supported_currencies` contient `EUR`. Le client bascule l'affichage en EUR. Panier de 5 000 XAF.

1. `validatedTotal` = 5000 (prix menu en XAF).
2. `calculateOrderTotal(..., 'XAF')` donne `pricing.total = 5000`.
3. `toMinorUnits(5000, 'EUR')` = **500 000**, ecrit dans `orders.total` avec `display_currency='EUR'`.
4. `PaymentModal.tsx:94` lit `orderCurrency = order.display_currency` = EUR, `fromMinorUnits(500000,'EUR')` = **5 000,00 EUR** presente a l'encaissement, soit environ 3,3 millions XAF au lieu de 5 000 XAF.

Le miroir existe : un tenant dont `currency='EUR'` passe par le POS (`api/orders/pos/route.ts` n'envoie jamais `display_currency`), donc `toMinorUnits(12.50, undefined)` retombe sur XAF (zero decimale) = **13**, relu comme 0,13 EUR. Facteur 100 dans l'autre sens.

**Corrections** :

1. Dissocier les deux notions. `orders.display_currency` doit etre la devise de **comptabilisation**, donc toujours `tenant.currency`, jamais la preference client.
2. Dans `src/app/api/orders/route.ts`, remplacer le `display_currency` du corps par `tenant.currency` avant l'appel a `createOrderWithItems`. Conserver la preference client dans un champ separe non monetaire (`customer_display_currency`) si l'affichage doit rester tracable.
3. Dans `src/app/api/orders/pos/route.ts`, passer explicitement `display_currency: tenant.currency`.
4. Rendre `toMinorUnits` et `fromMinorUnits` non silencieux : lever si la devise est `undefined` dans un chemin transactionnel, au lieu de retomber sur XAF.

**Acceptation** : `src/services/order/__tests__/order-creation.test.ts`. Tenant `currency='XAF'`, corps `display_currency='EUR'`, panier 5000, assert `p_total === 5000` et `p_display_currency === 'XAF'`. Meme test pour un tenant `currency='EUR'` via POS : total 12.50 donne `p_total === 1250`. Test d'aller-retour `fromMinorUnits(stored, order.display_currency) === pricing.total` sur les 4 devises.

**A verifier en production avant correction** : combien de commandes existantes ont un `display_currency` different de la devise de leur tenant. Si le cas s'est deja produit, une migration corrective des donnees est necessaire.

### 2.3 [F3] Un impaye conserve l'acces complet indefiniment

**Gravite : MAJEUR.**

Fichiers : `src/app/api/webhooks/stripe/route.ts:52-57`, `src/lib/plans/features.ts:170-173`, `:228-231`, `src/proxy.ts:253`.

```ts
// webhooks/stripe/route.ts:52-57
case 'past_due': return 'past_due';
case 'unpaid':   return 'past_due';   // fin de relance Stripe = toujours entitlant

// features.ts:230
return ['trial', 'active', 'past_due'].includes(status);
```

Si le parametrage Stripe de fin de relance est « mark subscription as unpaid » plutot que « cancel », Stripe envoie `customer.subscription.updated` avec `status='unpaid'`, remappe en `past_due` : **aucun `customer.subscription.deleted` n'arrive jamais** et le tenant garde son plan gratuitement de facon permanente. Aucune borne temporelle n'existe cote Attabl.

**Corrections** :

1. `case 'unpaid': return 'frozen';`
2. Borner `past_due` dans le temps : stocker `past_due_since` a la premiere transition, ajouter un cron (a cote de `freeze-expired-trials`) qui passe a `frozen` au dela de N jours, N aligne sur la duree de relance Stripe (typiquement 15 jours).
3. Traiter `cancelled` comme non entitlant dans `getEffectivePlan`.

**Acceptation** : `subscription.updated` avec `status='unpaid'` donne un tenant `frozen`. `getEffectivePlan('business','cancelled',null) === 'starter'`. Test du cron : tenant `past_due` depuis 20 jours devient `frozen`, depuis 3 jours reste inchange.

**Point a verifier hors code** : lire le reglage « Subscription status after retries exhausted » dans le tableau de bord Stripe. C'est lui qui determine si ce chemin est reellement emprunte.

### 2.4 [F4] Fonctionnalites payantes atteignables par appel direct des Server Actions

**Gravite : MAJEUR.**

Fichiers : `src/app/actions/inventory.ts`, `src/app/actions/suppliers.ts`, `src/app/actions/stock-count.ts` (aucune occurrence de `canAccessFeature`), a comparer avec `src/app/sites/[site]/admin/inventory/page.tsx:24` qui, lui, garde bien.

```ts
// La PAGE est gatee
const hasInventory = canAccessFeature('canAccessInventory', tenant?.subscription_plan, ...);

// La MUTATION ne l'est pas (actions/inventory.ts:162)
export async function actionAdjustStock(...) {
  const { supabase } = await getAuthenticatedUserForTenant(tenantId, [...], 'inventory.manage');
  // aucune verification de plan
```

Une Server Action est un endpoint POST adressable par son Action ID. Un tenant Starter (39 000 XAF) peut executer `actionCreateIngredient`, `actionAdjustStock`, `actionReceiveStock`, `actionCreateSupplier`, `actionOpenStockCount`, `actionCommitStockCount` et beneficier de tout le module Inventaire, Fournisseurs et Inventaire physique, qui est une fonctionnalite Pro a 79 000 XAF.

L'omission est locale, pas structurelle : la verification de plan existe deja dans `actions/suggestions.ts:153` (IA), `actions/qr-design.ts:25` (QR) et `actions/orders.ts:404` (pourboires).

**Corrections** :

1. Factoriser un helper `assertFeature(supabase, tenantId, 'canAccessInventory')` dans `plan-enforcement.service.ts`, sur le modele de `assertQrCustomizationEntitled`.
2. L'appeler en tete de chaque action de `inventory.ts`, `suppliers.ts`, `stock-count.ts`. Verifier aussi `reports` et `recipes`.
3. Doubler d'un trigger base sur `ingredients`, `suppliers` et `stock_counts`, calque sur `20260711080000_qr_customization_db_paywall.sql`, pour que le paywall tienne meme si une future route oublie la garde.

**Acceptation** : pour chaque action, un tenant `subscription_plan='starter'` et `subscription_status='active'` recoit une erreur d'entitlement et rien n'est ecrit en base. Plus un test de parite qui liste toutes les actions exportees des modules gates par plan et verifie qu'aucune n'echappe au helper.

### 2.5 [F5] Encaissement : aucun plafond serveur, aucune cle d'idempotence

**Gravite : MAJEUR.**

Fichiers : `src/app/actions/orders.ts:40-45`, `src/services/payment.service.ts:49-78`, `:94-112`, `src/components/admin/OrderPaymentPanel.tsx:86-99`.

```ts
const recordTenderSchema = z.object({
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  amount: z.number().positive(), // pas de borne haute, pas de comparaison au du
  method: z.string().min(1).max(50), // pas de restriction au registre PAYMENT_METHODS
});
```

Le seul garde-fou est cote interface (`OrderPaymentPanel.tsx:86` : `const canSettle = remaining > 0 && ...`).

**Scenario** : commande de 10 000 XAF. Le serveur valide, la reponse tarde, la tablette est relancee ou l'action est rejouee par le retry reseau. Deux lignes `payments` de 10 000 sont inserees. `deriveStatus` voit `net (20000) >= due (10000)` et passe la commande a `paid`. Le registre encaisse 20 000 alors que la caisse contient 10 000. Le fond de caisse est faux de 10 000 XAF et rien ne le signale.

**Meme classe de probleme sur le remboursement** (`payment.service.ts:94-112`) : `summarize` est lu **avant** l'insertion, donc deux remboursements concurrents du net total passent tous les deux le test `amount > summary.net` et sortent deux fois l'argent de la caisse. C'est un TOCTOU.

**Corrections** :

1. Plafonner cote service : `if (amount > dueFor(order) - net) throw new ServiceError('Montant superieur au solde du','VALIDATION')`. Ou autoriser explicitement un sur-encaissement en le stockant comme `change_due`, jamais comme tender.
2. Ajouter une cle d'idempotence : colonne `client_request_id` sur `payments`, index unique `(tenant_id, client_request_id)`, generee par le POS et transmise par l'action. Un rejeu retourne le resume existant sans insertion.
3. Rendre le remboursement atomique : le faire dans une RPC `record_refund(p_order_id, p_amount)` qui verrouille (`SELECT ... FOR UPDATE`) et recalcule le net dans la meme transaction que l'INSERT.
4. Restreindre `method` a `ALL_PAYMENT_METHOD_IDS` (`src/lib/payments/methods.ts`) via `z.enum`.

**Acceptation** : `src/services/__tests__/payment.service.test.ts`. Deux `recordTender` du montant total consecutifs : le deuxieme est rejete, `net === due`. Meme action rejouee avec le meme `client_request_id` : une seule ligne `payments`. Deux `refund` concurrents du net complet : un seul reussit, `net >= 0`. `recordTenderSchema.safeParse({ method: 'bitcoin' })` echoue.

### 2.6 [F6] Un tenant gele continue d'encaisser via la boutique publique

**Gravite : MAJEUR.**

Fichiers : `src/app/api/cron/freeze-expired-trials/route.ts:41-47`, `src/proxy.ts:242-253`, `src/services/order/order-queries.ts:16`.

Le cron passe `subscription_status` a `frozen` mais laisse `is_active = true`, contrairement au webhook `customer.subscription.deleted:360-366` qui, lui, met `is_active = false`. Or le middleware ne protege que `/sites/<slug>/admin` : la vitrine `/sites/<slug>` et `POST /api/orders` restent ouvertes, et `validateTenant` ne verifie que `is_active`.

**Corrections** :

1. Aligner le cron sur le webhook : `.update({ subscription_status: 'frozen', is_active: false })`.
2. Ajouter dans `validateTenant` un rejet explicite des statuts non entitlants (`frozen`, `cancelled`, `pending`) avec `ServiceError('UNAUTHORIZED')`, pour ne pas dependre du seul `is_active`.

**Acceptation** : tenant d'essai expire donne `is_active === false`. `validateTenant` sur un tenant `frozen` leve `UNAUTHORIZED`. `POST /api/orders` sur un tenant gele renvoie 403.

### 2.7 [F7] Coupon a montant fixe : `max_discount_amount` ignore

**Gravite : MINEUR.** `src/services/coupon.service.ts:125-137`.

Le plafond n'est applique que dans la branche pourcentage. Un coupon `fixed` de 20 000 XAF avec `max_discount_amount = 5 000` applique 20 000. La perte reste bornee par le sous-total grace au `Math.min(discountAmount, orderSubtotal)`, mais l'intention du plafond n'est pas respectee.

Point connexe : il n'existe **aucune limite par client**. `max_uses` est un compteur global. Un code sans `max_uses` est reutilisable a l'infini par la meme personne. La table `coupon_redemptions` existe deja (`20260629000500`) et permettrait d'ajouter un `max_uses_per_customer`.

### 2.8 [F8] `price_at_order` errone avec deux variantes du meme article

**Gravite : MINEUR.** `src/services/order/order-validation.ts:188`, `src/services/order/order-creation.ts:93`.

`verifiedPrices` est une Map indexee par `menu_item_id`, pas par ligne de panier. Un panier contenant « Pizza petite 3 000 » et « Pizza grande 5 000 » (meme `menu_item_id`) ne conserve que le dernier prix. `orders.total` reste juste (8 000), mais les deux lignes `order_items` sont enregistrees a 5 000. `SUM(order_items.price_at_order * quantity) != orders.total`, le ticket client est faux et tout rapprochement ligne a ligne est fausse.

**Correction** : indexer `verifiedPrices` par l'index de ligne du panier, ou par une cle composite `${item.id}:${item.selectedVariant?.id ?? ''}`, et faire consommer la meme cle par `createOrderWithItems`.

### 2.9 [F9] Affichage monetaire en float sur des montants XAF

**Gravite : MINEUR.** `src/components/admin/service/ServiceTableDetail.tsx:253` et `:261`.

`{(item.price * item.quantity).toFixed(2)}` sur une valeur qui est deja en unites mineures. Pour un tenant EUR l'ecran Service affiche « 1250.00 EUR » au lieu de « 12,50 EUR ». Remplacer par `formatAmountMinor(...)` de `src/lib/utils/money.ts`, comme le fait deja `PaymentModal`.

### 2.10 [F10] Evenements Stripe manquants

**Gravite : MINEUR.** Aucun traitement de `charge.dispute.created` ni `charge.dispute.closed` : un chargeback ne declenche aucune action, le tenant conserve son acces pendant et apres le litige. Ajouter aussi `invoice.paid` comme filet idempotent si `subscription.updated` est perdu.

### 2.11 [KNIP-RL] Deux limiteurs de debit definis et jamais branches

`paymentInitiationLimiter` (`src/lib/rate-limit.ts:124`) et `webhookLimiter` (`:131`) sont exportes mais jamais appeles. Detecte par `pnpm knip`. Ce sont les chemins paiement et webhook. A traiter comme un point de securite, pas comme du code mort.

---

## LOT 3 : PERTE DE COMMANDES HORS LIGNE

**Contexte metier.** L'application tourne sur des tablettes de caisse et de cuisine, en Afrique francophone, avec un reseau qui coupe regulierement. Le risque numero un pour un pilote reel n'est pas un defaut d'affichage, c'est une commande perdue ou dupliquee en plein coup de feu.

### 3.1 [OFF-01] Les mutations POS et KDS sont mises en pause hors ligne : la file n'est jamais alimentee

**Gravite : CRITIQUE. C'est le constat le plus grave du dossier sur le plan operationnel.**

Fichiers : `src/components/providers/QueryProvider.tsx:12-25`, `src/hooks/usePOSData.ts:460-467`, `src/hooks/useKitchenData.ts:281`.

```ts
// QueryProvider.tsx:11-25
queries: {
  networkMode: 'offlineFirst',
},
// aucune cle `mutations:` -> networkMode par defaut = 'online'
```

`grep -rn "networkMode" src/` ne retourne que cette ligne. Dans `@tanstack/query-core@5.90.20`, `retryer.js:10` : `(networkMode ?? "online") === "online" ? onlineManager.isOnline() : true`, et `mutation.js:89` : `const isPaused = !this.#retryer.canStart()`.

Quand `onlineManager` passe a `false`, **`mutationFn` n'est jamais appelee**. Or `submitOrder`, et donc `outbox.enqueue`, vit a l'interieur de `mutationFn` (`useCreateOrder.ts:89`). **L'outbox n'existe pas pour le POS hors ligne.**

Pire, la protection anti double-tap se retourne contre la caisse :

```ts
// usePOSData.ts:460-463
if (createOrder.isPending) return;
```

Une mutation en pause a `status === 'pending'`, donc `isPending === true` **indefiniment**. La premiere commande prise apres la coupure gele la mutation, et **toutes les suivantes sont silencieusement ignorees**, sans toast et sans journal. Ni `onSuccess` ni `onError` ne se declenchent : le modal de paiement reste ouvert, le panier n'est pas vide, aucun message.

Nuance importante et testable : `onlineManager.js:5` initialise `#online = true` et ne lit pas `navigator.onLine` ; il ne bascule que sur l'evenement `offline`. Donc :

- application **ouverte puis wifi coupe** : evenement `offline`, mutations en pause, **bug actif**. C'est le scenario terrain.
- application **chargee deja hors ligne** : `#online` reste `true`, `mutationFn` s'execute, `fetch` echoue, l'outbox fonctionne normalement.

Le storefront client n'est pas touche : `cart/page.tsx:304` appelle `submitOrder` directement, hors `useMutation`.

**Scenario terrain.** Vendredi 20h15, salle pleine. Le wifi coupe. Le caissier encaisse la table 7 : rien ne se passe. Il retape, rien. Il prend les tables 12, 4, 9 : chaque tap tombe dans `if (createOrder.isPending) return;`. Aucune des 6 commandes n'est envoyee, mise en file, ni affichee. Le bandeau « Mode hors ligne » s'affiche bien (il vient de `useNetworkStatus`, pas de l'outbox) et le compteur `outboxPending` reste a 0, ce qui **confirme faussement** qu'il n'y a rien en attente. Au retour du reseau : rien a rejouer. 6 commandes perdues, la cuisine n'a jamais rien vu.

**Corrections** :

1. Dans `makeQueryClient()`, ajouter `mutations: { networkMode: 'offlineFirst' }`. C'est la correction minimale et suffisante : `canFetch` renvoie alors `true` inconditionnellement, `mutationFn` s'execute, `fetch` rejette, `submitOrder` met en file.
2. Remplacer le garde `if (createOrder.isPending) return;` par un verrou explicite (ref booleenne relachee en `onSettled`), pour ne plus dependre d'un etat TanStack qui peut etre bloque.

**Acceptation** : `tests/e2e/pos-offline.spec.ts`.

```
setOffline(true) apres chargement du POS
-> composer un panier, taper "Encaisser"
-> attendre le toast t('orderQueued')
-> evaluer indexedDB 'attabl-offline'/'order-outbox': count === 1
-> composer une 2e commande, taper Encaisser -> count === 2
-> setOffline(false) -> attendre le drain -> count === 0 et 2 commandes en base, pas 4
```

Plus un test Vitest sur `makeQueryClient()` : `getDefaultOptions().mutations.networkMode === 'offlineFirst'`.

### 3.2 [OFF-02] Les donnees tenant Supabase sont ecrites dans le cache navigateur

**Gravite : CRITIQUE.**

Fichiers : `src/app/sw.ts:28-44` et `:58`, croise avec `@serwist/next@9.5.11/src/index.worker.ts:256-268`.

```ts
// sw.ts:28-31 - le commentaire affirme que les donnees tenant ne sont jamais cachees
const noCacheAuthenticated: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'),
    handler: new NetworkOnly(),
  },
];
```

Cette garde ne couvre que le **meme origine**. Or presque toutes les lectures admin ne passent pas par `/api/` : elles vont directement a PostgREST via le client navigateur Supabase (`src/hooks/queries/useOrders.ts:16-23`, `useKitchenData.ts:157-169`, `useDashboardStats`, `useAssignments`, `usePosUnpaidOrders`, `useNotifications`, `useSettingsData`, 18 hooks au total). Ce sont des `GET https://<projet>.supabase.co/rest/v1/orders?...`, donc **cross-origin**, donc captures par la derniere regle de `defaultCache` :

```ts
{ matcher: ({ sameOrigin }) => !sameOrigin,
  handler: new NetworkFirst({ cacheName: "cross-origin",
    plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 3600 })] }) }
```

`NetworkFirst` met en cache toute reponse 200. Les corps contiennent `customer_name`, `customer_phone`, `notes`, totaux, `order_items`. Et `'cross-origin'` **n'est pas dans `RUNTIME_DOC_CACHES`** : il survit a la deconnexion.

**Correction** :

```ts
const SUPABASE_HOST = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host;
const noCacheAuthenticated: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'),
    handler: new NetworkOnly(),
  },
  { matcher: ({ url }) => url.host === SUPABASE_HOST, handler: new NetworkOnly() },
];
const RUNTIME_DOC_CACHES = [
  'others',
  'pages',
  'pages-rsc',
  'pages-rsc-prefetch',
  'next-data',
  'cross-origin',
];
```

La lecture hors ligne reste assuree par le persist TanStack en IndexedDB, qui est le mecanisme prevu. Ce changement ne degrade donc pas le hors ligne, et corrige au passage OFF-04.

**Acceptation** : Playwright sur build de production. Apres chargement de `/admin/orders` authentifie, `(await caches.keys())` ne contient aucune entree dont une cle matche `/supabase\.co\/rest\/v1\/orders/`. Apres deconnexion, `caches.has('cross-origin') === false`.

**Verification terrain de 30 secondes** : ouvrir l'ecran commandes sur la tablette, puis dans DevTools executer `(await caches.open('cross-origin')).keys()`. Cela tranche definitivement.

### 3.3 [OFF-03] Ni le cache TanStack ni l'outbox ne sont purges a la deconnexion

**Gravite : CRITIQUE. Un commentaire du code affirme le contraire.**

Fichiers : `src/app/sw.ts:128-138`, `src/components/shared/ClearSwCache.tsx:16`, `src/lib/offline/idb-async-storage.ts:15`, `src/lib/offline/outbox-idb.ts:12`.

Le seul nettoyage a la deconnexion est le message au service worker, qui ne touche que les Cache Storage de documents. Le commentaire `sw.ts:131-132` affirme « the app's TanStack persist is cleared by the logout flow itself ». **C'est faux.** Recherche exhaustive : aucune occurrence de `attabl-query-cache` ou `attabl-offline` hors de leurs fichiers de definition, aucun `indexedDB.deleteDatabase`, aucun `queryClient.clear()`, aucun `persister.removeClient()`. `POST /api/auth/signout` fait `supabase.auth.signOut()` puis un redirect 302, sans aucun code client.

La base `attabl-query-cache` (menus, commandes, tableau de bord, `maxAge: 24h`) et la base `attabl-offline` (commandes en file avec leurs corps complets) survivent integralement.

**Scenario** : fin de service, le gerant se deconnecte et range la tablette. Le lendemain, un serveur ouvre l'application avant de se connecter : la rehydratation TanStack repeuple les ecrans avec le chiffre d'affaires, les commandes et les clients de la veille, avant toute verification de session.

**Correction** : creer un gestionnaire de deconnexion cote client (ou etendre `ClearSwCache`, monte sur `/login`, qui est le point de convergence de tous les etats deconnectes) qui, en plus du message au SW :

```ts
// 1. purger le cache de lecture (jamais critique, jamais rejoue)
indexedDB.deleteDatabase('attabl-query-cache');
// 2. l'outbox: NE PAS supprimer aveuglement. Drainer d'abord si en ligne,
//    puis n'effacer que si count() === 0. Sinon bloquer la deconnexion
//    avec un avertissement explicite ("N commandes non synchronisees").
```

**La distinction est essentielle** : purger l'outbox de force ferait perdre des commandes payees. Le bon comportement est de refuser la deconnexion tant que la file n'est pas vide, ou d'exiger une confirmation explicite.

**Acceptation** : apres deconnexion, `(await indexedDB.databases()).map(d=>d.name)` ne contient pas `attabl-query-cache`. Test Vitest du helper : file non vide et `navigator.onLine=false` retourne `{ blocked: true, pending: N }` et ne supprime rien.

### 3.4 [OFF-05] L'encaissement d'une commande existante ne passe pas par l'outbox

**Gravite : MAJEUR.** `src/components/admin/PaymentModal.tsx:191`.

Deux chemins de paiement coexistent. Le POS « composer puis encaisser » passe par `useCreateOrder` et donc par l'outbox. Mais l'encaissement d'une commande **deja ouverte** (table en cours, panneau impayes) appelle `actionMarkOrderPaid` directement. Une Server Action est un POST vers l'origine, hors du dispositif `submitOrder`. Hors ligne, elle echoue et l'encaissement est perdu, avec un toast d'erreur. Aucune mise en file, aucune cle d'idempotence.

**Scenario** : coupure de 4 minutes, trois tables reclament l'addition. Le caissier encaisse en especes, empoche l'argent, les trois appels echouent. Au retour du reseau, les trois commandes sont toujours `payment_status = 'pending'`. Les tables sont liberees physiquement mais restent ouvertes en base. La caisse ne tombe pas juste en fin de service.

**Correction** : router ce chemin par le meme endpoint idempotent. Ajouter une variante `{ type: 'pay', orderId, method, tipMinor }` a `orderMutationSchema` (`src/lib/validations/order-mutation.schema.ts:10-30`), la dispatcher dans `src/app/api/orders/mutations/route.ts:23-35`, et remplacer l'appel direct par `submitOrder(...)`. La table `order_mutation_requests` garantit deja l'exactement-une-fois, ce qui est indispensable ici puisque `markPaid` insere dans le grand livre `payments`.

**Acceptation** : deux POST successifs avec le meme `client_request_id` de type `pay` produisent une seule ligne dans `payments`, la deuxieme reponse est `{ deduped: true }`. Playwright hors ligne : l'encaissement d'une table ouverte produit `orderQueued` et une entree outbox.

### 3.5 [OFF-06] La file n'a ni duree de vie ni plafond

**Gravite : MAJEUR.** `src/lib/offline/outbox.ts:22-24`, `:103-158`.

`createdAt` est stocke mais n'est utilise **que pour trier**. Aucune expiration. Le budget de tentatives est explicitement neutralise pour les echecs reseau purs (`countsAsAttempt === false`), ce qui est correct pour une panne courte mais rend l'entree immortelle. Aucun plafond de taille non plus.

**Scenario** : le routeur meurt samedi a 22h30. La tablette garde 11 commandes en file. Personne ne rallume avant lundi matin. Lundi 9h, les 11 commandes de samedi soir sont creees avec l'horodatage de lundi, tombent sur le KDS du petit-dejeuner, destockent l'inventaire de lundi et polluent le chiffre d'affaires du jour. `create_order_with_items` n'a aucune notion d'anciennete.

**Correction** : dans `outbox.drain`, avant l'appel a `replay` :

```ts
const AGE_LIMIT_MS = 6 * 60 * 60 * 1000; // horizon d'un service
if (now - entry.createdAt > AGE_LIMIT_MS) {
  await store.delete(entry.id);
  permanentlyFailed.push({ ...entry, lastError: 'expired' });
  continue;
}
```

Plus un plafond dans `enqueue` (500 entrees par exemple) qui refuse la mise en file en retournant `{ status: 'failed' }` plutot que d'echouer silencieusement. Les entrees expirees remontent deja dans `permanentlyFailed`, donc dans le bandeau rouge `outboxRejected` : l'operateur voit « 11 commandes non synchronisees » au lieu de les voir apparaitre comme des fantomes.

### 3.6 [OFF-07] La file n'est cloisonnee ni par utilisateur ni par tenant

**Gravite : MAJEUR.** `src/lib/offline/outbox-idb.ts:12-14`, `src/app/api/orders/pos/route.ts:118`, `:154-164`.

Un unique singleton global, sans notion de session. Le corps mis en file ne contient ni `tenant_id` ni identite serveur (c'est voulu) : tout est derive de la **session au moment du rejeu**. Combine a OFF-03 (l'outbox survit a la deconnexion), une commande mise en file par A est rejouee sous la session de B.

**Scenario** : Fatou prend 3 commandes hors ligne, termine son service, se deconnecte. Ibrahim se connecte sur la meme tablette, le reseau revient, le drain part avec sa session : les 3 commandes sont enregistrees avec `server_id = Ibrahim`. Le rapport de performance serveur et le calcul de pourboires sont faux.

**Variante plus grave** : sur une tablette utilisee par deux etablissements du meme groupe, le tenant derive est celui d'Ibrahim, les `menu_item_id` de Fatou n'y existent pas, la reponse est `400 "Certains articles ne sont plus disponibles"`, `classifyStatus` renvoie `permanent` (`outbox-replay.ts:32`) et **les 3 commandes sont supprimees definitivement**.

**Correction** :

```ts
export interface OutboxEntry {
  ...
  ownerUserId: string;   // auth uid au moment de l'enqueue
  tenantId: string;      // tenant actif au moment de l'enqueue
}
```

`drain` ne rejoue que les entrees dont `ownerUserId` correspond a la session courante ; les autres restent en file et sont signalees. Cote serveur, faire de `/api/orders/pos` un rejet explicite `409` si le `tenantId` de l'entree ne correspond pas au tenant derive, plutot qu'un `400` qui detruit la commande.

### 3.7 [OFF-08] Pas de blocage de tete de file par ressource

**Gravite : MAJEUR pour les assignations, attenue pour les statuts.** `src/lib/offline/outbox.ts:108-153`.

`drain` boucle sur toutes les entrees et `continue` quelle que soit l'issue. Si l'entree 1 echoue en `retry` et que l'entree 2 passe, l'entree 1 sera appliquee **apres** l'entree 2 au prochain drain.

Pour les statuts de commande, le domaine est protege par `ORDER_STATUS_RANK` et la concurrence optimiste : un « ready » rejoue apres un « delivered » est rejete en 422. Pas de regression de donnees, mais un faux positif dans le bandeau rouge. En revanche `assign` et `release` (`useAssignment.ts:11-50`) n'ont aucun ordre impose : le manager libere la table 5 de Fatou puis l'assigne a Ibrahim, le `release` prend un 409, l'`assign` passe, puis le `release` s'applique au drain suivant. La table 5 se retrouve sans serveur.

**Correction** : attacher une `scopeKey` a chaque entree (`order:<id>`, `table:<id>`) et, dans `drain`, tenir un `Set<string>` des scopes bloques. Des qu'une entree d'un scope repart en `retry`, sauter toutes les entrees suivantes du meme scope. Cela conserve le parallelisme entre tables tout en garantissant l'ordre par ressource.

### 3.8 [OFF-04] Le KDS affiche une liste perimee en se presentant comme fraiche

**Gravite : MAJEUR. Corrige en grande partie par OFF-02.** `src/hooks/useKitchenData.ts:157-217`.

`loadOrders` construit une URL PostgREST **deterministe sur la journee**, donc une cle de cache parfaite pour le `NetworkFirst` cross-origin. Hors ligne, la strategie retombe sur le cache et renvoie un 200 avec une liste vieille de jusqu'a une heure. Le code ne peut pas distinguer ce cas d'un vrai succes, et met `setLastUpdate(new Date())` : horodatage frais sur des donnees perimees. Le `catch` n'est jamais atteint.

**Scenario** : samedi 21h, le wifi de la cuisine tombe 20 minutes. L'ecran KDS affiche les 4 tickets figes de 20h55, avec « Derniere mise a jour » qui se rafraichit toutes les 15 secondes. Le chef voit un ecran vivant et en deduit qu'il n'y a pas de nouvelles commandes.

**Correction complementaire a OFF-02** :

```ts
} catch (error) {
  logger.error('KDS loading error', error);
  setStale(true);          // NE PAS toucher lastUpdate
}
```

Et afficher un bandeau rouge « Ecran non synchronise depuis HH:MM » tant que `stale` est vrai.

### 3.9 [OFF-11] Le POS genere une nouvelle cle a chaque tap

**Gravite : MINEUR.** `src/hooks/usePOSData.ts:460-467`.

La cle d'idempotence est frappee au moment du tap, pas liee a la composition du panier. La seule protection contre une double soumission volontaire est le vidage du panier dans `onSuccess`. Le storefront fait mieux, avec une ref stable retenue jusqu'au succes (`cart/page.tsx:296-297`).

**Correction** : aligner sur le storefront. `useRef<string|null>` frappee au premier `handleOrder`, remise a `null` uniquement dans `onSuccess`, conservee sur `onError`. Complementairement, faire apparaitre les commandes en file dans la liste POS pour supprimer le doute qui declenche le double envoi.

### 3.10 [OFF-12] Les actions au niveau article du KDS contournent l'outbox

**Gravite : MINEUR.** `src/hooks/useKitchenData.ts:300-340`.

`handleStatusChange` passe bien par l'outbox, mais `actionUpdateItemStatus`, `actionUpdateOrderStatus` et `actionSetCourseHeld` sont appelees directement. Hors ligne, elles echouent avec un toast generique et rien n'est mis en file.

**Scenario** : coupure de 3 minutes. Le cuisinier passe 14 articles en « pret » un par un. Chaque tap produit un toast rouge. Il continue, croyant a un defaut d'affichage. Au retour du reseau, aucun des 14 articles n'a bouge et l'ecran se resynchronise en annulant tout son travail.

**Correction** : etendre `orderMutationSchema` avec `{ type: 'item_status', ... }` et `{ type: 'course_held', ... }`, les dispatcher dans `/api/orders/mutations`, remplacer les appels directs par `submitOrder`. Le mecanisme d'idempotence est deja en place, c'est un branchement.

### 3.11 [OFF-09] et [OFF-10] Points mineurs

- **OFF-09** : le verrou anti-drain-concurrent (`useOrderOutbox.ts:51`) est une ref locale a la page, elle ne protege pas contre le service worker qui draine dans un contexte distinct. Une entree supprimee peut etre ressuscitee par un `store.put`. L'impact est borne (le rejeu ulterieur est deduplique cote serveur), le cout est un compteur faux. Correction : ajouter un champ `claimedAt` et faire du demarrage d'un rejeu une transaction IndexedDB unique, avec expiration du claim a 60 secondes.
- **OFF-10** : une claim orpheline dans `order_mutation_requests` (fonction serverless gelee en plein `dispatch`) reste `processed_at = NULL` et repond 409 jusqu'a epuisement du budget. Le commentaire du code (`mutations/route.ts:127-131`) esquisse deja la correction : reprise de claim si `created_at < now() - 60s`. Ajouter aussi une migration de retention, la table croit indefiniment.

---

## LOT 4 : CONTROLE D'ACCES APPLICATIF

### 4.1 [HDR-REFERER] `x-tenant-slug` derive du `Referer`, donc controle par le client

**Gravite : MAJEUR, latent.** `src/proxy.ts:166-174` et `:309-323`.

```ts
// proxy.ts:309-316 - s'applique a TOUTES les routes /api/ sur le domaine principal
if (pathname.startsWith('/api/') && !subdomain) {
    const referer = request.headers.get('referer') || '';
    const refererMatch = referer.match(/\/sites\/([^/]+)/);
    if (refererMatch) request.headers.set('x-tenant-slug', refererMatch[1]);
```

Le `Referer` est entierement forgeable en dehors d'un navigateur. `verifyOrigin` n'exige que l'appartenance a `*.attabl.com`, trivialement satisfait par `Referer: https://attabl.com/sites/<cible>/menu`. Le commentaire de `src/app/api/menu-search/route.ts:16` affirme « Tenant derived from the x-tenant-slug header injected by the middleware, never from a client param », ce qui est **faux sur cette branche**.

**Ce n'est pas exploitable aujourd'hui**, car chaque consommateur re-verifie l'appartenance apres avoir resolu le tenant (verifie nominativement sur `invoices`, `billing-portal`, `update-subscription`, `permissions`, `invitations`, `assignments`, `stock-alerts/check`, `orders/mutations`, `orders/[id]/claim`). Le risque est structurel : la garantie « le slug vient du serveur » est fausse, donc **toute route ajoutee demain qui fait confiance a `x-tenant-slug` sans requete `admin_users` sera immediatement exploitable en cross-tenant par un simple `Referer` forge.**

**Corrections, par ordre de preference** :

1. Ne jamais reinjecter le slug depuis le `Referer`. Faire porter le contexte tenant par le chemin de l'API (`/api/t/<slug>/...`) ou par un cookie tenant signe.
2. A defaut, distinguer deux en-tetes : `x-tenant-slug` (uniquement sous-domaine, `/sites/<slug>`, domaine custom, donc reellement serveur) et `x-tenant-slug-hint` (Referer, non fiable). Aucune route n'autorise sur la base du hint sans requete d'appartenance.
3. Ajouter un test d'architecture : toute lecture de `x-tenant-slug` dans `src/app/api/**` doit etre suivie d'une requete `admin_users` dans le meme fichier.

**Acceptation** : test dans `src/__tests__/proxy.test.ts` documentant le comportement, plus un test d'integration prouvant qu'une route sensible renvoie 403 ou 404 pour un utilisateur non membre malgre un `Referer` forge.

### 4.2 [SESSION-FALLBACK] Repli silencieux sur la plus ancienne appartenance

**Gravite : MAJEUR.** `src/lib/auth/get-session.ts:115-171`.

Quand `x-tenant-slug` designe le tenant B et que l'utilisateur n'y est pas membre, l'action s'execute **silencieusement sur son tenant A**. Il n'y a pas d'elevation cross-tenant, mais c'est un deputy confus.

**Scenario le plus probable** : un `super_admin` n'a en general aucune ligne `admin_users` sur les tenants clients (le layout admin lui fabrique un owner virtuel, `src/app/sites/[site]/admin/layout.tsx:108-116`, sans creer de ligne). Il ouvre `/sites/client-b/admin/settings`, modifie le nom, le domaine custom ou les taux de TVA, et declenche `actionUpdateTenantSettings`. Le repli resout sur sa propre appartenance la plus ancienne. **La modification part sur le mauvais etablissement, sans erreur ni alerte.** Meme mecanique pour `actionUpdatePaymentMethods`, `actionSaveQrDesign`, `actionCreateVenue`, `/api/admin/reset` (destructif) et `/api/orders/pos`.

**Correction** : si `tenantSlug` est present et resout un tenant existant mais que l'utilisateur n'en est pas membre actif, lever `AuthError('Acces non autorise pour ce tenant', 403)` au lieu de retomber. Reserver le repli au cas ou le header est totalement absent. Ajouter en amont la resolution super_admin (owner virtuel sur le tenant du header) pour que l'operateur plateforme opere bien sur B.

**Acceptation** : se connecter en super_admin, ouvrir `/sites/<client>/admin/settings`, sauvegarder, verifier en base que c'est bien la ligne `tenants` du client qui bouge. Avec un utilisateur membre de A seulement, une Server Action appelee depuis `<B>.attabl.com` renvoie une erreur de permission, pas un succes sur A.

### 4.3 [ADMIN-TENANTS-BAN] `/admin/tenants` accepte un membre banni ou supprime

**Gravite : MAJEUR.** `src/app/admin/tenants/page.tsx:29-43`.

```ts
const { data: adminUsers } = await supabase
  .from('admin_users')
  .select('is_super_admin, role, full_name, tenant_id')
  .eq('user_id', user.id); // ni is_active, ni deleted_at
```

Tout le reste du code applique systematiquement `is_active = true` et `deleted_at IS NULL`. Cette page est la seule exception. Un owner banni conserve donc `/admin/tenants`, ou la branche owner recharge via `createAdminClient()` (service_role, RLS contournee) la liste complete de ses etablissements. Si le compte banni porte un `is_super_admin=true` historique, il obtient l'annuaire de **tous** les tenants de la plateforme.

**Correction** : ajouter `.eq('is_active', true).is('deleted_at', null)`. Mieux, remplacer le calcul local par `isSuperAdmin(supabase, user.id)` importe de `src/lib/auth/require-super-admin.ts`.

### 4.4 [SUPPORTS-EXPORT] `/api/supports/export` : pas de CSRF, pas de permission, tenant mal derive

**Gravite : MAJEUR.** `src/app/api/supports/export/route.ts:62`, `:95-110`.

Trois problemes cumules :

1. C'est l'une des trois seules routes mutantes sans `verifyOrigin` (les deux autres sont legitimes : `webhooks/stripe` protege par signature, `dev/simulate-subscription` protege par double garde).
2. Aucune garde de permission. La route `/admin/supports` exige `menu.edit` cote middleware, l'API sous-jacente n'exige rien : tout membre actif, y compris un `waiter`, peut generer des PDF.
3. `maybeSingle()` sans filtre de tenant : pour un owner multi-etablissements, PostgREST renvoie une erreur et la fonction est **inutilisable pour la cible principale du produit**. `is_active` et `deleted_at` ne sont pas filtres non plus.

**Correction** : ajouter `verifyOrigin(request)` en tete de `POST` ; remplacer la resolution de tenant par `getAuthenticatedUserWithTenant('menu.edit')`.

### 4.5 [CSP-CUSTOM-DOMAIN] Pas de CSP sur les pages servies via domaine custom

**Gravite : MINEUR mais correction triviale.** `src/proxy.ts:140-148`.

Cette branche est la seule des huit a ne pas poser l'en-tete CSP, et `isAppRootOnlyPath` couvre `/login`, `/signup`, `/onboarding`, `/checkout`, `/reset-password`, `/forgot-password`, `/auth/*`. Un tenant sur domaine custom sert donc ses pages d'identification et de paiement sans CSP.

**Correction** : ajouter `response.headers.set('Content-Security-Policy', buildCspHeader(nonce));` avant le `return response;` ligne 147.
**Acceptation** : `curl -I https://<domaine-custom>/login` renvoie un `Content-Security-Policy` contenant `nonce-`.

### 4.6 [ORDER-SPAM] Commandes injectables sur n'importe quel tenant depuis le domaine principal

**Gravite : MINEUR.** `src/proxy.ts:15-26`, `:164-178`, `src/app/api/orders/route.ts:47-52`.

`SKIP_AUTH_PREFIXES` contient `/api/orders`, donc sur le domaine principal le slug provient du `Referer`. Un script peut envoyer en boucle `POST https://attabl.com/api/orders` avec un `Referer` pointant un concurrent. Chaque requete cree une commande reelle : notification et son en cuisine, email comportemental, destockage si l'inventaire est actif, et surtout **consommation irreversible du budget d'un code promo** via `couponService.claimUsage`.

**Correction** : corriger HDR-REFERER supprime le vecteur. En complement, exiger un jeton de session de table (la table `table_sessions` existe deja, migration `20260629000600`) ou un challenge Turnstile pour les commandes sans contexte de sous-domaine, et deplacer le rate limit de `IP` vers `IP + tenant_id`.

### 4.7 Points mineurs de ce lot

- **[ACT-EVENT]** `actionTrackActivationEvent` (`src/app/actions/activation-events.ts:8-40`) est la seule Server Action exportee sans schema Zod ni code de permission. `event` est une chaine libre sans longueur maximale, ecrite comme cle jsonb dans une colonne chargee a chaque rendu de page tenant. Correction : `z.enum([...])` avec la liste fermee, plus un `PermissionCode`.
- **[RL-FAILOPEN]** `src/lib/rate-limit.ts:88-99`. Le choix fail-open est explicite et documente, et les surfaces sensibles (login, signup, checkout, upload, admin-reset) sont bien fail-closed. Mais `orderLimiter`, `contactLimiter`, `newsletterLimiter` et `supportsExportLimiter` devraient passer en fail-closed : une indisponibilite Upstash ouvre simultanement la creation de commandes et le formulaire de contact.
- **[IP-SPOOF]** `getClientIp` (`src/lib/rate-limit.ts:303-315`) fait confiance au premier element de `X-Forwarded-For`. Inoperant sur Vercel qui prepend l'IP reelle, mais a documenter comme hypothese, et a corriger si l'hebergement change.
- **[DOMAIN-VERIFY]** `/api/domain-verify` n'exige que `getUser()`. Remplacer par `getAuthenticatedUserWithTenant('settings.edit')`.
- **[PUSH-TENANT]** `/api/push-subscriptions` ignore `x-tenant-slug` et resout par `limit(1)` sur la plus ancienne appartenance. Un owner de deux etablissements recoit les alertes du mauvais. Utiliser `getAuthenticatedUserWithTenant()`.
- **[CONSOLE-PROD]** `src/lib/rate-limit.ts:36-41` affiche « rate limiting disabled in this environment » alors que `check()` bloque en realite les requetes en production. Message trompeur, a corriger.

---

## LOT 5 : MONTEE DE DEPENDANCES

### 5.1 [DEP-01] Next.js 16.2.9 vers 16.2.12

**Gravite : CRITIQUE. Effort : 3 lignes.**

`next`, `react`, `react-dom` et `eslint-config-next` sont **epingles en version exacte** dans `package.json` (pas de `^`). Un `pnpm update` ne les bougera jamais. Il faut editer `package.json`.

Avis de securite fermes : 4 HIGH (**Middleware / Proxy bypass in App Router applications**, SSRF in Server Actions on custom deployments, SSRF in rewrites, DoS in App Router using Server Actions) et 5 MODERATE (cache confusion, divulgation non authentifiee de Server Functions internes, DoS Image Optimization, payload non borne en Edge runtime).

Le contournement de middleware tape exactement la ligne qui separe le restaurant A du restaurant B, puisque l'isolation repose sur `src/proxy.ts` et l'en-tete `x-tenant-slug`. `ci.yml` classe d'ailleurs `src/proxy.ts` en « critical file ».

**A monter en meme temps** :

| Paquet                                     | Installe | Cible   | Raison                                                           |
| ------------------------------------------ | -------- | ------- | ---------------------------------------------------------------- |
| `next`                                     | 16.2.9   | 16.2.12 | 4 HIGH + 5 MOD                                                   |
| `eslint-config-next`                       | 16.2.4   | 16.2.12 | Aucune contrainte technique, mais le lint diverge du runtime     |
| `@next/bundle-analyzer`                    | 16.1.6   | 16.2.12 | Derive silencieuse d'une mineure                                 |
| `@sentry/nextjs`                           | 10.38.0  | 10.68.0 | Ferme les deux HIGH `fast-uri`. Peer deja compatible `^16.0.0-0` |
| `@serwist/next`, `serwist`, `@serwist/cli` | 9.5.11   | 9.5.12  | Doivent bouger ensemble                                          |
| `react`, `react-dom`                       | 19.2.3   | 19.2.8  | Optionnel                                                        |

**Procedure de verification apres montee** :

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test -- src/__tests__/proxy.test.ts    # la suite proxy en priorite
pnpm test:coverage
pnpm build                                   # build Next + serwist build
```

Puis, en preview Vercel, six verifications manuelles :

1. en-tete CSP avec nonce present sur `/` et sur `<tenant>.attabl.com` ;
2. rejet du contournement middleware (`curl -H 'x-middleware-subrequest: 1'` doit donner 403) ;
3. redirection auth (`/admin` non authentifie donne 307 vers `/login`) ;
4. resolution sous-domaine et injection de `x-tenant-slug` ;
5. `/sw.js` servi verbatim, non reecrit ;
6. `/api/version` sans rotation de session.

### 5.2 [DEP-02] Les overrides `pnpm-workspace.yaml` sont perimes

**C'est le point le plus actionnable de ce lot.** Le fichier contient 24 overrides, plusieurs sont depasses par des avis plus recents et laissent donc passer la version vulnerable.

| Override actuel                                           | Version resolue | Requise    | Etat                 |
| --------------------------------------------------------- | --------------- | ---------- | -------------------- |
| `fast-uri: '>=3.1.2'`                                     | 4.0.0           | `>=4.1.1`  | **PERIME**, 2 HIGH   |
| `brace-expansion@>=5.0.0 <5.0.6: '>=5.0.6'`               | 5.0.7           | `>=5.0.8`  | **PERIME**, 1 HIGH   |
| aucun pour la branche 2.x                                 | 2.1.1           | `>=2.1.2`  | **MANQUANT**, 1 HIGH |
| `postcss@<8.5.10: '>=8.5.10'`                             | 8.5.16          | `>=8.5.18` | **PERIME**, 1 HIGH   |
| `dompurify@<=3.4.10: '>=3.4.11'` (+ 9 lignes redondantes) | 3.4.11          | `>=3.4.12` | **PERIME**, 1 LOW    |

```yaml
overrides:
  # remplacer les 10 lignes dompurify@... par une seule
  dompurify: '>=3.4.12'
  fast-uri: '>=4.1.1'
  brace-expansion: '>=2.1.2'
  'brace-expansion@>=5.0.0': '>=5.0.8'
  postcss: '>=8.5.18'
  sharp: '>=0.35.0'
```

Les 10 lignes `dompurify@<X: '>=Y'` empilees sont un anti-pattern : chaque nouvel avis ajoute une ligne sans supprimer les precedentes, et la borne effective est la plus permissive.

`dompurify` est le seul de la liste **reellement atteignable cote client** : il arrive via `jspdf`, utilise dans 6 fichiers (`useReportExports.ts`, `QRExportPanel.tsx`, `export-card.ts`, page `orders/[orderId]`), et l'entree est constituee de noms de plats et de tenants saisis par l'utilisateur.

Montees directes complementaires :

```bash
pnpm up supabase@latest happy-dom@latest vitest@latest @vitest/coverage-v8@latest
```

La montee de la CLI `supabase` (2.76.3 vers 2.109.1) ferme le seul CRITICAL du graphe complet (`tar`).

**Acceptations documentees a ecrire** (une ligne chacune, dans un `security/ACCEPTATIONS.md`) :

- `xlsx@0.18.5` : `patched_versions: "<0.0.0"`, aucun correctif publie sur npm. Usage confine a 3 fichiers de test ; le chemin de production utilise `exceljs`.
- `esbuild` LOW : exploit Windows uniquement.
- `sharp` : l'optimisation d'image tourne sur l'infrastructure Vercel, pas sur le `sharp` du bundle. Deviendrait atteignable en auto-hebergement.

### 5.3 [CI-01] Trancher l'incoherence `ci.yml` / `security.yml`

|          | `ci.yml` (job `quality`)                     | `security.yml` (job `dependency-audit`) |
| -------- | -------------------------------------------- | --------------------------------------- |
| Commande | `pnpm audit --prod \|\| echo "::warning::…"` | `pnpm audit --prod --audit-level=high`  |
| Bloquant | Non                                          | **Oui**                                 |
| Node     | 20                                           | 22                                      |
| pnpm     | 10 (epingle)                                 | `latest` (flottant)                     |

Le meme controle est simultanement decoratif dans un workflow et bloquant dans l'autre.

**Etat reel verifie le 26/07/2026 (voir section 2.A), qui corrige une hypothese initiale erronee de ce dossier.** `security.yml` n'est pas rouge en permanence. Il etait **vert** du 18 au 20 juillet (runs #608 a #612) et a bascule au **rouge** le 21 juillet (runs #613 et #614), sur le job `Dependency Audit` exclusivement. `Static Analysis (Semgrep)` et `Secret Scanning` passent.

La bascule correspond a la publication des avis Next.js 16.2.11. **La porte fonctionne donc correctement** : elle signale un probleme reel apparu il y a cinq jours, elle n'est pas ignoree par accoutumance. Il ne faut surtout pas la desactiver ni la rendre non bloquante : il faut la remettre au vert en faisant le LOT 5.

L'incoherence entre les deux workflows reste, elle, a corriger.

**Correction, apres 5.1 et 5.2** : supprimer la Gate 0.5 de `ci.yml` (redondante), garder `security.yml` comme unique source de verite, aligner Node et pnpm. Ajouter dans `package.json` :

```json
"packageManager": "pnpm@10.x.y",
"engines": { "node": ">=20 <23" }
```

Autre remarque : `ci.yml` declare `on: push:` sans filtre de branche, ce qui fait tourner le workflow complet deux fois pour toute PR interne. `concurrency` ne dedoublonne pas puisque `github.ref` differe.

**Acceptation** : `pnpm audit --prod --audit-level=high` retourne 0. L'onglet Actions montre `security.yml` vert.

### 5.4 [CFG-01] `images.remotePatterns` ouvert sur tous les projets Supabase

`next.config.mjs` : `{ hostname: '**.supabase.co', pathname: '/storage/v1/object/public/**' }`. Le wildcard autorise **n'importe quel projet Supabase du monde** a etre proxifie par `/_next/image`. Epingler au ref du projet, alimente par `new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname`.

### 5.5 [CFG-02] Le bloc `webpack:` de `withSentryConfig` est inerte

Next 16 utilise Turbopack par defaut pour `dev` et `build` (aucun `--webpack` dans les scripts). Consequence mesurable : `removeDebugLogging` ne s'applique pas, les appels de log Sentry restent dans le bundle client, et `reactComponentAnnotation` n'annote rien. C'est de la configuration morte qui donne une fausse assurance. A supprimer ou migrer vers l'equivalent Turbopack.

Note connexe : duplication de `Cache-Control` sur `/sw.js` entre `next.config.mjs` et `vercel.json`. Sur Vercel, `vercel.json` gagne. Unifier dans `vercel.json` seul.

---

## LOT 6 : INTEGRITE DU STOCK ET DE LA BASE

### 6.1 [DB-04] `restock_order` a perdu son verrou consultatif

**Gravite : MAJEUR. C'est une regression, pas un choix.**

Regression introduite entre `20260629000200_order_cancellation_restock.sql:46` et `20260629120000_stock_integrity_restock_atomic_ledger.sql:36`, propagee dans la definition finale `20260702130000_stock_ledger_canonical.sql:136-201`.

```sql
-- Version d'origine, correcte (20260629000200:44-56)
PERFORM public.assert_tenant_member(p_tenant_id);
PERFORM pg_advisory_xact_lock(hashtext('restock_order:' || p_order_id::text));
IF EXISTS (SELECT 1 FROM public.stock_movements WHERE reference_id = p_order_id ...) THEN
  RETURN 0;
END IF;
```

La version finale a perdu le `pg_advisory_xact_lock`. C'est un lire-puis-ecrire classique. Sous `READ COMMITTED`, deux transactions concurrentes qui annulent la meme commande (double-clic, ou surtout **rejeu de l'outbox depuis deux tablettes**, scenario explicitement prevu par `20260717000000`) executent toutes les deux le `EXISTS` avant que l'autre n'ait committe, ne voient aucun mouvement `order_restock`, et crediten chacune `ABS(net_destocked)`.

**Le stock est gonfle du double, et `verify_stock_ledger` ne detecte rien** puisque l'invariant `SUM(stock_movements.quantity) = ingredients.current_stock` tient toujours. En coup de feu, on sert des plats dont l'ingredient n'existe plus physiquement.

`destock_order` a bien conserve son verrou (`20260702130000:72`) et son decrement est atomique. L'asymetrie confirme la regression.

```sql
-- supabase/migrations/20260726000300_restock_order_relock.sql
CREATE OR REPLACE FUNCTION public.restock_order(
  p_order_id uuid, p_tenant_id uuid, p_created_by uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_count INT := 0; v_mov RECORD; v_new_stock NUMERIC(10,3);
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  -- Serialise les rejeux concurrents (outbox offline) sur la meme commande.
  PERFORM pg_advisory_xact_lock(hashtext('restock_order:' || p_order_id::text));
  -- ... corps identique a 20260702130000:150-197 ...
END;
$$;

-- Garde-fou structurel: un seul restock par (tenant, commande, ingredient).
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movements_restock_once
  ON public.stock_movements (tenant_id, reference_id, ingredient_id)
  WHERE movement_type = 'order_restock';

REVOKE ALL ON FUNCTION public.restock_order(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restock_order(uuid, uuid, uuid) TO service_role;
```

**Acceptation** : `supabase/tests/stock/restock_idempotency.test.sql`.

- Sequentiel : `destock_order` puis deux `restock_order` successifs. `current_stock` revient exactement au niveau initial, une seule ligne `order_restock` par ingredient.
- Concurrence : deux `restock_order` en parallele sur la meme commande. L'index unique leve `23505` sur la seconde, `current_stock` n'est credite qu'une fois.
- `verify_stock_ledger(tenant)` retourne 0 ligne apres l'operation.

### 6.2 [DB-05] N'importe quel membre peut desactiver le compte de son proprietaire

**Gravite : MAJEUR.** `20260227000002_rls_optimization.sql:42-45`, `20260420000003_lock_admin_privilege_columns.sql:32-33`.

La migration `20260420000003` a bien verrouille `role`, `custom_permissions`, `email`, `tenant_id` et `user_id`, fermant l'escalade de privilege. Mais **`is_active` reste dans le grant `authenticated`**, et la policy `FOR ALL` ne filtre que sur `tenant_id`, jamais sur le role de l'appelant.

Concretement : un serveur du tenant A peut faire `PATCH /rest/v1/admin_users?id=eq.<owner_id>` avec `{"is_active": false}` et **desactiver le proprietaire du restaurant**. Combine a DB-03, il peut desactiver tous les managers sans perdre son propre acces. Le meme vecteur permet de reecrire `full_name` et `phone` de tous les collegues.

**Correction** : deux policies distinctes, l'une pour son propre profil (`user_id = auth.uid()`), l'autre reservee a `owner` et `admin` pour agir sur les autres membres. **Attention a la recursion** : une sous-requete sur `admin_users` dans une policy `ON admin_users` provoque la recursion corrigee en `20260209000001`. L'implementation doit passer par un helper SECURITY DEFINER `public.my_role_in_tenant(uuid)`, sur le meme modele que `get_my_tenant_ids_array`.

**Acceptation** : `supabase/tests/rls/admin_users_write.test.sql`. Un membre `server` du tenant A : `UPDATE admin_users SET is_active=false WHERE role='owner'` affecte 0 ligne, mais il peut mettre a jour son propre `full_name`. Un `owner` peut desactiver un `server` de son tenant, et affecte 0 ligne sur un membre du tenant B.

### 6.3 [DB-11] `destock_order` : garde d'idempotence non scopee au tenant

Meme famille que DB-04. A corriger dans la meme migration.

### 6.4 [DB-10] Policies UPDATE sans `WITH CHECK` explicite

Une policy UPDATE sans `WITH CHECK` permet a un utilisateur de **deplacer une ligne vers un autre tenant**. Le detail table par table est dans le rapport source. Passer en revue toutes les policies UPDATE des tables portant une colonne de tenant et ajouter la clause manquante.

### 6.5 [DB-14] `stock_counts` et `stock_count_lines` : policies sans clause `TO`

Sans clause `TO`, une policy s'applique au role `public`, donc `anon` inclus. Ajouter `TO authenticated`.

### 6.6 [DB-09] et [DB-15] Deux snapshots de schema divergents et perimes

- `supabase/schema.sql` (139 Ko, 34 tables) se presente en en-tete comme pouvant « provision a fresh database », mais il lui manque 8 tables (`ads`, `audit_log`, `invitations`, `newsletter_subscriber`, `platform_audit_log`, `push_subscriptions`, `role_permissions`, `tenant_supports`).
- `tests/journeys/fixtures/schema.sql` (166 Ko, 42 tables) est le snapshot reellement utilise par les scripts, fige au marqueur `20260628000000`, soit **40 migrations en arriere**.

**Point structurel important** : les 138 migrations **ne reconstruisent pas** une base vierge. Verifie : aucune migration ne contient de `CREATE TABLE` pour `tenants`, `orders` ni `menu_items`. Sur 138 fichiers, 37 `CREATE TABLE` au total, tous pour des tables ajoutees apres coup. `20260207000000_complete.sql` commence directement par des `ALTER TABLE tenants ADD COLUMN`. Un `supabase db reset` echouerait.

**Correction** : un seul fichier doit faire foi. Definir une procedure de regeneration du snapshot (aujourd'hui `GUIDE.md:162` reconnait que c'est « un artefact a maintenir a la main »), et une porte CI qui verifie que le snapshot n'a pas derive de plus de N migrations.

---

## LOT 7 : REMISE EN SERVICE DE LA VERIFICATION

**Le constat central de ce lot : le harnais n'est pas casse, il n'est jamais invoque avec un environnement.**

Les 26 tests neutralises de `tests/journeys/` le sont par des gardes conditionnelles `test.skip(!hasSeedEnv(), ...)` ou `test.skip(!hasStripeWebhookEnv(), ...)`, pas par des `fixme` ni des TODO de code. **Un seul script deja present au depot, `scripts/run-journeys-local.sh`, provisionne la totalite de ce qui manque pour 20 des 26.**

### 7.0 Etat exact

| Fichier                             | Tests  | Executes | Neutralises  |
| ----------------------------------- | ------ | -------- | ------------ |
| `00-preflight.spec.ts`              | 4      | 3        | 1            |
| `01-signup-and-billing.spec.ts`     | 5      | 1        | 4            |
| `02-restaurant-config.spec.ts`      | 4      | 0        | 4            |
| `03-staff-permissions.spec.ts`      | 2      | 1        | 1            |
| `04-service-and-ordering.spec.ts`   | 5      | 1        | 4            |
| `05-payments.spec.ts`               | 1      | 0        | 1 (skip dur) |
| `06-subscription-lifecycle.spec.ts` | 4      | 0        | 4            |
| `07-edge-cases-security.spec.ts`    | 5      | 3        | 2            |
| **`08-bola.spec.ts`**               | **5**  | **0**    | **5**        |
| **Total**                           | **35** | **9**    | **26**       |

Et cote CI, `ci.yml` ne lance que `pnpm test:e2e:ci`, soit `tests/e2e/home.spec.ts` uniquement. **Une CI verte sur Attabl prouve aujourd'hui que la page d'accueil marketing s'affiche.**

### 7.1 [TEST-01] Correctifs prealables, une demi-journee cumulee

| #   | Correctif                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Fichier                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1   | **Creer `tests/journeys/.env.journeys.example`**, qui n'existe pas alors que `README.md:25` et `GUIDE.md:145` demandent de le copier. Toute la voie manuelle est donc non executable                                                                                                                                                                                                                                                                                | nouveau fichier          |
| 2   | **Corriger le drift de nommage des prix Stripe.** `ci.yml:108-111` injecte `NEXT_PUBLIC_STRIPE_PRICE_ESSENTIEL`, `_ESSENTIEL_YEARLY`, `_PREMIUM`, `_PREMIUM_YEARLY`. Le code exige `NEXT_PUBLIC_STRIPE_PRICE_{STARTER,PRO,BUSINESS}_{MONTHLY,SEMIANNUAL,YEARLY}`, soit 9 variables (`src/lib/stripe/server.ts:47-59`). Le build passe parce que l'initialisation est paresseuse derriere un `Proxy`, mais **toute execution qui touche un prix explose au runtime** | `ci.yml`, `.env.example` |
| 3   | Corriger le gate incomplet de `01-signup-and-billing.spec.ts:75` : sans `hasSeedEnv()`, `loginPersona(OWNER)` leve au lieu de skipper                                                                                                                                                                                                                                                                                                                               | spec                     |
| 4   | Ajouter `-x edge-runtime` a l'invocation `supabase start` de `run-journeys-local.sh:65`, comme le fait deja `run-stock-integration.sh:55`. Indispensable en CI (l'edge runtime va chercher des dependances Deno sur le reseau)                                                                                                                                                                                                                                      | script                   |
| 5   | Propager les 9 variables de prix Stripe au `pnpm dev` lance par `run-journeys-local.sh:116-122`                                                                                                                                                                                                                                                                                                                                                                     | script                   |
| 6   | Remonter les seuils de couverture de 38/44/30/38 a **48/42/52/49**, juste sous le mesure. Les planchers actuels sont depasses de 10 a 14 points, ils ne gatent plus rien                                                                                                                                                                                                                                                                                            | `vitest.config.ts`       |
| 7   | Reecrire le commentaire `ci.yml:130-136`. Il declare l'E2E DB-backed « bloque sur le versionnement du schema » : **le diagnostic etait exact, la conclusion est perimee**, le contournement existe et tourne (`run-journeys-local.sh:54-97`)                                                                                                                                                                                                                        | `ci.yml`                 |
| 8   | Supprimer `05-payments.spec.ts` (skip inconditionnel, couvert reellement par 04) ou le reduire a un commentaire de perimetre. Un skip permanent pollue le rapport                                                                                                                                                                                                                                                                                                   | spec                     |
| 9   | Elargir `test:e2e:ci` a `tests/e2e/segments.spec.ts`, deja sans dependance base, contrairement a ce que le commentaire de `ci.yml:130` affirme                                                                                                                                                                                                                                                                                                                      | `package.json`           |
| 10  | Ajouter la denylist anti-production a `scripts/seed-demo.ts` et `scripts/seed-qa.ts`. Ils chargent leur environnement depuis `.env.local` : pointes sur un `.env.local` de production, ils **ecrasent le tenant de demonstration en production**. Ils n'ont aucun garde-fou comparable a `assertNotProduction()`                                                                                                                                                    | scripts                  |

### 7.2 [TEST-02] Premier vert de reference, en local

```bash
bash scripts/run-journeys-local.sh                  # tous les parcours
bash scripts/run-journeys-local.sh 04-service       # un seul
```

Prerequis : Docker demarre, CLI `supabase` **globale** (le script teste `command -v supabase`, la devDependency ne suffit donc pas), client `psql`, `pnpm install` fait.

Ce que le script fait deja et qu'il ne faut pas refaire a la main : `supabase init`, mise a l'ecart des 138 migrations, `enable_confirmations=false`, `supabase start`, chargement du snapshot fixture, rejeu des 42 migrations posterieures au marqueur, **publication de `orders` dans `supabase_realtime` avec `REPLICA IDENTITY FULL`** (indispensable, `pg_dump --schema public` omet l'appartenance a la publication), lancement de `pnpm dev` sur le port 3100 avec un env Supabase local inline sans toucher `.env.local`, Upstash vide, attente de `/api/health`, puis Playwright. Un `trap EXIT` restaure tout.

**Garde-fous fail-closed a connaitre** : `PROD_SUPABASE_REFS = ['nqufpobuozrzwpeijkxt']` et `PROD_APP_HOSTS = ['attabl.com', 'attabl-saas.vercel.app']` (`fixtures/env.ts:10,15`). `assertNotProduction()` est reappelee dans **chaque** fonction d'ecriture de `fixtures/seed.ts`. Sans `JOURNEY_CONFIRM_TEST_DB=yes`, le `globalSetup` avorte tout le run.

**Ordre de remise en service, par rapport valeur sur effort** :

| Lot                         | Tests debloques                                     | Action                                          | Effort |
| --------------------------- | --------------------------------------------------- | ----------------------------------------------- | ------ |
| **L1. Base de test locale** | **20** (00.4, 02.1-4, 03.2, 04.2-5, 07.4-5, 08.1-5) | `bash scripts/run-journeys-local.sh`            | **S**  |
| **L2. Stripe mode test**    | **6** (01.3-5, 06.1-4)                              | `sk_test_`, les 9 prix a creer, `whsec` partage | **M**  |
| L3. Rate limit reel         | 1 (07.2, de degrade a strict)                       | Instance Upstash dediee test                    | M      |

**Priorite absolue : `08-bola.spec.ts`.** Ce sont les 5 seuls tests du depot qui exercent l'isolation cross-tenant, sur 4 routes sans equivalent unitaire (`/api/orders/:id/claim`, `/api/invitations/:id`, `/api/invitations/:id/resend`, `/api/assignments/:id`). Le seed monte deux tenants complets. `loginPersonaForSlug(OWNER, SLUG_B)` force le `Referer` sur le slug de B pendant que la session est celle de A, ce qui rend le test non trivial. Un des tests asserte l'invariance du `token` et de `expires_at` d'une invitation, pas juste le statut : c'est exactement le vecteur de prise de controle de compte.

**Puis** : `04-service-and-ordering` test #3 (fraude prix) et #4 (POS especes), impact financier immediat.

### 7.3 [TEST-03] Cablage CI

**Nouveau job `journeys-critical`, sur chaque PR.** Il n'a besoin d'**aucun secret** : tout est local, cles `service_role` generees par `supabase start`, base ephemere.

```yaml
journeys-critical:
  name: Journeys (BOLA + commande + permissions)
  runs-on: ubuntu-latest
  timeout-minutes: 25
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 20 }
    - uses: pnpm/action-setup@v4
      with: { version: 10 }
    - uses: supabase/setup-cli@v1 # les scripts appellent `supabase` en global
      with: { version: latest }
    - run: pnpm install --frozen-lockfile
    - run: pnpm exec playwright install --with-deps chromium
    - name: Parcours critiques (Supabase local ephemere)
      run: bash scripts/run-journeys-local.sh "08-bola|04-service|03-staff"
    - uses: actions/upload-artifact@v4
      if: failure()
      with: { name: journeys-report, path: playwright-report-journeys/, retention-days: 7 }
```

**Important** : passer les trois filtres en un seul argument, pas en trois invocations, sinon la stack Supabase redemarre trois fois (6 a 10 minutes perdues). Le script doit accepter un filtre compose.

Cout realiste en un seul bootstrap : `supabase start` 60 a 90 s, schema plus 42 deltas 30 a 60 s, `pnpm dev` pret 60 a 90 s, 12 tests sequentiels 3 a 5 min. **Total 8 a 12 minutes**, en parallele des jobs existants.

**Jobs nocturnes** (sortis des PR pour trois raisons : duree, secrets Stripe partages, et surtout la **limite du nombre de Test Clocks actives par compte Stripe** qui casserait les runs sur PR concurrentes) :

| Job                 | Contenu                                                           | Secrets                                                              | Duree       |
| ------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- | ----------- |
| `journeys-full`     | 00 a 08 complets, Stripe inclus                                   | `JOURNEY_STRIPE_SECRET_KEY`, `JOURNEY_STRIPE_WEBHOOK_SECRET`, 9 prix | 20 a 30 min |
| `stock-integration` | `pnpm test:db`, 9 fichiers, seule couverture des RPC SQL de stock | aucun                                                                | 6 a 10 min  |
| `e2e-db`            | `admin-dashboard`, `responsive`, apres correctifs de 7.4          | aucun                                                                | 5 a 8 min   |
| `k6`                | charge 100 convives, manuel uniquement                            | `K6_CONFIRM=yes`                                                     | 5 min       |

Budget PR total apres ajout : environ 12 minutes en horloge murale, les trois jobs tournant en parallele.

### 7.4 [TEST-04] Activer `admin-dashboard.spec.ts` et `responsive.spec.ts`

Le vrai blocage n'est pas le schema, ce sont trois points concrets :

1. **Le tenant `blutable` n'existe pas.** `admin-dashboard.spec.ts:22` et `responsive.spec.ts:26` le ciblent, mais `seed-demo.ts:433` cree `lepicurien` et `seed-qa.ts:433` cree `attabl-qa`. Parametrer le slug par variable d'environnement (meilleur) ou ajouter `blutable` au seed. Effort S.
2. **`ALLOW_DEV_AUTH_BYPASS=true` plus `NODE_ENV=development` plus hote localhost**, les trois conditions sont cumulatives (`src/proxy.ts:196-201`). La config racine lance `pnpm dev`, donc `NODE_ENV=development` est acquis.
3. **Selecteurs fragiles.** Les tests visent `page.locator('.grid')` filtre par `page.locator('button').nth(3)`, `page.locator('svg').first()` et `page.getByText(/commandes/i).first()`. Le commentaire mentionne `[data-testid="metrics-row"]` mais le `waitForSelector` accepte le repli `.grid`, donc le testid n'est probablement pas pose dans le composant. Poser des `data-testid` stables sur `MetricsRow`, `OverviewChart` et `LiveOrdersFeed` **avant** d'activer, sinon la suite sera instable. Effort M.

### 7.5 [TEST-05] Tests unitaires sur les chemins critiques non couverts

**Remarque de perimetre importante** : `coverage.include` (`vitest.config.ts:14`) ne couvre que `src/services/**`, `src/lib/validations/**` et `src/lib/**`. **Les routes `src/app/api/**`et les Server Actions`src/app/actions/**` sont hors perimetre de couverture**, c'est-a-dire exactement la frontiere de confiance. A ajouter, en recalculant les planchers ensuite.

Modules a 0 % sur un chemin critique, par ordre de priorite :

| Module                                     | Lignes     | Pourquoi c'est critique                                                                                                                                                                                                                                       | Effort |
| ------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `src/lib/stripe/server.ts`                 | 0 % (27)   | Mappe un price ID Stripe vers un plan facture. Une erreur facture le mauvais plan ou n'en reconnait aucun. Test pur avec `process.env` stubbe : aller-retour `getStripePriceId('pro','yearly')` puis `getPlanFromPriceId`, absence de variable qui doit lever | S      |
| `src/lib/auth/require-admin-permission.ts` | 0 % (35)   | **Le plus important.** Garde RBAC serveur. Un test par role x permission, plus non-membre, plus `is_active=false`                                                                                                                                             | M      |
| `src/lib/auth/session-admin-user.ts`       | 0 % (37)   | Resolution du tenant courant quand un utilisateur appartient a plusieurs tenants. Point de bascule cross-tenant cote session                                                                                                                                  | M      |
| `src/lib/auth/require-super-admin.ts`      | 0 % (13)   | Fail-closed a prouver                                                                                                                                                                                                                                         | S      |
| `src/lib/stripe/checkout-tenant.ts`        | 0 % (13)   | Notamment le cas `tenants` renvoye en **tableau** contre objet (L54), piege PostgREST classique                                                                                                                                                               | S      |
| `src/lib/rate-limit.ts`                    | 0 % (66)   | 21 limiteurs exportes, aucun exerce. `getClientIp` avec `x-forwarded-for` multiple. Comportement quand Upstash n'est pas configure, a prouver et non a supposer                                                                                               | M      |
| `src/lib/admin/monthly-orders-count.ts`    | 0 % (22)   | Comptage mensuel qui pilote les limites de plan. Un cache mal tagge fait fuiter le compteur d'un tenant vers un autre                                                                                                                                         | S      |
| `src/lib/cache.ts`                         | 7,8 % (64) | `toPublicTenant` doit prouver qu'aucun champ sensible ne sort vers le client. `getCachedTenantByDomain` : une collision de cle de cache sert le mauvais restaurant                                                                                            | M      |
| `src/lib/printing/receipt-html.ts`         | 0 % (47)   | Le recu client est un document comptable. Totaux, TVA, remise, arrondi                                                                                                                                                                                        | S      |
| `src/services/excel-import/*`              | 0 % (75)   | Point d'entree de donnees chiffrees non maitrisees dans l'inventaire et les prix. `parseNumericCell` sur `"1 234,56"`, `"1,234.56"`, cellule vide, texte                                                                                                      | M      |
| `src/services/invitation.service.ts`       | 42,7 %     | `acceptInvitation` non couverte : token expire, deja consomme, d'un autre tenant, rejeu. Chemin d'entree dans un tenant                                                                                                                                       | M      |
| `src/services/coupon.service.ts`           | 75,9 %     | `unclaimUsage` non couverte. Un coupon non libere sur annulation est une perte de revenu ou un usage illimite selon le sens de l'erreur                                                                                                                       | S      |
| `src/services/order/order-validation.ts`   | 82,2 %     | `determinePreparationZone` non couverte. Routage kitchen/bar/both/mixed, exactement ce que 04 test #5 asserte en bout de chaine                                                                                                                               | S      |

---

## LOT 8 : DETTE, CONFIGURATION, HYGIENE

### 8.1 [SEC-CFG-01] L'allowlist `.gitleaks.toml` annule le scan sur la majorite des lignes

**Gravite : CRITIQUE au sens ou elle produit un faux vert.**

Le fichier utilise `regexTarget = "line"` avec une allowlist globale contenant `(?i)(example|placeholder|change[-_ ]?me|replace[-_ ]?me|your[-_]|xxx+|dummy|sample|fixture|redacted|todo)` et `<[^>]{1,40}>`.

Comme la cible est **la ligne entiere**, toute ligne contenant le mot `TODO`, `example` ou `sample`, ou contenant un generique TypeScript ou une balise JSX (`<[^>]{1,40}>`), est **integralement ignoree par le scan**. Un vrai secret sur une ligne portant un commentaire `// TODO` passe.

Illustration concrete : le mot de passe `[MOT-DE-PASSE-PURGE-VOIR-PR-299]` de `docs/DEMO-PRESENTATION.md` n'est pas detecte, a la fois parce qu'il est dans un tableau Markdown qui ne correspond pas au motif `password\s*[:=]\s*'...'`, et parce que `docs/.*\.md$` est dans `paths`.

**Correction** : reduire l'allowlist globale a des chemins uniquement, jamais un mot-clef libre. Deplacer les placeholders vers une allowlist specifique a la regle maison, avec `regexTarget` par defaut (la valeur capturee, pas la ligne), et des placeholders ancres.

### 8.2 [SEC-CFG-02] Les hooks Husky doivent echouer quand gitleaks est absent

`.husky/pre-commit` appelle gitleaks, mais si le binaire n'est pas installe sur la machine du developpeur, la barriere est simplement sautee. Ajouter un repli Docker et faire echouer le hook si ni l'un ni l'autre n'est disponible.

Ajouter aussi un garde-fou binaire et taille au `pre-commit` : refuser tout fichier de plus de 300 Ko et toute extension bureautique. C'est ce qui empeche la recidive du LOT 0.3 (4,42 Mio de fichiers parasites deja entres).

### 8.3 [KNIP-01] Rendre knip exploitable

`pnpm knip` sort 3 faux positifs sur 5 signaux principaux et n'est branche nulle part en CI.

- **Faux positifs a corriger dans `knip.json`** : ajouter `src/app/sw.ts` a `entry`. C'est le `swSrc` de `serwist.config.mjs`. Cela regle aussi les faux positifs `@serwist/next` et `serwist` en dependances inutilisees.
- **Vrais morts a supprimer** : `src/components/admin/orders/OrdersPagination.tsx`, la devDependency `@types/ws`.
- **Binaires non declares** : `tsx` (`"seed:demo": "npx tsx ..."` resout depuis le reseau, version non verrouillee, script non reproductible ; ajouter `tsx` en devDependency et utiliser `pnpm exec tsx`), `k6` (non documente), `scripts/db-migrate.sh`.
- **Exports morts notables**, qui suggerent une fonctionnalite incomplete plutot qu'un oubli : `paymentInitiationLimiter` et `webhookLimiter` (traites au LOT 2.11), `generateInvoiceHTML`, `generateKitchenTicketHTML`, `createIdbOutboxStore`, et trois hooks de requete `useStaffStockReport`, `useStockCounts`, `useStockCount`.
- Puis brancher `pnpm knip` en CI, **non bloquant d'abord**, bloquant une fois la liste videe.

### 8.4 [DETTE-01] Fichiers de plus de 500 lignes

La convention (`.claude/rules/04-frontend-quality.md:89`) est de 300 lignes. 104 fichiers sur 1076 depassent 300 lignes, 18 depassent 500, dont 10 hors tests et hors genere :

| Lignes  | Fichier                                                      |
| ------- | ------------------------------------------------------------ |
| 730     | `src/services/inventory.service.ts`                          |
| **700** | **`src/app/actions/orders.ts`**                              |
| 674     | `src/app/sites/[site]/(storefront)/cart/page.tsx`            |
| 672     | `src/components/tenant/ItemDetailSheet.tsx`                  |
| 659     | `src/app/sites/[site]/(storefront)/order-confirmed/page.tsx` |
| 652     | `src/components/admin/PaymentModal.tsx`                      |
| 619     | `src/contexts/CartContext.tsx`                               |
| 597     | `src/hooks/usePOSData.ts`                                    |
| **559** | **`src/app/api/orders/pos/route.ts`**                        |
| 523     | `src/app/admin/tenants/tenants-page-client.tsx`              |

Commencer par les deux en gras : ils portent la logique de commande et de paiement, et ils sont hors du perimetre de couverture actuel.

### 8.5 Points de configuration restants

- **`tsconfig.json`** : passer `target` de ES2017 a ES2022 (bundle client plus leger). Ajouter `noUncheckedIndexedAccess`, qui durcit les acces indexes de `proxy.ts`. Effort M, produira des erreurs a corriger.
- **`eslint.config.mjs`** : ajouter `no-console` en `error` avec exceptions pour `src/lib/logger.ts`, `src/lib/env.ts` et `**/__tests__/**`, pour verrouiller un acquis (7 occurrences seulement). Retirer `scripts/**` des ignores : 15 scripts non lintes, dont ceux qui manipulent le `service_role`.
- **`serwist.config.mjs`** : utiliser `VERCEL_GIT_COMMIT_SHA` pour eviter l'invalidation du precache `/offline` a chaque build.
- **`src/lib/auth/admin-route-guard.ts`** : un des 3 `any` du depot, sur le chemin RBAC appele depuis `proxy.ts`. A typer.
- **Deux props mortes** dans `src/components/features/kitchen/KDSTicket.tsx:40` et `:42`, et un placeholder de pagination dans `src/components/admin/KitchenClient.tsx:121`.

---

## 9. PORTE DE SORTIE PILOTE

Le produit est pret a recevoir de premiers utilisateurs reels quand les cinq portes suivantes sont fermees, chacune avec sa preuve.

| Porte  | Contenu                  | Preuve attendue                                                                                            |
| ------ | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **P1** | LOT 0 complet            | `git clone` sans jeton echoue. Connexion avec `[MOT-DE-PASSE-PURGE-VOIR-PR-299]` echoue                    |
| **P2** | LOT 1 complet            | `GET /rest/v1/tenants?select=stripe_customer_id` avec la cle anon renvoie 401. Tests pgTAP verts           |
| **P3** | LOT 2 sections 2.1 a 2.6 | Tests unitaires verts. `POST /api/restaurants/create {"plan":"business"}` renvoie 403                      |
| **P4** | LOT 3 sections 3.1 a 3.4 | `tests/e2e/pos-offline.spec.ts` vert : 6 commandes prises hors ligne arrivent 6 fois, pas 0, pas 12        |
| **P5** | LOT 5 et LOT 7.1 a 7.3   | `pnpm audit --prod --audit-level=high` retourne 0. Job `journeys-critical` vert, incluant les 5 tests BOLA |

### Verifications manuelles, non automatisables, a faire avant l'ouverture

- [ ] Deux comptes sur deux etablissements. Depuis A, modifier un ID d'URL pour atteindre une commande de B. Doit echouer.
- [ ] 10 tentatives de connexion echouees d'affilee sur le login. Doit bloquer ou ralentir.
- [ ] Commande passee en mode avion sur mobile, puis retour reseau. Doit arriver **une fois** en cuisine, ni zero, ni deux.
- [ ] Webhook Stripe de test avec signature invalide. Doit etre rejete.
- [ ] Tablette de caisse partagee : apres deconnexion, ouvrir l'application avant de se reconnecter. Aucune donnee de la session precedente ne doit s'afficher.
- [ ] Sur la tablette, DevTools, `(await caches.open('cross-origin')).keys()`. Doit etre vide.
- [ ] Lire le reglage Stripe « Subscription status after retries exhausted ».
- [ ] Restauration de sauvegarde reellement testee sur une base jetable, pas seulement activee.

### Les 7 commandes a rejouer avant chaque mise en production

```bash
pnpm typecheck                              # attendu: exit 0
pnpm lint                                   # attendu: exit 0
pnpm format:check                           # attendu: exit 0
pnpm test:coverage                          # attendu: exit 0, planchers releves tenus
pnpm audit --prod --audit-level=high        # attendu: exit 0
gitleaks git --redact .                     # attendu: no leaks found
bash scripts/run-journeys-local.sh          # attendu: 35/35, plus aucun skip
```

---

## 10. RECAPITULATIF DES CONSTATS

Colonne **Preuve** : `PROD` = prouve par requete reelle en production. `OUTIL` = prouve par execution d'une commande. `CODE` = lu dans le code, a reconfirmer avant correction (voir section 0.A).

| ID                                                                         | Gravite      | Preuve   | Lot | Titre                                                                    |
| -------------------------------------------------------------------------- | ------------ | -------- | --- | ------------------------------------------------------------------------ |
| REPO-01                                                                    | CRITIQUE     | OUTIL    | 0   | Depot GitHub public. **FAIT le 26/07**                                   |
| REPO-02                                                                    | CRITIQUE     | OUTIL    | 0   | Identifiants publies en clair                                            |
| REPO-03                                                                    | MAJEUR       | OUTIL    | 0   | 23 documents commerciaux et 83 fichiers d'agents commites                |
| REPO-04                                                                    | MAJEUR       | OUTIL    | 0   | Historique non purge                                                     |
| REPO-05                                                                    | MAJEUR       | **PROD** | 0   | Projet Supabase `gjlztittszelfjubbksy` a statuer                         |
| **DB-02**                                                                  | **CRITIQUE** | **PROD** | 1   | **`tenants` : fichier client lisible par anon. Verifie en production**   |
| **DB-01**                                                                  | **CRITIQUE** | CODE     | 1   | **`push_subscriptions` : credentials Web Push exposes**                  |
| **DB-03**                                                                  | **CRITIQUE** | CODE     | 1   | **Employe desactive conserve tous ses droits en base**                   |
| **DB-06**                                                                  | **MAJEUR**   | **PROD** | 1   | **`coupons` enumerables par anon. Verifie en production**                |
| DB-07                                                                      | MAJEUR       | CODE     | 1   | `ads` : policy SELECT `USING (true)`                                     |
| DB-12                                                                      | MAJEUR       | CODE     | 1   | Grants anon residuels (TRUNCATE, DELETE, INSERT)                         |
| DB-08                                                                      | MAJEUR       | CODE     | 1   | Policies storage non versionnees                                         |
| DB-13                                                                      | MINEUR       | CODE     | 1   | Fonction SECURITY DEFINER sans `search_path`                             |
| **F1**                                                                     | **CRITIQUE** | CODE     | 2   | **Plan Business gratuit a vie via `/api/restaurants/create`**            |
| **F2**                                                                     | **CRITIQUE** | CODE     | 2   | **La devise d'affichage client devient l'unite monetaire**               |
| F3                                                                         | MAJEUR       | CODE     | 2   | Impaye conserve l'acces indefiniment                                     |
| F4                                                                         | MAJEUR       | CODE     | 2   | Fonctionnalites payantes atteignables par Server Action                  |
| F5                                                                         | MAJEUR       | CODE     | 2   | Encaissement sans plafond ni idempotence, refund TOCTOU                  |
| F6                                                                         | MAJEUR       | CODE     | 2   | Tenant gele continue d'encaisser en boutique                             |
| F7                                                                         | MINEUR       | CODE     | 2   | Coupon fixe ignore `max_discount_amount`                                 |
| F8                                                                         | MINEUR       | CODE     | 2   | `price_at_order` errone sur deux variantes                               |
| F9                                                                         | MINEUR       | CODE     | 2   | Affichage float sur XAF                                                  |
| F10                                                                        | MINEUR       | CODE     | 2   | Chargebacks Stripe non traites                                           |
| KNIP-RL                                                                    | MAJEUR       | OUTIL    | 2   | Deux limiteurs paiement et webhook jamais branches                       |
| **OFF-01**                                                                 | **CRITIQUE** | CODE     | 3   | **Mutations en pause hors ligne : commandes perdues en silence**         |
| **OFF-02**                                                                 | **CRITIQUE** | CODE     | 3   | **Donnees tenant en cache navigateur cross-origin**                      |
| **OFF-03**                                                                 | **CRITIQUE** | CODE     | 3   | **Aucune purge a la deconnexion, commentaire faux**                      |
| OFF-05                                                                     | MAJEUR       | CODE     | 3   | Encaissement d'une commande ouverte hors outbox                          |
| OFF-06                                                                     | MAJEUR       | CODE     | 3   | File sans TTL ni plafond                                                 |
| OFF-07                                                                     | MAJEUR       | CODE     | 3   | File non cloisonnee par utilisateur ni tenant                            |
| OFF-08                                                                     | MAJEUR       | CODE     | 3   | Pas de blocage de tete de file par ressource                             |
| OFF-04                                                                     | MAJEUR       | CODE     | 3   | KDS perime presente comme frais                                          |
| OFF-11                                                                     | MINEUR       | CODE     | 3   | Nouvelle cle d'idempotence a chaque tap POS                              |
| OFF-12                                                                     | MINEUR       | CODE     | 3   | Actions article du KDS hors outbox                                       |
| OFF-09                                                                     | MINEUR       | CODE     | 3   | Course drain page contre service worker                                  |
| OFF-10                                                                     | MINEUR       | CODE     | 3   | Claim orpheline sans reprise ni retention                                |
| HDR-REFERER                                                                | MAJEUR       | CODE     | 4   | `x-tenant-slug` derive du `Referer`                                      |
| SESSION-FALLBACK                                                           | MAJEUR       | CODE     | 4   | Repli silencieux sur la plus ancienne appartenance                       |
| ADMIN-TENANTS-BAN                                                          | MAJEUR       | CODE     | 4   | `/admin/tenants` accepte un membre banni                                 |
| SUPPORTS-EXPORT                                                            | MAJEUR       | CODE     | 4   | Route sans CSRF ni permission, tenant mal derive                         |
| CSP-CUSTOM-DOMAIN                                                          | MINEUR       | CODE     | 4   | Pas de CSP sur domaine custom                                            |
| ORDER-SPAM                                                                 | MINEUR       | CODE     | 4   | Commandes injectables sur un tenant tiers                                |
| ACT-EVENT, RL-FAILOPEN, IP-SPOOF, DOMAIN-VERIFY, PUSH-TENANT, CONSOLE-PROD | MINEUR       | CODE     | 4   | Points mineurs de controle d'acces                                       |
| **DEP-01**                                                                 | **CRITIQUE** | OUTIL    | 5   | **Next 16.2.9, contournement de middleware non corrige**                 |
| DEP-02                                                                     | MAJEUR       | OUTIL    | 5   | Overrides `pnpm-workspace.yaml` perimes                                  |
| CI-01                                                                      | MAJEUR       | OUTIL    | 5   | `security.yml` rouge depuis le 21/07 sur `Dependency Audit` (vert avant) |
| CFG-01                                                                     | MOYEN        | OUTIL    | 5   | `images.remotePatterns` ouvert                                           |
| CFG-02                                                                     | FAIBLE       | OUTIL    | 5   | Bloc webpack inerte sous Turbopack                                       |
| DB-04                                                                      | MAJEUR       | CODE     | 6   | `restock_order` a perdu son verrou : double reapprovisionnement          |
| DB-05                                                                      | MAJEUR       | CODE     | 6   | Un serveur peut desactiver son proprietaire                              |
| DB-10, DB-11, DB-14                                                        | MAJEUR       | CODE     | 6   | `WITH CHECK` manquants, garde non scopee, policies sans `TO`             |
| DB-09, DB-15                                                               | MOYEN        | CODE     | 6   | Snapshots de schema divergents et perimes                                |
| DB-16                                                                      | MAJEUR       | CODE     | 7   | Aucun test pgTAP malgre 138 migrations                                   |
| TEST-01 a TEST-05                                                          | MAJEUR       | CODE     | 7   | 26 tests sur 35 neutralises, CI ne couvre que la page d'accueil          |
| SEC-CFG-01                                                                 | CRITIQUE     | OUTIL    | 8   | Allowlist gitleaks annule le scan, faux vert                             |
| SEC-CFG-02                                                                 | MAJEUR       | OUTIL    | 8   | Hooks Husky sans repli si gitleaks absent                                |
| KNIP-01, DETTE-01                                                          | FAIBLE       | OUTIL    | 8   | Outillage et dette de lisibilite                                         |

---

## 11. METHODE ET REPRODUCTIBILITE

Audit execute le 26 juillet 2026 sur le commit `f2277231`, avec Node 22.22.2, pnpm 10.28.0, gitleaks 8.24.0, sur une copie clonee du depot. **Aucun fichier du depot n'a ete modifie.**

Outils reellement executes : `pnpm typecheck` (exit 0), `pnpm lint` (exit 0), `pnpm test:coverage` (1475 tests verts), `gitleaks git` (837 commits, no leaks found), `pnpm audit --prod` et `pnpm audit`, `pnpm knip`, `pnpm outdated`, `curl` sur `attabl.com` et sur l'API PostgREST de production, API Vercel (erreurs runtime, deploiements), API Sentry (3 problemes non resolus, tous des `ReferenceError` sur `/login` datant de 13 jours, 0 utilisateur affecte), advisors Supabase sur le projet `gjlztittszelfjubbksy`.

**Ce qui n'a pas pu etre verifie et pourquoi** :

1. **Les advisors Supabase de la base de production Attabl** (`nqufpobuozrzwpeijkxt`). Ce projet n'est pas rattache au connecteur Supabase de la session. Les fuites DB-01, DB-02 et DB-06 ont neanmoins ete verifiees directement par requete HTTP, ce qui est plus probant qu'un linter.
2. ~~L'historique des executions CI GitHub.~~ **Verifie depuis, le 26/07/2026, directement dans l'onglet Actions.** Resultat en section 2.A, qui corrige une hypothese initiale erronee du dossier (`security.yml` n'est pas rouge en permanence : vert jusqu'au 20 juillet, rouge depuis le 21, sur le seul job `Dependency Audit`).
3. **Le comportement en execution reelle** : effectivite du strip de `x-tenant-slug` dans le runtime Next.js 16, chaine de proxies en production pour `IP-SPOOF`, quotas IndexedDB sur les tablettes cibles, declenchement exact de l'evenement `offline` sur portail captif ou 3G degradee, comportement de Background Sync sur les tablettes reelles (l'API `SyncManager` est absente de Safari et iOS).
4. **La configuration Stripe** : reglage de fin de relance, exactitude des 9 Price IDs, devise reelle des prix.

Une reexecution des memes commandes sur le meme commit doit donner les memes valeurs. Si elle ne les donne pas, c'est l'environnement qui a change, et c'est en soi une information.
