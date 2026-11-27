import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Garde CI de typographie (regle du depot, CLAUDE.md "Typographie dans le code").
 *
 * Interdits dans `src/` (code, commentaires, fichiers i18n) : tiret cadratin,
 * tiret demi-cadratin, points de suspension typographiques, guillemets courbes
 * et guillemets francais. Les accents francais restent permis. Les fichiers
 * Markdown sont hors perimetre. Les migrations SQL (hors `src/`) sont immuables
 * et ne sont donc pas scannees.
 *
 * Les caracteres interdits sont donnes par leur code numerique pour que CE fichier
 * ne se declenche pas lui-meme.
 */

const CODES_INTERDITS: [number, string][] = [
  [0x2013, 'tiret demi-cadratin'],
  [0x2014, 'tiret cadratin'],
  [0x2026, 'points de suspension typographiques'],
  [0x2018, 'guillemet simple courbe ouvrant'],
  [0x2019, 'guillemet simple courbe fermant / apostrophe courbe'],
  [0x201c, 'guillemet double courbe ouvrant'],
  [0x201d, 'guillemet double courbe fermant'],
  [0x00ab, 'guillemet francais ouvrant'],
  [0x00bb, 'guillemet francais fermant'],
];

const INTERDITS: Record<string, string> = Object.fromEntries(
  CODES_INTERDITS.map(([code, nom]) => [String.fromCharCode(code), nom]),
);

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css']);
const DOSSIERS_IGNORES = new Set(['node_modules', '.next']);

type Violation = { ligne: number; colonne: number; caractere: string };

function trouverViolations(source: string): Violation[] {
  const violations: Violation[] = [];
  source.split('\n').forEach((texte, i) => {
    for (let col = 0; col < texte.length; col++) {
      if (INTERDITS[texte[col]]) {
        violations.push({ ligne: i + 1, colonne: col + 1, caractere: texte[col] });
      }
    }
  });
  return violations;
}

function listerFichiers(dossier: string, sortie: string[] = []): string[] {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    if (entree.isDirectory()) {
      if (!DOSSIERS_IGNORES.has(entree.name))
        listerFichiers(path.join(dossier, entree.name), sortie);
    } else if (EXTENSIONS.has(path.extname(entree.name))) {
      sortie.push(path.join(dossier, entree.name));
    }
  }
  return sortie;
}

describe('typographie ASCII dans src/', () => {
  it('detecte chaque caractere interdit (temoin positif)', () => {
    for (const [caractere, nom] of Object.entries(INTERDITS)) {
      const trouves = trouverViolations(`abc\nx ${caractere} y`);
      expect(trouves, nom).toEqual([{ ligne: 2, colonne: 3, caractere }]);
    }
  });

  it('laisse passer les accents francais et l ASCII (temoin negatif)', () => {
    const texte = 'Équipe à l\'écoute : "ça marche" ... {n} • éèêàçù';
    expect(trouverViolations(texte)).toEqual([]);
  });

  it('parcourt bien le code (le garde ne scanne pas un dossier vide)', () => {
    const racine = path.resolve(__dirname, '..');
    expect(listerFichiers(racine).length).toBeGreaterThan(500);
  });

  it('ne trouve aucun caractere interdit dans src/ (hors Markdown)', () => {
    const racine = path.resolve(__dirname, '..');
    const trouves: string[] = [];
    for (const fichier of listerFichiers(racine)) {
      for (const v of trouverViolations(readFileSync(fichier, 'utf8'))) {
        const rel = path.relative(path.resolve(racine, '..'), fichier);
        trouves.push(`${rel}:${v.ligne}:${v.colonne} ${INTERDITS[v.caractere]}`);
      }
    }
    expect(trouves, `Caracteres interdits :\n  ${trouves.join('\n  ')}`).toEqual([]);
  });
});
