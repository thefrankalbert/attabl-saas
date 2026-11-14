import { describe, it, expect } from 'vitest';
import {
  confirmWithFreshSnapshot,
  isTenantFolderName,
  objectKey,
  orphanReason,
  selectOrphans,
  type OrphanCandidate,
  type OrphanSnapshot,
} from '../orphan-rules';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const OLD = '2026-11-01T00:00:00Z';
const RECENT = '2026-11-14T06:00:00Z';
const LIVE = '11111111-1111-1111-1111-111111111111';
const GONE = '22222222-2222-2222-2222-222222222222';

function snap(over: Partial<OrphanSnapshot> = {}): OrphanSnapshot {
  return { tenantIds: new Set([LIVE]), referenced: new Set<string>(), ...over };
}
function cand(over: Partial<OrphanCandidate> = {}): OrphanCandidate {
  return {
    bucket: 'menu-items',
    tenantFolder: LIVE,
    path: `${LIVE}/a.jpg`,
    createdAt: OLD,
    ...over,
  };
}

describe('isTenantFolderName', () => {
  it('accepte un UUID, refuse un slug (temoin negatif: lepicurien)', () => {
    expect(isTenantFolderName(LIVE)).toBe(true);
    expect(isTenantFolderName('lepicurien')).toBe(false);
  });
});

describe('objectKey', () => {
  it('extrait bucket/chemin et ignore une URL externe', () => {
    expect(objectKey(`https://x.co/storage/v1/object/public/logos/${LIVE}/l.png?v=2`)).toBe(
      `logos/${LIVE}/l.png`,
    );
    expect(objectKey('https://cdn.example.com/a.png')).toBeNull();
    expect(objectKey(null)).toBeNull();
  });
});

describe('orphanReason', () => {
  it('restaurant existant, non reference, vieux: orphelin', () => {
    expect(orphanReason(snap(), cand(), NOW)).toBe('non reference');
  });

  it('un dossier slug de demonstration n est JAMAIS selectionne', () => {
    const c = cand({ tenantFolder: 'lepicurien', path: 'lepicurien/a.jpg' });
    expect(orphanReason(snap(), c, NOW)).toBeNull();
    expect(selectOrphans(snap(), [c], NOW)).toEqual([]);
  });

  it('un fichier reference est garde, restaurant existant comme supprime', () => {
    const live = cand();
    const gone = cand({ tenantFolder: GONE, path: `${GONE}/b.jpg` });
    const s = snap({ referenced: new Set([`menu-items/${live.path}`, `menu-items/${gone.path}`]) });
    expect(orphanReason(s, live, NOW)).toBeNull();
    expect(orphanReason(s, gone, NOW)).toBeNull();
  });

  it('restaurant supprime et non reference: orphelin', () => {
    const gone = cand({ tenantFolder: GONE, path: `${GONE}/b.jpg` });
    expect(orphanReason(snap(), gone, NOW)).toBe('restaurant supprime et non reference');
  });

  it('un fichier de moins de 24 h ou sans date est garde', () => {
    expect(orphanReason(snap(), cand({ createdAt: RECENT }), NOW)).toBeNull();
    expect(orphanReason(snap(), cand({ createdAt: null }), NOW)).toBeNull();
    expect(orphanReason(snap(), cand({ createdAt: 'pas une date' }), NOW)).toBeNull();
  });

  it('sons: gardes pour un restaurant existant, orphelins si le restaurant a disparu', () => {
    expect(orphanReason(snap(), cand({ bucket: 'tenant-sounds' }), NOW)).toBeNull();
    const gone = cand({ bucket: 'tenant-sounds', tenantFolder: GONE, path: `${GONE}/s.mp3` });
    expect(orphanReason(snap(), gone, NOW)).not.toBeNull();
  });
});

describe('confirmWithFreshSnapshot', () => {
  it('un candidat devenu reference depuis la liste est abandonne', () => {
    const a = cand({ path: `${LIVE}/a.jpg` });
    const b = cand({ path: `${LIVE}/b.jpg` });
    const fresh = snap({ referenced: new Set([`menu-items/${b.path}`]) });
    expect(confirmWithFreshSnapshot(fresh, [a, b], NOW)).toEqual([a]);
  });

  it('un restaurant recree ne sauve pas un fichier qui reste non reference', () => {
    const c = cand({ tenantFolder: GONE, path: `${GONE}/b.jpg` });
    const fresh = snap({ tenantIds: new Set([LIVE, GONE]) });
    // le restaurant existe a nouveau mais le fichier n est toujours pas reference
    expect(confirmWithFreshSnapshot(fresh, [c], NOW)).toEqual([c]);
  });
});
