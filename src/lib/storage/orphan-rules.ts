/**
 * Regles de decision du nettoyage des fichiers orphelins (constat R-05), pures et
 * testees. Le script `scripts/nettoyer-stockage-orphelin.ts` ne fait que lire la
 * base et le stockage, puis appliquer ces regles.
 */

/** Un fichier plus jeune que ca n'est jamais efface par un balayage (envoi en cours). */
export const MIN_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * UNE seule liste des colonnes qui peuvent referencer un fichier du stockage.
 * Le service (verification avant effacement) et le script (instantane) la lisent
 * toutes les deux: ajouter une colonne ici protege les deux chemins.
 *   - text: la colonne contient l'URL publique;
 *   - json-array: la colonne jsonb est un tableau d'URL;
 *   - json-path: `column` est un chemin jsonb `col->a->>b` qui rend l'URL.
 */
export interface ReferenceSource {
  table: string;
  /** Colonne qui porte l'identifiant du restaurant (`id` pour la table tenants). */
  tenantColumn: 'id' | 'tenant_id';
  column: string;
  kind: 'text' | 'json-array' | 'json-path';
}

export const REFERENCE_SOURCES: readonly ReferenceSource[] = [
  { table: 'tenants', tenantColumn: 'id', column: 'logo_url', kind: 'text' },
  { table: 'tenants', tenantColumn: 'id', column: 'banner_url', kind: 'text' },
  { table: 'menu_items', tenantColumn: 'tenant_id', column: 'image_url', kind: 'text' },
  { table: 'menu_items', tenantColumn: 'tenant_id', column: 'images', kind: 'json-array' },
  { table: 'categories', tenantColumn: 'tenant_id', column: 'image_url', kind: 'text' },
  { table: 'menus', tenantColumn: 'tenant_id', column: 'image_url', kind: 'text' },
  { table: 'ads', tenantColumn: 'tenant_id', column: 'image_url', kind: 'text' },
  { table: 'announcements', tenantColumn: 'tenant_id', column: 'image_url', kind: 'text' },
  // Aucun chemin du code n'ecrit dans cette table aujourd'hui, mais une ligne qui
  // pointe un fichier le garde.
  { table: 'dish_photo_drafts', tenantColumn: 'tenant_id', column: 'public_url', kind: 'text' },
  {
    table: 'qr_designs',
    tenantColumn: 'tenant_id',
    column: 'config->logo->>src',
    kind: 'json-path',
  },
];

/** Expression `select` d'une source (alias pour un chemin jsonb). */
export function referenceSelect(source: ReferenceSource): string {
  return source.kind === 'json-path' ? `ref:${source.column}` : source.column;
}

/** Les URL portees par une ligne lue avec `referenceSelect`. */
export function referenceUrls(source: ReferenceSource, row: Record<string, unknown>): string[] {
  const value = source.kind === 'json-path' ? row.ref : row[source.column];
  if (source.kind === 'json-array') {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  }
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

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

/**
 * Un dossier de premier niveau est un dossier de restaurant seulement si son nom
 * est un UUID.
 *
 * Limite acceptee: un dossier nomme par un UUID qui n'est PAS celui d'un
 * restaurant (ayant existe) serait classe "restaurant supprime". Aucune source ne
 * conserve la liste des restaurants passes (le journal plateforme met tenant_id a
 * NULL a la suppression), et aucun code n'ecrit de dossier de ce genre: les
 * envois sont tous ranges sous `<tenant_id>/` par /api/upload et les actions.
 * Un tel fichier reste protege s'il est reference, a moins de 24 h, ou sous un
 * autre nom que UUID.
 */
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
