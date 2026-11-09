import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// menu_items n'a PAS de colonne display_order (seules categories, menus, zones,
// item_options, item_modifiers et item_suggestions en ont une). Une requete
// menu_items triee dessus echoue cote PostgREST et renvoie silencieusement
// zero plat : carte admin vide, suggestions du panier absentes. L'erreur est
// revenue deux fois (PR #339, puis 2026-11-09) : ce garde la bloque.
const SRC = join(__dirname, '..');
const WINDOW = 12;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

function findMenuItemsOrderedByDisplayOrder(files: string[]): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!line.includes("from('menu_items')")) return;
      const chain = lines.slice(i + 1, i + 1 + WINDOW);
      const end = chain.findIndex((l) => /;\s*$/.test(l));
      const scoped = end === -1 ? chain : chain.slice(0, end + 1);
      if (scoped.some((l) => l.includes(".order('display_order'"))) hits.push(`${file}:${i + 1}`);
    });
  }
  return hits;
}

describe('menu_items is never ordered by display_order', () => {
  it('no query in src sorts menu_items on the missing column', () => {
    expect(findMenuItemsOrderedByDisplayOrder(sourceFiles(SRC))).toEqual([]);
  });
});
