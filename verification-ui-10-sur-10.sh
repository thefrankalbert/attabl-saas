#!/bin/bash
# verification-ui-10-sur-10.sh
# Lancer depuis la racine du projet : bash verification-ui-10-sur-10.sh
# Ce script verifie que TOUTES les corrections UI ont ete implementees correctement.

set -e

echo "============================================"
echo "  VERIFICATION UI 10/10 — ATTABL SaaS"
echo "============================================"
echo ""

FAIL=0
PASS=0
TOTAL=0

check() {
  TOTAL=$((TOTAL + 1))
  if [ "$1" -eq 0 ]; then
    PASS=$((PASS + 1))
    echo "  PASS : $2"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL : $2"
    if [ -n "$3" ]; then
      echo "         → $3"
    fi
  fi
}

# =============================================
# CHANTIER 1 : Hex hardcodes dans tenant
# =============================================
echo "--- CHANTIER 1 : Couleurs hex dans composants tenant ---"

HEX_TENANT=$(grep -rn '#[0-9A-Fa-f]\{6\}' src/components/tenant/ --include='*.tsx' | grep -v 'primaryColor' | grep -v '// OK-HEX' | grep -v 'import' | wc -l | tr -d ' ')
check "$HEX_TENANT" "Zero hex hardcodes dans src/components/tenant/ ($HEX_TENANT trouves)" "Fichiers concernes :"
if [ "$HEX_TENANT" -gt 0 ]; then
  grep -rn '#[0-9A-Fa-f]\{6\}' src/components/tenant/ --include='*.tsx' | grep -v 'primaryColor' | grep -v '// OK-HEX' | grep -v 'import' | head -20
fi

# Verifier que COLORS const est supprime dans BottomNav
COLORS_CONST=$(grep -c "COLORS\|primary.*#\|background.*#\|divider.*#\|textMuted.*#" src/components/tenant/BottomNav.tsx 2>/dev/null || echo "0")
check "$COLORS_CONST" "Constante COLORS supprimee dans BottomNav.tsx ($COLORS_CONST references)"

echo ""

# =============================================
# CHANTIER 2 : Inline styles ServiceManager
# =============================================
echo "--- CHANTIER 2 : Inline styles dans ServiceManager ---"

INLINE_SM=$(grep -c 'style={{' src/components/admin/ServiceManager.tsx 2>/dev/null || echo "0")
check "$INLINE_SM" "Zero style={{}} dans ServiceManager.tsx ($INLINE_SM trouves)" ""
if [ "$INLINE_SM" -gt 0 ]; then
  grep -n 'style={{' src/components/admin/ServiceManager.tsx | head -20
fi

# Verifier les rgba
RGBA_SM=$(grep -c 'rgba' src/components/admin/ServiceManager.tsx 2>/dev/null || echo "0")
check "$RGBA_SM" "Zero rgba() dans ServiceManager.tsx ($RGBA_SM trouves)"

echo ""

# =============================================
# CHANTIER 3 : Boutons natifs
# =============================================
echo "--- CHANTIER 3 : Boutons natifs <button> ---"

BTN=$(grep -rn '<button' src/ --include='*.tsx' | grep -v 'src/components/ui/' | grep -v 'global-error' | grep -v 'shimmer-button' | wc -l | tr -d ' ')
check "$BTN" "Zero <button> natifs (sauf exceptions) ($BTN trouves)" ""
if [ "$BTN" -gt 0 ]; then
  echo "  Fichiers :"
  grep -rn '<button' src/ --include='*.tsx' | grep -v 'src/components/ui/' | grep -v 'global-error' | grep -v 'shimmer-button' | cut -d: -f1 | sort -u | head -20
fi

echo ""

# =============================================
# CHANTIER 4 : Inputs natifs
# =============================================
echo "--- CHANTIER 4 : Inputs natifs <input> ---"

INP=$(grep -rn '<input' src/ --include='*.tsx' | grep -v 'src/components/ui/' | grep -v 'type="file"' | grep -v "type='file'" | grep -v 'type="color"' | grep -v "type='color'" | grep -v 'honeypot' | grep -v 'hidden' | grep -v 'type="hidden"' | wc -l | tr -d ' ')
check "$INP" "Zero <input> natifs (sauf file/color/honeypot) ($INP trouves)" ""
if [ "$INP" -gt 0 ]; then
  echo "  Fichiers :"
  grep -rn '<input' src/ --include='*.tsx' | grep -v 'src/components/ui/' | grep -v 'type="file"' | grep -v "type='file'" | grep -v 'type="color"' | grep -v "type='color'" | grep -v 'honeypot' | grep -v 'hidden' | cut -d: -f1 | sort -u | head -20
fi

echo ""

# =============================================
# CHANTIER 5 : Tables natives
# =============================================
echo "--- CHANTIER 5 : Tables natives <table> ---"

TBL=$(grep -rn '<table' src/ --include='*.tsx' | grep -v 'src/components/ui/' | wc -l | tr -d ' ')
check "$TBL" "Zero <table> natifs ($TBL trouves)" ""

