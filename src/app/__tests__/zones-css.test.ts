import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// La feuille racine (src/app/globals.css) ne contient que les classes des
// dossiers listes par ses `@source`. Un fichier de ces dossiers qui importe un
// composant d'ailleurs (admin, caisse, menu client...) l'afficherait SANS ses
// styles sur le site public. Ce test refuse un tel import.

const APP = path.resolve(__dirname, '..');
const SRC = path.resolve(APP, '..');

function sourcedPaths(): string[] {
  const css = readFileSync(path.join(APP, 'globals.css'), 'utf8');
  return [...css.matchAll(/^@source "([^"]+)";/gm)].map((m) => path.resolve(APP, m[1]));
}

function filesUnder(p: string): string[] {
  if (statSync(p).isFile()) return [p];
  return readdirSync(p).flatMap((name) => {
    if (name === '__tests__' || name === 'node_modules') return [];
    return filesUnder(path.join(p, name));
  });
}

function resolveImport(from: string, spec: string): string | null {
  if (spec.startsWith('@/')) return path.join(SRC, spec.slice(2));
  if (spec.startsWith('.')) return path.resolve(path.dirname(from), spec);
  return null; // paquet npm: ses classes ne passent pas par Tailwind
}

describe('feuille de style du site public', () => {
  const sourced = sourcedPaths();
  const inZone = (p: string) => sourced.some((s) => p === s || p.startsWith(s + path.sep));

  it('liste bien des dossiers existants', () => {
    expect(sourced.length).toBeGreaterThan(10);
    for (const s of sourced) expect(() => statSync(s)).not.toThrow();
  });

  it("aucun composant affiche par une page publique n'est hors de la zone publique", () => {
    // On part des fichiers de la zone et on suit leurs imports de proche en
    // proche: tout fichier .tsx atteint (JSX = classes) doit etre dans la zone.
    // Les .ts (actions serveur, types, utilitaires) ne portent pas de classes.
    const vus = new Set<string>();
    const fuites = new Set<string>();
    const pile = sourced.flatMap(filesUnder).filter((f) => /\.tsx?$/.test(f));
    while (pile.length) {
      const file = pile.pop() as string;
      if (vus.has(file)) continue;
      vus.add(file);
      // `from '...'`, `import '...'` (import nu) et `import('...')` (dynamique).
      const imports = readFileSync(file, 'utf8').matchAll(
        /(?:from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g,
      );
      for (const m of imports) {
        const base = resolveImport(file, m[1]);
        if (!base) continue;
        const target = [
          base,
          `${base}.tsx`,
          `${base}.ts`,
          path.join(base, 'index.tsx'),
          path.join(base, 'index.ts'),
        ].find((c) => {
          try {
            return statSync(c).isFile();
          } catch {
            return false;
          }
        });
        if (!target) continue;
        if (target.endsWith('.tsx') && !inZone(target)) fuites.add(path.relative(SRC, target));
        pile.push(target);
      }
    }
    expect([...fuites].sort()).toEqual([]);
  });

  it('chaque dossier de page est lu par la feuille publique ou charge la feuille de l application', () => {
    // Une nouvelle route (ex: /unsubscribe) hors de la liste @source et sans
    // app.css s'afficherait sans ses classes. api, actions et fonts ne rendent
    // pas de page.
    const sansPage = new Set(['__tests__', 'api', 'actions', 'fonts']);
    const orphelins = readdirSync(APP).filter((name) => {
      const dir = path.join(APP, name);
      if (sansPage.has(name) || !statSync(dir).isDirectory() || inZone(dir)) return false;
      try {
        return !/['"]@\/styles\/app\.css['"]/.test(
          readFileSync(path.join(dir, 'layout.tsx'), 'utf8'),
        );
      } catch {
        return true; // ni dans la zone publique, ni layout qui charge app.css
      }
    });
    expect(orphelins).toEqual([]);
  });
});
