# Audit sécurité Attabl — résultats concrets

> CORRECTION (2026-06-28): ce fichier a été écrit alors que l'intégration Supabase pointait sur le projet `gjlztittszelfjubbksy` (RadissonMenu), qui n'est PAS le backend du code Attabl. Le vrai backend est `nqufpobuozrzwpeijkxt`. Les findings "HIGH-1" (is_admin / handle_new_user exposés) et "MEDIUM-1" (protection mots de passe) ci-dessous concernent RadissonMenu, pas Attabl. Le rapport à jour et corrigé est `AUDIT-EXECUTION-REPORT.md`. Lire celui-là en priorité.

Date: 2026-06-26. Stack auditée: Next.js 16.2.9, Supabase (projet `RadissonMenu` / `gjlztittszelfjubbksy`, région eu-north-1), Stripe, Vercel, Upstash, Turnstile, Sentry.

Cet audit combine: inspection du code réel du repo `attabl-saas`, et les advisors de sécurité du projet Supabase connecté. Il ne remplace pas un pentest externe. Il cible les failles vérifiables aujourd'hui.

---

## Verdict global

Le socle est solide, au-dessus de la moyenne des projets vibe-codés. Les points qui cassent d'habitude (secrets commités, service_role côté client, webhook Stripe non vérifié, Next.js vulnérable) sont déjà bien traités ici. Les failles restantes sont concentrées côté base de données (fonctions Postgres exposées) et sur la surface d'API non encore testée systématiquement.

Note indicative: socle 8/10. Risque résiduel: moyen, surtout sur l'autorisation (BOLA) des 48 routes API et la couverture RLS.

---

## Ce qui est déjà bien (vérifié, à conserver)

