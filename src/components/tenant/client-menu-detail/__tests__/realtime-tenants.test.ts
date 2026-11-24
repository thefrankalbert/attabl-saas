import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// B134 (revue ligne par ligne, lot B2b-2): la vitrine s'abonnait en temps reel a
// la table `tenants`, sortie de la publication `supabase_realtime` par
// 20260731000100 (le flux re-exposait des colonnes revoquees a anon). Cet
// abonnement ne recevait plus rien. Aucun code ne doit en recreer un.

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const ABONNEMENT_TENANTS = /useRealtimeSubscription[^;]{0,400}?table:\s*'tenants'/;

describe('abonnements temps reel', () => {
  it('aucun abonnement a `tenants` (absente de la publication)', () => {
    const fautifs = sources(join(process.cwd(), 'src')).filter((f) =>
      ABONNEMENT_TENANTS.test(readFileSync(f, 'utf8')),
    );
    expect(fautifs).toEqual([]);
  });

  it('temoin: la recherche trouve un abonnement a une table publiee (`categories`)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/tenant/client-menu-detail/useClientMenuDetail.ts'),
      'utf8',
    );
    expect(/useRealtimeSubscription[^;]{0,400}?table:\s*'categories'/.test(src)).toBe(true);
  });
});
