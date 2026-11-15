import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { STOREFRONT_GRACE_DAYS } from '../storefront-access';

/**
 * La periode de lecture seule de la vitrine (7 jours apres la fin d'essai) est
 * ecrite deux fois: ici en TypeScript, et dans la policy RESTRICTIVE de la
 * migration reste_donnees_lecture_publique (fonction storefront_tenant_visible).
 * Ce test lit le texte de la migration pour que les deux ne divergent jamais:
 * une base plus etroite que l'application couperait la grace a chaud.
 */
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase/migrations');

function migrationText(): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) =>
    f.endsWith('_reste_donnees_lecture_publique.sql'),
  );
  expect(files).toHaveLength(1);
  return readFileSync(path.join(MIGRATIONS_DIR, files[0]), 'utf8');
}

describe('grace de la vitrine: TypeScript et SQL', () => {
  it('la migration porte la meme duree que STOREFRONT_GRACE_DAYS', () => {
    const matches = [...migrationText().matchAll(/trial_ends_at \+ interval '(\d+) days'/g)];
    expect(matches).toHaveLength(1);
    expect(Number(matches[0][1])).toBe(STOREFRONT_GRACE_DAYS);
  });

  it('temoin negatif: une duree differente serait detectee', () => {
    const forged = migrationText().replace(/interval '\d+ days'/, "interval '8 days'");
    const m = forged.match(/trial_ends_at \+ interval '(\d+) days'/);
    expect(Number(m?.[1])).not.toBe(STOREFRONT_GRACE_DAYS);
  });
});
