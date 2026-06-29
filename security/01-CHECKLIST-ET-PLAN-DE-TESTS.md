# Checklist sécurité + plan de tests — Attabl

Checklist actionnable, couche par couche. Chaque ligne: `[ ]` à cocher, le risque, et **comment le tester** (commande, requête ou manip). Adapté à la stack Attabl. Statut au 2026-06-26: `[x]` = déjà vérifié OK, `[ ]` = à faire, `[!]` = faille trouvée à corriger.

Légende test: 🔧 commande/scan, 🧪 test manuel, 🗄️ requête SQL Supabase, 👁️ revue de code.

---

## A. Secrets & configuration

- [x] **Aucun secret commité.** 🔧 `git ls-files | grep -iE '\.env'` ne doit montrer que des `.example`. `git log --all -p -- .env.local` doit être vide.
- [x] **service_role jamais côté client.** 🔧 `grep -rn SERVICE_ROLE src/` → uniquement fichiers serveur. `src/lib/supabase/admin.ts` commence par `import 'server-only'`.
- [x] **Pas de secret en `NEXT_PUBLIC_`.** 🔧 `grep -rhoE 'NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE|PRIVATE|TOKEN)' src/ .env*` doit être vide.
- [ ] **`ALLOW_DEV_AUTH_BYPASS` absent des env Vercel** (Prod + Preview). 🧪 Vercel > Settings > Environment Variables.
- [ ] **gitleaks passe.** 🔧 `gitleaks detect --source . --redact -v` → 0 leak. (config `.gitleaks.toml` présente.)
- [ ] **Rotation des clés planifiée** (service_role, Stripe, Resend, Anthropic) au moins trimestrielle. 🧪 noter la date.

## B. Authentification

- [ ] **Protection mots de passe fuités activée** (Supabase Auth, HaveIBeenPwned). 🧪 Dashboard > Auth > Policies. **Actuellement OFF → activer.**
- [ ] **MFA disponible** pour les comptes restaurateur/admin. 🧪 tester l'enrôlement TOTP.
- [ ] **Rate limit sur login/signup/reset.** 🧪 50 tentatives login rapides → doit bloquer (Upstash). 🔧 boucle curl.
- [ ] **Confirmation email activée**, pas de connexion avant confirmation. 🧪 créer un compte, tenter d'agir avant validation.
- [ ] **URLs de redirection auth restreintes** (allowlist). 🧪 Dashboard > Auth > URL Configuration.
- [ ] **Sessions**: expiration raisonnable, refresh token rotation, logout invalide la session. 🧪 logout puis rejouer le cookie.

## C. Autorisation & multi-tenant (priorité haute)

- [!] **Fonctions `SECURITY DEFINER` non exposées à `anon`.** 🗄️ voir HIGH-1. `REVOKE EXECUTE` sur `is_admin()` et `handle_new_user()`.
- [ ] **RLS active sur toutes les tables `public`.** 🗄️ requête `security/scripts/rls_coverage.sql` → 0 table sans RLS.
- [ ] **BOLA testé sur chaque route prenant un id.** 🧪 protocole ci-dessous (section Plan de tests BOLA). C'est le test #1.
- [ ] **Isolation tenant prouvée.** 🧪 user tenant A ne voit aucune donnée tenant B (menus, commandes, stats, factures).
- [ ] **Function-level authz**: routes admin/platform refusent un user normal. 🧪 appeler `/api/.../platform/*` avec un compte restaurateur simple.
- [ ] **Object property authz**: un user ne peut pas modifier des champs interdits (rôle, tenant_id, prix). 🧪 PATCH avec champs en trop.

## D. Données & entrées

- [ ] **Validation d'entrée (Zod) sur chaque route/Server Action.** 👁️ chaque `route.ts` parse et valide le body.
- [ ] **Pas d'injection SQL.** Requêtes paramétrées / client Supabase. 👁️ aucune concaténation de chaîne SQL.
- [ ] **`dangerouslySetInnerHTML` sûr** (2 occurrences). 👁️ source statique ou sanitizée (DOMPurify).
- [ ] **Pas de SSRF**: tout fetch d'URL fournie par l'utilisateur est validé/allowlisté. 👁️ rechercher `fetch(` sur input user.
- [ ] **Upload de fichiers** (si présent): type/taille validés, pas d'exécution, stockage privé. 🧪 uploader un .svg/.html piégé.

## E. Paiements & abonnements (Stripe)

