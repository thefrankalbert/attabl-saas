## A. Montée de version Next.js

### Constat mesuré

Versions réellement installées (`node -p "require('./node_modules/<pkg>/package.json').version"`) :

| Paquet                                       | Installé   | Déclaré package.json | Cible       |
| -------------------------------------------- | ---------- | -------------------- | ----------- |
| `next`                                       | **16.2.9** | `16.2.9` (pin exact) | **16.2.12** |
| `eslint-config-next`                         | **16.2.4** | `16.2.4` (pin exact) | **16.2.12** |
| `@next/bundle-analyzer`                      | **16.1.6** | `^16.1.6`            | **16.2.12** |
| `react` / `react-dom`                        | 19.2.3     | `19.2.3` (pin exact) | 19.2.8      |
| `@sentry/nextjs`                             | 10.38.0    | `^10.38.0`           | 10.68.0     |
| `@serwist/next` / `serwist` / `@serwist/cli` | 9.5.11     | `^9.5.11`            | 9.5.12      |
| `next-intl`                                  | 4.13.0     | `^4.13.0`            | 4.13.4      |

Preuve : `pnpm outdated` (next 16.2.9 → 16.2.12, eslint-config-next 16.2.4 → 16.2.12, @next/bundle-analyzer 16.1.6 → 16.2.12).

Note importante : `next`, `react`, `react-dom` et `eslint-config-next` sont **épinglés en version exacte** dans `package.json` (pas de `^`). Un `pnpm update` ne les bougera jamais. Il faut éditer `package.json`.

### Ce qui doit bouger en même temps

Contraintes de peers réellement lues dans `node_modules` :

- `eslint-config-next` : peers `{eslint: ">=9.0.0", typescript: ">=3.3.1"}`. **Aucune contrainte technique sur `next`**, mais le paquet embarque les règles du cycle Next : le laisser à 16.2.4 pendant que le runtime est en 16.2.12 fait diverger le lint du runtime. À aligner sur 16.2.12.
- `@next/bundle-analyzer` : **aucun peer déclaré**. Il est à 16.1.6 alors que le reste est en 16.2.x : dérive silencieuse, à aligner.
- `@sentry/nextjs` : peer `{next: "^13.2.0 || ^14.0 || ^15.0.0-rc.0 || ^16.0.0-0"}`. **Déjà compatible**, aucun blocage. Mais le passer à 10.68.0 corrige les deux HIGH `fast-uri` (voir section B).
- `@serwist/next` : peers `{next: ">=14.0.0", react: ">=18.0.0", "@serwist/cli": "^9.5.11"}`. **Aucun blocage** sur Next. En revanche `@serwist/next`, `serwist` et `@serwist/cli` doivent monter **ensemble** (verrou de peer interne `^9.5.11`).
- `react` / `react-dom` : peer de `next` = `^19.0.0`. 19.2.3 suffit. 19.2.8 est un patch, recommandé mais non bloquant.

Conclusion : **aucune dépendance ne bloque le passage à 16.2.12.** Le chemin minimal est un changement de `package.json` sur 3 lignes.

```
"next": "16.2.12",
"eslint-config-next": "16.2.12",
"@next/bundle-analyzer": "^16.2.12",
```

Puis `pnpm install --lockfile-only` puis `pnpm install`.

### Risques de rupture, lecture du code sensible

**1. `src/proxy.ts` (452 lignes), le middleware Next 16.**

Le fichier suit la convention Next 16 (`src/proxy.ts` exportant `proxy()` + `config.matcher`). Il n'y a **pas** de `src/middleware.ts` (`ls src/middleware.ts` → No such file). Le correctif 16.2.11 touche précisément le dispatch middleware/proxy. Points à revérifier après montée :

- Ligne 80 : garde `x-middleware-subrequest` (CVE-2025-29927). À conserver, elle ne fait pas double emploi avec le correctif 16.2.11.
- Propagation d'en-têtes de **requête** via `NextResponse.next({ request: { headers: request.headers } })`, utilisée 8 fois pour porter le nonce CSP et `x-tenant-slug`. C'est le mécanisme le plus susceptible d'être affecté par un correctif de dispatch.
- Le `matcher` (regex négative excluant `_next/static`, `sw.js`, extensions statiques) : un changement de normalisation d'URL modifierait la surface protégée.
- Recopie manuelle des cookies de session Supabase sur chaque `NextResponse.rewrite`/`redirect`.

**2. CVE-2026-64642 (contournement middleware, HIGH) : les préconditions ne sont PAS réunies ici.**

Texte exact de l'avis (`pnpm audit --json`, GHSA-6gpp-xcg3-4w24) : _"App Router built with Turbopack and a **single** entry in `config.i18n.locales`"_.

- Turbopack : oui, Next 16 l'utilise par défaut pour `dev` et `build` (aucun `--webpack` dans `package.json`).
- `config.i18n` : **absent**. `grep -n "i18n" next.config.mjs` ne retourne que `createNextIntlPlugin('./src/i18n/request.ts')`. next-intl est utilisé en mode App Router sans routage par préfixe (`src/i18n/request.ts` résout la locale depuis le cookie `NEXT_LOCALE`), et `src/i18n/config.ts` déclare **2** locales (`fr-FR`, `en-US`).

Le vecteur « contournement de middleware » ne s'applique donc pas à cette application. Cela ne change pas la recommandation de monter, mais cela **déclasse l'urgence** par rapport à ce que laisse croire la lecture brute du rapport d'audit.

**3. Les CVE Next qui, elles, s'appliquent vraiment.**

`ls src/app/actions | wc -l` → **27 fichiers**, `grep -rl "'use server'" src | wc -l` → **26 fichiers**.

| CVE                                                               | Applicable ?     | Justification mesurée                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CVE-2026-64641 DoS Server Actions (HIGH)                          | **OUI**          | 26 fichiers `use server`                                                                                                                                                                                    |
| CVE-2026-64643 divulgation d'endpoints Server Function (MODERATE) | **OUI**          | idem. Mitigation déjà en place : chaque action revalide l'auth côté serveur                                                                                                                                 |
| CVE-2026-64649 SSRF Server Actions serveur custom (HIGH)          | **NON**          | Déploiement Vercel (`vercel.json`, `framework: nextjs`). L'avis dit explicitement _"Managed hosting pins the host upstream and is not affected"_                                                            |
| CVE-2026-64645 SSRF via rewrites (HIGH)                           | **NON**          | `grep -n "rewrites" next.config.mjs` → uniquement le commentaire ligne 86. Les rewrites sont faits dans `proxy.ts` vers des chemins internes (`url.pathname = /sites/...`), jamais vers un hostname externe |
| CVE-2026-64644 DoS Image Optimization SVG (MODERATE)              | **NON**          | Avis : _"If you are using Vercel, you are NOT impacted"_                                                                                                                                                    |
| CVE-2026-64646 payload Server Action Edge (MODERATE)              | **NON**          | `grep -rn "export const runtime" src` → **0 résultat**. Aucune route Edge                                                                                                                                   |
| CVE-2026-64647/64648 cache confusion fetch (MODERATE)             | **Peu probable** | `grep -rn "fetch(new Request" src` → 0 résultat. Le motif dangereux `fetch(new Request(init), otherInit)` est absent                                                                                        |

**4. `next.config.mjs`.** Chaîne `withSentryConfig(analyze(withNextIntl(nextConfig)))`. Aucune API dépréciée en 16.2.x. Deux points à noter (voir section C) : le bloc `webpack: {...}` de Sentry est **inerte sous Turbopack**, et `images.remotePatterns` autorise `**.supabase.co` (wildcard sur tous les projets Supabase).

**5. `serwist.config.mjs`.** Le SW est construit en **étape séparée après** `next build` (`"build": "next build && serwist build serwist.config.mjs"`). Il ne dépend pas du bundler. Une montée de Next n'a mécaniquement aucun effet dessus. Le seul risque indirect : `precachePrerendered: false` et `globPatterns: []` s'appuient sur le manifeste Serwist, pas sur la sortie Next.

### Procédure de vérification après montée

