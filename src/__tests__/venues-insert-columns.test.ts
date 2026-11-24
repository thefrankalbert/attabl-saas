import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Audit B60: deux creations de salle de secours echouaient A CHAQUE essai pour
// un restaurant sans salle. `venues.slug` est NOT NULL sans valeur par defaut,
// et ni le lancement de l'onboarding (onboarding.complete.ts) ni la page
// "Tables" ne le fournissaient; la page envoyait en plus `is_default`, une
// colonne qui n'existe pas. Les tests de ces chemins simulent la base et ne
// pouvaient pas le voir: ce garde lit les insertions dans le code et les
// compare aux colonnes reelles de la table (supabase/schema.sql).
const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');
const WINDOW = 15;

function venueColumns(): { all: Set<string>; required: string[] } {
  const schema = readFileSync(join(ROOT, 'supabase/schema.sql'), 'utf8');
  const start = schema.indexOf('CREATE TABLE "public"."venues" (');
  const body = schema.slice(start, schema.indexOf(');', start));
  const all = new Set<string>();
  const required: string[] = [];
  for (const line of body.split('\n').slice(1)) {
    const m = line.match(/^\s+"(\w+)"/);
    if (!m) continue;
    all.add(m[1]);
    if (line.includes('NOT NULL') && !line.includes('DEFAULT')) required.push(m[1]);
  }
  return { all, required };
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** Les cles litterales de chaque `.from('venues')...insert({...})` du code. */
function venueInserts(files: string[]): Array<{ at: string; keys: string[] }> {
  const found: Array<{ at: string; keys: string[] }> = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!line.includes("from('venues')")) return;
      // Une seule instruction: jusqu'a la premiere ligne terminee par `;`.
      const window = lines.slice(i, i + WINDOW);
      const stmtEnd = window.findIndex((l) => /;\s*$/.test(l));
      const chain = stmtEnd === -1 ? window : window.slice(0, stmtEnd + 1);
      const ins = chain.findIndex((l) => l.includes('.insert('));
      if (ins === -1) return;
      // Le litteral objet passe a insert, sur une ou plusieurs lignes:
      // `{ a: x, b }` ou `[{ ... }]`. Cles explicites et raccourcies.
      const text = chain
        .slice(ins)
        .map((l) => l.replace(/\/\/.*$/, ''))
        .join(' ');
      const open = text.indexOf('{', text.indexOf('.insert('));
      const literal = text.slice(open + 1, text.indexOf('}', open));
      const keys = literal
        .split(',')
        .map((part) => part.trim().match(/^(\w+)\s*(:|$)/)?.[1])
        .filter((k): k is string => !!k);
      found.push({ at: `${file.replace(ROOT, '')}:${i + 1}`, keys });
    });
  }
  return found;
}

describe('insertions dans venues', () => {
  const { all, required } = venueColumns();
  const inserts = venueInserts(sourceFiles(SRC));

  it('temoin: la lecture du schema et du code trouve quelque chose', () => {
    expect(required).toEqual(expect.arrayContaining(['tenant_id', 'slug', 'name']));
    // signup.service.ts cree la salle par defaut: au moins cette insertion.
    expect(inserts.some((x) => x.at.includes('signup.service.ts'))).toBe(true);
  });

  it('chaque insertion fournit les colonnes obligatoires et seulement des colonnes reelles', () => {
    const fautes = inserts.flatMap(({ at, keys }) => [
      ...required.filter((c) => !keys.includes(c)).map((c) => `${at} sans ${c}`),
      ...keys.filter((k) => !all.has(k)).map((k) => `${at} colonne inconnue ${k}`),
    ]);
    expect(fautes).toEqual([]);
  });
});
