/**
 * Nettoyage ponctuel des fichiers orphelins du stockage (constat R-05).
 *
 * Avant le correctif R-05, aucun fichier n'etait jamais supprime. Ce script
 * REPERTORIE puis, sur demande explicite, efface:
 *   - tout objet d'un dossier `<tenant_id>/` dont le restaurant n'existe plus
 *     (buckets logos, menu-items, images, tenant-sounds);
 *   - dans logos / menu-items / images, tout objet d'un restaurant existant que
 *     plus aucune ligne ne reference (logo, plat meme supprime en douceur,
 *     categorie, carte, annonce).
 * Les sons des restaurants existants ne sont jamais touches: leur reference n'est
 * pas verifiable ici.
 *
 * Usage:
 *   npx tsx scripts/nettoyer-stockage-orphelin.ts            # --dry-run (defaut): compte et chemins
 *   npx tsx scripts/nettoyer-stockage-orphelin.ts --apply    # efface
 *
 * --apply exige CONFIRM_PROD_STORAGE_CLEANUP=yes dans l'environnement. Les
 * identifiants viennent de NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.
 * Une erreur de lecture d'une table de references arrete le script: dans le doute,
 * on n'efface rien.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const TENANT_BUCKETS = ['logos', 'menu-items', 'images', 'tenant-sounds'] as const;
const REFERENCED_BUCKETS = new Set<string>(['logos', 'menu-items', 'images']);
const PAGE = 1000;
const REMOVE_BATCH = 100;

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(message: string): never {
  process.stderr.write(`ERREUR: ${message}\n`);
  process.exit(1);
}

/** Cle `bucket/chemin` d'une URL publique de stockage, ou null. */
function objectKey(url: unknown): string | null {
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

async function selectAll(
  admin: SupabaseClient,
  table: string,
  columns: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) fail(`lecture de ${table}: ${error.message}`);
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function listFolder(admin: SupabaseClient, bucket: string, prefix: string) {
  const entries: { name: string; id: string | null }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error) fail(`liste de ${bucket}/${prefix}: ${error.message}`);
    entries.push(...(data ?? []));
    if (!data || data.length < PAGE) return entries;
  }
}

/** Tous les fichiers sous un prefixe (descend dans les sous-dossiers). */
async function listFiles(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await listFolder(admin, bucket, prefix)) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) files.push(...(await listFiles(admin, bucket, path)));
    else files.push(path);
  }
  return files;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  if (apply && args.includes('--dry-run')) fail('--apply et --dry-run sont exclusifs.');
  if (apply && process.env.CONFIRM_PROD_STORAGE_CLEANUP !== 'yes') {
    fail('--apply exige CONFIRM_PROD_STORAGE_CLEANUP=yes. Rien n a ete efface.');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.');
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tenantRows = await selectAll(admin, 'tenants', 'id, logo_url');
  const tenantIds = new Set(tenantRows.map((r) => String(r.id)));

  const referenced = new Set<string>();
  const addRef = (value: unknown) => {
    const k = objectKey(value);
    if (k) referenced.add(k);
  };
  for (const r of tenantRows) addRef(r.logo_url);
  for (const r of await selectAll(admin, 'menu_items', 'image_url, images')) {
    addRef(r.image_url);
    if (Array.isArray(r.images)) r.images.forEach(addRef);
  }
  for (const table of ['categories', 'menus', 'ads']) {
    for (const r of await selectAll(admin, table, 'image_url')) addRef(r.image_url);
  }

  const orphans: { bucket: string; path: string; why: string }[] = [];
  for (const bucket of TENANT_BUCKETS) {
    for (const folder of await listFolder(admin, bucket, '')) {
      if (folder.id !== null) continue; // fichier a la racine: hors perimetre
      const tenantAlive = tenantIds.has(folder.name);
      if (!tenantAlive) {
        for (const path of await listFiles(admin, bucket, folder.name)) {
          orphans.push({ bucket, path, why: 'restaurant supprime' });
        }
      } else if (REFERENCED_BUCKETS.has(bucket)) {
        for (const path of await listFiles(admin, bucket, folder.name)) {
          if (!referenced.has(`${bucket}/${path}`)) {
            orphans.push({ bucket, path, why: 'non reference' });
          }
        }
      }
    }
  }

  out(`${apply ? 'APPLY' : 'DRY-RUN'}: ${orphans.length} fichier(s) orphelin(s)`);
  for (const o of orphans) out(`${o.bucket}/${o.path}  (${o.why})`);
  if (!apply) {
    out('Rien n a ete efface. Relancer avec --apply et CONFIRM_PROD_STORAGE_CLEANUP=yes.');
    return;
  }

  let removed = 0;
  for (const bucket of TENANT_BUCKETS) {
    const paths = orphans.filter((o) => o.bucket === bucket).map((o) => o.path);
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + REMOVE_BATCH));
      if (error) fail(`suppression dans ${bucket}: ${error.message} (${removed} deja efface(s))`);
      removed += Math.min(REMOVE_BATCH, paths.length - i);
    }
  }
  out(`${removed} fichier(s) efface(s).`);
}

void main();
