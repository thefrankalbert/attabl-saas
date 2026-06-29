# Verification: ce que Claude Code a implemente (vs documentation)

Date: 2026-06-28. Mode: lecture seule, aucune modification. Etat verifie au commit `35ff4ce`.
Sources comparees: `AUDIT-EXECUTION-REPORT.md`, `01-CHECKLIST-ET-PLAN-DE-TESTS.md`, `02-BOITE-A-OUTILS-CLAUDE-CODE.md`, `tests/journeys/`.

## Verdict en une ligne

Le correctif de securite reel (le seul MEDIUM exploitable) est FAIT et bien fait. Les portes CI securite sont en place. Le garde-fou anti-prod du harnais est meme renforce. En revanche, la simulation "journee complete" de bout en bout n'est PAS terminee: les parcours metiers restent en `test.skip` (squelette). Voir le plan: `PLAN-CLAUDE-CODE.md`.

## FAIT (verifie, avec preuve)

1. **Verrouillage RPC `create_order_with_items` (finding 4.1).** FAIT.
   - `supabase/migrations/20260628000000_revoke_create_order_rpc_public_exec.sql` et `20260628010000_order_idempotency_key.sql`: `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` puis `GRANT ... TO service_role` (sur l'ancienne et la nouvelle signature 21 args). La migration cite explicitement mon rapport. Le contournement direct par RPC (sous-paiement) est ferme. La creation passe deja par `service_role` apres la verif prix du service. Risque 4.1: clos.

2. **Portes CI securite.** FAIT (au-dela de la reco).
   - `.github/workflows/security.yml` avec 3 jobs: Semgrep (`p/default`, `p/nextjs`, `p/typescript`, `p/owasp-top-ten`), Dependency Audit (`pnpm audit --prod --audit-level=high`, bloquant), Secret Scanning (gitleaks via image Docker + `.gitleaks.toml`). Commit `f025568` indique les gates au vert.

3. **Garde-fou anti-prod du harnais.** FAIT et ameliore.
   - `tests/journeys/fixtures/global-setup.ts` (cable via `globalSetup` dans la config) appelle `assertNotProduction()` + `assertAppTargetIsTest()`. Ajouts de Claude Code: denylist des hotes app de prod (`attabl.com`, `attabl-saas.vercel.app`), confirmation obligatoire `JOURNEY_CONFIRM_TEST_DB=yes`, et garde hote-prod dans le script k6. Fail-closed: si mal configure, tout le run avorte. Meilleur que ma version.

4. **Durcissements bonus (non demandes dans mes docs, mais bons).**
   - RBAC server-side par route dans le middleware (#134, #136).
   - Broadcast scope par commande, fermeture du flux tenant-wide (#127, securite realtime).
   - Restauration `tenants.custom_domain` + durcissement `getTenant` (#126).
   - Idempotency key + outbox offline pour la creation de commande (PR1/PR2).
   - Console super-admin plateforme + soft-delete + audit log (#137, team FK #138).

5. **Qualite du harnais.** `eslint tests/journeys` = exit 0 (propre).

## PAS FAIT / PARTIEL (les ecarts)

1. **Simulation "journee complete" non operationnelle de bout en bout.** Les parcours restent en `test.skip`:
   - 01: activation abonnement apres webhook (skip).
   - 02: creation menu / tables / coupons (3 skip).
   - 03: permissions par rôle, happy-path (2 skip).
   - 04: commande convive reelle, KDS temps reel, encaissement POS (3 skip).
   - 05: paiements cash / Wave / Orange Money / echec (4 skip).
   - 06: rattachement abonnement + renouvellement / annulation via Test Clock (3 skip).
     Seuls tournent: preflight, signup+login, commande vide rejetee, coupon invalide, rate limit, refus action non authentifiee. C'est utile mais ce n'est pas encore "toute la journee".

2. **Revalidation du prix DANS la fonction `create_order_with_items`.** PAS fait (insere `price_at_order` verbatim). Acceptable car EXECUTE est limite a `service_role` et le service valide le prix avant. Reste un nice-to-have defense-en-profondeur (LOW).

3. **Test BOLA non integre.** Toujours dans `security/generated-tests/security-bola.spec.ts`, pas deplace dans `tests/`, pas renseigne avec de vrais ids cross-tenant, donc pas execute en suite.

4. **Seed de donnees.** `tests/journeys/fixtures/seed.ts` n'a pas de creation de menu/tables (necessaire pour les happy-paths 04).

5. **Hook gitleaks local (pre-commit).** Absent. Non bloquant: la CI scanne deja les secrets. Nice-to-have.

## NE PEUT PAS ETRE VERIFIE DEPUIS LE CODE (actions dashboard, encore OUVERTES)

- Connecter le vrai projet Supabase `nqufpobuozrzwpeijkxt` a l'integration pour lancer les advisors live + `security/scripts/rls_coverage.sql`.
- Activer "Leaked password protection" (Supabase Auth).
- Verifier MFA et la liste blanche des URLs de redirection.

Ces points doivent etre confirmes dans le dashboard Supabase et Stripe. Le code ne les expose pas.

## Conclusion

Cote securite, Claude Code a traite le point qui comptait (4.1) et a meme ajoute des durcissements. Cote "tests temps reel de toute la journee", il a securise et cable l'ossature mais n'a pas rempli les parcours metiers. Le plan `PLAN-CLAUDE-CODE.md` lui dit exactement quoi faire, dans l'ordre, avec criteres d'acceptation.
