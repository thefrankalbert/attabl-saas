# Rapport d'exécution sécurité Attabl

Date: 2026-06-28. Mode: audit autonome, lecture seule, aucune modification du code ni de la base. Aucune commande destructive exécutée. Baseline git vérifiée: seuls des fichiers `security/` ont été ajoutés, rien de modifié ni supprimé.

Ce rapport remplace et corrige `AUDIT-ATTABL-FINDINGS.md` sur un point majeur (voir section 1).

---

## 1. Correction de périmètre importante (à lire en premier)

Le code `attabl-saas` pointe vers le projet Supabase **`nqufpobuozrzwpeijkxt`** (lu dans `.env.local`, `NEXT_PUBLIC_SUPABASE_URL`). C'est le vrai backend Attabl, multi-tenant (table `tenants`, `tenant_id`, 90 appels `from('tenants')`, 94 migrations).

Le projet Supabase connecté via l'intégration MCP est **`gjlztittszelfjubbksy` (RadissonMenu)**: un projet différent, mono-restaurant (`restaurants`, `restaurant_id`, pas de table `tenants`).

Conséquence: les findings Supabase de mon premier audit (`is_admin()` et `handle_new_user()` exécutables par anon, protection mots de passe désactivée) proviennent de **RadissonMenu**, pas du backend Attabl en production. Ils sont réels pour RadissonMenu mais ne décrivent PAS l'état de la base Attabl.

Pour auditer en direct la vraie base, il faut connecter le projet `nqufpobuozrzwpeijkxt` à l'intégration Supabase (puis relancer les advisors et `security/scripts/rls_coverage.sql`). En attendant, j'ai audité le vrai schéma via les 94 migrations du repo, qui sont la source de vérité.

---

## 2. Ce qui a réellement tourné

| Contrôle                                        | Méthode                          | Résultat                                        |
| ----------------------------------------------- | -------------------------------- | ----------------------------------------------- |
| Tracking des secrets (git)                      | `git ls-files`, historique       | PASS, seuls les `.example` suivis               |
| Secrets en clair / NEXT_PUBLIC                  | grep regex ciblé                 | PASS, aucun secret exposé                       |
| service_role côté client                        | grep + `import 'server-only'`    | PASS, serveur uniquement                        |
| BOLA / authz (routes dynamiques)                | lecture du code, 10 routes       | PASS, ownership tenant imposé                   |
| Intégrité des prix                              | lecture `order.service.ts` + RPC | PASS au niveau service (voir 4.1)               |
| Webhook Stripe                                  | lecture route (492 lignes)       | PASS (signature + idempotence)                  |
| Headers / CSP                                   | `next.config.mjs`, `proxy.ts`    | PASS (5 headers + CSP nonce)                    |
| XSS (`dangerouslySetInnerHTML`)                 | lecture des 2 occurrences        | SAFE (CSS statique/config)                      |
| Routes `/api/dev`                               | grep garde NODE_ENV              | PASS (désactivées en prod)                      |
| SSRF                                            | grep fetch sur input             | Rien trouvé                                     |
| Schéma DB réel                                  | 94 migrations                    | Fortement durci (voir 3)                        |
| Advisors live (vraie base)                      | non exécuté                      | Base non connectée (voir 1)                     |
| Scanners SAST/secrets (semgrep, detect-secrets) | tentés                           | Non exécutés, sandbox sans pip-install (voir 5) |

---

## 3. Audit du vrai schéma Attabl (via migrations) — solide

Le backend Attabl est mature et clairement pensé sécurité:

- **RLS partout avec WITH CHECK explicite.** Migration `20260622130000_rls_coverage_hardening.sql`: ferme les trous de couverture, ajoute un `WITH CHECK` explicite sur chaque policy `FOR ALL` capable d'écrire, scope par `tenant_id = ANY get_my_tenant_ids_array()`. Tables couvertes: admin_users, orders, categories, menus, item_price_variants, coupons, tables, venues, zones, etc.
- **Fonctions SECURITY DEFINER durcies.** 29 migrations touchent des fonctions SECDEF. `REVOKE EXECUTE FROM anon/authenticated/PUBLIC` présents sur les fonctions sensibles (`delete_admin_user_atomic`, `reset_tenant_data`, `provision_signup_tenant`, `get_orders_for_tracking`, `accept_invitation_membership`). Migration dédiée `20260622140000_secdef_function_grants_hardening.sql` (grants restreints à authenticated/service_role).
- **Garde cross-tenant.** `20260623000000_secdef_cross_tenant_guard.sql` + `assert_tenant_member(uuid)`.
- **Anti-escalade de privilège.** `20260420000001_block_super_admin_escalation.sql` et `20260420000003_lock_admin_privilege_columns.sql`: empêchent un membre de se hisser `super_admin` via `admin_users`.
- **PII restreinte pour anon.** `20260506155500_restrict_anon_pii_columns.sql`.
- **RLS tenants resserrée.** `20260330000000_tighten_tenants_rls.sql` (RPC `get_tenant_by_slug` / `get_tenant_public_by_id` exposées en lecture publique contrôlée).

C'est un niveau de durcissement RLS rare pour un projet vibe-codé.

---

## 4. Findings réels (code et schéma Attabl)

### 4.1 MEDIUM (à vérifier sur la base live) — intégrité des prix en défense unique

La vérification de prix est faite dans la couche service: `order.service.ts` charge `menu_items.price`, `item_price_variants.price` et les prix de modifiers depuis la DB, calcule `expectedPrice`, et lève `VALIDATION` si `Math.abs(item.price - expectedPrice) > 1` (ligne 236). La route `orders/route.ts` utilise `createAdminClient()` (service_role) APRES cette validation. Bon.

Mais la fonction DB `create_order_with_items` (migration `20260516140000_p1_table_lock_payment_stock.sql`, SECURITY DEFINER) insère `price_at_order = COALESCE((v_item->>'price_at_order')::numeric, 0)` SANS revalider le prix contre `menu_items`. L'intégrité repose donc entièrement sur le passage par le service.

Risque résiduel: si `create_order_with_items` reste exécutable par `anon`/`authenticated` en RPC direct (`/rest/v1/rpc/create_order_with_items`), un client pourrait contourner le service et soumettre un `price_at_order` arbitraire (sous-paiement). Je n'ai pas pu confirmer le GRANT sur la base live (non connectée).

Action:

1. Sur la base live, vérifier les droits EXECUTE:
   ```sql
   select has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='create_order_with_items';
   ```
2. Si `anon_exec`/`auth_exec` = true et que la création passe toujours par la route service_role: `REVOKE EXECUTE ... FROM anon, authenticated` (laisser `service_role`).
3. Défense en profondeur recommandée: revalider le prix DANS la fonction (comme le fait RadissonMenu, qui lève `price_mismatch`), pour ne pas dépendre uniquement de la couche applicative.

### 4.2 MEDIUM — base live non auditée en direct

Impossible de lancer les advisors et `rls_coverage.sql` sur `nqufpobuozrzwpeijkxt` (non connectée). Les migrations sont bonnes, mais l'état réellement déployé (drift, policies manuelles, auth config) n'est pas prouvé.

Action: connecter `nqufpobuozrzwpeijkxt` à l'intégration Supabase, relancer `get_advisors` (security + performance) et `security/scripts/rls_coverage.sql`. Vérifier l'auth: protection mots de passe fuités activée, MFA, URLs de redirection.

### 4.3 LOW — RadissonMenu (projet séparé) à décommissionner ou corriger

Le projet `gjlztittszelfjubbksy` (RadissonMenu) a, lui, des fonctions SECDEF exposées à anon (`is_admin()`, `handle_new_user()`) et la protection mots de passe désactivée. S'il est encore en ligne avec des données, soit le corriger:

```sql
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
```

soit le mettre en pause / supprimer s'il est abandonné (réduction de surface d'attaque). Note positive: sur RadissonMenu, `create_order` valide le prix en interne (`price_mismatch`).

### 4.4 INFO — confirmés OK (rien à faire)

Secrets non commités; service_role en `server-only`; Next.js 16.2.9 (hors CVE-2025-29927); webhook Stripe (signature + idempotence + rollback); prix checkout via price IDs serveur; les 2 `dangerouslySetInnerHTML` n'injectent que du CSS (thème shadcn, keyframes statiques); routes `/api/dev` gardées par NODE_ENV; aucun gros artefact (`ruvector.db`, `*.tsbuildinfo`) suivi par git.