```bash
# 1. Montée
#    editer package.json (next / eslint-config-next / @next/bundle-analyzer)
pnpm install
pnpm audit --prod --audit-level=high   # doit ne plus lister "next"

# 2. Gates statiques
pnpm typecheck        # tsc --noEmit + tsc -p tsconfig.sw.json --noEmit
pnpm lint
pnpm format:check

# 3. Tests, en particulier la suite proxy
pnpm test src/__tests__/proxy.test.ts    # 561 lignes, couvre le routage middleware
pnpm test:coverage                       # seuils lines 38 / functions 44 / branches 30

# 4. Build complet + SW
pnpm build
test -f public/sw.js && grep -c "/offline" public/sw.js   # le fallback doit etre precache

# 5. Verifications runtime a faire manuellement en preview Vercel
#    a) en-tete CSP avec nonce present sur / et sur <tenant>.attabl.com
curl -sI https://<preview>/ | grep -i content-security-policy
#    b) rejet du contournement middleware
curl -sI -H 'x-middleware-subrequest: 1' https://<preview>/admin   # doit rendre 403
#    c) redirection auth
curl -sI https://<preview>/admin | grep -i location                # doit pointer /login
#    d) resolution sous-domaine + x-tenant-slug
curl -sI https://<tenant>.<preview-domain>/                        # doit rendre 200, pas 404
#    e) /sw.js servi verbatim, non reecrit
curl -s https://<tenant>.<preview-domain>/sw.js | head -3
#    f) /api/version sans rotation de session
curl -sI https://<preview>/api/version | grep -i set-cookie         # doit etre vide

# 6. E2E
pnpm test:e2e:ci
```

Ordre recommandé : monter `next` + `eslint-config-next` + `@next/bundle-analyzer` **seuls** dans une PR (patch de sécurité, diff minimal, rollback trivial), puis Sentry/Serwist/React dans une seconde PR.

---

## B. Autres CVE

### Constat mesuré

`pnpm audit --json` (graphe complet, 1398 dépendances) :

```
critical: 1 | high: 27 | moderate: 15 | low: 2   (45 avis)
```

`pnpm audit --prod --json` (909 dépendances) :

```
critical: 0 | high: 11 | moderate: 5 | low: 2    (18 avis)
```

**Piège de lecture à signaler :** dans la sortie JSON, `pnpm` marque **toutes** les findings `"dev": false` et rapporte `"devDependencies": 0` dans `metadata`. Le champ `dev` est donc inexploitable. La seule façon de séparer build et runtime est de comparer les deux exécutions (`--prod` vs sans flag).

### Classement par atteignabilité

**Groupe 1 : atteignable depuis une entrée utilisateur en production**

| Paquet                  | Sévérité                                        | Chemin                                                                      | Atteignabilité                                                                                                                                                                                                         | Correctif                                                                              |
| ----------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `next` 16.2.9           | 4 HIGH + 5 MOD                                  | `.>next`                                                                    | **Oui**, toute requête HTTP                                                                                                                                                                                            | Montée directe 16.2.12 (section A)                                                     |
| `sharp` 0.34.5          | HIGH (libvips CVE-2026-33327/33328/35590/35591) | `.>next>sharp`                                                              | **Non sur Vercel** : l'optimisation d'image tourne sur l'infra Vercel, pas sur le `sharp` du bundle. Devient atteignable si auto-hébergement                                                                           | Override `sharp: '>=0.35.0'` (coût nul, retire le bruit)                               |
| `dompurify` 3.4.11      | LOW                                             | `.>jspdf>dompurify`                                                         | **Oui, côté client.** `jspdf` est utilisé dans 6 fichiers (`useReportExports.ts`, `QRExportPanel.tsx`, `export-card.ts`, page `orders/[orderId]`). Entrée = noms de plats et de tenants saisis par l'utilisateur       | Override existant **périmé** : `dompurify@<=3.4.10: '>=3.4.11'`, or il faut `>=3.4.12` |
| `brace-expansion` 2.1.1 | HIGH (DoS expansion exponentielle)              | `.>exceljs>archiver>readdir-glob>minimatch>...`                             | **Non** en pratique : `exceljs` est bien une dépendance prod (`src/lib/exports/styled-workbook.ts`, import dynamique), mais `archiver>readdir-glob` globbe des chemins de fichiers locaux, pas de l'entrée utilisateur | Override, voir ci-dessous                                                              |
| `postcss` 8.5.16        | HIGH (path traversal `sourceMappingURL`)        | `.>next>postcss` et `.>@tailwindcss/postcss>postcss`                        | **Non** : PostCSS ne tourne qu'au build                                                                                                                                                                                | Override, voir ci-dessous                                                              |
| `fast-uri` 4.0.0        | 2 HIGH (host confusion)                         | `.>@sentry/nextjs>@sentry/webpack-plugin>webpack>schema-utils>ajv>fast-uri` | **Non** : chaîne Webpack du plugin Sentry, build uniquement, et inerte sous Turbopack                                                                                                                                  | Override + montée `@sentry/nextjs`                                                     |

**Groupe 2 : dépendances de build ou de test uniquement (absentes de `pnpm audit --prod`)**

| Paquet                      | Sévérité                            | Via                                                                    | Verdict                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | ----------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tar`                       | **1 CRITICAL + 4 HIGH + 4 MOD**     | `.>supabase` (CLI, devDependency)                                      | Build/CLI local. Le CRITICAL disparaît en montant `supabase` 2.76.3 → 2.109.1                                                                                                                                                                                                                                                                                       |
| `xlsx` 0.18.5               | 2 HIGH (prototype pollution, ReDoS) | `.>xlsx` (devDependency)                                               | **`patched_versions: "<0.0.0"` = aucun correctif publié sur npm.** Usage vérifié : uniquement 3 fichiers de test (`recipe-import.service.test.ts`, `supplier-import.service.test.ts`, `tests/integration/stock/recipe-supplier-import.test.ts`). Le chemin de production utilise `exceljs`. **Acceptation documentée** ou remplacement par `exceljs` dans les tests |
| `vite`                      | 3 HIGH + 2 MOD                      | `.>vitest>vite`                                                        | Serveur de dev/test. Deux des trois HIGH sont spécifiques à Windows                                                                                                                                                                                                                                                                                                 |
| `happy-dom` 20.7.0          | 2 HIGH                              | `.>happy-dom`                                                          | Environnement de test. Montée triviale vers 20.11.1                                                                                                                                                                                                                                                                                                                 |
| `ws`                        | HIGH + MOD                          | `.>happy-dom>ws`, `.>@next/bundle-analyzer>webpack-bundle-analyzer>ws` | Dev uniquement                                                                                                                                                                                                                                                                                                                                                      |
| `flatted`, `js-yaml`, `ajv` | 2 HIGH + 2 MOD                      | `.>eslint>...`                                                         | Lint uniquement                                                                                                                                                                                                                                                                                                                                                     |
| `yaml`                      | MOD                                 | `.>lint-staged>yaml`                                                   | Hook de commit uniquement                                                                                                                                                                                                                                                                                                                                           |
| `esbuild`                   | LOW                                 | `.>@serwist/cli>esbuild`                                               | Build, exploit Windows uniquement                                                                                                                                                                                                                                                                                                                                   |

### Les overrides `pnpm-workspace.yaml` sont périmés

C'est le point le plus actionnable de cette section. Le fichier contient déjà 24 overrides, mais **plusieurs sont dépassés par des avis plus récents** et laissent donc passer la version vulnérable. Preuve croisée entre `pnpm-workspace.yaml`, `find node_modules/.pnpm -maxdepth 1 -name "<pkg>@*"` et les cibles de `pnpm audit` :

| Override actuel                                                  | Version résolue | Version requise | État                             |
| ---------------------------------------------------------------- | --------------- | --------------- | -------------------------------- |
| `fast-uri: '>=3.1.2'`                                            | **4.0.0**       | `>=4.1.1`       | **PÉRIMÉ**, laisse passer 2 HIGH |
| `brace-expansion@>=5.0.0 <5.0.6: '>=5.0.6'`                      | **5.0.7**       | `>=5.0.8`       | **PÉRIMÉ**, laisse passer 1 HIGH |
| (aucun pour la branche 2.x)                                      | **2.1.1**       | `>=2.1.2`       | **MANQUANT**, 1 HIGH             |
| `postcss@<8.5.10: '>=8.5.10'`                                    | **8.5.16**      | `>=8.5.18`      | **PÉRIMÉ**, 1 HIGH               |
| `dompurify@<=3.4.10: '>=3.4.11'` (+ 9 autres lignes redondantes) | **3.4.11**      | `>=3.4.12`      | **PÉRIMÉ**, 1 LOW                |

Correctif précis, dans `pnpm-workspace.yaml` :

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

Les 10 lignes `dompurify@<X: '>=Y'` empilées sont un anti-pattern : chaque nouvel avis ajoute une ligne sans supprimer les précédentes, et la borne effective est la plus permissive. Une seule ligne `dompurify: '>=3.4.12'` couvre tous les cas et se met à jour en un seul endroit.

Montées directes complémentaires :

```bash
pnpm up supabase@latest happy-dom@latest vitest@latest @vitest/coverage-v8@latest \
        @sentry/nextjs@latest @serwist/next@latest serwist@latest @serwist/cli@latest
