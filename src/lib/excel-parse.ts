/**
 * Shared low-level Excel parsing helpers.
 *
 * Extracted so the supplier + recipe importers reuse the exact same tolerant
 * header matching / cell coercion as the menu importer without duplicating it
 * (and without appending to the already 539-line excel-import.service.ts, which
 * would break the <400-line rule and risk a menu-import regression).
 *
 * Pure TypeScript: no Next.js, no Supabase imports. Safe to import from services.
 */

/** One row-level import error, surfaced to the user with the sheet row number. */
export interface ImportRowError {
  row: number;
  message: string;
}

/**
 * Normalizes a column header for tolerant matching:
 * - Lowercases
 * - Strips accents (NFD normalization)
 * - Removes all whitespace
 */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

/**
 * Builds a header-to-field mapping from the actual Excel headers.
 *
 * @param aliases - map of canonical field name -> accepted normalized aliases
 * @param headers - the raw header cells from the first sheet row
 * @returns a map from column index to canonical field name
 */
export function mapHeaders(
  aliases: Record<string, string[]>,
  headers: string[],
): Map<number, string> {
  const mapping = new Map<number, string>();

  // Reverse lookup: normalized alias -> canonical field name.
  const aliasLookup = new Map<string, string>();
  for (const [field, fieldAliases] of Object.entries(aliases)) {
    for (const alias of fieldAliases) {
      aliasLookup.set(alias, field);
    }
  }

  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeHeader(headers[i]);
    const field = aliasLookup.get(normalized);
    // First column wins for a given field (ignore duplicate header columns).
    if (field && !Array.from(mapping.values()).includes(field)) {
      mapping.set(i, field);
    }
  }

  return mapping;
}

/**
 * Trouve la ligne d'en-tetes d'une feuille: la premiere ligne qui porte TOUS
 * les champs obligatoires.
 *
 * Les modeles telecharges depuis ATTABL commencent par une bande de titre et un
 * sous-titre (voir buildStyledWorkbook): les en-tetes sont en ligne 4, pas en
 * ligne 1. Lire la ligne 1 faisait refuser au restaurateur le modele qu'on venait
 * de lui donner. Un fichier fait a la main, en-tetes en ligne 1, reste lu pareil.
 *
 * @returns l'index (base 0) de la ligne d'en-tetes, ou -1 si aucune ligne des
 *   `maxScan` premieres ne contient tous les champs obligatoires.
 */
export function findHeaderRow(
  aliases: Record<string, string[]>,
  rows: unknown[][],
  required: string[],
  maxScan = 10,
): number {
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const cells = (rows[i] ?? []).map((c) => (c == null ? '' : String(c)));
    const fields = new Set(mapHeaders(aliases, cells).values());
    if (required.every((f) => fields.has(f))) return i;
  }
  return -1;
}

/**
 * Lit une cellule numerique (prix, quantite) venue d'un fichier uploade.
 *
 * Le separateur de milliers est le piege central, et il coutait de l'argent.
 * L'ancienne version remplacait la PREMIERE virgule par un point puis lisait le
 * resultat: `"1,500"` - ce qu'ecrit Excel en locale anglaise pour 1500 - donnait
 * `1.5`. Un restaurateur important sa carte voyait ses prix divises par mille,
 * en silence: 1,5 reste un nombre positif, donc la validation le laissait
 * passer. Sur un marche ou les prix sont a 4-6 chiffres (1 500, 25 000 FCFA),
 * c'etait systematique. Meme effet en format europeen: `"1.500,75"` -> `1.5`.
 *
 * Regles appliquees:
 * - Les deux separateurs presents : le DERNIER est le separateur decimal,
 *   l'autre marque les milliers. Couvre `1,234.56` et `1.234,56`.
 * - Un seul separateur suivi d'exactement 3 chiffres, ou repete : separateur de
 *   milliers (`1,500` -> 1500). Sinon : separateur decimal (`12,50` -> 12.5).
 *   L'ambiguite est levee dans le sens du marche d'ATTABL, ou le franc CFA n'a
 *   pas de sous-unite et ou personne n'ecrit trois decimales pour un prix.
 * - Le signe negatif est CONSERVE. Le faire disparaitre transformerait une
 *   saisie fautive en prix valide; le garder laisse la validation la refuser.
 */
export function parseNumericCell(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const brut = String(value).trim();
  const negatif = brut.startsWith('-');
  const chiffres = brut.replace(/[^0-9.,]/g, '');
  if (chiffres === '') return null;

  const dernierPoint = chiffres.lastIndexOf('.');
  const derniereVirgule = chiffres.lastIndexOf(',');
  let normalise: string;

  if (dernierPoint >= 0 && derniereVirgule >= 0) {
    const sepDecimal = dernierPoint > derniereVirgule ? '.' : ',';
    const sepMilliers = sepDecimal === '.' ? ',' : '.';
    normalise = chiffres.split(sepMilliers).join('').replace(sepDecimal, '.');
  } else if (dernierPoint >= 0 || derniereVirgule >= 0) {
    const sep = dernierPoint >= 0 ? '.' : ',';
    const parties = chiffres.split(sep);
    const derniere = parties[parties.length - 1];
    normalise =
      parties.length > 2 || derniere.length === 3
        ? parties.join('')
        : `${parties.slice(0, -1).join('')}.${derniere}`;
  } else {
    normalise = chiffres;
  }

  const parsed = parseFloat(normalise);
  if (Number.isNaN(parsed)) return null;
  return negatif ? -parsed : parsed;
}