echo ""

# =============================================
# CHANTIER 6 : Border-radius
# =============================================
echo "--- CHANTIER 6 : Border-radius standardise (admin) ---"

BR_SM=$(grep -rn 'rounded-sm' src/components/admin/ --include='*.tsx' | wc -l | tr -d ' ')
check "$BR_SM" "Zero rounded-sm dans admin ($BR_SM trouves)"

BR_2XL=$(grep -rn 'rounded-2xl' src/components/admin/ --include='*.tsx' | wc -l | tr -d ' ')
check "$BR_2XL" "Zero rounded-2xl dans admin ($BR_2XL trouves)"

BR_INLINE=$(grep -rn 'borderRadius' src/components/admin/ --include='*.tsx' | wc -l | tr -d ' ')
check "$BR_INLINE" "Zero borderRadius inline dans admin ($BR_INLINE trouves)"

echo ""

# =============================================
# CHANTIER 7 : Couleurs hardcodees globales
# =============================================
echo "--- CHANTIER 7 : Couleurs hardcodees globales ---"

BG_GRAY=$(grep -rn 'bg-gray-' src/ --include='*.tsx' | wc -l | tr -d ' ')
if [ "$BG_GRAY" -le 5 ]; then BG_GRAY_OK=0; else BG_GRAY_OK=1; fi
check "$BG_GRAY_OK" "bg-gray-* < 5 occurrences ($BG_GRAY trouves)"

BORDER_GRAY=$(grep -rn 'border-gray-' src/ --include='*.tsx' | wc -l | tr -d ' ')
check "$BORDER_GRAY" "Zero border-gray-* ($BORDER_GRAY trouves)"

TEXT_GRAY=$(grep -rn 'text-gray-' src/ --include='*.tsx' | grep -v 'src/app/(marketing)' | wc -l | tr -d ' ')
if [ "$TEXT_GRAY" -le 10 ]; then TEXT_GRAY_OK=0; else TEXT_GRAY_OK=1; fi
check "$TEXT_GRAY_OK" "text-gray-* < 10 hors marketing ($TEXT_GRAY trouves)"

echo ""

# =============================================
# METRIQUES GLOBALES
# =============================================
echo "--- METRIQUES GLOBALES ---"

SEM_BG=$(grep -rn 'bg-app-\|bg-accent\|bg-status-' src/ --include='*.tsx' | wc -l | tr -d ' ')
HARD_BG=$(grep -rn 'bg-gray-\|bg-slate-\|bg-zinc-\|bg-neutral-' src/ --include='*.tsx' | wc -l | tr -d ' ')
echo "  Backgrounds semantiques  : $SEM_BG"
echo "  Backgrounds hardcodes    : $HARD_BG"

SEM_BORDER=$(grep -rn 'border-app-border' src/ --include='*.tsx' | wc -l | tr -d ' ')
HARD_BORDER=$(grep -rn 'border-gray-\|border-zinc-\|border-slate-' src/ --include='*.tsx' | wc -l | tr -d ' ')
echo "  Bordures semantiques     : $SEM_BORDER"
echo "  Bordures hardcodees      : $HARD_BORDER"

INLINE_TOTAL=$(grep -rn 'style={{' src/ --include='*.tsx' | grep -v 'src/components/ui/' | grep -v 'src/app/global-error' | wc -l | tr -d ' ')
echo "  Inline styles (hors ui/) : $INLINE_TOTAL"

ARB_HEX=$(grep -rn '\-\[#[0-9A-Fa-f]' src/ --include='*.tsx' | wc -l | tr -d ' ')
echo "  Hex arbitraires Tailwind : $ARB_HEX"

echo ""

# =============================================
# QUALITY GATES
# =============================================
echo "--- QUALITY GATES ---"

echo "  TypeScript..."
if pnpm typecheck > /dev/null 2>&1; then
  check 0 "pnpm typecheck"
else
  check 1 "pnpm typecheck"
fi

echo "  ESLint..."
if pnpm lint > /dev/null 2>&1; then
  check 0 "pnpm lint"
else
  check 1 "pnpm lint"
fi

echo "  Tests unitaires..."
if pnpm test > /dev/null 2>&1; then
  check 0 "pnpm test"
else
  check 1 "pnpm test"
fi

echo "  Build production..."
if pnpm build > /dev/null 2>&1; then
  check 0 "pnpm build"
else
  check 1 "pnpm build"
fi

echo ""

# =============================================
# RESULTAT FINAL
# =============================================
echo "============================================"
echo "  RESULTAT : $PASS/$TOTAL checks passes"
echo "============================================"

if [ "$FAIL" -eq 0 ]; then
  echo ""
  echo "  ★★★★★★★★★★ 10/10 ★★★★★★★★★★"
  echo "  Toutes les corrections UI sont implementees."
  echo ""
else
  echo ""
  echo "  $FAIL corrections restantes."
  echo "  Relancer apres corrections."
  echo ""
  exit 1
fi