```

Acceptation documentée à écrire (une ligne chacune) : `xlsx@0.18.5` (aucun correctif amont, usage confiné aux tests), `esbuild` LOW (Windows uniquement, équipe non Windows à confirmer).

---

## C. Configuration

### C.1 `.gitleaks.toml` : l'allowlist annule le scan sur la majorité des lignes

**Constat confirmé par lecture et par simulation.** Le bloc `[allowlist]` est un allowlist **global** (non attaché à une règle), donc il s'applique à **toutes** les règles, y compris les règles par défaut de gitleaks (clés Stripe, AWS, GitHub, clés privées, JWT), pas seulement à la règle maison `hardcoded-password-or-secret`.

Avec `regexTarget = "line"`, chaque regex de `regexes` est confrontée à **la ligne entière** de la finding. Deux regex sont catastrophiques :

```toml
'''<[^>]{1,40}>'''
'''(?i)(example|placeholder|change[-_ ]?me|replace[-_ ]?me|your[-_]|xxx+|dummy|sample|fixture|redacted|todo)'''
```

Simulation (reproduction exacte des regex du fichier en JS) :

```
RULE-MATCH | ALLOWLISTED par (…|todo)      | const stripeKey = 'sk_live_51H8xQ2KZ…'; // TODO rotate
RULE-MATCH | ALLOWLISTED par <[^>]{1,40}>  |   <div>const password = 'hunter2superlong'</div>
RULE-MATCH | ALLOWLISTED par <[^>]{1,40}>  | const secret: Record<string, string> = { webhook_secret: 'whsec_abcdefghijklm' }
RULE-MATCH | ALLOWLISTED par (…|example)   | const api_key = 'AKIAIOSFODNN7EXAMPLE'
RULE-MATCH | REPORTED                      | const password = '<exemple-neutralise-a-la-copie>'
RULE-MATCH | ALLOWLISTED par (…|sample)    | const service_role = 'eyJhbGciOi…IkpXVCJ9.sample'
```

Réponse à la question posée : **oui, toute ligne contenant le mot `TODO` (ou `example`, `sample`, `dummy`, `fixture`, `placeholder`, `redacted`, `xxx`, `your_`, `change me`) est intégralement ignorée**, en casse indifférente et **sans frontière de mot**. Un secret réel sur une ligne se terminant par `// TODO: rotate` passe le hook de commit, le hook de push et le job CI `secrets-scan`.

Pire, `<[^>]{1,40}>` n'a rien à voir avec des placeholders : il matche **tout générique TypeScript** (`Record<string, string>`, `Promise<void>`, `Array<Foo>`) et **toute balise JSX courte** (`<div>`, `<Button …>`). Dans une base de 1076 fichiers `.ts`/`.tsx`, cela neutralise le scan sur une très large fraction du code.

Le troisième problème est que `process\.env` en `regexTarget = "line"` allowliste toute ligne mentionnant `process.env`, y compris `const k = process.env.X || 'sk_live_fallback_hardcode'`.

**Allowlist plus étroite proposée.** Trois principes : ne jamais matcher la ligne quand on veut matcher le secret, ancrer les placeholders, scoper par chemin plutôt que par mot.

```toml
# 1) Allowlist GLOBAL reduit au strict minimum : uniquement des chemins,
#    jamais un mot-clef libre.
[allowlist]
description = "Fixtures de test et exemples d'environnement (chemins uniquement)"
paths = [
  '''.*\.test\.(ts|tsx)$''',
  '''.*\.spec\.(ts|tsx)$''',
  '''(^|/)__tests__/''',
  '''(^|/)tests/''',
  '''\.env\.example$''',
  '''\.env\.staging\.example$''',
  '''(^|/)src/messages/''',
  '''(^|/)\.husky/''',
  '''(^|/)scripts/seed-.*\.(ts|js)$''',
]

# 2) Allowlist SPECIFIQUE a la regle maison, avec regexTarget par defaut
#    (= la valeur capturee, PAS la ligne), et des placeholders ancres.
[[rules]]
id = "hardcoded-password-or-secret"
description = "Hardcoded password or secret literal assignment"
regex = '''(?i)(password|passwd|pwd|mot de passe|client_secret|merchant_key|webhook_secret|api[_-]?key|service_role|secret)['"]?\s*[:=]\s*['"][^'"\n]{6,}['"]'''
keywords = ["password","passwd","pwd","passe","secret","merchant","webhook","apikey","api_key","api-key","service_role"]

  [rules.allowlist]
  # regexTarget non renseigne => match sur le SECRET capture, pas sur la ligne
  regexes = [
    # placeholders ancres : la valeur EST le placeholder, pas une ligne qui en parle
    '''^(?i)(xxx+|placeholder|changeme|change_me|replace_me|redacted|dummy|<[^>]+>)$''',
    '''^(?i)your[-_][a-z0-9_-]+$''',
    '''^sk_test_[A-Za-z0-9]+$''',
    '''^whsec_test_[A-Za-z0-9]+$''',
    # fixtures nominatives, en liste explicite
    '''^SecurePass123!$''',
    '''^Demo2024!$''',
    '''^a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2$''',
  ]
  # attributs autocomplete React : ceux-la ont besoin de la ligne
  [rules.allowlist.regexTarget]
```

Pour les attributs `autocomplete="current-password"` / `"new-password"`, la bonne solution n'est pas un allowlist mais **un affinage de la règle** : exclure `autoComplete` du groupe de capture (`(?<!auto[Cc]omplete=)`) ou ajouter `stopwords = ["current-password", "new-password"]`.

Vérification recommandée après changement, avant de committer le nouveau `.gitleaks.toml` :

```bash
gitleaks detect --source . --config .gitleaks.toml --no-banner --redact -v
gitleaks detect --source . --config .gitleaks.toml --log-opts="--all" --redact  # historique complet
```

Note : `gitleaks` **n'est pas installé** dans cet environnement (`command -v gitleaks` → absent). Voir section F : les deux hooks Husky se contentent alors d'un avertissement.

### C.2 Incohérence `ci.yml` / `security.yml`

|              | `ci.yml` (job `quality`)                     | `security.yml` (job `dependency-audit`)           |
| ------------ | -------------------------------------------- | ------------------------------------------------- |
| Commande     | `pnpm audit --prod \|\| echo "::warning::…"` | `pnpm audit --prod --audit-level=high`            |
| Bloquant     | **Non**                                      | **Oui**                                           |
| Déclencheurs | `on: push` (toutes branches) + PR vers main  | push sur main + PR vers main + cron lundi 8h      |
| Node         | **20**                                       | **22**                                            |
| pnpm         | **10** (épinglé)                             | **latest** (flottant)                             |
| Install      | `pnpm install --frozen-lockfile`             | `pnpm install --frozen-lockfile --ignore-scripts` |

Trois problèmes distincts :

1. **Contradiction de politique.** Le même contrôle est simultanément décoratif dans un workflow et bloquant dans l'autre. Le commentaire de `ci.yml` (« upgrade to `--fail-on-high` once all known CVEs are triaged ») reconnaît la dette.
2. **`security.yml` échoue nécessairement aujourd'hui.** `pnpm audit --prod --audit-level=high` retourne 11 HIGH. Le job est donc rouge en permanence, ce qui revient en pratique à une désactivation par accoutumance. Preuve : `pnpm audit --prod --json | jq .metadata` → `{"high": 11, ...}`.
3. **Toolchains divergents.** Node 20 vs 22, pnpm 10 épinglé vs `latest` flottant. La résolution du lockfile et le comportement des scripts de build diffèrent entre les deux jobs, ce qui a déjà obligé à ajouter `--ignore-scripts` d'un seul côté (commentaire du workflow). Un `packageManager` dans `package.json` + `node-version-file` réglerait le problème une fois pour toutes.

