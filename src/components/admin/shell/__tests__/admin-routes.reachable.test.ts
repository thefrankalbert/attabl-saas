import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MAIN, CATALOGUE, MARKETING, GESTION, ANALYSE } from '../shell-nav';
import { ANALYSE_TABS } from '../../AnalyseTabs';
import type { Poste } from '@/types/permission.types';
import { getEffectiveLevels, meetsRequirement } from '@/lib/permissions';
import { permissionForAdminSubPath } from '@/lib/auth/admin-route-permissions';

// Audit d'equipe du 2026-11-27 (DASH-16, DASH-18) et son contre-audit: chaque
// page du restaurant doit avoir un chemin dans l'interface. Ce test lit les
// VRAIES routes: une nouvelle page sans lien le fait echouer.

const ADMIN_DIR = join(process.cwd(), 'src/app/sites/[site]/admin');

function routes(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory() || name === '__tests__') continue;
    if (name.startsWith('[')) continue; // fiches de detail, ouvertes depuis leur liste
    const segment = name.startsWith('(') ? '' : `/${name}`; // groupe de routes
    try {
      statSync(join(full, 'page.tsx'));
      if (segment) out.push(prefix + segment);
    } catch {
      /* pas de page a ce niveau */
    }
    out.push(...routes(full, prefix + segment));
  }
  return out;
}

const sidebar = [...MAIN, ...CATALOGUE, ...MARKETING, ...GESTION, ...ANALYSE];

// Pages atteintes AILLEURS que par la barre ou les onglets d'analyse, avec le
// composant qui porte le lien (verifie a la main lors de l'audit).
const REACHED_ELSEWHERE: Record<string, string> = {
  '/settings': 'ShellAccountMenu, SettingsDialog',
  '/settings/espaces': 'onglets de /settings',
  '/settings/permissions': 'onglets de /settings',
  '/settings/tables': 'onglets de /settings',
  '/users': 'SettingsDialog (personnel)',
  '/subscription': 'SidebarPlanCard',
  '/support': 'ShellAccountMenu',
  '/inventory/reports': 'InventoryClient',
  '/orders/house-accounts': 'OrdersToolbar',
};

describe('toutes les pages admin ont un chemin dans l interface', () => {
  const linked = new Set([
    ...sidebar.map((i) => i.path),
    ...ANALYSE_TABS.map((t) => t.path),
    ...Object.keys(REACHED_ELSEWHERE),
  ]);
  it.each(routes(ADMIN_DIR))('%s', (route) => {
    expect(linked.has(route)).toBe(true);
  });

  it('la lecture des routes trouve bien les pages (temoin)', () => {
    expect(routes(ADMIN_DIR)).toEqual(expect.arrayContaining(['/coupons', '/reports/venues']));
  });
});

describe('liens visibles selon le poste (droits par defaut)', () => {
  const visibleFor = (poste: Poste) => {
    const levels = getEffectiveLevels({ postes: [poste] });
    return sidebar
      .filter((i) => {
        const required = permissionForAdminSubPath(i.path);
        return required == null || meetsRequirement(levels, required);
      })
      .map((i) => i.path);
  };

  it('le chef (sans reports.money) atteint les pertes par leur propre lien', () => {
    const chef = visibleFor('chef');
    expect(chef).not.toContain('/reports');
    expect(chef).toContain('/stock-losses');
  });

  it('le proprietaire voit Rapports (temoin)', () => {
    expect(visibleFor('owner')).toContain('/reports');
  });
});
