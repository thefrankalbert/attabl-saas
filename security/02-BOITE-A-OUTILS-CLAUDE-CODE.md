# Boîte à outils Claude Code — tester la sécurité d'Attabl en continu

Tout est prêt à coller dans Claude Code, dans ce repo. Trois usages: (1) scanner en une commande, (2) lancer des revues ciblées par prompt, (3) automatiser via slash command et pre-commit.

---

## 1. Scan en une commande

```bash
bash security/scripts/security-scan.sh
```

Lance: gitleaks (secrets), pnpm audit (deps), osv-scanner, semgrep (SAST), grep de patterns dangereux, et un rappel des checks manuels. Voir le script pour le détail. Installe ce qui manque avec:

```bash
# macOS (brew)
brew install gitleaks semgrep
# osv-scanner
brew install osv-scanner
# (alternatives sans brew)
pipx install semgrep
```

## 2. Slash command Claude Code

Un fichier `.claude/commands/security-audit.md` a été créé. Dans Claude Code, tape:

```
/security-audit
```

Claude relit la checklist, scanne le diff/les routes, et remonte les écarts classés par gravité. Variante ciblée:

```
/security-audit les routes de paiement
/security-audit la couverture RLS
```

## 3. Prompts prêts à l'emploi

Copie-colle dans Claude Code. Chacun est cadré pour éviter les réponses vagues.

### Prompt — Audit BOLA / autorisation (le plus important)

```
Audite l'autorisation au niveau objet (BOLA, OWASP API1:2023) sur toutes les routes
de src/app/api. Pour chaque route qui reçoit un id, slug ou tenant dans l'URL ou le body:
1. Vérifie que le handler contrôle que l'objet appartient au tenant/user courant,
   PAS seulement que l'user est authentifié.
2. Liste les routes où ce contrôle manque ou repose uniquement sur le middleware/proxy.
3. Propose le correctif (vérif d'ownership côté requête + policy RLS correspondante).
Rends un tableau: route | méthode | contrôle present (oui/non) | risque | correctif.
Ne te contente pas du middleware: la vraie défense est dans la route et la RLS.
```

### Prompt — Revue RLS Supabase

```
Lis les migrations dans supabase/ et la liste des tables. Pour chaque table du schéma public:
- RLS activée ? policies SELECT/INSERT/UPDATE/DELETE présentes et isolées par tenant ?
- Une policy laisse-t-elle passer du cross-tenant (USING (true), oubli de tenant_id) ?
Liste les tables à risque et écris les policies SQL corrigées. Vérifie aussi les fonctions
SECURITY DEFINER exposées en RPC à anon/authenticated et propose les REVOKE EXECUTE.
```

### Prompt — Revue webhook & paiements

```
Relis src/app/api/webhooks/stripe/route.ts et les routes create-checkout-session,
create-embedded-checkout, update-subscription, verify-checkout. Vérifie:
1. Montants/prix déterminés côté serveur, jamais lus depuis le body client.
2. Signature vérifiée + idempotence (déjà en place: confirme).
3. Gestion des events d'échec/annulation/downgrade.
4. Aucune action métier déclenchée avant la vérif de signature.
Remonte tout écart avec le numéro de ligne et le correctif.
```

### Prompt — Chasse aux secrets et config dangereuse

```
Cherche dans tout le repo (hors node_modules): clés API en dur, tokens, mots de passe,
URLs de connexion, usages de service_role hors code serveur, variables NEXT_PUBLIC_
contenant un secret, et flags de bypass (auth, turnstile, honeypot) non gardés par
NODE_ENV. Pour chaque trouvaille: fichier, ligne, gravité, correctif.
```

### Prompt — Revue d'un diff avant commit

```
Joue le rôle d'un reviewer sécurité senior. Sur le diff git stagé, applique la checklist
security/01-CHECKLIST-ET-PLAN-DE-TESTS.md. Bloque (et explique) si tu vois: secret,
route sans authz d'objet, input non validé, RLS manquante, header retiré, montant client
de confiance, dangerouslySetInnerHTML non sanitisé. Sinon valide.
```

### Prompt — Test BOLA automatisé (génère un test e2e)

```
Génère un test Playwright (tests/e2e/security-bola.spec.ts) qui:
- crée/charge deux comptes de tenants différents (A et B),
- tente d'accéder aux ressources de B avec la session de A sur les routes orders,
  menus, items, restaurants, invoices,
- échoue le test si une réponse renvoie la donnée de B (attendu 403/404).
Utilise les helpers de test existants si présents.
```

---

## 4. Hook pre-commit (déjà husky en place)

Ajoute un garde secrets au pre-commit. Dans `.husky/pre-commit`:

```bash
# secrets
gitleaks protect --staged --redact -v || { echo "Secret détecté, commit bloqué"; exit 1; }
```

## 5. CI GitHub Actions (scan à chaque PR)

Crée `.github/workflows/security.yml`:

```yaml
name: security
on: [pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: gitleaks
        uses: gitleaks/gitleaks-action@v2
      - name: semgrep
        uses: semgrep/semgrep-action@v1
        with: { config: p/owasp-top-ten p/javascript p/typescript p/nextjs p/react }
      - name: deps audit
        run: corepack pnpm i --frozen-lockfile && pnpm audit --audit-level=high || true
```

## 6. Rythme recommandé

- À chaque commit: husky + gitleaks (auto).
- À chaque PR: workflow CI (semgrep + audit).
- Chaque semaine: `bash security/scripts/security-scan.sh` + `/security-audit`.
- Après toute migration Supabase: relancer les advisors (`get_advisors` via MCP Supabase, ou Dashboard > Advisors).
- Avant chaque release: dérouler la checklist sections A-F + plan BOLA.