---

## 5. Limite d'exécution (transparence)

Les scanners externes (semgrep, detect-secrets, gitleaks, trivy) n'ont PAS pu tourner dans mon environnement: le bac à sable n'autorise pas l'installation de paquets pip (et `pnpm` est absent), même si le réseau npm répond. J'ai compensé par une revue manuelle + regex + audit du schéma, ce qui couvre les mêmes classes de failles, mais ne remplace pas un passage SAST complet.

Ces scanners doivent tourner sur ta machine, où tout est installé. Une commande:

```bash
bash security/scripts/security-scan.sh
```

Et la revue cadrée dans Claude Code:

```
/security-audit
```

---

## 6. Couverture vs "80% des failles du vibe coding"

| Classe de faille vibe coding     | État Attabl                                    |
| -------------------------------- | ---------------------------------------------- |
| Secrets hardcodés / exposés      | Couvert (clean)                                |
| service_role / clés côté client  | Couvert (clean)                                |
| RLS absente / permissive         | Couvert (schéma durci; à prouver live)         |
| BOLA / IDOR (autorisation objet) | Couvert (routes vérifiées)                     |
| Webhooks non vérifiés            | Couvert (Stripe OK)                            |
| Manipulation de prix             | Couvert au niveau service; durcir la RPC (4.1) |
| Headers / CSP / clickjacking     | Couvert                                        |
| XSS (innerHTML)                  | Couvert (CSS only)                             |
| CVE dépendances (Next, libs)     | À exécuter en local (pnpm audit / osv)         |
| SAST patterns (injection, SSRF)  | Partiel; semgrep à lancer en local             |
| Auth (MFA, mots de passe fuités) | À vérifier sur la base live                    |

Estimation: les classes structurelles (secrets, RLS, BOLA, paiements, headers) sont couvertes côté code et schéma. Les 20% restants sont opérationnels: connecter la vraie base pour les advisors, lancer les scanners deps/SAST en local, et durcir la RPC de commande.

---

## 7. Actions prioritaires

1. Connecter `nqufpobuozrzwpeijkxt` à l'intégration Supabase, lancer advisors + `rls_coverage.sql`. (preuve de l'état live)
2. Vérifier/retirer l'EXECUTE anon sur `create_order_with_items` + revalider le prix dans la fonction (4.1).
3. Sur la base live: activer la protection mots de passe fuités, vérifier MFA et URLs de redirection.
4. En local: `bash security/scripts/security-scan.sh` puis corriger les findings deps/SAST.
5. RadissonMenu: corriger (REVOKE) ou décommissionner (4.3).
6. Brancher gitleaks en pre-commit et le workflow CI sécurité (modèles dans `02-BOITE-A-OUTILS-CLAUDE-CODE.md`).

Aucune de ces actions n'a été appliquée automatiquement: elles touchent la base de production ou la config, et tu as demandé de ne rien casser. Dis-moi lesquelles tu veux que je prenne en charge (ex: je peux préparer les migrations SQL en fichier, prêtes à relire, sans les exécuter).

---

## 8. Suivi d'execution (2026-06-28, session de correction)

Decisions utilisateur: appliquer le fix RPC en prod, accepter+documenter xlsx, verifier BOLA en direct.

### 8.1 RPC create_order_with_items (finding 4.1) - CORRIGE + APPLIQUE EN PROD

- Verifie en direct sur `nqufpobuozrzwpeijkxt`: la fonction etait `SECURITY INVOKER`, signature unique, et `anon_exec=true, auth_exec=true, svc_exec=true` (PUBLIC avait EXECUTE par defaut). Vulnerabilite confirmee: un client pouvait appeler `/rest/v1/rpc/create_order_with_items` avec un `price_at_order` arbitraire (sous-paiement).
- Seul appelant legitime: `src/services/order.service.ts:432`, construit avec `createAdminClient()` (service_role) dans `src/app/api/orders/route.ts:89-90`, APRES la verif prix serveur (order.service.ts ligne ~236).
- Correctif: migration `supabase/migrations/20260628000000_revoke_create_order_rpc_public_exec.sql` = `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role`. Additive, n'affecte pas le code deploye (il passe par service_role).
- Applique en prod via MCP `apply_migration`. Re-verifie apres: `anon_exec=false, auth_exec=false, svc_exec=true`. Vecteur ferme. Aucune donnee modifiee. Rollback documente en tete de la migration.

