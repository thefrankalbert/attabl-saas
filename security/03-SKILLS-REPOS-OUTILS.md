# Skills, repos et outils sécurité à installer — Attabl

Sélection ciblée pour un SaaS vibe-codé Supabase/Vercel/Stripe. Priorité: ce qui détecte automatiquement les failles que l'IA introduit (secrets, BOLA, RLS, deps). Gratuit/open-source d'abord.

---

## 1. Skills (Claude Code / Cowork)

- **`security-review`** (skill Anthropic, déjà disponible dans cet environnement). Revue de sécurité d'un diff/PR. Lance-le avant chaque merge. C'est le plus rentable au quotidien.
- **`.claude/skills/security-pentest`** — déjà présent dans ton repo. À garder et à brancher sur le plan BOLA.
- **`skill-creator`** (Anthropic) — pour transformer ta checklist en skill maison réutilisable (ex: un skill "attabl-security" qui encode tes règles).
- **Supabase agent skills** — guidance officielle dev/sécurité Supabase: `npx skills add supabase/agent-skills` (réf doc Supabase AI skills). Utile pour RLS et migrations sûres.
- Le slash command **`/security-audit`** (créé dans `.claude/commands/`) joue déjà le rôle d'un skill d'audit cadré.

## 2. MCP / connecteurs

- **Supabase MCP** (déjà connecté). Outil clé: `get_advisors` (sécurité + perf). À relancer après chaque migration. C'est lui qui a remonté les fonctions SECURITY DEFINER exposées.
- **Vercel MCP** (déjà connecté). Pour vérifier déploiements, env, logs runtime.
- **Stripe CLI** (pas un MCP, mais indispensable): `stripe listen` pour rejouer/tester les webhooks en local, `stripe trigger` pour simuler les events d'échec/annulation.

Note: le registre de connecteurs n'expose pas (à ce jour) de SAST dédié type Snyk/Semgrep en MCP one-click. On passe donc par les CLI ci-dessous, branchées en CI.

## 3. Outils open-source à installer (le cœur)

| Outil           | Détecte                                         | Installation               | Commande type                           |
| --------------- | ----------------------------------------------- | -------------------------- | --------------------------------------- |
| **gitleaks**    | secrets commités/stagés                         | `brew install gitleaks`    | `gitleaks detect --redact -v`           |
| **trufflehog**  | secrets + vérif de validité                     | `brew install trufflehog`  | `trufflehog filesystem .`               |
| **semgrep**     | SAST (BOLA, injection, XSS, Next/React)         | `brew install semgrep`     | `semgrep --config p/owasp-top-ten src/` |
| **osv-scanner** | deps vulnérables (lockfile)                     | `brew install osv-scanner` | `osv-scanner --lockfile=pnpm-lock.yaml` |
| **pnpm audit**  | deps vulnérables                                | inclus                     | `pnpm audit --audit-level=high`         |
| **Trivy**       | deps + IaC + conteneurs + secrets               | `brew install trivy`       | `trivy fs .`                            |
| **OWASP ZAP**   | DAST (scan dynamique du site déployé)           | `brew install --cask zap`  | scan de l'URL de staging                |
| **Nuclei**      | scan de vulnérabilités/exposition par templates | `brew install nuclei`      | `nuclei -u https://staging.attabl...`   |

Tout est déjà câblé dans `security/scripts/security-scan.sh` (lance ce qui est installé, ignore le reste).

## 4. Services web (gratuits, zéro install)

- **securityheaders.com** — note tes en-têtes HTTP (vise ≥ A).
- **Mozilla Observatory** (developer.mozilla.org/observatory) — audit headers/CSP/TLS.
- **Supabase Dashboard > Advisors** — équivalent UI de `get_advisors`.
- Scanners commerciaux spécialisés "vibe coding" (optionnels, pour aller plus loin): **Escape.tech**, **vibeappscanner.com** — pensés pour les apps Supabase/Next générées par IA.

## 5. Repos GitHub de référence (à lire/forker)

- **OWASP Cheat Sheet Series** — github.com/OWASP/CheatSheetSeries (Auth, Node.js, REST, Secrets Management).
- **OWASP ASVS** — github.com/OWASP/ASVS (standard de vérification, sert de checklist exhaustive).
- **OWASP API Security Top 10** — github.com/OWASP/API-Security (BOLA et co., ton risque #1).
- **OWASP GenAI / LLM Top 10** — genai.owasp.org (pour la partie `@anthropic-ai/sdk`).
- **semgrep-rules** — github.com/semgrep/semgrep-rules (règles JS/TS/React/Next à étendre).
- **gitleaks** — github.com/gitleaks/gitleaks. **trufflehog** — github.com/trufflesecurity/trufflehog.
- **osv-scanner** — github.com/google/osv-scanner. **Trivy** — github.com/aquasecurity/trivy.
- **OWASP ZAP** — github.com/zaproxy/zaproxy. **Nuclei** — github.com/projectdiscovery/nuclei.

## 6. Ordre d'installation conseillé (30 min)

1. `brew install gitleaks semgrep osv-scanner trivy` (les 4 essentiels).
2. Installer Stripe CLI (`brew install stripe/stripe-cli/stripe`).
3. Brancher gitleaks en pre-commit (husky) et semgrep+audit en CI (modèles dans `02-BOITE-A-OUTILS-CLAUDE-CODE.md`).
4. Lancer `bash security/scripts/security-scan.sh`, corriger ce qui sort.
5. Activer le skill `security-review` avant chaque merge.

Une fois ces 5 étapes faites, 80% des failles typiques du vibe coding sont attrapées automatiquement, et le reste (BOLA, RLS, logique métier) est couvert par le plan de tests.
