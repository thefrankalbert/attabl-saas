import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveSessionAdminUser } from '@/lib/auth/session-admin-user';
import { uploadLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import { resolveAdminPermission } from '@/lib/auth/resolve-admin-permission';
import { readOnboardingSiteParam } from '@/lib/validations/onboarding.schema';
import { tenantLockResponse } from '@/lib/billing/tenant-lock-response';

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
      return NextResponse.json({ error: 'Aucun fichier reçu.' }, { status: 400 });
    }

    // Validate bucket (whitelist)
    const allowedBuckets = ['logos', 'menu-items'];
    if (!allowedBuckets.includes(bucket)) {
      return NextResponse.json({ error: "Destination d'envoi inconnue." }, { status: 400 });
    }

    // Etre membre ne suffit pas: sans ce controle, un serveur ou un chef pouvait
    // remplacer (donc supprimer) le logo et les photos de la carte. Le bucket
    // `logos` ne recoit que le logo (reglages). Le bucket `menu-items` recoit
    // les photos de plats ET le logo envoye depuis la page Reglages: l'un ou
    // l'autre des deux droits y suffit.
    const admin = createAdminClient();
    const droits =
      bucket === 'logos' ? (['settings.edit'] as const) : (['menu.edit', 'settings.edit'] as const);
    let peutEnvoyer = false;
    for (const droit of droits) {
      const { allowed: accorde } = await resolveAdminPermission(
        admin,
        session.userId,
        session.adminUser.tenant_id,
        droit,
      );
      if (accorde) {
        peutEnvoyer = true;
        break;
      }
    }
    if (!peutEnvoyer) {
      return NextResponse.json(
        { error: "Votre role ne permet pas d'envoyer cette image." },
        { status: 403 },
      );
    }

    // Coupure du restaurant: un televersement est une ecriture (403 + message).
    const locked = await tenantLockResponse(session.adminUser.tenant_id);
    if (locked) return locked;

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image trop lourde (5 Mo maximum).' }, { status: 400 });
    }

    // Validate mime type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Format non accepté. Utilisez une image JPEG, PNG ou WebP.' },
        { status: 400 },
      );
    }

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    // Scope uploads to tenant directory for isolation
    const fileName = `${session.adminUser.tenant_id}/${crypto.randomUUID()}_${Date.now()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate magic bytes to prevent Content-Type spoofing (stored XSS prevention)
    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: "Le contenu du fichier ne correspond pas à un format d'image valide." },
        { status: 400 },
      );
    }

    const { error: uploadError } = await admin.storage.from(bucket).upload(fileName, buffer, {
      upsert: false,
      contentType: file.type,
    });

    if (uploadError) {
      logger.error('Upload failed', { error: uploadError, bucket });
      const bucketMissing = /bucket not found/i.test(uploadError.message);
      return NextResponse.json(
        {
          error: bucketMissing
            ? "Le dossier de stockage des images n'est pas configuré. Contactez le support."
            : "Echec de l'envoi de l'image. Réessayez.",
        },
        { status: 500 },
      );
    }

    const {
      data: { publicUrl },
    } = admin.storage.from(bucket).getPublicUrl(fileName);

    // Le remplacement d'une image est nettoye cote serveur au moment ou l'ecriture
    // en base change l'URL (storage-cleanup.service, R-05): supprimer ici, avant
    // l'enregistrement, effacerait un fichier encore utilise si l'envoi est annule.

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    logger.error('Upload failed', { error: err });
    return NextResponse.json({ error: 'Echec du televersement' }, { status: 500 });
  }
}
