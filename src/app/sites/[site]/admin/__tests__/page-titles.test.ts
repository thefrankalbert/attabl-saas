import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import fr from '@/messages/fr-FR.json';
import en from '@/messages/en-US.json';

vi.mock('next-intl/server', () => ({
  getTranslations: async (ns: string) => (key: string) => `${ns}.${key}`,
}));

/**
 * Audit de mise en production (2026-11-23, 2.4.2): les 27 pages admin avaient le
 * meme titre d'onglet. Chaque page du tableau de bord declare maintenant son
 * titre ("Commandes - ATTABL") via adminPageMetadata, et la cle de traduction
 * visee existe en francais ET en anglais.
 */

const ADMIN_DIR = join(__dirname, '..');

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...pageFiles(full));
    else if (name === 'page.tsx') out.push(full);
  }
  return out;
}

function lookup(tree: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined),
      tree,
    );
}

describe('titres des pages du tableau de bord', () => {
  const files = pageFiles(ADMIN_DIR);

  it('trouve les pages (temoin: il y en a plus de 30)', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it.each(files.map((f) => [f.slice(ADMIN_DIR.length + 1), f]))(
    '%s declare son titre avec une cle de traduction existante',
    (_name, file) => {
      const src = readFileSync(file, 'utf8');
      const m = src.match(/adminPageMetadata\('([^']+)', '([^']+)'\)/);
      expect(m, 'generateMetadata manquant').not.toBeNull();
      const [, ns, key] = m as RegExpMatchArray;
      expect(typeof lookup(fr, `${ns}.${key}`)).toBe('string');
      expect(typeof lookup(en, `${ns}.${key}`)).toBe('string');
    },
  );

  it('temoin negatif: une cle qui n existe pas est vue comme absente', () => {
    expect(lookup(fr, 'sidebar.cleQuiNexistePas')).toBeUndefined();
  });

  it('adminPageMetadata compose "Libelle - ATTABL"', async () => {
    const { adminPageMetadata } = await import('@/lib/admin-page-metadata');
    expect(await adminPageMetadata('sidebar', 'navOrders')).toEqual({
      title: 'sidebar.navOrders - ATTABL',
    });
  });
});
