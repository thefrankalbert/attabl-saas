import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveSessionAdminUser } from '@/lib/auth/session-admin-user';
import { uploadLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';

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

    const session = await resolveSessionAdminUser({
      requireActive: true,
      provisionIfMissing: true,
    });
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

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    logger.error('Upload failed', { error: err });
    return NextResponse.json({ error: 'Echec du televersement' }, { status: 500 });
  }
}