- [x] **Signature webhook vérifiée** (`constructEvent`, corps brut). 👁️ `src/app/api/webhooks/stripe/route.ts`.
- [x] **Idempotence** (table `stripe_events`, contrainte unique). 👁️ idem.
- [ ] **Montants calculés serveur**, jamais depuis le client. 👁️ `create-checkout-session`, `create-embedded-checkout`: les prix viennent des price IDs serveur, pas du body.
- [ ] **Webhook secret de prod ≠ test**, clés restreintes. 🧪 Stripe Dashboard.
- [ ] **Cycle de vie abonnement géré**: paiement échoué, annulation, downgrade. 🧪 utiliser les events de test Stripe CLI.
- [ ] **Réconciliation paiements** fonctionne (cron `reconcile-payments`). 👁️ logs cron.
- [ ] **Anti-abus essai/coupon**: un même user ne peut pas enchaîner les essais gratuits. 🧪 recréer un compte, retenter l'essai.

## F. Infrastructure & headers

- [x] **Next.js patché** (16.2.9, > CVE-2025-29927). 🔧 `npm ls next`.
- [x] **CSP par nonce + HSTS + X-Frame-Options.** 👁️ `src/proxy.ts`, `next.config.mjs`.
- [ ] **Headers complets**: ajouter si absents X-Content-Type-Options=nosniff, Referrer-Policy, Permissions-Policy. 🔧 `curl -sI https://<domaine> | grep -iE 'content-security|strict-transport|x-frame|x-content|referrer|permissions'`.
- [ ] **Scan en-têtes externe** ≥ A. 🧪 https://securityheaders.com et https://observatory.mozilla.org.
- [ ] **Dépendances sans vuln critique.** 🔧 `pnpm audit --audit-level=high` et `npx osv-scanner .`.
- [ ] **Rate limit global** sur les routes coûteuses/IA (`@anthropic-ai/sdk`). 🧪 marteler une route IA.
- [ ] **Routes `/api/dev/*` inaccessibles en prod.** 🧪 appeler `/api/dev/simulate-subscription` en prod → 404/403.

## G. Logs, monitoring, réponse

- [x] **Sentry configuré** (client/server/edge). 👁️ `sentry.*.config.ts`.
- [ ] **Pas de PII/secret dans les logs.** 👁️ grep `console.log` sur données sensibles.
- [ ] **Alerte sur pics d'erreurs auth/paiement.** 🧪 Sentry alert rules.
- [ ] **Sauvegardes Supabase + test de restauration.** 🧪 PITR activé, faire un essai de restore.

## H. Conformité (UE)

- [ ] **DPA signés**: Supabase, Vercel, Stripe, Resend, Sentry, Upstash. 🧪 archiver les PDF.
- [ ] **Process violation de données** (notification CNIL < 72h) documenté. 👁️ runbook.
- [ ] **Droits RGPD** (accès/effacement) réalisables. 🧪 simuler une demande d'effacement.
- [ ] **PCI**: inventaire des scripts de la page de paiement, CSP stricte, SAQ A confirmé avec Stripe. 👁️ page checkout.
- [ ] **Politique de confidentialité + mentions cookies** à jour. 👁️ pages légales.

---

## Plan de tests BOLA (le test le plus important)

BOLA = #1 risque API. Protocole, à répéter pour chaque ressource (commandes, menus, items, restaurants, factures, abonnements):

1. Créer deux tenants: **A** (restaurant Alpha) et **B** (restaurant Bravo), chacun avec ses données.
2. Se connecter en **A**, récupérer un token/session et noter un `id` appartenant à **B** (ex: une commande de B).
3. Avec la session de **A**, appeler chaque endpoint sur l'`id` de **B**:
   - `GET /api/orders/{idB}` → doit renvoyer 403/404, jamais la donnée.
   - `PATCH /api/orders/{idB}` → refus.
   - `DELETE`, `POST` actions associées → refus.
4. Tester aussi les RPC Supabase: `get_order(idB, token)` avec un token invalide → refus.
5. Tester l'élévation de privilège: compte restaurateur simple → routes `platform/admin` → refus.
6. Documenter chaque route testée dans un tableau (route, méthode, attendu, obtenu).

Astuce: script ce protocole avec les comptes de test (voir `02-BOITE-A-OUTILS-CLAUDE-CODE.md`, prompt "Test BOLA automatisé") et garde-le en test e2e Playwright pour non-régression.

---

## Définition de "fini"

Sécurité considérée à niveau quand: tous les `[ ]` des sections A-F sont `[x]`, `get_advisors` Supabase renvoie 0 warning, securityheaders.com ≥ A, `pnpm audit` sans critique, et le plan BOLA passe sur toutes les ressources. Les sections G-H sont continues (process, pas one-shot).
