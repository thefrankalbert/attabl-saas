#!/usr/bin/env bash
# Attabl security scan — exécute les scanners locaux et résume les écarts.
# Usage: bash security/scripts/security-scan.sh
# N'échoue pas le shell si un outil manque; il l'indique et continue.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
ROOT="$(pwd)"
echo "==================================================================="
echo " Attabl — scan sécurité  ($(date '+%Y-%m-%d %H:%M'))  repo: $ROOT"
echo "==================================================================="

have() { command -v "$1" >/dev/null 2>&1; }
section() { echo; echo "----- $1 -----"; }

section "1. Secrets (gitleaks)"
if have gitleaks; then
  gitleaks detect --source . --redact -v || echo ">> gitleaks a trouvé des secrets (voir ci-dessus)"
else
  echo "gitleaks absent. Installer: brew install gitleaks"
fi

section "2. Secrets commités dans l'historique (.env)"
if git rev-parse --git-dir >/dev/null 2>&1; then
  TRACKED=$(git ls-files | grep -iE '\.env' | grep -ivE '\.example$' || true)
  [ -z "$TRACKED" ] && echo "OK: aucun .env réel suivi par git" || { echo "!! Fichiers env suivis:"; echo "$TRACKED"; }
else
  echo "pas un repo git"
fi

section "3. Dépendances vulnérables (pnpm audit)"
if have pnpm; then
  pnpm audit --audit-level=high || echo ">> vulnérabilités high/critical à corriger"
else
  echo "pnpm absent — essaie: npm audit --audit-level=high"
fi

section "4. OSV scanner (lockfile)"
if have osv-scanner; then
  osv-scanner --lockfile=pnpm-lock.yaml || true
else
  echo "osv-scanner absent. Installer: brew install osv-scanner"
fi

section "5. SAST (semgrep, rulesets OWASP/Next/React)"
if have semgrep; then
  semgrep --quiet --config p/owasp-top-ten --config p/javascript --config p/typescript --config p/react --config p/nextjs src/ || true
else
  echo "semgrep absent. Installer: brew install semgrep  (ou pipx install semgrep)"
fi

section "6. Patterns dangereux (grep)"
echo "[service_role hors code serveur]"
grep -rniE 'SERVICE_ROLE|service_role' src/ 2>/dev/null | grep -ivE 'route\.ts|/api/|\.server\.|server-only|lib/supabase/admin|lib/admin|services/|lib/cache|lib/env' || echo "  OK"
echo "[NEXT_PUBLIC_ avec mot sensible]"
grep -rhoiE 'NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE|PRIVATE|TOKEN)[A-Z_]*' src/ .env* 2>/dev/null | sort -u || echo "  OK"
echo "[dangerouslySetInnerHTML]"
grep -rnE 'dangerouslySetInnerHTML' src/ 2>/dev/null || echo "  aucun"
echo "[flags bypass non gardes par NODE_ENV - inspecter manuellement]"
grep -rnE 'ALLOW_DEV_AUTH_BYPASS|AUTH_BYPASS|SKIP_AUTH' src/ 2>/dev/null || echo "  aucun"
echo "[fetch sur input potentiellement user - SSRF a verifier]"
grep -rnE 'fetch\(' src/app/api 2>/dev/null | grep -iE 'req|body|params|searchParams|input|url' | head -10 || echo "  rien d'evident"

section "7. Next.js patché (CVE-2025-29927 -> >= 15.2.3)"
node -e "try{console.log('next', require('./node_modules/next/package.json').version)}catch(e){console.log('next n/a')}"

section "8. Rappels manuels (non scriptables)"
cat <<'EOF'
  - Supabase advisors: Dashboard > Advisors  (ou MCP get_advisors) -> 0 warning
  - Supabase Auth: activer "Leaked password protection"
  - REVOKE EXECUTE sur is_admin() et handle_new_user()  (voir AUDIT-ATTABL-FINDINGS.md)
  - Vercel env: ALLOW_DEV_AUTH_BYPASS absent en Prod et Preview
  - Plan BOLA: dérouler 01-CHECKLIST-ET-PLAN-DE-TESTS.md
  - Headers externes: https://securityheaders.com  (cible >= A)
EOF
echo
echo "Scan terminé. Détail et correctifs: security/AUDIT-ATTABL-FINDINGS.md"