/**
 * Lecture d'une QUANTITE (fiche technique, stock), pas d'un prix (B83).
 *
 * `parseNumericCell` est pensee pour les prix: un separateur unique suivi de 3
 * chiffres y vaut separateur de milliers ("1,500" = 1500). Une quantite, elle,
 * s'ecrit couramment avec 3 decimales: "0,250" kg etait lu 250 kg. Regles:
 * - Les deux separateurs presents : le DERNIER est decimal (`1.000,5` = 1000,5).
 * - Un separateur present UNE fois : decimal (`0,250` = 0,25 ; `1.500` = 1,5).
 * - Un separateur repete : milliers (`1.000.000` = 1000000).
 * - Les espaces sont ignores (`1 000,5` = 1000,5). Le signe negatif est garde.
 */
/**
 * Quantite ecrite de facon AMBIGUE (decision de l'orchestrateur apres le
 * contre-audit 1 de B83): un separateur unique suivi d'exactement trois chiffres
 * quand la partie entiere n'est pas zero ("1,500", "1.500", "12,500") peut
 * valoir 1500 (ecriture anglaise des milliers) ou 1,5 (decimale francaise).
 * Elle est refusee, jamais devinee. Ne sont pas ambigus: "0,250" (decimale),
 * "1,5", "1.25", "1500", "1 500" (espace = milliers), "1.500,5".
 */
/**
 * L'UNIQUE nombre ecrit dans un texte, sans espaces, ou `null` s'il y en a zero
 * ou plusieurs (contre-audit 3 de B72/B83: "1500 2500" etait lu 15002500).
 *
 * - Un retour a la ligne ou une tabulation n'est JAMAIS un separateur: deux
 *   nombres de part et d'autre = deux valeurs ("2500\r\n3500" refuse).
 * - Un espace (normal, fin ou insecable) n'est un separateur de milliers que si
 *   le premier groupe a 1 a 3 chiffres et chaque groupe suivant exactement 3
 *   ("1 500", "12 500", "1 250 000", "2 500,00"); sinon refus ("1 2500",
 *   "12,50 15,00", "1 2", "0 500").
 * - Les lettres et symboles autour sont ignores ("1500 F CFA", "CFA 1500",
 *   "0,5kg."): un point apres une unite n'appartient pas au nombre.
 */
export function extractSingleNumberToken(text: string): string | null {
  return locateSingleNumber(text)?.token ?? null;
}

/**
 * Meme lecture que `extractSingleNumberToken`, avec le texte ecrit AUTOUR du
 * nombre (`rest`, le nombre remplace par un espace), pour qu'un appelant juge
 * ce qui l'entoure (unite, monnaie). `null` si zero ou plusieurs nombres.
 * Contre-audit 4: un premier groupe "0" suivi d'un groupe de milliers ("0 500")
 * est illisible.
 */
export function locateSingleNumber(text: string): { token: string; rest: string } | null {
  const runs = text.match(/\d(?:[\d.,]|[ \u00a0\u202f\u2007\u2009](?=\d))*/g) ?? [];
  if (runs.length !== 1) return null;
  const groups = runs[0].split(/[ \u00a0\u202f\u2007\u2009]/);
  if (groups.length > 1) {
    const [first, ...rest] = groups;
    const last = rest[rest.length - 1];
    if (
      !/^[1-9]\d{0,2}$/.test(first) ||
      rest.slice(0, -1).some((g) => !/^\d{3}$/.test(g)) ||
      !/^\d{3}(?:[.,]\d*)?$/.test(last)
    ) {
      return null;
    }
  }
  return { token: groups.join(''), rest: text.replace(runs[0], ' ') };
}

/**
 * Quantite en texte qui contient autre chose que des chiffres, des separateurs
 * (point, virgule, espaces) et une unite EN FIN ("0,5 kg"). Contre-audit 2 de
 * B83: "1/2" etait lu 12, "2 x 0,5" lu 20,5 et "1e3" lu 13, en silence. Une
 * cellule numerique n'est jamais concernee.
 */
export function isMalformedQuantityText(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const texte = value.trim();
  if (texte === '') return false;
  // Contre-audit 3: "1 2" et "2 5 kg" etaient lus 12 et 25 (groupes d'espaces).
  if (extractSingleNumberToken(texte) === null) return true;
  return !/^\d[\d.,\s\u00a0\u202f]*[a-zA-Z\u00c0-\u00ff]*\.?$/.test(texte);
}