### 8.2 BOLA / isolation cross-tenant - VERIFIE EN DIRECT (prod)

- Les 6 routes dynamiques sensibles (orders/claim, pay-wave, pay-orange-money, assignments DELETE, invitations DELETE, invitations resend) ont ete relues: chacune resout le tenant via le slug injecte par le middleware (non spoofable par le client) puis scope la ressource par `.eq('tenant_id', <tenant de la session>)`.
- Preuve live (prod, vrais ids cross-tenant, lecture seule, predicat exact des routes orders):
  - tenant A tente l'order de B: `0` ligne -> 404
  - tenant B tente l'order de A: `0` ligne -> 404
  - chacun sur le sien: `1` ligne (OK, pas de regression)
- assignments / invitations: `0` ligne en prod; isolation par construction (le lookup de l'`admin_users` appelant est scope au `tenant_id` de la ressource -> 403).
- Detail des statuts: pay-\* et invitations renvoient 404/403; orders/claim et assignments DELETE filtrent la mutation par tenant -> un id cross-tenant est un no-op (0 ligne) BOLA-safe meme si HTTP 200. Le template `security/generated-tests/security-bola.spec.ts` a ete annote en consequence et reste pret a derouler (en dev, bypass Turnstile actif). Aucune donnee de test seedee en prod.

### 8.3 xlsx 0.18.5 (deps) - ACCEPTE + DOCUMENTE

- `pnpm audit`: 23 high / 27 moderate / 5 low. 21 des "high" sont des deps de build/test (vite, rollup, happy-dom, babel, minimatch, tar, flatted, ws) - pas de surface runtime.
- xlsx 0.18.5 (prototype pollution + ReDoS) est la seule dep runtime notable (utilisee dans `src/app/api/menu-import/route.ts`). Pas de patch sur le registre npm (sheetjs a quitte npm).
- Risque contenu par les gardes existantes de la route: auth obligatoire (`getAuthenticatedUserWithTenant`), tenant derive de la session, CSRF (`verifyOrigin`), rate-limit (`excelImportLimiter`), plafond 5 Mo, validation extension+MIME, verif que le menu cible appartient au tenant. La surface non authentifiee est nulle.
- Decision: accepte tel quel pour l'instant. Reste residuel: un membre authentifie d'un tenant pourrait DoS via un xlsx forge (limite par taille+rate-limit). Si on veut fermer: migrer vers un fork maintenu de sheetjs (changement plus lourd, a tester sur menu-import + generation de template).

### 8.4 Faux positifs confirmes (rien a faire)

- "SSRF" `api/supports/export`: la route a une allowlist de hostnames (`ALLOWED_IMAGE_HOSTS`) et n'utilise que `tenant.logo_url` derive de la session, pas d'input utilisateur. Sain.
- `dangerouslySetInnerHTML`: CSS statique uniquement. Next 16.2.9: hors CVE-2025-29927.

---

## 9. Advisors live + rls_coverage executes sur la prod (2026-06-28)

La base `nqufpobuozrzwpeijkxt` (attabl-saas-production, Postgres 17.6) est accessible via l'integration MCP. `get_advisors` (security + performance) et les requetes `rls_coverage.sql` ont tourne EN DIRECT.

### 9.1 rls_coverage - RESULTAT SAIN

- **0 table sans RLS** dans `public` (toutes ont RLS active).
- Tables RLS-active SANS policy (verrouillees, lecture/ecriture impossibles hors service_role): `platform_audit_log`, `stripe_events`. INTENTIONNEL (ecrites par service_role/webhooks, jamais lues par anon/authenticated). Secure-by-default, rien a faire.
- Policies d'ecriture reellement permissives (`WITH CHECK (true)`): UNE seule, `newsletter_subscriber / Enable insert for public` (INSERT). By-design (formulaire newsletter public), rate-limite cote app. Les 3 autres remontees par le grep large (`categories`, `menu_items`, `dish_photo_drafts`) sont des faux positifs (le mot "true" apparait dans une expression de tenant, pas un `USING/CHECK (true)`; l'advisor precis ne les flag pas).