1. **Secrets non commités.** `.env*` est gitignoré, seuls les `.example` sont suivis. Aucun `.env.local` dans l'historique git. Conforme.
2. **service_role isolé serveur.** `src/lib/supabase/admin.ts` commence par `import 'server-only'`. La clé `SUPABASE_SERVICE_ROLE_KEY` n'apparaît que dans du code serveur (`lib/admin`, `lib/cache`, `services/platform-admin`). Jamais côté client. Conforme.
3. **Aucun secret en `NEXT_PUBLIC_`.** Les variables exposées au navigateur sont toutes légitimement publiques: publishable key Stripe, anon key Supabase, site key Turnstile, VAPID public, price IDs, DSN Sentry. Conforme.
4. **Next.js 16.2.9.** Non affecté par CVE-2025-29927 (contournement d'auth middleware, corrigé en 15.2.3). Conforme.
5. **Webhook Stripe exemplaire.** `src/app/api/webhooks/stripe/route.ts` (492 lignes): vérification de signature via `stripe.webhooks.constructEvent`, lecture du corps brut via `request.text()`, idempotence via table `stripe_events` (contrainte unique, gestion du code `23505`), rollback de l'enregistrement d'idempotence en cas d'échec pour permettre le retry. Meilleur que la majorité des intégrations.
6. **Bypass dev triple-gardé.** `ALLOW_DEV_AUTH_BYPASS` n'est actif que si `NODE_ENV === 'development'` ET flag `=== 'true'` ET host `localhost`/`127.0.0.1`/`.localhost` (`src/proxy.ts:177`, `lib/honeypot.ts`, `lib/turnstile.ts`). Bien conçu.
7. **CSP par nonce.** `src/proxy.ts` génère un nonce par requête et remplace `unsafe-inline` dans `script-src`. Headers `X-Frame-Options` et `Strict-Transport-Security` présents (`next.config.mjs`).
8. **Défenses présentes.** Upstash rate limit, Turnstile (anti-bot), Sentry, husky pre-commit, `.gitleaks.toml`, cron `reconcile-payments` (réconciliation paiements).

---

## Failles et corrections (par priorité)

### HIGH-1 — Fonctions Supabase `SECURITY DEFINER` exécutables par `anon`/`authenticated`

Source: advisors Supabase. Cinq fonctions sont appelables sans droit suffisant via `/rest/v1/rpc/...`:

- `public.is_admin()` — appelable par `anon`. Une fonction qui décide qui est admin ne doit jamais être exposée à un visiteur non authentifié.
- `public.handle_new_user()` — c'est une fonction de trigger. Elle ne doit pas être appelable en RPC du tout.
- `public.create_order(...)`, `public.get_order(p_id, p_token)`, `public.cancel_order(p_id, p_token)` — appelables par `anon`. Probablement intentionnel (commande à table sans compte, via token), mais `SECURITY DEFINER` contourne la RLS: toute la validation doit être DANS la fonction.

Impact: contournement d'autorisation, fuite/altération de commandes, abus de la logique admin.

Correctif:

```sql
-- Bloquer les fonctions qui ne doivent jamais être appelées en RPC
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- Pour les fonctions de commande volontairement publiques: garder SECURITY DEFINER
-- mais durcir le corps (voir checklist), figer le search_path, et limiter le débit.
ALTER FUNCTION public.create_order(uuid, text, text, text, integer, text, text, jsonb)
  SET search_path = '';
ALTER FUNCTION public.get_order(uuid, uuid) SET search_path = '';
ALTER FUNCTION public.cancel_order(uuid, uuid) SET search_path = '';
```

Réf: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

### HIGH-2 — Vérifier que `ALLOW_DEV_AUTH_BYPASS` n'existe pas en prod Vercel

Le code est bien gardé (host localhost requis), donc le risque réel est faible. Mais par hygiène: la variable ne doit exister dans AUCUN environnement Vercel (Production, Preview). Un `NODE_ENV` mal réglé sur un preview custom + cette variable = porte ouverte.

Action: Vercel > Settings > Environment Variables. Confirmer l'absence de `ALLOW_DEV_AUTH_BYPASS` en Production et Preview. La garder uniquement en `.env.local`.

### MEDIUM-1 — Protection mots de passe compromis désactivée (Supabase Auth)

Source: advisor `auth_leaked_password_protection`. La vérification HaveIBeenPwned est OFF. Des utilisateurs peuvent choisir un mot de passe déjà fuité.

Correctif: Supabase Dashboard > Authentication > Policies > activer "Leaked password protection". Réf: https://supabase.com/docs/guides/auth/password-security

### MEDIUM-2 — Autorisation au niveau objet (BOLA) sur 48 routes API non testée systématiquement

48 fichiers `route.ts` sous `src/app/api`. BOLA (API1:2023) = #1 risque API, ~40% des attaques. Risque type: un restaurateur du tenant A lit/modifie les commandes du tenant B en changeant un `id` dans l'URL.

Action: tester chaque route qui prend un `id`/`slug` avec un utilisateur d'un autre tenant. Voir `01-CHECKLIST-ET-PLAN-DE-TESTS.md` section BOLA et le script de la boîte à outils.

### MEDIUM-3 — Couverture RLS à prouver, pas à supposer

La RLS doit être active sur TOUTES les tables du schéma `public`, avec des policies SELECT/INSERT/UPDATE/DELETE cohérentes, isolées par tenant. Les advisors n'ont pas remonté de table sans RLS (bon signe), mais il faut le prouver par requête (voir toolkit: requête `rls_coverage.sql`).

### LOW-1 — Deux usages de `dangerouslySetInnerHTML`

2 occurrences dans `src/`. Risque XSS si la donnée injectée n'est pas constante/sanitisée.

Action: vérifier que les 2 sources sont statiques ou passées par un sanitizer (DOMPurify). Sinon, corriger.

### LOW-2 — Inventaire d'API et routes de debug

`src/app/api/dev/simulate-subscription/route.ts` existe. Confirmer que toutes les routes sous `/api/dev/*` sont inaccessibles en production (garde `NODE_ENV`).

---

## Plan d'action 7 jours (ordre recommandé)

1. Jour 1: HIGH-1 (revoke EXECUTE + search_path) et MEDIUM-1 (leaked password). Rejouer `get_advisors` pour confirmer 0 warning.
2. Jour 1: HIGH-2 (vérifier env Vercel).
3. Jour 2-3: MEDIUM-2 (tests BOLA sur les routes prenant un id, en priorité orders, menus, restaurants, billing).
4. Jour 3: MEDIUM-3 (requête de couverture RLS, corriger les manques).
5. Jour 4: LOW-1 et LOW-2.
6. Jour 5: lancer le scan complet (`security/scripts/security-scan.sh`) et la revue Claude Code (`/security-audit`).
7. Jour 6-7: corriger, re-scanner, documenter.

Sources des règles citées dans `00-RAPPORT-ETAT-DE-LART-SECURITE-2026.md`.
