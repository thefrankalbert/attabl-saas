import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RETENTION } from '../retention';

/**
 * La duree annoncee par la politique de confidentialite pour les sauvegardes
 * doit etre celle que le workflow applique reellement: une duree publique fausse
 * est pire que pas de duree du tout (voir retention.ts).
 */
describe('RETENTION.backupDays', () => {
  it('egale la retention des artefacts de sauvegarde.yml', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/sauvegarde.yml'), 'utf8');
    const valeurs = [...workflow.matchAll(/retention-days:\s*(\d+)/g)].map((m) => Number(m[1]));

    expect(valeurs.length).toBeGreaterThan(0);
    for (const v of valeurs) expect(v).toBe(RETENTION.backupDays);
  });
});
