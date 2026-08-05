import { describe, it, expect } from 'vitest';
import { assertNotProduction, PROD_SUPABASE_REFS } from '../../scripts/assert-not-production';

/**
 * LOT 7.1 #10. `seed-demo.ts` et `seed-qa.ts` EFFACENT puis recreent des donnees,
 * et lisent `.env.local` qui pointe sur la production. Sans garde, un simple
 * `pnpm seed:demo` detruisait les donnees reelles du tenant de demonstration.
 *
 * Ces tests existent pour qu'on ne puisse pas retirer le garde par accident: sans
 * eux, supprimer l'appel dans un seed ne casserait rien de visible.
 */
describe('assertNotProduction', () => {
  it('REFUSE la base de production', () => {
    const prodUrl = `https://${PROD_SUPABASE_REFS[0]}.supabase.co`;
    expect(() => assertNotProduction(prodUrl, 'seed-demo')).toThrow(/PRODUCTION/);
  });

  it('REFUSE une URL absente (fail-closed)', () => {
    // Sans cible identifiable, on ne peut pas garantir que ce n'est pas la prod.
    expect(() => assertNotProduction(undefined, 'seed-demo')).toThrow();
    expect(() => assertNotProduction('', 'seed-demo')).toThrow();
  });

  it('laisse passer une base locale', () => {
    expect(() => assertNotProduction('http://127.0.0.1:54321', 'seed-demo')).not.toThrow();
  });

  it('laisse passer un projet de staging', () => {
    // Un autre projet Supabase distant reste legitime: seule la prod est bannie.
    expect(() =>
      assertNotProduction('https://abcdefghijklmnopqrst.supabase.co', 'seed-qa'),
    ).not.toThrow();
  });

  it('nomme le script fautif dans le message', () => {
    const prodUrl = `https://${PROD_SUPABASE_REFS[0]}.supabase.co`;
    expect(() => assertNotProduction(prodUrl, 'seed-qa')).toThrow(/seed-qa/);
  });
});
