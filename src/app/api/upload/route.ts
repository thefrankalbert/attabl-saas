import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveSessionAdminUser } from '@/lib/auth/session-admin-user';
import { uploadLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import { readOnboardingSiteParam } from '@/lib/validations/onboarding.schema';

/** Validate file magic bytes to prevent Content-Type spoofing (stored XSS via file upload) */
function validateMagicBytes(buffer: Buffer, declaredType: string): boolean {
  if (buffer.length < 4) return false;

  // JPEG: FF D8 FF
  if (declaredType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  // PNG: 89 50 4E 47
  if (declaredType === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  // WebP: RIFF....WEBP
  if (declaredType === 'image/webp') {
    return (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer.length >= 12 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    );
  }
  return false;
}

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await uploadLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // Which of the user's establishments this file belongs to. Without it the
    // file was stored under the DEFAULT one (most recent unfinished): a logo
    // uploaded while setting up B, or from B's admin, landed in C's folder.
    // - `?site=` (sent by the onboarding): explicit, never replaced by another;
    // - otherwise the tenant of the page (proxy header, or the Referer hint):
    //   only orients the choice, and falls back to the default if it is not
    //   one of the user's memberships (e.g. a super admin), as before.
    // Either way the resolver only picks among the user's OWN memberships.
    const explicitSite = readOnboardingSiteParam(request.url);
    if (explicitSite === undefined) {
      return NextResponse.json({ error: 'Parametre site invalide' }, { status: 400 });
    }
    const pageSite = explicitSite ? null : readTenantSlug(request.headers).slug;

    let session = await resolveSessionAdminUser({
      requireActive: true,
      provisionIfMissing: true,
      siteSlug: explicitSite ?? pageSite,
    });
    if (!session.ok && pageSite) {
      session = await resolveSessionAdminUser({ requireActive: true, provisionIfMissing: true });
    }
    if (!session.ok) {
      return NextResponse.json({ error: session.error }, { status: session.status });
    }
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const bucket = (formData.get('bucket') as string) || 'logos';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate bucket (whitelist)
    const allowedBuckets = ['logos', 'menu-items'];
    if (!allowedBuckets.includes(bucket)) {
      return NextResponse.json({ error: 'Invalid bucket' }, { status: 400 });
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    // Validate mime type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    // Scope uploads to tenant directory for isolation
    const fileName = `${session.adminUser.tenant_id}/${crypto.randomUUID()}_${Date.now()}.${ext}`;

    // Use admin client to bypass RLS
    const admin = createAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate magic bytes to prevent Content-Type spoofing (stored XSS prevention)
    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: 'File content does not match declared type' },
        { status: 400 },
      );
    }

    const { error: uploadError } = await admin.storage.from(bucket).upload(fileName, buffer, {
      upsert: false,
      contentType: file.type,
    });

    if (uploadError) {
      logger.error('Upload failed', { error: uploadError, bucket });
      return NextResponse.json({ error: 'Echec du televersement' }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = admin.storage.from(bucket).getPublicUrl(fileName);

    // Remplacement: supprimer l'objet precedent.
    //
    // L'ancien upload de logo utilisait un nom STABLE (`<tenant>/logo.png`) avec
    // upsert, donc il etait auto-nettoyant. Cette route genere un nom aleatoire:
    // sans suppression explicite, chaque changement de logo laissait un fichier
    // mort, public et facture, indefiniment. Le chemin est verifie contre le
    // prefixe du tenant de la SESSION avant toute suppression - sinon un client
    // pourrait faire effacer le fichier d'un autre restaurant en le declarant
    // comme le sien.
    const replaces = formData.get('replaces');
    if (typeof replaces === 'string' && replaces.length > 0) {
      const prefix = `/storage/v1/object/public/${bucket}/`;
      const idx = replaces.indexOf(prefix);
      const previousPath =
        idx >= 0 ? decodeURIComponent(replaces.slice(idx + prefix.length)) : null;

      if (previousPath && previousPath.startsWith(`${session.adminUser.tenant_id}/`)) {
        const { error: removeError } = await admin.storage.from(bucket).remove([previousPath]);
        // Un echec de nettoyage ne doit pas faire echouer un televersement
        // reussi: le nouveau fichier est deja en place et son URL est valide.
        if (removeError) {
          logger.warn('Ancien fichier non supprime', { bucket, previousPath });
        }
      }
    }

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    logger.error('Upload failed', { error: err });
    return NextResponse.json({ error: 'Echec du televersement' }, { status: 500 });
  }
}
