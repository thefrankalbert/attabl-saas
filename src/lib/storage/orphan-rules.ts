/**
 * Regles de decision du nettoyage des fichiers orphelins (constat R-05), pures et
 * testees. Le script `scripts/nettoyer-stockage-orphelin.ts` ne fait que lire la
 * base et le stockage, puis appliquer ces regles.
 */

export const MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** Buckets dont les fichiers sont verifies contre les lignes qui les referencent. */
const REFERENCED_BUCKETS = new Set<string>(['logos', 'menu-items', 'images']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OrphanSnapshot {
  /** Identifiants des restaurants qui existent. */
  tenantIds: ReadonlySet<string>;
  /** Cles `bucket/chemin` de tout ce qui est reference par une ligne. */
  referenced: ReadonlySet<string>;
}

export interface OrphanCandidate {
  bucket: string;
  /** Dossier de premier niveau (identifiant de restaurant). */
  tenantFolder: string;
  path: string;
  createdAt: string | null;
}

/** Un dossier de premier niveau est un dossier de restaurant seulement si son nom est un UUID. */
export function isTenantFolderName(name: string): boolean {
  return UUID_RE.test(name);
}

/** Cle `bucket/chemin` d'une URL publique de stockage, ou null. */
export function objectKey(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const marker = '/storage/v1/object/public/';
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  try {
    return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
  } catch {
    return null;
  }
}

/** Date inconnue ou invalide = trop jeune: dans le doute, on garde. */
export function oldEnough(createdAt: string | null, now: number): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && now - t >= MIN_AGE_MS;
}

/**
 * Raison pour laquelle le fichier est orphelin dans CET instantane, ou null s'il
 * doit etre garde. Un fichier reference est garde, que son restaurant existe ou
 * non. Les sons (bucket non verifie) ne sont orphelins que si leur restaurant a
 * disparu.
 */
export function orphanReason(snap: OrphanSnapshot, c: OrphanCandidate, now: number): string | null {
  if (!isTenantFolderName(c.tenantFolder)) return null;
  if (!oldEnough(c.createdAt, now)) return null;
  if (snap.referenced.has(`${c.bucket}/${c.path}`)) return null;
  if (!snap.tenantIds.has(c.tenantFolder)) return 'restaurant supprime et non reference';
  return REFERENCED_BUCKETS.has(c.bucket) ? 'non reference' : null;
}

/** Les candidats a effacer d'apres l'instantane. */
export function selectOrphans(
  snap: OrphanSnapshot,
  candidates: readonly OrphanCandidate[],
  now: number,
): { candidate: OrphanCandidate; why: string }[] {
  const out: { candidate: OrphanCandidate; why: string }[] = [];
  for (const candidate of candidates) {
    const why = orphanReason(snap, candidate, now);
    if (why) out.push({ candidate, why });
  }
  return out;
}

/** Ne garde, parmi les candidats deja choisis, que ceux que l'instantane frais confirme. */
export function confirmWithFreshSnapshot(
  fresh: OrphanSnapshot,
  selected: readonly OrphanCandidate[],
  now: number,
): OrphanCandidate[] {
  return selected.filter((c) => orphanReason(fresh, c, now) !== null);
}
