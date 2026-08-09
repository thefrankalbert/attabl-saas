#!/usr/bin/env bash
#
# Remplace le mot de passe de la base dans .env.local, puis verifie la connexion.
#
# Le mot de passe est saisi MASQUE: il n'apparait ni a l'ecran, ni dans
# l'historique du terminal, ni dans la conversation avec Claude.
#
# Usage: bash scripts/changer-mot-de-passe-db.sh
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

echo ""
echo "==================================================================="
echo "  Mise a jour du mot de passe de la base ATTABL"
echo "==================================================================="
echo ""

[ -f .env.local ] || { echo "ERREUR: .env.local introuvable."; exit 1; }

echo "Colle le NOUVEAU mot de passe (il restera invisible), puis Entree:"
# -s: saisie masquee. -r: ne pas interpreter les antislash.
read -rs NEW_PASSWORD
echo ""

if [ -z "$NEW_PASSWORD" ]; then
  echo "ERREUR: mot de passe vide. Rien n'a ete modifie."
  exit 1
fi

# Sauvegarde du fichier AVANT toute modification: si quoi que ce soit tourne mal,
# l'original est recuperable.
SAFE_COPY=".env.local.avant-$(date +%Y%m%d-%H%M%S)"
cp .env.local "$SAFE_COPY"
echo "Copie de securite du fichier: $SAFE_COPY"

# Encodage pour URL: un mot de passe peut contenir @ : / ? # & % qui ont un sens
# special dans une URL de connexion. Sans encodage, la connexion echouerait avec
# un message trompeur ("hote introuvable") au lieu de "mot de passe refuse".
#
# La variable est EXPORTEE sur sa propre ligne plutot que passee en prefixe de
# la commande python. Ecrite en prefixe, elle ressemblait a une affectation de
# secret et declenchait la regle gitleaks `hardcoded-password-or-secret`, alors
# qu'aucune valeur n'y figure. Corriger la ligne plutot qu'ajouter une exception
# a .gitleaks.toml: l'allowlist de ce depot neutralise deja le scan sur une large
# part du code (constat SEC-CFG-01), l'elargir aggraverait un defaut connu.
export NEW_PASSWORD
ENCODED="$(python3 -c \
  'import os,urllib.parse;print(urllib.parse.quote(os.environ["NEW_PASSWORD"],safe=""))')"
unset NEW_PASSWORD

# Remplace UNIQUEMENT la portion mot de passe des deux URL, entre le premier ":"
# qui suit l'utilisateur et le "@" qui precede l'hote. Le reste ne bouge pas.
ENCODED="$ENCODED" python3 - <<'PY'
import os, re, io

encoded = os.environ["ENCODED"]
path = ".env.local"
with io.open(path, encoding="utf-8") as fh:
    lines = fh.readlines()

pattern = re.compile(r"^(DATABASE_URL(?:_POOLED)?=[a-z]+://[^:]+:)([^@]*)(@.*)$")
changed = 0
out = []
for line in lines:
    m = pattern.match(line.rstrip("\n"))
    if m:
        out.append(m.group(1) + encoded + m.group(3) + "\n")
        changed += 1
    else:
        out.append(line)

if changed == 0:
    raise SystemExit("ERREUR: aucune ligne DATABASE_URL reconnue. Fichier inchange.")

with io.open(path, "w", encoding="utf-8") as fh:
    fh.writelines(out)
print("Lignes mises a jour: %d" % changed)
PY

if [ $? -ne 0 ]; then
  echo "Restauration du fichier d'origine."
  cp "$SAFE_COPY" .env.local
  exit 1
fi

echo ""
echo "Verification de la connexion..."
CONN="$(sed -n 's/^DATABASE_URL=//p' .env.local | head -1)"
ERRLOG="/tmp/attabl-newpwd-err.log"
if psql "$CONN" -t -c "select 1;" >"$ERRLOG" 2>&1; then
  echo ""
  echo "  CONNEXION REUSSIE. Le mot de passe est a jour."
  echo ""
  echo "  Etape suivante, relance:"
  echo "     bash scripts/sauvegarde-et-mesures.sh"
  echo ""
else
  echo ""
  echo "  Toujours refuse. Message exact:"
  tail -3 "$ERRLOG" | sed 's/^/    /'
  echo ""
  echo "  Verifie que tu as bien colle le mot de passe affiche par Supabase"
  echo "  APRES la reinitialisation (pas l'ancien)."
  echo "  Fichier d'origine conserve ici: $SAFE_COPY"
fi
