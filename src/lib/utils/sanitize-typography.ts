// Normalize forbidden typographic punctuation to ASCII in displayed text.
// The project rule forbids special Unicode punctuation in "textes affiches a
// l'utilisateur"; tenant-entered content (item names/descriptions) can still
// contain an em-dash / smart-quote typed in the admin, so we sanitize it at
// render time. Accented letters stay untouched. The forbidden chars are built
// from code points so this source file stays pure ASCII.
const REPLACEMENTS: Array<[number, string]> = [
  [0x2014, '-'], // em dash
  [0x2013, '-'], // en dash
  [0x2026, '...'], // horizontal ellipsis
  [0x2018, "'"], // left single quote
  [0x2019, "'"], // right single quote
  [0x201c, '"'], // left double quote
  [0x201d, '"'], // right double quote
  [0x00ab, '"'], // left guillemet
  [0x00bb, '"'], // right guillemet
];

const TYPO_MAP = new Map<string, string>(
  REPLACEMENTS.map(([code, repl]) => [String.fromCharCode(code), repl]),
);
const TYPO_RE = new RegExp(
  `[${REPLACEMENTS.map(([code]) => String.fromCharCode(code)).join('')}]`,
  'g',
);

export function sanitizeTypography(text: string): string {
  if (!text) return text;
  return text.replace(TYPO_RE, (ch) => TYPO_MAP.get(ch) ?? ch);
}