Correctif : après la montée Next et l'assainissement des overrides, supprimer la Gate 0.5 de `ci.yml` (redondante) et garder `security.yml` comme unique source de vérité, en alignant Node/pnpm sur ceux de `ci.yml`. Ajouter dans `package.json` :

```json
"packageManager": "pnpm@10.x.y",
"engines": { "node": ">=20 <23" }
```

Autre remarque : `ci.yml` déclare `on: push:` **sans filtre de branche**, ce qui fait tourner le workflow complet (build Next + Playwright) deux fois pour toute PR interne (une fois sur le push, une fois sur la PR). `concurrency` ne dédoublonne pas puisque `github.ref` diffère.

### C.3 `next.config.mjs`

- **`webpack: { treeshake, reactComponentAnnotation }` est inerte.** Next 16 utilise Turbopack par défaut pour `dev` et `build` (aucun `--webpack` dans les scripts). Le commentaire du fichier le dit d'ailleurs (« Webpack-specific options (not supported with Turbopack) »). Conséquence mesurable : `removeDebugLogging` ne s'applique pas, les appels de log Sentry restent dans le bundle client, et `reactComponentAnnotation` n'annote rien. À supprimer ou à migrer vers l'équivalent Turbopack, sinon c'est de la configuration morte qui donne une fausse assurance.
- **`images.remotePatterns: [{ hostname: '**.supabase.co', pathname: '/storage/v1/object/public/**' }]`.** Le wildcard autorise **n'importe quel projet Supabase du monde** à être proxifié par `/_next/image` de l'application. Correctif : épingler le ref du projet, `hostname: '<ref>.supabase.co'`, alimenté par `new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname`.
- **Identifiants d'infrastructure en dur** : `org: 'odc-digital-solub'`, `project: 'attabl-saas'` (voir section E).
- **Duplication de `Cache-Control` sur `/sw.js`** entre `next.config.mjs` (`no-store, must-revalidate`) et `vercel.json` (`no-cache, no-store, must-revalidate`). Sur Vercel, `vercel.json` gagne. Deux sources de vérité pour un en-tête décrit comme critique dans les commentaires : à unifier dans `vercel.json` seul.

### C.4 `tsconfig.json`

