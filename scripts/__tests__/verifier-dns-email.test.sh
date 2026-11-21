#!/usr/bin/env bash
# Le controle DNS e-mail doit dire OUI sur la configuration reelle et NON des
# qu'un enregistrement manque ou s'affaiblit. `dig` est remplace par un faux.
set -euo pipefail
cd "$(dirname "$0")/../.."
t=$(mktemp -d); echec=0
faux_dig() { # $1 = valeur DMARC a renvoyer, $2 = valeur MX
  cat > "$t/dig" <<SH
#!/usr/bin/env bash
case "\$3 \$4" in
  "attabl.com MX") printf '%s\n' "$2" ;;
  "_dmarc.attabl.com TXT") printf '%s\n' '$1' ;;
  "send.attabl.com TXT") echo '"v=spf1 include:amazonses.com ~all"' ;;
  "resend._domainkey.attabl.com TXT") echo '"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDFkhTvm9udoof8lGNdJgkwNKjJrAuMiVRJMZblSKVlSfqKi2U8oXwrdl6GW6XgOVY7Q5q4WMPsz1ZidAB"' ;;
esac
SH
  chmod +x "$t/dig"
}
cas() { # libelle attendu(0|1) dmarc mx
  faux_dig "$3" "$4"
  if PATH="$t:$PATH" bash scripts/verifier-dns-email.sh >/dev/null; then r=0; else r=1; fi
  if [ "$r" = "$2" ]; then echo "ok - $1"; else echo "not ok - $1"; echec=1; fi
}
BON_MX=$'10 mx1.improvmx.com.\n20 mx2.improvmx.com.'
cas "configuration reelle -> accepte" 0 '"v=DMARC1; p=quarantine; rua=mailto:dmarc@attabl.com"' "$BON_MX"
cas "DMARC p=none -> refuse" 1 '"v=DMARC1; p=none"' "$BON_MX"
cas "DMARC absent -> refuse" 1 '' "$BON_MX"
cas "MX absent -> refuse" 1 '"v=DMARC1; p=reject"' ''
cas "MX vers un autre service -> refuse" 1 '"v=DMARC1; p=reject"' '10 mx.autre.com.'
exit "$echec"
