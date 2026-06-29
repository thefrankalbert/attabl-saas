# Re-verification: execution du PLAN-CLAUDE-CODE par Claude Code

Date: 2026-06-29. Mode: lecture seule, aucune modification. HEAD verifie: `95d8cf2`.
Compare a: `PLAN-CLAUDE-CODE.md` (taches T1 a T9).

## Verdict en une ligne

Tres bon travail. Claude Code a fait l'essentiel du plan, a EXECUTE le harnais (preuve: `test-results/.last-run.json` = `status: passed`, 0 echec) et a meme ajoute un runner 100% local. Restent 3 ecarts reels (BOLA non integre, T3 partiel, T5 Stripe partiel) et 2 nettoyages mineurs. Detail et instructions correctives: `PLAN-2-CLAUDE-CODE.md`.

## Preuves d'execution (pas seulement du code ecrit)

- `test-results/.last-run.json`: `{"status":"passed","failedTests":[]}`. Le harnais a reellement tourne et passe.
- Rapport HTML genere: `tests/journeys/playwright-report-journeys/index.html`.
- Runner local: `scripts/run-journeys-local.sh` (charge `tests/journeys/fixtures/schema.sql`, snapshot prod de 42 tables / 4853 lignes, puis applique seulement les migrations recentes; tout en local, cle service_role locale, zero ecriture prod).
- `eslint tests/journeys` = exit 0. `tsconfig.json` inclut `**/*.ts` (donc `pnpm typecheck` couvre le harnais).
- Commits: `d150e88` (harnais full-day + runner + hardening), `2976418` / `95d8cf2` (retrait mobile money).

## Statut par tache du plan

| Tache | Sujet                                                    | Statut   | Preuve                                                                                                                                                                        |
| ----- | -------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1    | Seed donnees de service                                  | FAIT     | `seed.ts`: `seedTenantWithMenu()` (tenant, menu, categorie, menu_item) + `seedStaffForTenant()` (admin_users + roles), teardown FK-aware (purge order_items avant menu_items) |
| T2    | Commande happy-path + manipulation de prix               | FAIT     | `04`: commande valide -> 200/201; prix baisse de 1000 -> rejet                                                                                                                |
| T3    | Configuration (menu/tables/coupons)                      | PARTIEL  | menu seede + visibilite testee via `/api/menu-search`; creation tables/zones + coupon: encore `test.skip`                                                                     |
| T4    | Permissions par role                                     | FAIT     | `03`: manager authentifie refuse sur `/api/admin/reset` (jamais 200; 401/403)                                                                                                 |
| T5    | Abonnement: webhook (01) + cycle de vie (06)             | PARTIEL  | checkout appele (gated Stripe); activation par webhook = TODO; `06` cree+avance une Test Clock mais ne l'attache pas a un abonnement et n'asserte pas le renouvellement       |
| T6    | Paiements (cash)                                         | FAIT     | `04`: POS cash -> `payment_status = paid` asserte. Mobile money RETIRE du produit (decision, `docs/MOBILE-MONEY-RETRAIT.md`) - hors scope, normal                             |
| T7    | KDS temps reel                                           | PARTIEL  | `04`: routage POS -> cuisine teste cote API; l'assertion realtime via broadcast navigateur n'est pas faite                                                                    |
| T8    | Integrer le test BOLA                                    | NON FAIT | toujours dans `security/generated-tests/security-bola.spec.ts`; `07` le laisse en `test.skip`, pas de `tests/journeys/08-bola.spec.ts`                                        |
| T9    | Optionnel (revalidation prix in-DB, gitleaks pre-commit) | NON FAIT | aucune migration `price_mismatch`; pas de gitleaks dans `.husky/pre-commit` (la CI couvre deja les secrets)                                                                   |

## Ce qui tourne reellement (selon le design conditionnel)

- Sans base de test: preflight, signup+login, commande vide rejetee, coupon invalide, rate limit, refus d'action non authentifiee.
- Avec base de test (runner local ou staging): T1, T2, T4, T6, visibilite menu (T3 partiel), routage cuisine (T7 partiel).
- Avec cle Stripe `sk_test_`: checkout (T5 partiel).

Les nombreux `test.skip(!hasSeedEnv(), ...)` ne sont PAS des trous: ce sont des skips CONDITIONNELS corrects. Avec le runner local, ils s'executent.

## Ecarts reels a corriger (resume)

1. T8 - BOLA pas integre au harnais (le test de securite #1 ne tourne pas en suite).
2. T3 - creation tables/zones + coupon: encore en TODO.
3. T5 - activation abonnement par webhook + cycle de vie reel (rattacher la Test Clock a un abonnement, asserter renouvellement/echec/annulation).
4. T7 - assertion realtime KDS (broadcast) cote navigateur, au-dela du routage API.
5. Nettoyage: le test "manipulation de prix" de `07` et le test cash de `05` font doublon avec `04` -> les pointer vers `04` ou les retirer.

## Encore hors-code (dashboard / live, toujours ouvert)

- Connecter le vrai projet Supabase `nqufpobuozrzwpeijkxt` a l'integration et lancer les advisors live + `security/scripts/rls_coverage.sql`.
- Activer "Leaked password protection" (Supabase Auth), verifier MFA + URLs de redirection.

## Conclusion

Le plan est execute a ~80% avec une vraie preuve d'execution (suite verte) et un bonus de qualite (runner local reproductible). Les 5 ecarts ci-dessus sont cadres dans `PLAN-2-CLAUDE-CODE.md`, pret a etre donne a Claude Code. Apres ca, le harnais couvrira la journee complete de bout en bout et on pourra passer au test LIVE.