### 9.2 Advisors securite - aucun nouveau vecteur cross-tenant

- ~30 WARN "anon/authenticated peut executer une fonction SECURITY DEFINER". Triage:
  - **Helpers RLS** (`get_my_tenant_ids`, `get_my_tenant_ids_array`, `is_super_admin`, `assert_tenant_member`, `prevent_super_admin_elevation`): DOIVENT rester executables par anon/authenticated, sinon l'evaluation RLS casse. Ne PAS revoquer.
  - **RPC publiques voulues** (`get_tenant_by_slug`, `get_tenant_public_by_id`, `get_orders_for_tracking`, `get_co_ordered_items`, `increment_menu_item_favorites`, `broadcast_order_status`): verifiees - `get_orders_for_tracking` et `get_co_ordered_items` scopent par `tenant_id = p_tenant_id`, exigent des UUID connus, et n'exposent PAS de PII (pas de customer_name/phone). Sain.
  - **RPC analytics/stock authenticated** (`get_daily_revenue`, `get_order_summary`, `get_top_items`, `get_owner_dashboard`, `get_stock_status`, `adjust_ingredient_stock`, `set_opening_stock`, `claim_coupon_usage`, `unclaim_coupon_usage`, `increment_login_count`): TOUTES ont un garde de membership interne (`assert_tenant_member` / `get_my_tenant_ids` / `is_super_admin` / `auth.uid()`) - verifie en lisant chaque corps. Pas de fuite cross-tenant via param `p_tenant_id`.
- INFO `rls_enabled_no_policy`: `platform_audit_log`, `stripe_events` (cf 9.1).
- WARN `newsletter_subscriber` always-true insert (cf 9.1, by-design).
- WARN `public_bucket_allows_listing` sur le bucket `qr-designs`: policy SELECT large -> un client peut LISTER les fichiers du bucket. Expose au pire des noms de fichiers de QR designs. Mineur. A durcir si besoin: retirer la policy de listing, garder l'acces par URL d'objet.
- **WARN `auth_leaked_password_protection` DESACTIVE**: reel, a activer (cf 9.4).

### 9.3 Advisors performance - 418 lints, 0 ERROR (hors-scope securite)

Pur tuning, non bloquant, non securite: 302 `multiple_permissive_policies` (policies qui se chevauchent -> surcout d'eval), 62 `auth_rls_initplan` (`auth.uid()` re-evalue par ligne -> a wrapper en `(select auth.uid())`), 34 `unused_index`, 16 `unindexed_foreign_keys`, 4 `duplicate_index`. A traiter dans un chantier perf dedie (n'affecte pas la securite ni la correction, seulement la vitesse a l'echelle).

### 9.4 Leaked password protection + MFA - ACTION DASHBOARD REQUISE (non scriptable ici)

Ce sont des reglages GoTrue (auth), pas du SQL: l'integration MCP Supabase n'expose aucun outil de config auth, donc je ne peux PAS les activer depuis ici. A faire dans le dashboard:

- Leaked password protection: Authentication > Sign In / Providers > Password -> activer "Leaked password protection" (verifie via HaveIBeenPwned).
- MFA: Authentication > Multi-Factor -> activer TOTP (et/ou WebAuthn).
- Tant qu'a faire (recommande par l'audit initial): verifier les Redirect URLs (Authentication > URL Configuration) = uniquement les domaines attabl attendus.

### 9.5 RadissonMenu (gjlztittszelfjubbksy) - INACCESSIBLE depuis ce token MCP

