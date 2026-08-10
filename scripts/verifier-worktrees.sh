#!/usr/bin/env bash
#
# Verifie que le depot principal et chaque worktree sont AUTONOMES, et dresse
# l'inventaire de ce qui est sur a supprimer.
#
# Pourquoi ce script existe (2026-08-10) : le `node_modules` du depot principal
# s'est retrouve avec son magasin pnpm pointe vers `.worktrees/lot3-offline`.
# Supprimer ce worktree merge - un geste de menage anodin - aurait casse les
# dependances du depot principal. Le lien entre la cause et l'effet aurait ete
# introuvable : rien, dans le message d'erreur, n'aurait mentionne un worktree.
#
# Le fichier `.npmrc` empeche desormais la derive. Ce script la DETECTE quand
# meme : une prevention qu'on ne verifie pas est une prevention qu'on croit
# avoir. Il sert aussi d'inventaire avant tout menage : on ne supprime jamais un
# worktree sans savoir si sa branche est fusionnee et son travail sauvegarde.
#
# Usage :
#   bash scripts/verifier-worktrees.sh            # verifie + inventaire
#   bash scripts/verifier-worktrees.sh --quiet    # garde pre-commit (anomalies seules)
#
# Sortie grep-friendly : ^worktrees: OK|ANOMALIE

set -uo pipefail

QUIET=false
[[ "${1:-}" == "--quiet" ]] && QUIET=true

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

# Deux niveaux, volontairement. BLOQUANT = ce qui casse vraiment les
# dependances. SIGNAL = ce qui merite d'etre range mais n'empeche rien. Un
# garde-fou qui refuse un commit pour des artefacts de build finit desactive
# dans la semaine, et ne protege alors plus de rien.
BLOQUANT=0
SIGNAL=0
say() { [[ "$QUIET" == false ]] && echo "$@"; return 0; }

# --- 1. Magasin pnpm ancre au projet ---------------------------------------
# Le magasin doit etre RELATIF et rester sous le projet. Un `..` signifie qu'il
# sort du checkout courant : c'est exactement la panne qu'on ne veut plus.
verifier_magasin() {
  local nom="$1" fichier="$2"
  [[ -f "$fichier" ]] || return 0
  local valeur
  valeur="$(sed -n 's/.*"virtualStoreDir": "\([^"]*\)".*/\1/p' "$fichier" | head -1)"
  [[ -z "$valeur" ]] && return 0
  if [[ "$valeur" == /* || "$valeur" == *..* ]]; then
    echo "ANOMALIE  $nom : magasin pnpm hors du projet -> $valeur"
    echo "          Reparer : cd '$nom' && CI=true pnpm install"
    BLOQUANT=$((BLOQUANT + 1))
  else
    say "  ok  $nom : magasin local ($valeur)"
  fi
}

say "Magasin pnpm"
verifier_magasin "depot principal" "node_modules/.modules.yaml"
for d in .worktrees/*/; do
  [[ -d "$d" ]] || continue
  verifier_magasin "${d%/}" "${d}node_modules/.modules.yaml"
done

# --- 2. Dossiers fantomes ---------------------------------------------------
# Un dossier de .worktrees/ que git ne connait pas n'est PAS un worktree : c'est
# un residu de `git worktree remove` (artefacts de build laisses derriere, que
# git n'avait pas a supprimer puisqu'ils ne sont pas suivis).
#
# Piege : `git worktree prune` ne les enlevera PAS. Il nettoie les METADONNEES
# de git, pas le disque. Conseiller prune ici enverrait tourner en rond.
#
# Le script ne supprime rien de lui-meme : il compte les fichiers pour qu'on
# distingue d'un coup d'oeil un residu de build d'un vrai travail oublie.
say ""
say "Dossiers fantomes dans .worktrees/"
CONNUS="$(git worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p')"
for d in .worktrees/*/; do
  [[ -d "$d" ]] || continue
  chemin="$ROOT/${d%/}"
  if ! echo "$CONNUS" | grep -qxF "$chemin"; then
    nb="$(find "$d" -type f 2>/dev/null | wc -l | tr -d ' ')"
    src="$(find "$d" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.sql' \) \
      -not -path '*/.next/*' -not -path '*/node_modules/*' 2>/dev/null | wc -l | tr -d ' ')"
    say "ANOMALIE  ${d%/} : inconnu de git ($nb fichier(s), dont $src source)"
    if [[ "$src" == "0" ]]; then
      say "          Residu de build, aucun code. Supprimer : rm -rf '${d%/}'"
    else
      say "          CONTIENT DU CODE SOURCE - ne pas supprimer, inspecter d'abord."
    fi
    SIGNAL=$((SIGNAL + 1))
  fi
done

# --- 3. Inventaire : qu'est-ce qui est SUR a supprimer ? --------------------
# On ne supprime un worktree que si sa branche est fusionnee dans origin/main ET
# qu'il n'a aucun travail non commite. Les deux conditions, jamais une seule.
if [[ "$QUIET" == false ]]; then
  echo ""
  echo "Inventaire des worktrees"
  git fetch -q origin 2>/dev/null || true
  for d in .worktrees/*/; do
    [[ -d "$d" ]] || continue
    nom="${d%/}"
    branche="$(git -C "$d" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
    sale="$(git -C "$d" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
    # ATTENTION au squash. Ce depot merge en squash: la branche n'est alors
    # JAMAIS ancetre de main, meme fusionnee depuis longtemps. Se fier au seul
    # `--is-ancestor` declarerait tout "non fusionne" a vie, et l'inventaire
    # deviendrait un bruit qu'on apprend a ignorer - donc un inventaire inutile.
    # L'etat de la PR est la source de verite pour ce workflow.
    if git merge-base --is-ancestor "$branche" origin/main 2>/dev/null; then
      fusionnee="fusionnee"
    elif [[ "$(gh pr list --head "$branche" --state merged --limit 1 --json number \
      --jq 'length' 2>/dev/null)" == "1" ]]; then
      fusionnee="fusionnee (squash)"
    else
      fusionnee="NON fusionnee"
    fi
    if [[ "$fusionnee" == fusionnee* && "$sale" == "0" ]]; then
      verdict="sur a supprimer ($fusionnee)"
    else
      verdict="A GARDER ($fusionnee, $sale fichier(s) non commite(s))"
    fi
    printf '  %-28s %-22s %s\n' "$(basename "$nom")" "$branche" "$verdict"
  done
fi

[[ "$QUIET" == false || "$BLOQUANT" -gt 0 ]] && echo ""
if [[ "$BLOQUANT" -eq 0 ]]; then
  if [[ "$SIGNAL" -gt 0 ]]; then
    say "worktrees: OK ($SIGNAL dossier(s) a ranger, sans gravite)"
  else
    say "worktrees: OK"
  fi
  exit 0
fi
echo "worktrees: ANOMALIE ($BLOQUANT bloquante(s))"
exit 1
