# Rapport d'Audit de Securite - ATTABL SaaS

**Date** : 2026-03-24
**Auditeur** : Security Engineer (Agent IA)
**Perimetre** : Code source complet, configurations, dependances, headers HTTP
**Score global** : A RISQUE

---

## Resume executif

L'application ATTABL presente une architecture de securite globalement bien concue avec des patterns solides (Zod validation, RLS Supabase, rate limiting, CSP headers). Cependant, plusieurs vulnerabilites necessitent une attention immediate :

- **1 vulnerabilite critique** : Next.js 16.1.6 est en dessous de 16.1.7 (CVE CSRF bypass sur Server Actions)
- **5 vulnerabilites hautes** dans les dependances directes (jspdf, xlsx)
- **4 routes API sans rate limiting** exposees a des attaques par force brute
- **Server Actions acceptant `tenantId` du client** - risque IDOR attenue par verification DB
- **`listUsers()` avec `perPage: 1000`** - ne passe pas a l'echelle et echouera silencieusement au-dela de 1000 utilisateurs
- **Webhook Stripe** avec secret non configure (`whsec_xxxxxxxxxxxxx`)

---

## 1. Checklist OWASP Top 10

| #   | Categorie                 | Statut           | Details                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 | Broken Access Control     | **PARTIEL**      | RLS actif + verification cote application. Mais les Server Actions (`admin.ts`, `categories.ts`, `menus.ts`, `menu-items.ts`, `venues.ts`) acceptent `tenantId` en parametre client au lieu de le deriver de la session. Bien que la verification DB (`admin_users.eq('tenant_id', tenantId)`) attenuerait un IDOR, le pattern correct est de deriver le `tenantId` de la session serveur comme le fait `tenant-settings.ts`. |
| A02 | Cryptographic Failures    | **CONFORME**     | Supabase gere le hachage des mots de passe (bcrypt). HTTPS force via HSTS. Cookies avec flags `sameSite: 'lax'`.                                                                                                                                                                                                                                                                                                              |
| A03 | Injection                 | **CONFORME**     | Pas de SQL brut (`sql`, `.raw()`, `.unsafeRaw`). Toutes les requetes passent par le SDK Supabase (parametrees). Validation Zod systematique. `dangerouslySetInnerHTML` utilise uniquement avec des chaines statiques (pas d'input utilisateur). Pas de `eval()`.                                                                                                                                                              |
| A04 | Insecure Design           | **PARTIEL**      | Bonne architecture multi-couches. Pas de middleware Next.js racine (`middleware.ts`) - le proxy est dans `src/proxy.ts`. Le `ALLOW_DEV_AUTH_BYPASS=true` dans `.env.local` est protege par `NODE_ENV === 'development'`, mais sa presence en `.env.local` est un risque si le fichier est copie en production.                                                                                                                |
| A05 | Security Misconfiguration | **PARTIEL**      | Headers de securite bien configures (CSP, HSTS, X-Frame-Options, X-Content-Type-Options). Mais `unsafe-inline` dans `script-src` affaiblit le CSP. Le webhook secret Stripe est un placeholder (`whsec_xxxxxxxxxxxxx`).                                                                                                                                                                                                       |
| A06 | Vulnerable Components     | **NON CONFORME** | 32 vulnerabilites dans les dependances (1 critique, 23 hautes). Next.js 16.1.6 a un bypass CSRF sur Server Actions (CVE corrige en 16.1.7). `xlsx@0.18.5` a un Prototype Pollution sans correctif disponible. `jspdf@4.1.0` a une injection HTML critique.                                                                                                                                                                    |
| A07 | Authentication Failures   | **CONFORME**     | `getUser()` utilise partout (jamais `getSession()`). Rate limiting sur login/signup/forgot-password. Protection anti-enumeration sur forgot-password et resend-confirmation. Email non confirme bloque l'acces admin.                                                                                                                                                                                                         |
| A08 | Data Integrity Failures   | **CONFORME**     | Webhook Stripe verifie la signature (`constructEvent`). Validation Zod avant toute ecriture DB. Prix verifies cote serveur dans le flux commande.                                                                                                                                                                                                                                                                             |
| A09 | Logging & Monitoring      | **CONFORME**     | Logger centralise (`logger.ts`) vers Sentry en production. Pas de `console.*` dans le code applicatif (seulement dans `logger.ts` pour le dev). Audit trail implemente via `audit.service.ts`.                                                                                                                                                                                                                                |
| A10 | SSRF                      | **PARTIEL**      | `domain-verify/route.ts` fait un `fetch()` vers `dns.google/resolve` avec un domaine fourni par l'utilisateur. Le domaine est `encodeURIComponent`-e, mais un attaquant pourrait utiliser ce endpoint pour scanner des domaines internes si `dns.google` resolvait des noms internes. Risque faible car la requete est dirigee vers un DNS public externe.                                                                    |

---

## 2. Inventaire des Headers de Securite

| Header                         | Statut           | Valeur                                                       |
| ------------------------------ | ---------------- | ------------------------------------------------------------ |
| `X-Frame-Options`              | PRESENT          | `DENY`                                                       |
| `X-Content-Type-Options`       | PRESENT          | `nosniff`                                                    |
| `Referrer-Policy`              | PRESENT          | `strict-origin-when-cross-origin`                            |
| `Permissions-Policy`           | PRESENT          | `camera=(), microphone=(), geolocation=()`                   |
| `Strict-Transport-Security`    | PRESENT          | `max-age=63072000; includeSubDomains; preload`               |
| `Content-Security-Policy`      | PRESENT (faible) | `script-src 'self' 'unsafe-inline' ...`                      |
| `X-XSS-Protection`             | ABSENT           | Non configure (deprecie mais utile pour anciens navigateurs) |
| `Cross-Origin-Opener-Policy`   | ABSENT           | Non configure                                                |
| `Cross-Origin-Resource-Policy` | ABSENT           | Non configure                                                |
| `Cross-Origin-Embedder-Policy` | ABSENT           | Non configure                                                |

**Remarque CSP** : `'unsafe-inline'` dans `script-src` et `style-src` affaiblit significativement la protection CSP. En production, il faudrait utiliser des nonces ou des hashes pour les scripts inline.

---

## 3. Vulnerabilites trouvees

### CRITIQUE

#### V-001 : Next.js 16.1.6 - CSRF Bypass sur Server Actions

- **Fichier** : `package.json` (ligne 73)
- **Risque** : Un attaquant peut contourner la protection CSRF des Server Actions en utilisant un `null` origin (CVE GHSA-mq59-m269-xvcx)
- **Correctif** : Mettre a jour vers `next@16.1.7+`
- **Effort** : Faible (1h)

#### V-002 : jspdf@4.1.0 - Injection HTML dans les chemins New Window

- **Fichier** : `package.json` (ligne 70)
- **CVE** : GHSA-wfv2-pwc8-crg5
- **Correctif** : Mettre a jour vers `jspdf@4.2.1+`
- **Effort** : Faible (30min)

### HAUTE

#### V-003 : xlsx@0.18.5 - Prototype Pollution + ReDoS

- **Fichier** : `package.json` (ligne 91)
- **Risque** : Prototype Pollution (GHSA-4r6h-8v6p-xvw6) + ReDoS (GHSA-5pgg-2g8v-p4x9)
- **Impact** : L'import Excel de menus traite des fichiers uploades par les utilisateurs avec cette librairie vulnerable
- **Correctif** : Aucun patch disponible pour la version open-source. Envisager la migration vers SheetJS Pro ou une alternative (`exceljs`, `read-excel-file`)
- **Effort** : Moyen (4-8h)

#### V-004 : 4 routes API sans rate limiting

- **Routes affectees** :
  - `POST /api/admin/reset` - Endpoint de suppression massive de donnees
  - `POST /api/upload` - Upload de fichiers
  - `POST /api/billing-portal` - Creation de sessions Stripe
  - `POST /api/revalidate-menu` - Revalidation du cache
- **Risque** : Attaque par force brute, DoS, abus de ressources
- **Correctif** : Ajouter un rate limiter a chaque route
- **Effort** : Faible (1h)

#### V-005 : Webhook Stripe avec secret placeholder

- **Fichier** : `.env.local` (ligne 28)
- **Valeur** : `STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx`
- **Risque** : Les webhooks Stripe ne verifient PAS la signature en production si ce secret est un placeholder. Un attaquant pourrait forger de faux evenements pour activer/desactiver des tenants.
- **Correctif** : Configurer le vrai secret depuis le Stripe Dashboard
- **Effort** : Faible (15min)

### MOYENNE

#### V-006 : Server Actions acceptent `tenantId` du client

- **Fichiers** : `src/app/actions/admin.ts`, `categories.ts`, `menus.ts`, `menu-items.ts`, `venues.ts`
- **Pattern observe** : `actionCreateAdminUser(tenantId: string, ...)` - le `tenantId` vient du client
- **Attenuation existante** : La fonction `checkPermissions()` verifie que l'utilisateur authentifie appartient bien au tenant via `admin_users.eq('tenant_id', tenantId)` + `eq('user_id', user.id)`
- **Risque residuel** : Un administrateur multi-tenant (membre de plusieurs restaurants) pourrait manipuler le `tenantId` pour effectuer des actions cross-tenant. Le pattern correct (utilise dans `tenant-settings.ts`) derive le `tenantId` de la session.
- **Correctif** : Modifier les Server Actions pour deriver le `tenantId` de la session (via `getAuthenticatedUserWithTenant()`)
- **Effort** : Moyen (3-4h)

#### V-007 : `listUsers()` avec `perPage: 1000` - ne passe pas a l'echelle

- **Fichiers** : `src/app/api/forgot-password/route.ts` (ligne 56), `src/app/api/resend-confirmation/route.ts` (ligne 49)
- **Risque** : Au-dela de 1000 utilisateurs, la recherche par email echouera silencieusement (l'utilisateur recevra un faux "email non trouve"). Performance degradee avec la croissance.
- **Correctif** : Utiliser `supabase.auth.admin.getUserByEmail(email)` ou `supabase.rpc('get_user_by_email', { email })` au lieu de lister puis filtrer
- **Effort** : Faible (1h)

#### V-008 : `'unsafe-inline'` dans Content-Security-Policy

- **Fichier** : `next.config.mjs` (lignes 57-58)
- **Impact** : Reduit l'efficacite du CSP contre les attaques XSS. Un attaquant qui trouve un point d'injection pourrait executer du JavaScript inline.
- **Correctif** : Implementer des nonces CSP via un middleware Next.js pour les scripts inline. Pour `style-src`, c'est plus complexe avec Tailwind CSS inline.
- **Effort** : Eleve (8-16h)

#### V-009 : Server Actions sans rate limiting

- **Fichiers** : `src/app/actions/admin.ts`, `categories.ts`, `menus.ts`, `orders.ts`
- **Risque** : Les Server Actions ne sont pas protegees par le rate limiting d'Upstash (seuls `contact.ts` et `newsletter.ts` le sont)
- **Correctif** : Ajouter un rate limiter dans chaque Server Action publique
- **Effort** : Moyen (2-3h)

### BASSE

#### V-010 : `ALLOW_DEV_AUTH_BYPASS=true` dans `.env.local`

- **Fichier** : `.env.local` (ligne 31)
- **Protection existante** : Conditionne par `NODE_ENV === 'development'` dans `proxy.ts` (ligne 124-125)
- **Risque** : Si `.env.local` est copie tel quel vers un environnement de staging ou production avec `NODE_ENV=development`
- **Correctif** : Documenter clairement. Envisager de renommer en `DANGER_DEV_AUTH_BYPASS` pour visibilite
- **Effort** : Negligeable

#### V-011 : Unused imports dans `menu-import/route.ts`

- **Fichier** : `src/app/api/menu-import/route.ts` (ligne 10-11)
- **Impact** : `import * as fs` et `import * as path` sont importes mais les seules utilisations sont pour servir le fichier demo. Le `fs.readFileSync` pourrait etre un vecteur si le chemin devenait dynamique.
- **Risque actuel** : Faible - le chemin est hardcode (`public/demo-menu-epicurien.xlsx`)
- **Correctif** : Servir le fichier demo via le dossier `public/` statique plutot que via `fs.readFileSync`
- **Effort** : Faible (30min)

#### V-012 : Headers Cross-Origin manquants

- **Impact** : Pas de `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, ou `Cross-Origin-Embedder-Policy`
- **Risque** : Vulnerabilite potentielle a Spectre et autres attaques side-channel
- **Correctif** : Ajouter `COOP: same-origin`, `CORP: same-origin`, `COEP: require-corp` dans `next.config.mjs`
- **Effort** : Faible (1h) - mais tester la compatibilite avec les iframes Stripe

---

## 4. Audit des dependances

### Vulnerabilites par severite (pnpm audit)

| Severite  | Nombre | Packages principaux                                                                                                                                                                                                                 |
| --------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critique  | 1      | `jspdf@4.1.0` (HTML injection)                                                                                                                                                                                                      |
| Haute     | 23     | `xlsx@0.18.5` (prototype pollution), `jspdf` (PDF injection, DoS), `next@16.1.6` (CSRF), `tar` (path traversal), `minimatch` (ReDoS), `rollup` (path traversal), `flatted` (DoS, prototype pollution), `serialize-javascript` (RCE) |
| Moyenne   | 7      | `ajv` (ReDoS), `dompurify` (XSS), `next` (request smuggling, disk cache, buffering, CSRF)                                                                                                                                           |
| Basse     | 1      | `next` (HMR websocket CSRF dev-only)                                                                                                                                                                                                |
| **Total** | **32** |                                                                                                                                                                                                                                     |

### Actions prioritaires sur les dependances

1. **`next`** : `16.1.6` -> `16.1.7+` (4 CVEs dont 1 CSRF sur Server Actions)
2. **`jspdf`** : `4.1.0` -> `4.2.1+` (1 critique + 4 hautes)
3. **`xlsx`** : `0.18.5` - Pas de correctif OSS disponible. Evaluer `exceljs` comme remplacement.

### Lockfile

- `pnpm-lock.yaml` est present et commite : **CONFORME**

---

## 5. Audit de l'authentification

### Points forts

- [x] `auth.getUser()` utilise partout (verification serveur du JWT) - jamais `getSession()`
- [x] Rate limiting sur signup, login (via Supabase), forgot-password, resend-confirmation
- [x] Protection anti-enumeration email (reponse identique que l'email existe ou non)
- [x] Verification email obligatoire avant acces admin (bypass bloque dans le proxy)
- [x] Cookies avec `sameSite: 'lax'` et domaine scope en production (`.attabl.com`)
- [x] OAuth IDOR prevention (verification `authenticatedUser.id !== userId` dans `signup-oauth`)
- [x] Tokens d'invitation nettoyes avant retour API (champ `token` strip)
- [x] Audit trail sur les operations admin (creation/suppression/modification utilisateurs)

### Points d'attention

- [ ] Pas de politique de complexite de mot de passe au-dela de la longueur minimale (8 caracteres dans `actionResetUserPassword`)
- [ ] Pas de session timeout configurable (depend de la configuration Supabase Auth par defaut)
- [ ] `listUsers({ perPage: 1000 })` ne passe pas a l'echelle (V-007)

---

## 6. Audit Multi-Tenant

### Points forts

- [x] Header `x-tenant-slug` nettoye dans le proxy (`request.headers.delete('x-tenant-slug')`) avant injection serveur
- [x] RLS Supabase actif sur toutes les tables multi-tenant (defense en profondeur)
- [x] `tenant_id` derive de la session dans les routes API principales (checkout, billing-portal, invoices, permissions, invitations)
- [x] Verification d'appartenance au tenant dans les routes admin (`admin_users.eq('tenant_id', ...).eq('user_id', ...)`)

### Points d'attention

- [ ] Les Server Actions dans `actions/admin.ts`, `categories.ts`, `menus.ts` acceptent `tenantId` du client (V-006)
- [ ] Le pattern est correct dans `tenant-settings.ts` (utilise `getAuthenticatedUserWithTenant()`) mais n'est pas generalise

---

## 7. Gestion des secrets

| Secret                         | Stockage                   | Statut                                         |
| ------------------------------ | -------------------------- | ---------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`    | `.env.local` (gitignore)   | CONFORME                                       |
| `STRIPE_SECRET_KEY`            | `.env.local` (gitignore)   | CONFORME                                       |
| `STRIPE_WEBHOOK_SECRET`        | `.env.local` (placeholder) | **NON CONFORME** - placeholder non fonctionnel |
| `UPSTASH_REDIS_REST_TOKEN`     | `.env.local` (gitignore)   | CONFORME                                       |
| `RESEND_API_KEY`               | `.env.local` (gitignore)   | CONFORME                                       |
| `DATABASE_URL` (avec password) | `.env.local` (gitignore)   | CONFORME                                       |
| `.env.local.example`           | Git (commite)              | CONFORME - valeurs placeholder uniquement      |
| Historique Git                 | Verifie                    | CONFORME - aucun secret reel dans l'historique |

---

## 8. Plan de remediation priorise

| Priorite             | Ref   | Action                                                              | Effort | Impact                                 |
| -------------------- | ----- | ------------------------------------------------------------------- | ------ | -------------------------------------- |
| P0 (immediat)        | V-001 | Mettre a jour `next` vers 16.1.7+                                   | 1h     | Corrige CSRF bypass sur Server Actions |
| P0 (immediat)        | V-005 | Configurer le vrai `STRIPE_WEBHOOK_SECRET`                          | 15min  | Empeche la forge de webhooks           |
| P1 (cette semaine)   | V-002 | Mettre a jour `jspdf` vers 4.2.1+                                   | 30min  | Corrige injection HTML critique        |
| P1 (cette semaine)   | V-004 | Ajouter rate limiting aux 4 routes manquantes                       | 1h     | Protege contre DoS/brute-force         |
| P2 (ce sprint)       | V-006 | Refactorer les Server Actions pour deriver `tenantId` de la session | 3-4h   | Elimine le risque IDOR cross-tenant    |
| P2 (ce sprint)       | V-007 | Remplacer `listUsers()` par `getUserByEmail()`                      | 1h     | Passage a l'echelle                    |
| P2 (ce sprint)       | V-003 | Migrer de `xlsx` vers `exceljs`                                     | 4-8h   | Elimine 2 vulns hautes sans correctif  |
| P2 (ce sprint)       | V-009 | Ajouter rate limiting aux Server Actions                            | 2-3h   | Protection uniforme                    |
| P3 (prochain sprint) | V-008 | Implementer CSP avec nonces (retrait `unsafe-inline`)               | 8-16h  | Renforce la protection XSS             |
| P3 (prochain sprint) | V-012 | Ajouter les headers Cross-Origin                                    | 1h     | Protection contre Spectre              |
| P4 (backlog)         | V-010 | Renommer `ALLOW_DEV_AUTH_BYPASS`                                    | 15min  | Visibilite                             |
| P4 (backlog)         | V-011 | Servir le demo Excel via `public/`                                  | 30min  | Elimine l'import `fs`                  |

---

## 9. Points positifs notables

L'application presente plusieurs patterns de securite exemplaires :

1. **Defense en profondeur** : RLS Supabase + verification applicative du tenant
2. **Rate limiting systematique** : 20+ limiters configures via Upstash Redis (avec mode gracieux en dev)
3. **Validation Zod generalisee** : Tous les endpoints API valident les entrees avec Zod avant traitement
4. **Service Layer isole** : La logique metier est separee des routes, facilitant l'audit et les tests
5. **Logger centralise** : Aucun `console.*` dans le code applicatif, tout passe par Sentry en production
6. **Anti-enumeration** : Les endpoints `forgot-password` et `resend-confirmation` retournent des reponses identiques
7. **Headers de securite complets** : HSTS avec preload, X-Frame-Options DENY, CSP (malgre `unsafe-inline`)
8. **Proxy securise** : Le header `x-tenant-slug` est strip avant d'etre reinjecte par le serveur
9. **Upload securise** : Whitelist MIME, taille limitee, scope par tenant, noms aleatoires
10. **Idempotence webhooks** : Les handlers Stripe verifient l'etat avant mise a jour

---

_Rapport genere le 2026-03-24. Audit en lecture seule - aucun fichier source modifie._
