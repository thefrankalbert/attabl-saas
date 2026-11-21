#!/usr/bin/env bash
# Verifie que les enregistrements DNS dont depend l'e-mail d'ATTABL sont en
# place. Lance chaque semaine par .github/workflows/email-dns.yml.
#
# - attabl.com MX            -> ImprovMX (reception: contact@, dmarc@...)
# - _dmarc.attabl.com        -> DMARC en quarantine ou reject (anti-usurpation)
# - send.attabl.com SPF      -> include:amazonses.com (chemin de retour Resend)
# - resend._domainkey        -> cle DKIM publiee (signature des e-mails envoyes)
#
# NE PAS ajouter de SPF a la racine: les envois partent de send.attabl.com.
# Sortie: une ligne par controle, puis ^email-dns: OK|FAIL
set -uo pipefail
RESOLVEUR=${RESOLVEUR:-1.1.1.1}
echecs=0

q() { dig +short @"$RESOLVEUR" "$1" "$2" 2>/dev/null; }
controle() {
  local nom=$1 valeur=$2 motif=$3
  if printf '%s\n' "$valeur" | grep -Eq -- "$motif"; then
    echo "OK   $nom"
  else
    echo "FAIL $nom (obtenu: ${valeur:-rien})"
    echecs=$((echecs + 1))
  fi
}

controle "MX attabl.com -> ImprovMX" "$(q attabl.com MX)" 'mx[12]\.improvmx\.com\.?$'
controle "DMARC quarantine ou reject" "$(q _dmarc.attabl.com TXT)" '^"v=DMARC1;.*p=(quarantine|reject)'
controle "SPF send.attabl.com (Resend)" "$(q send.attabl.com TXT)" '^"v=spf1 .*include:amazonses\.com'
controle "DKIM resend._domainkey publie" "$(q resend._domainkey.attabl.com TXT)" '^"p=[A-Za-z0-9+/]{100,}'

if [ "$echecs" -eq 0 ]; then echo "email-dns: OK"; else echo "email-dns: FAIL ($echecs)"; exit 1; fi
