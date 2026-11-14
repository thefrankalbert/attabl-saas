import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { REFERENCE_SOURCES, oldEnough } from '@/lib/storage/orphan-rules';

/**
 * Nettoyage du stockage (constat R-05).
 *
 * Avant: aucune photo, aucun logo n'etait jamais supprime. Remplacer une image
 * laissait l'ancien fichier public et facture pour toujours, et supprimer un
 * restaurant laissait tout son dossier.
 *
 * Regles, toutes verifiees avant d'effacer quoi que ce soit:
 *  - seuls les buckets publics `logos`, `menu-items` et `images` (annonces) sont concernes;
 *  - l'objet doit etre sous le dossier `<tenant_id>/` du restaurant de la SESSION
 *    (un chemin forge vers le dossier d'un autre restaurant est ignore);
 *  - un objet encore reference par une ligne du restaurant (logo, plat, meme
 *    supprime en douceur, categorie, carte) n'est JAMAIS efface. Un plat supprime
 *    en douceur garde sa photo: le suivi de commande du convive l'affiche encore;
 *  - au moindre doute (erreur de lecture), on n'efface pas;
 *  - tout est au mieux: une erreur est journalisee et n'echoue jamais l'action
 *    appelante, dont l'ecriture en base est deja faite.
 */

const IMAGE_BUCKETS = ['logos', 'menu-items', 'images'] as const;
type ImageBucket = (typeof IMAGE_BUCKETS)[number];

/** Tous les buckets dont les objets sont ranges sous `<tenant_id>/`. */
const TENANT_FOLDER_BUCKETS = ['logos', 'menu-items', 'images', 'tenant-sounds'] as const;

const MAX_PURGE_PASSES = 20;
const PURGE_PAGE_SIZE = 1000;

type ImageTable = 'menu_items' | 'categories' | 'menus' | 'ads';

export interface OwnedObject {
  bucket: ImageBucket;
  path: string;
}

/**
 * `url` est-elle l'URL publique d'un objet de CE restaurant ? Retourne le bucket
 * et le chemin, ou null (URL externe, autre bucket, autre restaurant, chemin
 * suspect).
 */
export function parseOwnedObject(tenantId: string, url: unknown): OwnedObject | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  for (const bucket of IMAGE_BUCKETS) {
    const prefix = `/storage/v1/object/public/${bucket}/`;
    const idx = url.indexOf(prefix);
    if (idx < 0) continue;
    let path: string;
    try {
      path = decodeURIComponent(url.slice(idx + prefix.length).split('?')[0]);
    } catch {
      return null;
    }
    if (!path.startsWith(`${tenantId}/`) || path.split('/').includes('..')) return null;
    return { bucket, path };
  }
  return null;
}

/** Les URLs d'une valeur `images` (jsonb: tableau de chaines attendu). */
function urlsFromImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export interface StorageCleanupService {
  /** Les URLs d'image portees aujourd'hui par une ligne. Jamais d'exception. */
  imageUrlsOf(table: ImageTable, id: string, tenantId: string): Promise<string[]>;
  /** Le logo actuel du restaurant. Jamais d'exception. */
  logoUrlOf(tenantId: string): Promise<string[]>;
  /** Efface ceux de ces objets qui ne sont plus references. Jamais d'exception. */
  release(tenantId: string, urls: readonly string[]): Promise<void>;
  /**
   * Efface les fichiers du dossier du restaurant (buckets d'images) que plus
   * aucune ligne ne reference: photos envoyees pendant l'onboarding puis
   * retirees ou remplacees du brouillon. Jamais d'exception.
   */
  releaseUnreferencedFiles(tenantId: string): Promise<void>;
  /** Efface le dossier du restaurant dans chaque bucket. Jamais d'exception. */
  purgeTenant(tenantId: string): Promise<void>;
}

