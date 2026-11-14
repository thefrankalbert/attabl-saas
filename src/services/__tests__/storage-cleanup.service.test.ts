import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { createStorageCleanupService, parseOwnedObject } from '../storage-cleanup.service';

const TENANT = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const BASE = 'https://x.supabase.co/storage/v1/object/public';
const OLD = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

interface FakeOptions {
  referenced?: boolean;
  refError?: boolean;
  tenantRowExists?: boolean;
  listings?: (string | { name: string; id: string | null; created_at?: string })[][];
}

/** Doublure minimale: toute lecture de reference rend `referenced`, le stockage est espionne. */
function fakeAdmin(opts: FakeOptions = {}) {
  const remove = vi.fn().mockResolvedValue({ error: null });
  const getPublicUrl = vi.fn((path: string) => ({
    data: { publicUrl: `${BASE}/menu-items/${path}` },
  }));
  const listings = [...(opts.listings ?? [])];
  const list = vi.fn().mockImplementation(async () => {
    const names = listings.shift() ?? [];
    return {
      data: names.map((n) => (typeof n === 'string' ? { name: n, created_at: OLD } : n)),
      error: null,
    };
  });
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const result = () => {
      if (opts.refError) return { data: null, error: { message: 'boom' } };
      if (table === 'tenants' && opts.tenantRowExists !== undefined && !chain.logo) {
        return { data: opts.tenantRowExists ? { id: TENANT } : null, error: null };
      }
      return { data: opts.referenced ? [{ id: 'x' }] : [], error: null };
    };
    chain.select = () => chain;
    chain.eq = (col: string) => {
      if (col === 'logo_url') chain.logo = true;
      return chain;
    };
    chain.filter = () => chain;
    chain.limit = () => Promise.resolve(result());
    chain.maybeSingle = () => Promise.resolve(result());
    return chain;
  };
  const admin = {
    from: vi.fn((table: string) => builder(table)),
    storage: { from: vi.fn(() => ({ remove, list, getPublicUrl })) },
  } as unknown as SupabaseClient;
  return { admin, remove, list };
}

describe('parseOwnedObject', () => {
  it('accepte une URL publique du dossier du restaurant', () => {
    expect(parseOwnedObject(TENANT, `${BASE}/menu-items/${TENANT}/a.jpg`)).toEqual({
      bucket: 'menu-items',
      path: `${TENANT}/a.jpg`,
    });
  });
  it('refuse le dossier d un autre restaurant (temoin negatif)', () => {
    expect(parseOwnedObject(TENANT, `${BASE}/logos/${OTHER}/a.jpg`)).toBeNull();
  });
  it('refuse un autre bucket, une URL externe, un chemin avec ..', () => {
    expect(parseOwnedObject(TENANT, `${BASE}/tenant-sounds/${TENANT}/a.mp3`)).toBeNull();
    expect(parseOwnedObject(TENANT, 'https://cdn.example.com/a.jpg')).toBeNull();
    expect(parseOwnedObject(TENANT, `${BASE}/logos/${TENANT}/../${OTHER}/a.jpg`)).toBeNull();
    expect(parseOwnedObject(TENANT, null)).toBeNull();
  });
});

describe('release', () => {
  const url = `${BASE}/menu-items/${TENANT}/old.jpg`;

  it('efface un objet qui n est plus reference', async () => {
    const { admin, remove } = fakeAdmin({ referenced: false });
    await createStorageCleanupService(admin).release(TENANT, [url, url]);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([`${TENANT}/old.jpg`]);
  });

  it('n efface PAS un objet encore reference (temoin negatif)', async () => {
    const { admin, remove } = fakeAdmin({ referenced: true });
    await createStorageCleanupService(admin).release(TENANT, [url]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('verifie toutes les sources de reference (logo QR, annonces, banniere, brouillons)', async () => {
    const { admin } = fakeAdmin({ referenced: false });
    await createStorageCleanupService(admin).release(TENANT, [url]);
    const tables = (admin.from as unknown as { mock: { calls: string[][] } }).mock.calls.map(
      (c) => c[0],
    );
    for (const t of [
      'tenants',
      'menu_items',
      'categories',
      'menus',
      'ads',
      'announcements',
      'dish_photo_drafts',
      'qr_designs',
    ]) {
      expect(tables).toContain(t);
    }
  });

  it('n efface pas quand la lecture des references echoue', async () => {
    const { admin, remove } = fakeAdmin({ refError: true });
    await createStorageCleanupService(admin).release(TENANT, [url]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('n efface jamais un objet d un autre restaurant', async () => {
    const { admin, remove } = fakeAdmin({ referenced: false });
    await createStorageCleanupService(admin).release(TENANT, [
      `${BASE}/menu-items/${OTHER}/victime.jpg`,
    ]);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('purgeTenant', () => {
  it('ne purge rien tant que la ligne du restaurant existe (temoin negatif)', async () => {
    const { admin, remove, list } = fakeAdmin({ tenantRowExists: true });
    await createStorageCleanupService(admin).purgeTenant(TENANT);
    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('descend dans un sous-dossier (annonces) avant de supprimer', async () => {
    const { admin, remove } = fakeAdmin({
      tenantRowExists: false,
      listings: [[{ name: 'ads', id: null }], ['pub.jpg'], [], [], [], []],
    });
    await createStorageCleanupService(admin).purgeTenant(TENANT);
    expect(remove).toHaveBeenCalledWith([`${TENANT}/ads/pub.jpg`]);
  });

  it('vide le dossier du restaurant dans chaque bucket quand il a disparu', async () => {
    const { admin, remove } = fakeAdmin({
      tenantRowExists: false,
      listings: [['a.jpg', 'b.jpg'], [], ['c.jpg'], [], []],
    });
    await createStorageCleanupService(admin).purgeTenant(TENANT);
    expect(remove).toHaveBeenCalledWith([`${TENANT}/a.jpg`, `${TENANT}/b.jpg`]);
    expect(remove).toHaveBeenCalledWith([`${TENANT}/c.jpg`]);
  });
});

describe('releaseUnreferencedFiles', () => {
  it('ne touche jamais un fichier de moins de 24 h (temoin negatif)', async () => {
    const { admin, remove } = fakeAdmin({
      referenced: false,
      listings: [[{ name: 'recent.jpg', id: 'x', created_at: new Date().toISOString() }]],
    });
    await createStorageCleanupService(admin).releaseUnreferencedFiles(TENANT);
    expect(remove).not.toHaveBeenCalled();
  });

  it('efface les fichiers du dossier que rien ne reference', async () => {
    const { admin, remove } = fakeAdmin({ referenced: false, listings: [['brouillon.jpg']] });
    await createStorageCleanupService(admin).releaseUnreferencedFiles(TENANT);
    expect(remove).toHaveBeenCalledWith([`${TENANT}/brouillon.jpg`]);
  });

  it('garde les fichiers encore references (temoin negatif)', async () => {
    const { admin, remove } = fakeAdmin({ referenced: true, listings: [['utilise.jpg']] });
    await createStorageCleanupService(admin).releaseUnreferencedFiles(TENANT);
    expect(remove).not.toHaveBeenCalled();
  });
});