export function isAmbiguousQuantityText(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const chiffres = value.replace(/[^0-9.,\s\u00a0\u202f]/g, '').trim();
  if (/[\s\u00a0\u202f]/.test(chiffres)) return false;
  const m = /^(\d+)[.,](\d{3})$/.exec(chiffres);
  return !!m && Number(m[1]) !== 0;
}

export function parseQuantityCell(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const brut = String(value).trim();
  const negatif = brut.startsWith('-');
  // Contre-audit 3: le nombre seul ("0,5kg." = 0,5, pas 5), groupes d'espaces
  // selon la regle des milliers, un seul nombre.
  const chiffres = extractSingleNumberToken(brut);
  if (chiffres === null || chiffres === '') return null;

  const dernierPoint = chiffres.lastIndexOf('.');
  const derniereVirgule = chiffres.lastIndexOf(',');
  let normalise: string;
  if (dernierPoint >= 0 && derniereVirgule >= 0) {
    const sepDecimal = dernierPoint > derniereVirgule ? '.' : ',';
    const sepMilliers = sepDecimal === '.' ? ',' : '.';
    normalise = chiffres.split(sepMilliers).join('').replace(sepDecimal, '.');
  } else if (dernierPoint >= 0 || derniereVirgule >= 0) {
    const sep = dernierPoint >= 0 ? '.' : ',';
    const parties = chiffres.split(sep);
    normalise = parties.length > 2 ? parties.join('') : `${parties[0]}.${parties[1]}`;
  } else {
    normalise = chiffres;
  }

  const parsed = parseFloat(normalise);
  if (Number.isNaN(parsed)) return null;
  return negatif ? -parsed : parsed;
}

/**
 * Parses a cell value into a boolean.
 * Supports: Y/N, Yes/No, Oui/Non, O/N, 1/0, true/false, V/X, vrai/faux.
 */
export function parseBooleanCell(value: unknown, defaultValue: boolean): boolean {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  const normalized = String(value).trim().toLowerCase();
  const truthyValues = ['y', 'yes', 'oui', 'o', 'true', '1', 'v', 'vrai'];
  const falsyValues = ['n', 'no', 'non', 'false', '0', 'x', 'faux'];

  if (truthyValues.includes(normalized)) return true;
  if (falsyValues.includes(normalized)) return false;

  return defaultValue;
}

/**
 * Aplatit une valeur de cellule exceljs vers la valeur simple que le reste du
 * code attend.
 *
 * exceljs ne rend pas toujours un scalaire: une formule arrive en
 * `{ formula, result }`, un texte enrichi en `{ richText: [...] }`, un lien en
 * `{ text, hyperlink }`. Sans cette normalisation, un fichier client contenant
 * une simple formule de total ou une cellule mise en forme donnerait `[object
 * Object]` a l'import au lieu de sa valeur.
 */
function flattenCell(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;

  const cell = value as Record<string, unknown>;
  if ('result' in cell) return flattenCell(cell.result);
  if ('text' in cell) return cell.text;
  if (Array.isArray(cell.richText)) {
    return cell.richText.map((part) => (part as { text?: string }).text ?? '').join('');
  }
  if ('error' in cell) return null;
  return value;
}

/**
 * Reads the first sheet of an Excel workbook as an array-of-arrays (aoa).
 * The first inner array is the header row.
 *
 * Lu avec exceljs, deja utilise pour l'EXPORT. La bibliotheque xlsx (SheetJS) a
 * ete retiree du projet: sa derniere version publiee sur npm (0.18.5) porte deux
 * failles hautes non corrigees (pollution de prototype et ReDoS), et l'editeur ne
 * publie plus les correctifs que sur son propre CDN. Ces failles s'ouvraient sur
 * un fichier UPLOADE par un utilisateur, donc sur une entree non fiable.
 *
 * @throws when the workbook contains no sheet.
 */
export async function readFirstSheetRows(buffer: ArrayBuffer): Promise<unknown[][]> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  if (!sheet) {
    throw new Error('EMPTY_WORKBOOK');
  }

  const rows: unknown[][] = [];
  // `includeEmpty` garde les lignes vides intercalees: isEmptyRow s'en charge
  // ensuite, et les sauter ici decalerait la numerotation vue par l'utilisateur
  // dans les messages d'erreur ("ligne 7").
  sheet.eachRow({ includeEmpty: true }, (row) => {
    // `row.values` est indexe a partir de 1 (la case 0 est toujours vide).
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push(values.map(flattenCell));
  });

  return rows;
}

/** True when a sheet row is entirely empty (all cells null/undefined/''). */
export function isEmptyRow(cells: unknown[] | undefined): boolean {
  return (
    !cells || cells.length === 0 || cells.every((c) => c === null || c === undefined || c === '')
  );
}
