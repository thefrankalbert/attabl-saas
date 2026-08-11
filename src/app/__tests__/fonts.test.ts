/**
 * Garde-fou: le build ne doit dependre d'AUCUN service tiers.
 *
 * Le 2026-08-11, Google a fait tourner ses fichiers Roboto et a servi une
 * feuille de style pointant vers des .woff2 pas encore en ligne. Resultat: 27
 * erreurs `Module not found`, build avorte, production bloquee - alors que le
 * code etait sain. Les polices sont depuis auto-hebergees.
 *
 * Ce test existe parce que la regression est facile et silencieuse: il suffit
 * qu'un `import { Inter } from 'next/font/google'` revienne dans un fichier pour
 * que la dependance soit retablie, sans que rien ne casse tant que Google
 * repond. On ne s'en apercevrait qu'au prochain incident, au pire moment.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const RACINE = path.resolve(__dirname, '../../..');
const SRC = path.join(RACINE, 'src');
const DOSSIER_POLICES = path.join(SRC, 'app/fonts');

/** Tous les fichiers TypeScript/TSX de src/, hors dossiers generes. */
function fichiersSource(dossier: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    if (entree.name === 'node_modules' || entree.name.startsWith('.')) continue;
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) fichiersSource(complet, acc);
    else if (/\.tsx?$/.test(entree.name)) acc.push(complet);
  }
  return acc;
}

describe('polices auto-hebergees', () => {
  it('aucun fichier n importe next/font/google', () => {
    const coupables = fichiersSource(SRC)
      // Ce fichier-ci contient le motif recherche dans sa propre expression
      // reguliere: sans cette exclusion, le garde-fou se denoncerait lui-meme.
      .filter((f) => f !== __filename)
      .filter((f) => /from\s+['"]next\/font\/google['"]/.test(readFileSync(f, 'utf8')));

    expect(
      coupables.map((f) => path.relative(RACINE, f)),
      'next/font/google telecharge les polices depuis Google PENDANT LE BUILD: une panne de leur cote bloque toute mise en ligne. Utiliser src/app/fonts.ts (next/font/local). Pour ajouter une police: scripts/telecharger-polices.mjs.',
    ).toEqual([]);
  });

  it('chaque police declaree existe bien sur le disque', () => {
    // Un chemin faux ne casse pas le typecheck: il casse le build, plus tard.
    const source = readFileSync(path.join(SRC, 'app/fonts.ts'), 'utf8');
    const chemins = [...source.matchAll(/['"]\.\/fonts\/([^'"]+\.woff2)['"]/g)].map((m) => m[1]);

    expect(chemins.length).toBeGreaterThan(0);
    const absents = chemins.filter((c) => !existsSync(path.join(DOSSIER_POLICES, c)));
    expect(absents).toEqual([]);
  });

  it('aucun fichier de police n est orphelin', () => {
    // Un .woff2 que plus personne ne declare est du poids mort dans le depot.
    const source = readFileSync(path.join(SRC, 'app/fonts.ts'), 'utf8');
    const surDisque = readdirSync(DOSSIER_POLICES).filter((f) => f.endsWith('.woff2'));

    const orphelins = surDisque.filter((f) => !source.includes(f));
    expect(orphelins).toEqual([]);
  });
});