`list_projects` ne retourne que `attabl-saas-production`. RadissonMenu est dans une autre organisation non connectee a ce token (tentative d'`execute_sql` -> "You do not have permission"). Je ne peux donc PAS y appliquer le REVOKE depuis ici. C'est un projet SEPARE, encore EN PRODUCTION (app BLU TABLE servie sur theblutable.com) - donc NE PAS decommissionner.

A faire avec un acces a ce projet (dashboard SQL editor ou MCP connecte a son org). ATTENTION: `is_admin()` est probablement reference dans des policies RLS de RadissonMenu - si on `REVOKE EXECUTE ... FROM authenticated`, l'evaluation RLS casse (permission denied for function). Procedure sure:

```sql
-- 1) handle_new_user: fonction de trigger sur auth.users -> le REVOKE est SANS risque
--    (un trigger SECURITY DEFINER s'execute sans que l'appelant ait besoin d'EXECUTE).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;

-- 2) is_admin: VERIFIER d'abord s'il est utilise dans des policies AVANT de revoquer.
select pol.tablename, pol.policyname, pol.cmd
from pg_policies pol
where pol.schemaname='public'
  and (coalesce(pol.qual,'') ilike '%is_admin%' or coalesce(pol.with_check,'') ilike '%is_admin%');
--    - Si AUCUNE ligne -> REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, authenticated, PUBLIC;
--    - Si is_admin est utilise dans des policies -> NE PAS revoquer authenticated (ca casserait la RLS).
--      Au mieux: durcir le search_path de la fonction et la laisser, ou la passer SECURITY INVOKER
--      apres avoir verifie qu'elle n'a pas besoin du definer. is_admin() sans args lu par anon
--      renvoie de toute facon false (pas d'utilisateur) -> exposition reelle quasi nulle.
```

### 9.6 Bilan de la session ops

| Item demande                                          | Etat                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Advisors (security + perf) + rls_coverage sur la prod | FAIT (rien de critique; net = leaked-pw + MFA + bucket listing mineur)              |
| Activer leaked password protection + MFA              | FAIT cote dashboard (voir 9.7) - HIBP bloque (plan Pro), MFA deja actif             |
| RadissonMenu REVOKE / decommission                    | BLOQUE ici (projet hors token MCP) -> SQL sur en 9.5, ne pas decommissionner (live) |

### 9.7 Reglages auth appliques au dashboard (2026-06-28, par l'utilisateur sur nqufpobuozrzwpeijkxt)

L'utilisateur a traite les 3 points directement dans le dashboard Supabase du projet Attabl prod.

- **Leaked password protection (HIBP)**: NON activable - reserve au **plan Pro et +** (erreur Supabase: "Configuring leaked password protection via HaveIBeenPwned.org is available on Pro Plans and up"). Toggle laisse OFF. A revisiter si upgrade Pro.
- **Compensation appliquee + sauvegardee** (mitigation forte sans HIBP): **Minimum password length 6 -> 12**; **Password requirements**: "No required characters" -> **"Lowercase, uppercase letters, digits and symbols"**. Bon controle compensatoire contre le credential-stuffing.
- **MFA TOTP**: deja **Enabled** - rien a faire.
- **URL Configuration (Redirect URLs) - 1 finding REEL**: l'allowlist contenait `https://*.vercel.app/auth/callback` = **wildcard ouvert sur tout le namespace vercel.app** -> n'importe quel projet Vercel d'un attaquant peut recevoir un callback OAuth (interception de code d'auth -> prise de compte). A SUPPRIMER.
  - Prod sert sur le domaine custom **attabl.com** (NEXT_PUBLIC_APP_URL), couvert par `https://attabl.com/auth/callback` + `https://*.attabl.com/auth/callback`. Le `*.vercel.app` n'est PAS necessaire en prod.
  - Remplacement si besoin de se connecter via l'URL Vercel: l'alias propre du projet `https://attabl-saas.vercel.app/auth/callback` (projet Vercel `attabl-saas`, team `team_dnfIixBQWI1oNxE83sE1R2ia`). Pour OAuth sur previews: scoper a `https://attabl-saas-*.vercel.app/auth/callback` (prefixe du projet), jamais `*.vercel.app`.
  - `http://localhost:3000/auth/callback`: risque faible (loopback = machine du dev, pas joignable par un attaquant). A garder pour le dev ou retirer en posture stricte.
  - Note: les Redirect URLs sont de la config auth GoTrue - pas d'outil MCP/SQL, modif dashboard uniquement.
