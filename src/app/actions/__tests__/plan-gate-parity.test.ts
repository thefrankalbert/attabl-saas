import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Test de parite exige par le constat F4.
 *
 * Le trou d'origine n'etait pas une garde mal ecrite: c'etait une garde ABSENTE
 * d'un module entier. Verifier chaque action une par une ne protege que les
 * actions qui existent aujourd'hui - la prochaine, ajoutee dans six mois, passera
 * a travers exactement comme les huit precedentes.
 *
 * Ce test lit la SOURCE et exige que chaque action exportee d'un module vendu
 * avec un plan payant passe par le helper de permission de son module - le seul
 * endroit ou la garde de plan est posee. Ajouter une action sans ce helper fait
 * echouer la CI, sans que personne ait a y penser.
 */

const ACTIONS_DIR = join(process.cwd(), 'src/app/actions');

const GATED_MODULES = [
  { file: 'inventory.ts', helpers: ['checkInventoryPermissions', 'checkInventoryViewPermissions'] },
  { file: 'suppliers.ts', helpers: ['checkSupplierPermissions'] },
  { file: 'stock-count.ts', helpers: ['checkStockCountPermissions'] },
  { file: 'tables.ts', helpers: ['checkPermissions'] },
];

/** Decoupe le fichier en corps d'actions exportees, par leur nom. */
function exportedActionBodies(source: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const marker = /export async function (action\w+)/g;
  const starts: { name: string; index: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = marker.exec(source)) !== null) {
    starts.push({ name: match[1], index: match.index });
  }

  starts.forEach((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : source.length;
    bodies.set(start.name, source.slice(start.index, end));
  });

  return bodies;
}

describe('parite des gardes de plan (F4)', () => {
  for (const { file, helpers } of GATED_MODULES) {
    describe(file, () => {
      const source = readFileSync(join(ACTIONS_DIR, file), 'utf8');

      it('pose la garde de plan dans le helper de permission', () => {
        expect(source).toContain('isFeatureEntitled');
      });

      const bodies = exportedActionBodies(source);

      it('exporte au moins une action', () => {
        expect(bodies.size).toBeGreaterThan(0);
      });

      for (const [name, body] of bodies) {
        it(`${name} passe par un helper de permission`, () => {
          const guarded = helpers.some((helper) => body.includes(helper));
          expect(
            guarded,
            `${name} n'appelle aucun de: ${helpers.join(', ')}. Une Server Action est un ` +
              'endpoint POST adressable: sans le helper, elle contourne la garde de plan.',
          ).toBe(true);
        });
      }
    });
  }
});