- **`"target": "ES2017"`** pour une application Next 16 / React 19 dont la cible minimale de navigateur est bien plus récente. Conséquence : downlevel inutile d'`async`/`await`, des générateurs et du spread, donc du bundle client en plus. Passer à `ES2022`.
- `"strict": true` est bien en place, mais il manque les garde-fous qui comptent sur un SaaS multi-tenant : `noUncheckedIndexedAccess` (très pertinent vu le nombre d'accès `match[1]` dans `proxy.ts`), `noImplicitOverride`, `noFallthroughCasesInSwitch`.
- `tsconfig.tsbuildinfo` fait **5.7 Mo** sur disque, non versionné (correctement ignoré). Il reflète simplement la taille du graphe (`include` part de la racine : `**/*.ts`, `**/*.tsx`, `**/*.mts`, donc `scripts/`, `tests/`, `security/generated-tests/` sont typés). Les répertoires en `.` (`.agents/`) ne sont pas capturés, TypeScript ignorant les dossiers cachés dans les globs `include`. Rien à corriger, mais bon à savoir : `pnpm typecheck` couvre bien plus que `src/`.

### C.5 `vitest.config.ts`

- Seuils de couverture : `lines 38`, `functions 44`, `branches 30`, `statements 38`. Honnêtement documentés comme des « planchers à cliquet » calés sur la mesure du 2026-06-18.
- **Le périmètre de mesure exclut la surface la plus sensible.** `coverage.include: ['src/services/**', 'src/lib/validations/**', 'src/lib/**']`. Ne sont donc **pas** mesurés : `src/app/actions/**` (27 fichiers, 26 avec `use server`, c'est la frontière de confiance côté serveur) et `src/app/api/**`. Un plancher de 38 % sur un périmètre qui exclut les Server Actions ne dit rien du risque réel. Correctif : ajouter `src/app/actions/**` et `src/app/api/**` à `include`, recalculer les planchers, puis remonter par paliers.
- `environment: 'node'` alors que la suite contient des tests de composants (`ClientSettings.component.test.tsx`) : ceux-ci doivent déclarer `// @vitest-environment happy-dom` en tête de fichier, sinon ils s'exécutent dans le mauvais environnement. À vérifier.

### C.6 `serwist.config.mjs`

La révision de précache vient de `spawnSync('git', ['rev-parse', 'HEAD'])` avec repli sur `Date.now()`. Dans un conteneur de build Vercel, `.git` n'est pas systématiquement présent : le repli s'active et produit une révision **différente à chaque build**, ce qui invalide le document `/offline` précaché à chaque déploiement, y compris quand il n'a pas changé. Sur les réseaux lents ciblés (commentaire du fichier), c'est un re-téléchargement inutile. Correctif :

```js
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() ||
  String(Date.now());
```

### C.7 `eslint.config.mjs`

12,3 Ko, avec trois règles maison sérieuses (bannissement des container queries en admin, anti-zoom iOS, bannissement du lime en admin) documentées avec dates d'incidents. C'est de la bonne configuration. Deux réserves :

- **`scripts/**`est globalement ignoré.** Cela couvre 15 fichiers dont`seed-demo.ts`(42 Ko),`seed-qa.ts`(63 Ko),`create-superadmin.ts`, `manage-super-admin.js`, `audit-rls.ts`. Ce sont exactement les scripts qui touchent au `service_role`, jamais lintés.
- **Le bloc admin doit redéclarer les sélecteurs anti-zoom iOS** parce que la config plate remplace `no-restricted-syntax` par fichier. C'est documenté dans un commentaire, mais c'est fragile : toute future règle `no-restricted-syntax` ajoutée ailleurs devra être recopiée. Une règle maison dédiée (comme `attabl/no-container-query-in-admin-layout`) éviterait la duplication.

---

## D. Dette technique

### D.1 `pnpm knip`

Sortie complète (`pnpm knip`, sortie 1, non branché en CI : `grep -c knip .github/workflows/*.yml` → 0 partout).

**Fichiers inutilisés (2)**

- `src/components/admin/orders/OrdersPagination.tsx` : **vrai mort**, à supprimer.
- `src/app/sw.ts` : **faux positif**. C'est le `swSrc` de `serwist.config.mjs`, compilé par `serwist build`. Correctif dans `knip.json` : ajouter `"src/app/sw.ts"` à `entry`.

**Dépendances inutilisées (3)**

- `@serwist/next`, `serwist` : **faux positifs**, importés par `src/app/sw.ts` (`@serwist/next/worker`, `serwist`) et par `serwist.config.mjs` (`@serwist/next/config`). Réglés par le même correctif d'entrée.
- `@types/ws` : **vrai mort**. `ws` n'est pas une dépendance directe (il n'arrive que via `happy-dom` et `webpack-bundle-analyzer`). À supprimer.

**Binaires non déclarés (3)**

- `tsx` : `"seed:demo": "npx tsx scripts/seed-demo.ts"`. `npx` résout depuis le réseau, la version n'est pas verrouillée, le script n'est donc pas reproductible. Ajouter `tsx` en devDependency et utiliser `pnpm exec tsx`.
- `k6` : binaire système attendu par `load:k6`, non documenté dans le README.
- `scripts/db-migrate.sh` : appelé par 3 scripts npm, non déclaré.

**Exports morts** : 22 exports + 59 types exportés + 1 export dupliqué (`menuItemWriteSchema` / `menuItemCreateSchema` dans `src/lib/validations/menu-item.schema.ts`). Les plus notables, parce qu'ils suggèrent une fonctionnalité incomplète plutôt qu'un simple oubli :

- `paymentInitiationLimiter` et `webhookLimiter` (`src/lib/rate-limit.ts:124` et `:131`) : **deux limiteurs de débit définis et jamais branchés**. Sur les chemins paiement et webhook. À traiter comme un point de sécurité, pas comme du code mort.
- `generateInvoiceHTML` (`src/lib/printing/invoice-html.ts:57`), `generateKitchenTicketHTML` (`src/lib/printing/kitchen-ticket.ts:66`), `createIdbOutboxStore` (`src/lib/offline/outbox-idb.ts:38`) : fonctions substantielles jamais appelées.
- `useStaffStockReport`, `useStockCounts`, `useStockCount` (`src/hooks/queries/index.ts`) : trois hooks de requête morts.

Correctif immédiat : corriger `knip.json` (entrée `src/app/sw.ts`), puis ajouter une gate CI `pnpm knip` **non bloquante d'abord**, bloquante une fois la liste vidée.

### D.2 Fichiers de plus de 500 lignes

Convention : la règle des 300 lignes n'est **pas** dans `CLAUDE.md` mais dans `.claude/rules/04-frontend-quality.md:89` (« JAMAIS de composant > 300 lignes, decomposer en sous-composants »).

Mesure (`find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn`) :

- **1076** fichiers `.ts`/`.tsx` dans `src/`
- **104** dépassent 300 lignes (9,7 %)
- **18** dépassent 500 lignes, dont **10** hors tests et hors généré :

| Lignes | Fichier                                                      |
| ------ | ------------------------------------------------------------ |
| 730    | `src/services/inventory.service.ts`                          |
| 700    | `src/app/actions/orders.ts`                                  |
| 674    | `src/app/sites/[site]/(storefront)/cart/page.tsx`            |
| 672    | `src/components/tenant/ItemDetailSheet.tsx`                  |
| 659    | `src/app/sites/[site]/(storefront)/order-confirmed/page.tsx` |
| 652    | `src/components/admin/PaymentModal.tsx`                      |
| 619    | `src/contexts/CartContext.tsx`                               |
| 597    | `src/hooks/usePOSData.ts`                                    |
| 559    | `src/app/api/orders/pos/route.ts`                            |
| 523    | `src/app/admin/tenants/tenants-page-client.tsx`              |

Les autres (2473 `database.generated.ts`, 1053/908/610/576/561/545/529 fichiers de test) sont légitimes.

Priorité de découpe : `src/app/actions/orders.ts` (700 lignes) et `src/app/api/orders/pos/route.ts` (559 lignes) d'abord, parce qu'ils portent la logique de commande et de paiement et qu'ils sont hors du périmètre de couverture (section C.5).

### D.3 TODO et FIXME

**Constat mesuré : il n'y en a aucun dans le code.**

```
grep -rnw "TODO\|FIXME" --include=*.ts --include=*.tsx src | wc -l   →  0
```

Le seul résultat d'une recherche sans frontière de mot est `src/components/onboarding/TablesStep.tsx:121`, qui contient la chaîne d'interface `'XXX'` (préfixe de zone par défaut), pas un marqueur de dette.

Sur l'ensemble du dépôt hors `node_modules` : 15 occurrences, **toutes dans des fichiers `.md`** (`plans/README.md`, `CLAUDE.md`, `tests/journeys/GUIDE.md`, `docs/AUDIT-GESTION-STOCK.md`, `security/VERIFICATION-2-CLAUDE-CODE.md`, etc.).

L'exercice de `git blame` sur les 20 plus anciens TODO n'a donc pas lieu d'être : **la population est vide**. C'est un vrai point positif, à noter comme tel.

En contrepartie, la dette a migré vers les suppressions de règle : **70 `eslint-disable`** dans `src/` (`grep -rn "eslint-disable" src | wc -l`), et **2 `@ts-expect-error`** (les deux dans des tests, délibérés). La grande majorité des `eslint-disable` porte une justification écrite et datée, ce qui est la bonne pratique. Les deux exceptions à surveiller, parce qu'elles signalent du code en attente :

- `src/components/features/kitchen/KDSTicket.tsx:40` et `:42` : « deprecated prop retained for API compatibility; will be removed once all callers stop passing it » (deux props mortes).
- `src/components/admin/KitchenClient.tsx:121` : « pagination placeholder; signature preserved for when board pagination lands ».

### D.4 Fichiers parasites commités

`git ls-files` (donc réellement dans l'index, pas juste sur disque) :

| Catégorie               | Nombre | Fichiers                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verrous LibreOffice     | **6**  | `.~lock.AUDIT-SECURITE-ATTABL.pdf#`, `.~lock.BENCHMARK-PRICING-ATTABL.pdf#`, `.~lock.REBRANDING-LANDING-PAGE-V2.pdf#`, `.~lock.REFONTE-TEXTUELLE-ATTABL.pdf#`, `.~lock.REPOSITIONNEMENT-FOOD-HOSPITALITY.pdf#`, `.~lock.SCENARIOS-PENETRATION-V2.pdf#`                                                                                                                                                                                                                       |
| Temporaires LibreOffice | **6**  | `lu17035106wtq.tmp` (455 186 o), `lu213491gu9af.tmp` (232 297 o), `lu1790111xz97.tmp` (223 535 o), `lu18348169pet.tmp` (221 450 o), `lu205191g01ow.tmp` (190 020 o), `lu1755010xppf.tmp` (162 712 o). **Total 1 485 200 o = 1,42 Mio**. Au moins 4 sont des copies **octet pour octet** de PDF déjà versionnés (tailles identiques à `REPOSITIONNEMENT-FOOD-HOSPITALITY.pdf`, `SCENARIOS-PENETRATION-V2.pdf`, `AUDIT-SECURITE-ATTABL.pdf`, `REBRANDING-LANDING-PAGE-V2.pdf`) |
| Journaux de build/test  | **6**  | `build_phase7.log`, `coverage_phase6.log`, `test_phase6.log`, `test_phase6_after.log`, `test_new_phase6.log`, `test_orange_callback.log`                                                                                                                                                                                                                                                                                                                                     |
| Sortie de lint          | **1**  | `lint_output.txt` (22 288 o)                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Aucun `.DS_Store` ni `._*` (bon point). `tsconfig.tsbuildinfo` (5,7 Mo) et `coverage/` sont présents sur disque mais **non suivis** : `.gitignore` fonctionne pour eux.

**Le piège :** `.gitignore` contient déjà `/build*.log`, `/test_*.log`, `/ci_*.log`. Ces règles sont **sans effet** parce que les fichiers ont été committés avant leur ajout. `git ls-files` prime sur `.gitignore`. Il faut un `git rm --cached` explicite.

Datation (`git log -1 --format='%ad %h %s' --date=short -- <fichier>`) :

- `lint_output.txt` : 2026-02-07, commit `34005672`
- `lu*.tmp` et `.~lock.*` : 2026-03-31, commit `1fb62647` « feat: production readiness … »
- `build_phase7.log` : 2026-05-08, commit `7a16700a`

Correctif :

```bash
git rm --cached '.~lock.'*'#' 'lu'*'.tmp' *.log lint_output.txt
printf '%s\n' '.~lock.*#' '*.tmp' '/lint_output.txt' '/coverage_phase6.log' >> .gitignore
```

### D.5 PDF et DOCX à la racine

Mesure : **23** fichiers suivis à la racine (11 PDF + 12 DOCX), **2 818 431 octets = 2,69 Mio**.

```bash
git ls-files | grep -E '^[^/]+\.(pdf|docx)$' | xargs stat -c%s | awk '{s+=$1} END{print s, NR}'
# -> 2818431 23
```

| Octets  | Fichier                                          |
| ------- | ------------------------------------------------ |
| 455 186 | `REPOSITIONNEMENT-FOOD-HOSPITALITY.pdf`          |
| 277 878 | `ARCHITECTURE-TERMINOLOGIE-CONTEXTUELLE-V2.pdf`  |
| 273 703 | `REFONTE-TEXTUELLE-ATTABL.pdf`                   |
| 244 800 | `REBRANDING-LANDING-PAGE-ATTABL.pdf`             |
| 240 779 | `REBRANDING-LANDING-PAGE-PROP-B.pdf`             |
| 232 297 | `SCENARIOS-PENETRATION-V2.pdf`                   |
| 228 971 | `BENCHMARK-PRICING-ATTABL.pdf`                   |
| 215 878 | `AUDIT-RESPONSIVE-DESIGN-ATTABL.pdf`             |
| 190 020 | `AUDIT-SECURITE-ATTABL.pdf`                      |
| 162 712 | `REBRANDING-LANDING-PAGE-V2.pdf`                 |
| 16 769  | `AUDIT-RESPONSIVE-ATTABL.pdf`                    |
| 30 082  | `REPOSITIONNEMENT-FOOD-HOSPITALITY.docx`         |
| 26 909  | `SCENARIOS-PENETRATION-V2.docx`                  |
| 25 814  | `REFONTE-TEXTUELLE-ATTABL.docx`                  |
| 25 305  | `REBRANDING-LANDING-PAGE-ATTABL.docx`            |
| 23 774  | `REBRANDING-LANDING-PAGE-PROP-B.docx`            |
| 23 392  | `ARCHITECTURE-TERMINOLOGIE-CONTEXTUELLE-V2.docx` |
| 22 084  | `AUDIT-SECURITE-ATTABL.docx`                     |
| 21 889  | `AUDIT-STORYTELLING-MULTI-COMMERCE.docx`         |
| 21 339  | `ARCHITECTURE-TERMINOLOGIE-CONTEXTUELLE.docx`    |
| 21 223  | `AUDIT-RESPONSIVE-DESIGN-ATTABL.docx`            |
| 20 618  | `BENCHMARK-PRICING-ATTABL.docx`                  |
| 17 009  | `REBRANDING-LANDING-PAGE-V2.docx`                |

Poids réel ajouté au dépôt, en incluant les artefacts liés :

| Bloc                                     | Taille         |
| ---------------------------------------- | -------------- |
| 23 PDF/DOCX racine                       | 2,69 Mio       |
| 6 `lu*.tmp` (copies)                     | 1,42 Mio       |
| `CONTRE-AUDIT-COMPARAISON-ICONES.html`   | 0,31 Mio       |
| **Total documents non code**             | **≈ 4,42 Mio** |
| Pack git total (`git count-objects -vH`) | **21,11 Mio**  |

Soit **environ 21 % du pack**, pour du contenu qui n'a aucune raison d'être dans un dépôt de code, et qui est **rechargé intégralement à chaque `git clone`** par tout contributeur et par chaque job CI (5 workflows). Le chiffre sous-estime encore l'impact réel : les PDF sont des binaires non compressibles et non delta-compressibles, donc chaque révision de `REBRANDING-LANDING-PAGE-*.pdf` a été stockée en entier dans l'historique de 908 commits.

Correctif : `git rm --cached` + migration vers Drive/Notion, et ignore de `*.pdf`, `*.docx` à la racine. Le nettoyage de l'historique (`git filter-repo`) est un second temps, à coupler avec la rotation évoquée en section E.

### D.6 `console.*` hors `src/lib/logger.ts`

**7 occurrences**, sur 3 fichiers seulement.

```bash
grep -rn "console\.\(log\|error\|warn\|info\|debug\|trace\)" --include=*.ts --include=*.tsx src \
  | grep -v "src/lib/logger.ts" | wc -l   →  7
```

| Fichier                            | Occurrences | Verdict                                                                                   |
| ---------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `src/lib/env.ts`                   | 3           | Légitime : validation d'environnement au démarrage, le logger n'est pas encore disponible |
| `src/lib/rate-limit.ts`            | 2           | Légitime pour la même raison (bootstrap Upstash), à confirmer par lecture                 |
| `src/lib/__tests__/logger.test.ts` | 2           | Test du logger lui-même                                                                   |

Aucune correction nécessaire. C'est un résultat très propre pour une base de 1076 fichiers. Recommandation défensive uniquement : ajouter `no-console` en `error` dans `eslint.config.mjs` avec une exception explicite pour `src/lib/logger.ts`, `src/lib/env.ts` et `**/__tests__/**`, pour verrouiller l'acquis.

### D.7 `any` restants

**3 occurrences**, une par fichier :

```bash
grep -rn ":\s*any\b\|as any\b\|<any>\|any\[\]" --include=*.ts --include=*.tsx src | wc -l   →  3
```

- `src/lib/auth/admin-route-guard.ts`
- `src/hooks/usePosUnpaidOrders.ts`
- `src/components/tenant/__tests__/ClientSettings.component.test.tsx`

Celui de `src/lib/auth/admin-route-guard.ts` mérite une lecture : ce fichier est appelé depuis `proxy.ts` (`isAdminRouteDenied`) sur le chemin RBAC. Les deux autres sont sans enjeu.

---

## E. Hygiène du dépôt public

Le dépôt est public : `https://github.com/thefrankalbert/attabl-saas.git`, 908 commits, historique complet depuis 2026-02-04.

### E.1 Identifiants d'infrastructure en dur

| Ce qui est exposé                                                                                                                                                          | Où                                                                                                                                                  | Gravité                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ref de projet Supabase `gjlztittszelfjubbksy`** (20 lettres minuscules)                                                                                                  | `migration-audit.md:485` : `https://gjlztittszelfjubbksy.supabase.co/storage/v1/object/public/menu-items/...`                                       | **Élevée.** C'est le hostname d'API du projet « Blutable ». Combiné à une clé anon fuitée ou à une RLS trop permissive, c'est un point d'entrée direct. Seul ref de 20 caractères trouvé dans tout le dépôt (`grep -rInoE '[a-z0-9]+\.supabase\.co'`) |
| **URL du miroir GitLab** `https://gitlab.com/odcsupportagency/odc-support-agency-project.git`                                                                              | `.github/workflows/mirror.yml:29`, en dur dans `env:`                                                                                               | Moyenne. Révèle une seconde copie complète du dépôt, sur une autre plateforme, comme cible alternative de credential stuffing. Le workflow lui-même documente que le token a le scope `write_repository`                                              |
| **Organisation + projet Sentry** `odc-digital-solub` / `attabl-saas`                                                                                                       | `next.config.mjs:94-95`, plus `tunnelRoute: '/monitoring'`                                                                                          | Faible à moyenne. Facilite le ciblage de l'org Sentry                                                                                                                                                                                                 |
| **Sous-domaines de tenants réels** `radisson.attabl.com`, `lepicurien.attabl.com`, `lejardin.attabl.com`, `attabl-qa.attabl.com`                                           | `migration-audit.md`, `docs/DEMO-PRESENTATION.md`, `docs/plans/2026-02-18-multi-restaurant-hub-design.md`, `scripts/seed-qa.ts:1894`, `CLAUDE.md:5` | Moyenne. Cartographie nominative de la clientèle réelle                                                                                                                                                                                               |
| **Compte super-admin** `superadmin@attabl.com`                                                                                                                             | `scripts/manage-super-admin.js:33`, `scripts/security-super-admin.sql` (3 fois)                                                                     | Moyenne. La moitié d'une paire identifiant/mot de passe pour le compte le plus privilégié                                                                                                                                                             |
| **Identifiants de démo en clair** : `owner@demo.attabl.com` … `serveur2@demo.attabl.com`, **mot de passe `[MOT-DE-PASSE-PURGE-VOIR-PR-299]`**, sur `lepicurien.attabl.com` | `docs/DEMO-PRESENTATION.md:39-51`                                                                                                                   | **Élevée si le compte est actif sur un tenant de production.** Ce sont des identifiants fonctionnels publiés en clair                                                                                                                                 |

**À noter : gitleaks ne détecte aucun de ces cas.** Le mot de passe de démo est dans un tableau Markdown (`\| Mot de passe \| \`[MOT-DE-PASSE-PURGE-VOIR-PR-299]\` \|`), qui ne correspond pas au motif `password\s*[:=]\s*'...'`de la règle maison ; et`docs/.\*\.md$`est de toute façon dans`paths` de l'allowlist. Le ref Supabase n'est couvert par aucune règle. C'est une illustration concrète du problème de la section C.1 : le scan donne un signal vert sur un dépôt qui contient des identifiants publiés.

Aucun identifiant Vercel (`prj_`, `team_`) trouvé : `grep -rInE 'prj_|team_|VERCEL_(ORG|PROJECT)'` ne remonte rien. `.vercel` est correctement dans `.gitignore`.

### E.2 Documents commerciaux et de sécurité publiés

- **23 documents commerciaux** (section D.5) publiés sur un dépôt public. Le contenu est explicite dans les noms : `BENCHMARK-PRICING-ATTABL` (stratégie tarifaire), `SCENARIOS-PENETRATION-V2` (plan de pénétration du marché), `REPOSITIONNEMENT-FOOD-HOSPITALITY`, `REBRANDING-LANDING-PAGE-*` (3 variantes, propositions A/B), `AUDIT-SECURITE-ATTABL`.
- **`security/` : 13 fichiers suivis**, dont `AUDIT-ATTABL-FINDINGS.md`, `AUDIT-EXECUTION-REPORT.md`, `00-RAPPORT-ETAT-DE-LART-SECURITE-2026.md`, `01-CHECKLIST-ET-PLAN-DE-TESTS.md`, `VERIFICATION-CLAUDE-CODE.md`, `scripts/rls_coverage.sql`, `generated-tests/security-bola.spec.ts`. C'est une **cartographie publique des faiblesses de sécurité de l'application** et de leur état de correction, avec les tests BOLA qui documentent les endpoints sensibles.
- **19 fichiers `.md` d'audit à la racine** (`AUDIT-FIX-PLAN.md` 32 Ko, `AUDIT-FONCTIONNEL.md` 29 Ko, `migration-audit.md` 37 Ko, etc.), plus `CONTRE-AUDIT-COMPARAISON-ICONES.html` (320 Ko), `prototype-service-page.jsx` (18 Ko), `verification-ui-10-sur-10.sh`.
- **`.claude/rules/` : 8 fichiers publiant les règles internes**, y compris `01-security.md`, `07-multi-tenant.md`, et les dates d'incidents de production (`incident 2026-07-03`, `incident 2026-07-11` cités dans `eslint.config.mjs`).

Aucune capture d'écran hors `public/` : `git ls-files | grep -iE '\.(png|jpg|jpeg)$' | grep -v '^public/'` ne retourne rien. La règle `.gitignore` `/*.png` fonctionne.

### E.3 Fichiers de configuration d'agents

**83 fichiers suivis** sous `.claude/`, `.agents/`, `.agent/`, `.kiro/`, `.windsurf/` :

- `.claude/agents/` : 30 fichiers (`security-engineer.md`, `devops.md`, `database-admin.md`, `sales-proposal-strategist.md`, `nexus-strategy.md`…)
- `.claude/rules/` : 8 fichiers
- `.agents/skills/` : 21 fichiers (skills tiers vendorisés : `benjitaylor/agentation`, `jezweb/claude-skills`, `josiahsiegel/claude-plugin-marketplace`, voir `skills-lock.json`)
- `.agent/skills/` et `.kiro/skills/` : 8 **liens symboliques** pointant vers `../../.agents/skills/*` (mode `120000` dans `git ls-files -s`)
- `.windsurf/rules/` : 3 fichiers

**Le `.gitignore` est déjà correct mais inefficace.** Il liste `.agents/`, `.claude/agents/`, `.claude/skills/`, `.claude/commands/`, `.kiro/`. Comme pour les journaux, ces règles ne s'appliquent pas à des fichiers déjà suivis. La preuve : `git ls-files | grep -cE '^\.(agent|agents|claude|kiro|windsurf)/'` → **83**.

Impact concret : trois répertoires (`.agent`, `.kiro`, `.agents`) décrivent la même chose par redondance d'outillage, deux d'entre eux ne sont que des liens symboliques relatifs qui n'ont de sens que sur la machine d'origine, et l'ensemble ajoute du code tiers non audité au dépôt.

Correctif :

```bash
git rm -r --cached .agent .agents .kiro .windsurf .claude/agents
# conserver .claude/rules si elles font partie de la doc d'ingenierie assumee
```

### E.4 Plan de remédiation ordonné pour le dépôt public

1. **Rotation d'abord, nettoyage ensuite.** Changer le mot de passe `[MOT-DE-PASSE-PURGE-VOIR-PR-299]` et désactiver ou isoler les comptes `*@demo.attabl.com`. Vérifier l'état du projet Supabase `gjlztittszelfjubbksy` (RLS, clés) et le supprimer s'il est obsolète, la référence étant publique depuis le 2026-02-28.
2. `git rm --cached` sur : documents commerciaux, `lu*.tmp`, `.~lock.*#`, journaux, répertoires d'agents. Un seul commit, message explicite.
3. Mettre à jour `.gitignore` (`*.pdf`, `*.docx`, `*.tmp`, `.~lock.*#` à la racine).
4. `git filter-repo` pour purger l'historique, en coordination avec le miroir GitLab de `mirror.yml` (qui pousse en `--force`, donc le miroir suivra, mais il faut le vérifier).
5. Déplacer l'URL GitLab de `mirror.yml` vers un secret de dépôt.

---

## F. Hooks Husky

### Constat mesuré

`.husky/` contient **2 hooks** (`pre-commit` 1429 o, `pre-push` 1203 o). Aucun `commit-msg`, `prepare-commit-msg`, `post-merge`, `post-checkout`.

**`pre-commit`, 5 barrières :**

| Gate | Contenu                                                                                                                               | Bloquant ?                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 0    | Suppression de 6 fichiers critiques (`src/proxy.ts`, `src/lib/supabase/{client,server,admin,middleware}.ts`, `src/lib/rate-limit.ts`) | Oui                        |
| 0b   | `gitleaks git --staged --redact -v`                                                                                                   | **Non si gitleaks absent** |
| 1a   | `pnpm typecheck` (2 passes `tsc`)                                                                                                     | Oui                        |
| 1b   | `pnpm test` (suite Vitest complète)                                                                                                   | Oui                        |
| 2-3  | `npx lint-staged` (eslint --fix + prettier)                                                                                           | Oui                        |

**`pre-push`, 1 barrière :** `gitleaks git --log-opts="<range>"` sur la plage réellement poussée, avec calcul correct de la plage pour une branche neuve (`--not --remotes`) comme pour une mise à jour.

### Sont-ils suffisants ? Non. Cinq lacunes, par ordre de gravité.

**1. Le scan de secrets se désactive tout seul.** C'est la lacune la plus grave, et elle est reproductible ici :

```bash
command -v gitleaks   # -> absent dans cet environnement
```

`pre-commit` : `else echo "WARNING: gitleaks not installed, secret scan skipped."` puis on continue.
`pre-push` : `if ! command -v gitleaks …; then echo "WARNING…"; exit 0; fi`, sortie **0**, donc le push passe.

Autrement dit : **un développeur qui n'a jamais fait `brew install gitleaks` n'a aucune protection contre les secrets, ni au commit ni au push**, et ne voit qu'un avertissement noyé dans la sortie. Combiné avec le trou d'allowlist de la section C.1, la protection annoncée par les commentaires (« Nothing is sent while a secret exists ») ne tient pas.

Correctif : remplacer le repli silencieux par un repli fonctionnel, comme `security.yml` le fait déjà avec Docker.

```sh
if command -v gitleaks >/dev/null 2>&1; then
  GITLEAKS="gitleaks"
elif command -v docker >/dev/null 2>&1; then
  GITLEAKS="docker run --rm -v $PWD:/repo -w /repo zricethezav/gitleaks:latest"
else
  echo "BLOQUE: gitleaks introuvable et docker indisponible."
  echo "Installer: brew install gitleaks   (ou lever avec --no-verify en connaissance de cause)"
  exit 1
fi
```

**2. `pnpm test` complet au pre-commit pousse au contournement.** `CLAUDE.md:379` documente que la suite produit « 550 lignes ». Un hook lent entraîne mécaniquement l'usage de `git commit --no-verify`, qui **désactive aussi les gates 0 et 0b**. Le coût du hook lent n'est donc pas la lenteur, c'est la perte de la barrière secrets. Correctif : `vitest related --run $(git diff --cached --name-only)` au commit, suite complète au push.

**3. Le pre-push ne vérifie que les secrets.** Aucun `typecheck`, `lint`, ni `test` avant qu'un lot de commits ne parte sur `main`. Si le commit a été fait avec `--no-verify`, rien ne rattrape avant la CI.

**4. Aucun garde-fou sur les fichiers volumineux ni sur les binaires.** C'est exactement le mécanisme par lequel 4,42 Mio de PDF, de `.tmp` LibreOffice et de verrous `.~lock.*#` sont entrés (sections D.4 et D.5), et la CI ne les a jamais signalés non plus. Ajout recommandé au `pre-commit` :

```sh
# refuser tout binaire > 300 Ko et toute extension bureautique
git diff --cached --name-only --diff-filter=A | while read -r f; do
  case "$f" in
    *.pdf|*.docx|*.xlsx|*.tmp|.~lock.*|*.log) echo "BLOQUE: $f n'a pas sa place dans le depot"; exit 1;;
  esac
  sz=$(git cat-file -s "$(git rev-parse ":$f")" 2>/dev/null || echo 0)
  [ "$sz" -gt 307200 ] && { echo "BLOQUE: $f fait ${sz} octets (> 300 Ko)"; exit 1; }
done
```

**5. Détails.** Aucun `commit-msg` alors que les 908 commits suivent visiblement Conventional Commits (`fix(pos):`, `feat(qr):`) : la convention n'est pas outillée. Ni `knip` ni `format:check` ne sont dans les hooks (`format:check` n'est que dans `ci.yml`). Les deux fichiers sont en `-rw-r--r--` sans shebang : correct pour Husky v9 qui les source, mais ils ne sont pas exécutables directement pour un test manuel.

---

## Tableau de priorisation effort / impact

| #   | Action                                                                                                                                                                 | Effort            | Impact                                                                                                                                | Risque de régression                                                  | Preuve                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | **Monter `next` 16.2.9 → 16.2.12** (+ `eslint-config-next`, `@next/bundle-analyzer`)                                                                                   | **XS** (3 lignes) | **Critique** : ferme 4 HIGH + 5 MOD, dont 2 réellement applicables (DoS Server Actions, divulgation d'endpoints)                      | Faible, patch de la même mineure. Aucun peer bloquant                 | `pnpm outdated`, peers lus dans `node_modules`                  |
| 2   | **Corriger l'allowlist `.gitleaks.toml`** (retirer `regexTarget="line"` global, retirer `<[^>]{1,40}>` et le groupe `todo\|example\|sample`, ancrer les placeholders)  | **S**             | **Critique** : le scan de secrets est aujourd'hui neutralisé sur toute ligne contenant un générique TS, une balise JSX ou le mot TODO | Faux positifs à trier au premier passage                              | Simulation Node des regex du fichier                            |
| 3   | **Faire échouer les hooks Husky quand `gitleaks` est absent** (repli Docker)                                                                                           | **XS**            | **Critique** : sans cela, la barrière secrets est optionnelle côté développeur                                                        | Nul                                                                   | `command -v gitleaks` → absent                                  |
| 4   | **Rotation `[MOT-DE-PASSE-PURGE-VOIR-PR-299]` + audit du projet Supabase `gjlztittszelfjubbksy`**                                                                      | **S**             | **Élevé** : identifiants fonctionnels et ref de projet publiés depuis février dans un dépôt public                                    | Nul                                                                   | `docs/DEMO-PRESENTATION.md:40`, `migration-audit.md:485`        |
| 5   | **Rafraîchir les overrides `pnpm-workspace.yaml`** (`fast-uri>=4.1.1`, `brace-expansion>=2.1.2` et `>=5.0.8`, `postcss>=8.5.18`, `dompurify>=3.4.12`, `sharp>=0.35.0`) | **XS**            | **Élevé** : 5 HIGH + 1 LOW fermés, dont le seul atteignable côté client (`dompurify` via `jspdf`)                                     | Faible, versions patch                                                | `pnpm-workspace.yaml` vs `node_modules/.pnpm` vs cibles d'audit |
| 6   | **`git rm --cached` documents, `lu*.tmp`, `.~lock.*#`, journaux, répertoires d'agents**                                                                                | **S**             | **Élevé** : 4,42 Mio sur 21,11 Mio de pack, plus le retrait du contenu commercial et de la cartographie de sécurité d'un dépôt public | Nul sur le code                                                       | `git ls-files` + `git count-objects -vH`                        |
| 7   | **Trancher l'incohérence `ci.yml` / `security.yml`** (supprimer la gate non bloquante, aligner Node/pnpm, `packageManager`)                                            | **S**             | **Élevé** : `security.yml` est rouge en permanence (11 HIGH en prod), donc ignoré                                                     | Le job devient vert seulement après 1 et 5                            | Lecture des deux workflows                                      |
| 8   | **Brancher `paymentInitiationLimiter` et `webhookLimiter`** (définis, jamais appelés)                                                                                  | **S**             | **Élevé** : deux limiteurs de débit morts sur les chemins paiement et webhook                                                         | Faible, à tester en charge                                            | `pnpm knip`, `src/lib/rate-limit.ts:124` et `:131`              |
| 9   | **Épingler `images.remotePatterns`** au ref du projet au lieu de `**.supabase.co`                                                                                      | **XS**            | **Moyen** : ferme le proxy `/_next/image` ouvert sur tous les projets Supabase                                                        | Nul si le ref est correct                                             | `next.config.mjs`                                               |
| 10  | **Ajouter `src/app/actions/**`et`src/app/api/**` au périmètre de couverture Vitest**                                                                                   | **S**             | **Moyen** : les planchers actuels ignorent les 26 fichiers `use server`, c'est-à-dire la frontière de confiance                       | Les planchers vont chuter, il faut les recalculer                     | `vitest.config.ts`, `ls src/app/actions`                        |
| 11  | **Ajouter un garde-fou binaire/taille au `pre-commit`**                                                                                                                | **XS**            | **Moyen** : empêche la récidive de l'action 6                                                                                         | Nul                                                                   | 4,42 Mio déjà entrés                                            |
| 12  | **Corriger `knip.json`** (entrée `src/app/sw.ts`), supprimer `OrdersPagination.tsx` et `@types/ws`, brancher `pnpm knip` en CI non bloquant                            | **S**             | **Moyen** : rend l'outil exploitable, aujourd'hui il sort 3 faux positifs sur 5 signaux principaux                                    | Nul                                                                   | `pnpm knip`                                                     |
| 13  | **Monter `supabase` CLI 2.76.3 → 2.109.1**                                                                                                                             | **XS**            | **Moyen** : ferme le seul CRITICAL du graphe (`tar`), dev uniquement                                                                  | Faible, vérifier `db:types` et `db:migrate`                           | `pnpm audit --json`                                             |
| 14  | **Passer `tsconfig target` de ES2017 à ES2022**, ajouter `noUncheckedIndexedAccess`                                                                                    | **M**             | **Moyen** : bundle client plus léger, et le second flag durcit les accès indexés de `proxy.ts`                                        | Moyen : `noUncheckedIndexedAccess` va produire des erreurs à corriger | `tsconfig.json`                                                 |
| 15  | **Supprimer le bloc `webpack:` inerte de `withSentryConfig`** et documenter                                                                                            | **XS**            | **Faible** : configuration morte qui fait croire à un tree-shaking des logs Sentry qui n'a pas lieu                                   | Nul                                                                   | Next 16 = Turbopack par défaut, aucun `--webpack`               |
| 16  | **`VERCEL_GIT_COMMIT_SHA` dans `serwist.config.mjs`**                                                                                                                  | **XS**            | **Faible** : évite l'invalidation du précache `/offline` à chaque build                                                               | Nul                                                                   | `serwist.config.mjs`                                            |
| 17  | **Retirer `scripts/**` des ignores ESLint\*\*                                                                                                                          | **S**             | **Faible à moyen** : 15 scripts non lintés, dont ceux qui manipulent le `service_role`                                                | Volume d'erreurs initial à absorber                                   | `eslint.config.mjs`                                             |
| 18  | **Découper les 10 fichiers > 500 lignes** (commencer par `src/app/actions/orders.ts` 700 l. et `src/app/api/orders/pos/route.ts` 559 l.)                               | **L**             | **Faible à moyen** : lisibilité et testabilité, la convention est à 300 lignes                                                        | Moyen, refactoring de chemins critiques                               | `wc -l`, `.claude/rules/04-frontend-quality.md:89`              |
| 19  | **Acceptations documentées** : `xlsx@0.18.5` (aucun correctif amont, usage confiné aux 3 fichiers de test), `esbuild` LOW (Windows)                                    | **XS**            | **Faible** : arrête le bruit récurrent dans l'audit                                                                                   | Nul                                                                   | `patched_versions: "<0.0.0"`                                    |
| 20  | **Ajouter `no-console` à ESLint** avec exceptions `logger.ts`/`env.ts`/tests                                                                                           | **XS**            | **Faible** : verrouille un acquis (7 occurrences seulement)                                                                           | Nul                                                                   | `grep console.* src` → 7                                        |

**Ce qui n'a pas besoin d'être corrigé, et qu'il faut noter comme tel :** aucun `TODO`/`FIXME` dans le code (0 sur 1076 fichiers), 3 `any` seulement, 7 `console.*`, 2 `@ts-expect-error` tous deux dans des tests, 70 `eslint-disable` presque tous justifiés et datés, aucun `.DS_Store`, aucune capture d'écran hors `public/`, aucun identifiant Vercel exposé, `tsconfig.tsbuildinfo` et `coverage/` correctement ignorés. Sur les axes classiques de dette de code, cette base est nettement au-dessus de la moyenne. La dette réelle est ailleurs : dans les dépendances non montées, dans une configuration de scan de secrets qui donne un faux vert, et dans l'hygiène d'un dépôt public qui héberge des documents commerciaux et des identifiants fonctionnels.
