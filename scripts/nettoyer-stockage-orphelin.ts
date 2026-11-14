/**
 * Nettoyage ponctuel des fichiers orphelins du stockage (constat R-05).
 *
 * Avant le correctif R-05, aucun fichier n'etait jamais supprime. Ce script
 * REPERTORIE puis, sur demande explicite, efface un fichier seulement si TOUTES
 * ces conditions tiennent (regles dans src/lib/storage/orphan-rules.ts, testees):
 *   - il est sous un dossier de premier niveau dont le nom est un UUID (un autre
 *     nom, par exemple le slug `lepicurien/` des donnees de demonstration, n'est
 *     jamais touche);
 *   - plus aucune ligne ne le reference: logo et banniere du restaurant, plat
 *     (meme supprime en douceur), categorie, carte, annonce, publicite, brouillon
 *     de photo, logo d'un design QR. Cela vaut AUSSI pour les dossiers de
 *     restaurants supprimes;
 *   - il a plus de 24 h (un envoi en cours n'est jamais efface);
 *   - juste avant la suppression, les references sont relues et le fichier est
 *     reverifie.
 * Buckets: logos, menu-items, images, tenant-sounds. Les sons ne sont verifies que
 * pour les restaurants supprimes: leur reference n'est pas lisible ici.
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
import {
  confirmWithFreshSnapshot,
  isTenantFolderName,
  objectKey,
  selectOrphans,
  type OrphanCandidate,
  type OrphanSnapshot,
} from '../src/lib/storage/orphan-rules';

const TENANT_BUCKETS = ['logos', 'menu-items', 'images', 'tenant-sounds'] as const;
const PAGE = 1000;
const REMOVE_BATCH = 100;

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(message: string): never {
  process.stderr.write(`ERREUR: ${message}\n`);
  process.exit(1);
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
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) fail(`lecture de ${table}: ${error.message}`);
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function listFolder(admin: SupabaseClient, bucket: string, prefix: string) {
  const entries: { name: string; id: string | null; created_at: string | null }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error) fail(`liste de ${bucket}/${prefix}: ${error.message}`);
    entries.push(...(data ?? []));
    if (!data || data.length < PAGE) return entries;
  }
}

/** Tous les fichiers sous un prefixe (descend dans les sous-dossiers). */
async function listFiles(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<{ path: string; createdAt: string | null }[]> {
  const files: { path: string; createdAt: string | null }[] = [];
  for (const entry of await listFolder(admin, bucket, prefix)) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) files.push(...(await listFiles(admin, bucket, path)));
    else files.push({ path, createdAt: entry.created_at });
  }
  return files;
}

/** Restaurants existants et cles `bucket/chemin` de tout ce qui est reference. */
async function readSnapshot(admin: SupabaseClient): Promise<OrphanSnapshot> {
  const tenantRows = await selectAll(admin, 'tenants', 'id, logo_url, banner_url');
  const referenced = new Set<string>();
  const addRef = (value: unknown) => {
    const k = objectKey(value);
    if (k) referenced.add(k);
  };
  for (const r of tenantRows) {
    addRef(r.logo_url);
    addRef(r.banner_url);
  }
  for (const r of await selectAll(admin, 'menu_items', 'image_url, images')) {
    addRef(r.image_url);
    if (Array.isArray(r.images)) r.images.forEach(addRef);
  }
  for (const table of ['categories', 'menus', 'ads', 'announcements']) {
    for (const r of await selectAll(admin, table, 'image_url')) addRef(r.image_url);
  }
  for (const r of await selectAll(admin, 'dish_photo_drafts', 'public_url')) addRef(r.public_url);
  for (const r of await selectAll(admin, 'qr_designs', 'logo_src:config->logo->>src')) {
    addRef(r.logo_src);
  }
  return { tenantIds: new Set(tenantRows.map((r) => String(r.id))), referenced };
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

  const snap = await readSnapshot(admin);

  const candidates: OrphanCandidate[] = [];
  let ignoredFolders = 0;
  for (const bucket of TENANT_BUCKETS) {
    for (const folder of await listFolder(admin, bucket, '')) {
      if (folder.id !== null) continue; // fichier a la racine: hors perimetre
      if (!isTenantFolderName(folder.name)) {
        ignoredFolders += 1; // pas un dossier de restaurant (ex. slug de demonstration)
        continue;
      }
      for (const file of await listFiles(admin, bucket, folder.name)) {
        candidates.push({ bucket, tenantFolder: folder.name, ...file });
      }
    }
  }

  const selected = selectOrphans(snap, candidates, Date.now());
  out(`${apply ? 'APPLY' : 'DRY-RUN'}: ${selected.length} fichier(s) orphelin(s)`);
  out(`${ignoredFolders} dossier(s) de premier niveau ignore(s) (nom non UUID)`);
  for (const s of selected) out(`${s.candidate.bucket}/${s.candidate.path}  (${s.why})`);
  if (!apply) {
    out('Rien n a ete efface. Relancer avec --apply et CONFIRM_PROD_STORAGE_CLEANUP=yes.');
    return;
  }

  // Relecture juste avant d'effacer: une reference apparue depuis la liste, ou un
  // restaurant recree, sauve le fichier.
  const fresh = await readSnapshot(admin);
  const toRemove = confirmWithFreshSnapshot(
    fresh,
    selected.map((s) => s.candidate),
    Date.now(),
  );
  out(`${selected.length - toRemove.length} fichier(s) sauve(s) par la relecture.`);

  let removed = 0;
  for (const bucket of TENANT_BUCKETS) {
    const paths = toRemove.filter((c) => c.bucket === bucket).map((c) => c.path);
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + REMOVE_BATCH));
      if (error) fail(`suppression dans ${bucket}: ${error.message} (${removed} deja efface(s))`);
      removed += Math.min(REMOVE_BATCH, paths.length - i);
    }
  }
  out(`${removed} fichier(s) efface(s).`);
}

void main();
