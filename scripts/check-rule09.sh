#!/usr/bin/env bash
#
# check-rule09.sh - enforce .claude/rules/09-square-design.md
#
# Scans src/ for patterns forbidden by the Square-inspired design system:
#   - forbidden hardcoded colors (old lime/olive/UberEats accents)
#   - forbidden Tailwind radii (rounded-xl / 2xl / 3xl)
#   - forbidden font weights (font-medium / font-semibold)
#
# Exits 1 when any violation is found. shadcn/ui primitives are exempt
# (src/components/ui/**) - they keep their original tokens.
#
# Run locally: pnpm rule09:check
# Intended for CI pipeline (alongside typecheck / lint / test / build).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
RESET=$'\033[0m'

violations=0

check_pattern() {
  local label="$1"
  local pattern="$2"
  local extra_exclude="${3:-}"

  local matches
  if [ -n "$extra_exclude" ]; then
    matches=$(grep -rnE "$pattern" src --include='*.ts' --include='*.tsx' --include='*.css' 2>/dev/null \
      | grep -v 'src/components/ui/' \
      | grep -v "$extra_exclude" \
      || true)
  else
    matches=$(grep -rnE "$pattern" src --include='*.ts' --include='*.tsx' --include='*.css' 2>/dev/null \
      | grep -v 'src/components/ui/' \
      || true)
  fi

  if [ -n "$matches" ]; then
    local count
    count=$(echo "$matches" | wc -l | tr -d ' ')
    echo "${RED}[FAIL]${RESET} $label: $count violation(s)"
    echo "$matches" | head -10 | sed 's/^/  /'
    if [ "$count" -gt 10 ]; then
      echo "  ... and $((count - 10)) more"
    fi
    violations=$((violations + count))
  else
    echo "${GREEN}[OK]${RESET}   $label"
  fi
}

echo "--- Rule 09 (Square design) enforcement ---"
echo

# Colors - forbidden legacy accents
# wcag.ts and wcag.test.ts are exempt: they keep #06C167 as a grandfathered
# brand color for legacy tenants who stored it in DB before the migration.
check_pattern "accent lime admin dark (#c2f542/#C2F542)" "#[cC]2[fF]542"
check_pattern "accent lime hover (#d1ff5c/#D1FF5C)" "#[dD]1[fF][fF]5[cC]"
check_pattern "accent lime marketing (#ccff00/#CCFF00)" "#[cC][cC][fF][fF]00"
check_pattern "accent olive light (#65a30d/#65A30D)" "#65[aA]30[dD]"
check_pattern "accent olive dark (#4d7c0f/#4D7C0F)" "#4[dD]7[cC]0[fF]"
check_pattern "accent olive darker (#3f6212)" "#3[fF]6212"
check_pattern "UberEats green tenant (#06C167/#06c167)" "#06[cC]167" "__tests__/wcag\\|lib/utils/wcag"
check_pattern "UberEats green hover (#05a557)" "#05[aA]557"
check_pattern "UberEats green light (#e6f9f0)" "#[eE]6[fF]9[fF]0"
check_pattern "legacy lime hover (#b3e600)" "#[bB]3[eE]600"

# Radii - forbidden Tailwind classes (scale [4, 6, 10, 50] enforced)
check_pattern "rounded-xl (12px forbidden)" "\\brounded-xl\\b"
check_pattern "rounded-2xl (16px forbidden)" "\\brounded-2xl\\b"
check_pattern "rounded-3xl (24px forbidden)" "\\brounded-3xl\\b"
check_pattern "rounded-4xl (forbidden)" "\\brounded-4xl\\b"

# Weights - only 400 and 700 allowed ({font-normal, font-bold})
check_pattern "font-medium (500 forbidden)" "\\bfont-medium\\b"
check_pattern "font-semibold (600 forbidden)" "\\bfont-semibold\\b"

echo
if [ "$violations" -eq 0 ]; then
  echo "${GREEN}All rule 09 checks passed.${RESET}"
  exit 0
else
  echo "${RED}Rule 09 violated: $violations total occurrences.${RESET}"
  echo "See ${YELLOW}.claude/rules/09-square-design.md${RESET} for the full rule + allowed alternatives."
  exit 1
fi
