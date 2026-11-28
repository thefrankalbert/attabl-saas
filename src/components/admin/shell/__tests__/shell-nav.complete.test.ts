import { describe, it, expect } from 'vitest';
import { MAIN, CATALOGUE, MARKETING, GESTION, ANALYSE, activeNavPath } from '../shell-nav';

// Audit d'equipe du 2026-11-27 (DASH-16, DASH-18): 11 pages du restaurant
// n'avaient aucun lien dans la barre laterale.

const items = [...MAIN, ...CATALOGUE, ...MARKETING, ...GESTION, ...ANALYSE];
const all = items.map((i) => i.path);

describe('barre laterale: toutes les pages ont leur lien', () => {
  it.each(['/announcements', '/coupons', '/suggestions', '/ads', '/supports', '/inventory/counts'])(
    '%s',
    (path) => {
      expect(all).toContain(path);
    },
  );
});

describe('activeNavPath: le lien le plus precis', () => {
  const base = '/sites/resto/admin';
  it.each(['/reports/venues', '/reports/advanced', '/invoices', '/audit-logs'])(
    'page d analyse %s (onglets de Rapports): "Rapports" reste actif',
    (path) => {
      expect(activeNavPath(`${base}${path}`, base, items)).toBe('/reports');
    },
  );
  it.each(['/stock-history', '/stock-losses'])('%s garde son propre lien', (path) => {
    expect(activeNavPath(`${base}${path}`, base, items)).toBe(path);
  });
  it('sur /inventory/counts/abc, "Inventaires physiques" et non "Inventaire"', () => {
    expect(activeNavPath(`${base}/inventory/counts/abc`, base, items)).toBe('/inventory/counts');
  });
  it('sur /reports, "Rapports" (temoin)', () => {
    expect(activeNavPath(`${base}/reports`, base, items)).toBe('/reports');
  });
  it('tableau de bord', () => {
    expect(activeNavPath(base, base, items)).toBe('');
  });
});