export function createStorageCleanupService(admin: SupabaseClient): StorageCleanupService {
  async function stillReferenced(tenantId: string, url: string): Promise<boolean> {
    const checks = await Promise.all(
      REFERENCE_SOURCES.map((source) => {
        const query = admin.from(source.table).select('id').eq(source.tenantColumn, tenantId);
        const matching =
          source.kind === 'json-array'
            ? query.filter(source.column, 'cs', JSON.stringify([url]))
            : query.eq(source.column, url);
        return matching.limit(1);
      }),
    );
    // Une lecture en erreur compte comme "reference": dans le doute, on garde.
    return checks.some((r) => r.error !== null || (r.data?.length ?? 0) > 0);
  }

  return {
    async imageUrlsOf(table, id, tenantId) {
      try {
        const columns = table === 'menu_items' ? 'image_url, images' : 'image_url';
        const { data, error } = await admin
          .from(table)
          .select(columns)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (error || !data) return [];
        const row = data as unknown as { image_url?: unknown; images?: unknown };
        return [row.image_url, ...urlsFromImages(row.images)].filter(
          (v): v is string => typeof v === 'string' && v.length > 0,
        );
      } catch (err) {
        logger.warn('Nettoyage stockage: lecture des images impossible', { table, error: err });
        return [];
      }
    },

    async logoUrlOf(tenantId) {
      try {
        const { data, error } = await admin
          .from('tenants')
          .select('logo_url')
          .eq('id', tenantId)
          .maybeSingle();
        if (error || !data || typeof data.logo_url !== 'string' || data.logo_url.length === 0) {
          return [];
        }
        return [data.logo_url];
      } catch (err) {
        logger.warn('Nettoyage stockage: lecture du logo impossible', { error: err });
        return [];
      }
    },

    async release(tenantId, urls) {
      try {
        for (const url of new Set(urls)) {
          const owned = parseOwnedObject(tenantId, url);
          if (!owned) continue;
          if (await stillReferenced(tenantId, url)) continue;
          const { error } = await admin.storage.from(owned.bucket).remove([owned.path]);
          if (error) {
            logger.warn('Ancien fichier non supprime', { bucket: owned.bucket, path: owned.path });
          }
        }
      } catch (err) {
        logger.warn('Nettoyage stockage: echec', { error: err });
      }
    },

    async releaseUnreferencedFiles(tenantId) {
      try {
        for (const bucket of IMAGE_BUCKETS) {
          const { data: entries, error } = await admin.storage
            .from(bucket)
            .list(tenantId, { limit: PURGE_PAGE_SIZE });
          if (error || !entries) continue;
          const now = Date.now();
          const urls = entries
            .filter((entry) => entry.id !== null)
            .filter((entry) => oldEnough(entry.created_at, now))
            .map(
              (entry) =>
                admin.storage.from(bucket).getPublicUrl(`${tenantId}/${entry.name}`).data.publicUrl,
            );
          // `release` re-verifie dossier du restaurant et references.
          await this.release(tenantId, urls);
        }
      } catch (err) {
        logger.warn('Nettoyage stockage: fichiers non references non liberes', { error: err });
      }
    },

    async purgeTenant(tenantId) {
      try {
        // Garde: ne rien effacer tant que la ligne du restaurant existe (ou si on
        // ne sait pas).
        const { data, error } = await admin
          .from('tenants')
          .select('id')
          .eq('id', tenantId)
          .maybeSingle();
        if (error || data) return;

        for (const bucket of TENANT_FOLDER_BUCKETS) {
          for (let pass = 0; pass < MAX_PURGE_PASSES; pass++) {
            const { data: entries, error: listError } = await admin.storage
              .from(bucket)
              .list(tenantId, { limit: PURGE_PAGE_SIZE });
            if (listError || !entries || entries.length === 0) break;
            const paths: string[] = [];
            for (const entry of entries) {
              const path = `${tenantId}/${entry.name}`;
              if (entry.id !== null) {
                paths.push(path);
                continue;
              }
              // Sous-dossier (ex. annonces `<tenant>/ads/`): un niveau suffit.
              const { data: nested } = await admin.storage
                .from(bucket)
                .list(path, { limit: PURGE_PAGE_SIZE });
              for (const file of nested ?? []) paths.push(`${path}/${file.name}`);
            }
            if (paths.length === 0) break;
            const { error: removeError } = await admin.storage.from(bucket).remove(paths);
            if (removeError) {
              logger.warn('Dossier du restaurant non vide apres purge', { bucket });
              break;
            }
          }
        }
      } catch (err) {
        logger.warn('Nettoyage stockage: purge du restaurant echouee', { error: err });
      }
    },
  };
}

/** Le service avec le client service_role. Ne leve jamais, meme sans identifiants. */
export function getStorageCleanup(): StorageCleanupService {
  try {
    return createStorageCleanupService(createAdminClient());
  } catch (err) {
    logger.warn('Nettoyage stockage indisponible', { error: err });
    return {
      imageUrlsOf: async () => [],
      logoUrlOf: async () => [],
      release: async () => undefined,
      releaseUnreferencedFiles: async () => undefined,
      purgeTenant: async () => undefined,
    };
  }
}
