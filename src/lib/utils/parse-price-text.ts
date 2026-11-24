import { extractSingleNumberToken, locateSingleNumber, parseNumericCell } from '@/lib/excel-parse';
import { currencyDecimals } from '@/lib/utils/money';

/**
 * Prix ecrit en texte, pour une devise SANS decimales (XOF, XAF). B72.
 *
 * Regles, dans l'ordre:
 *  1. Un seul nombre (`extractSingleNumberToken`): "1500 / 2500", "1500 2500",
 *     "2500\r\n3500" ou "-500" sont refuses; un espace n'est un separateur de
 *     milliers que par groupes de 3 chiffres ("1 500" oui, "1 2500" non).
 *  3. Une partie decimale NULLE est retiree: "2500.00", "2 500,00 FCFA" = 2500.
 *  4. Le reste n'admet que des separateurs de milliers: groupes de 3 chiffres
 *     apres le premier ("1.500", "12.500", "1,500,000"). Une vraie decimale
 *     ("1,500.50", "2500,75", "12,5") est REFUSEE: le franc CFA n'en a pas, et
 *     deviner (concatener les chiffres) donnait 150050 pour 1 500,50.
 *
 * `null` = prix refuse (illisible ou ambigu): l'appelant le signale.
 */
export function parseZeroDecimalPrice(text: string): number | null {
  if (/-\s*\d/.test(text)) return null;
  const single = extractSingleNumberToken(text);
  if (single === null) return null;
  const token = single.replace(/[.,]$/, '').replace(/[.,]0{1,2}$/, '');
  if (!/[.,]/.test(token)) return Number(token);
  const groups = token.split(/[.,]/);
  const [first, ...rest] = groups;
  if (first.length < 1 || first.length > 3 || rest.some((g) => g.length !== 3)) return null;
  return Number(groups.join(''));
}

/**
 * Ecritures tolerees AUTOUR du prix (contre-audit 4): marqueurs de monnaie et
 * ponctuation deja lus juste par les essais des contre-audits 3 et 4 ("1500 F
 * CFA", "CFA 1500", "12.50 EUR", "EUR12", le signe euro, "1500.-", "+500",
 * "Prix: 2.500F"). Toute autre unite ("33 cl", "x2", "2 pieces") fait refuser
 * le prix: un volume ou un multiplicateur n'est pas un prix.
 */
const PRICE_MARKERS = new Set([
  'F',
  'FCFA',
  'CFA',
  'XOF',
  'XAF',
  'EUR',
  'USD',
  'PRIX',
  'EURO',
  'EUROS',
  '\u20ac',
  '$',
]);

function onlyPriceMarkersAround(rest: string): boolean {
  return rest
    .toUpperCase()
    .replace(/\u20ac/g, ' \u20ac ')
    .replace(/[$]/g, ' $ ')
    .split(/[\s:.,+\-]+/)
    .filter(Boolean)
    .every((word) => PRICE_MARKERS.has(word));
}

/** Plafond de la colonne `menu_items.price` (numeric(10,2)). */
export const MENU_PRICE_MAX = 99_999_999;

/**
 * Pourquoi un prix de plat est refuse. Un plat refuse n'est JAMAIS importe
 * (decision apres le contre-audit 2 de B72): il serait en vente a 0.
 */
export type MenuPriceRejection = 'illisible' | 'decimale' | 'negatif_ou_nul' | 'trop_eleve';

export type MenuPriceReading =
  { ok: true; price: number } | { ok: false; reason: MenuPriceRejection };

/** Raison en francais, pour les messages renvoyes par les imports. */
export const MENU_PRICE_REJECTION_LABEL: Record<MenuPriceRejection, string> = {
  illisible: 'prix illisible',
  decimale: 'centimes impossibles en francs CFA',
  negatif_ou_nul: 'prix nul ou négatif',
  trop_eleve: 'prix trop élevé (99 999 999 au plus)',
};

/**
 * LA lecture du prix d'un plat importe, commune a l'import PDF et a l'import
 * Excel de la carte (une seule regle, pas deux copies).
 *
 * - Un nombre (cellule Excel numerique, nombre rendu par le modele) n'est PAS
 *   relu comme un texte: il est seulement borne. En devise sans decimales, un
 *   nombre non entier est refuse ("decimale").
 * - Un texte doit porter UN seul nombre positif ("1500 / 2500", "-500", "1e12"
 *   sont refuses). Devise sans decimales: `parseZeroDecimalPrice`. Devise a
 *   decimales: regle de `parseNumericCell`.
 * - Puis: strictement positif et au plus MENU_PRICE_MAX.
 */
export function readMenuPrice(raw: unknown, currency: string | null | undefined): MenuPriceReading {
  const zeroDecimal = currencyDecimals(currency) === 0;
  let value: number | null;

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { ok: false, reason: 'illisible' };
    value = raw;
  } else if (typeof raw === 'string') {
    if (/-\s*\d/.test(raw)) return { ok: false, reason: 'negatif_ou_nul' };
    const located = locateSingleNumber(raw);
    if (located === null || !onlyPriceMarkersAround(located.rest)) {
      return { ok: false, reason: 'illisible' };
    }
    const token = located.token;
    if (zeroDecimal) {
      value = parseZeroDecimalPrice(raw);
      if (value === null) {
        const decimal = /[.,]\d{1,2}$/.test(token.replace(/[.,]$/, ''));
        return { ok: false, reason: decimal ? 'decimale' : 'illisible' };
      }
    } else {
      value = parseNumericCell(token);
      if (value === null) return { ok: false, reason: 'illisible' };
    }
  } else {
    return { ok: false, reason: 'illisible' };
  }

  if (value <= 0) return { ok: false, reason: 'negatif_ou_nul' };
  if (value > MENU_PRICE_MAX) return { ok: false, reason: 'trop_eleve' };
  if (zeroDecimal && !Number.isInteger(value)) return { ok: false, reason: 'decimale' };
  return { ok: true, price: value };
}
