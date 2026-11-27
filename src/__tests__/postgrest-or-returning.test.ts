/**
 * Garde structurelle: une ecriture PostgREST filtree par `.or(...)` qui renvoie
 * des lignes (`.select(...)`) doit renvoyer chaque colonne nommee dans le `or`.
 *
 * PostgREST applique le filtre `or` sur les lignes RENVOYEES: une colonne
 * absente du select donne 42703 "column ... does not exist" et l'ecriture
 * n'aboutit jamais (mesure sur v14.3: l'annulation de commande echouait
 * toujours avec `.or('payment_status...').select('id')`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === '__tests__' || name === 'node_modules' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Colonnes nommees dans un filtre `or` litteral: `col.op.val,col2.op.val`. */
function orColumns(filter: string): string[] {
  return filter
    .split(',')
    .map((part) => part.trim().split('.')[0])
    .filter((col) => /^[a-z_]+$/.test(col));
}

function violations(source: string): string[] {
  const found: string[] = [];
  // Une instruction = du `.update(` ou `.delete(` jusqu'au premier `;`.
  for (const statement of source.match(/\.(update|delete)\([^;]*;/g) ?? []) {
    const or = statement.match(/\.or\(\s*['"`]([^'"`]+)['"`]/);
    const select = statement.match(/\.select\(\s*['"`]([^'"`]*)['"`]/);
    if (!or || !select) continue;
    const returned = select[1].split(',').map((c) => c.trim());
    if (returned.includes('*')) continue;
    for (const col of orColumns(or[1])) {
      if (!returned.includes(col)) found.push(`${col} absent de select('${select[1]}')`);
    }
  }
  return found;
}

describe('ecritures PostgREST filtrees par or(): colonnes renvoyees', () => {
  it('temoin: la forme fautive est bien detectee', () => {
    const fautif = `await supabase.from('orders').update({ status: 'cancelled' })
      .or('payment_status.is.null,payment_status.neq.paid').select('id');`;
    expect(violations(fautif)).toHaveLength(2);
    const correct = fautif.replace("select('id')", "select('id, payment_status')");
    expect(violations(correct)).toEqual([]);
  });

  it('aucune ecriture du depot ne filtre par une colonne absente du select', () => {
    const fautes = sourceFiles(SRC).flatMap((file) =>
      violations(readFileSync(file, 'utf8')).map((v) => `${file.slice(SRC.length + 1)}: ${v}`),
    );
    expect(fautes).toEqual([]);
  });
});
