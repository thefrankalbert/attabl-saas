import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { uploadLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';

const QR_DESIGNS_BUCKET = 'qr-designs';
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// SVG intentionally excluded: stored XSS risk via <script>/event handlers in a public bucket.
// If SVG support is needed later, sanitize server-side with DOMPurify or serve via private bucket
// with signed URLs and Content-Disposition: attachment.
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/pdf': 'pdf',
};

/**
 * Validate file magic bytes to prevent Content-Type spoofing.
 * Returns true if the buffer matches the declared type.
 */
function validateMagicBytes(buffer: Buffer, declaredType: string): boolean {
  if (buffer.length < 4) return false;

  // PNG: 89 50 4E 47
  if (declaredType === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }

  // JPEG: FF D8 FF
  if (declaredType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  // PDF: 25 50 44 46 (%PDF)
  if (declaredType === 'application/pdf') {
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  }

  return false;
}

/**
 * POST /api/onboarding/upload-qr-design
 *
 * Uploads a custom QR design (PNG, SVG, or PDF) to the Supabase Storage
 * bucket `qr-designs`, scoped to the authenticated user's tenant directory.
 * Returns the public URL of the uploaded file.
 */
export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await uploadLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // 2. Authentication
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3. Tenant derivation - reject orphaned/unlinked accounts
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!adminUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 4. Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 5. Validate size
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 400 });
    }

    // 6. Validate mime type
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: PNG, JPG, PDF' },
        { status: 400 },
      );
    }

    // 7. Read and validate magic bytes
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: 'File content does not match declared type' },
        { status: 400 },
      );
    }

    // 8. Upload via admin client (bypass RLS)
    const fileName = `${adminUser.tenant_id}/qr-${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const admin = createAdminClient();

    const { error: uploadError } = await admin.storage
      .from(QR_DESIGNS_BUCKET)
      .upload(fileName, buffer, {
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      logger.error('QR design upload failed', uploadError.message, {
        userId: user.id,
        tenantId: adminUser.tenant_id,
      });
      // Generic message to client - detailed error logged server-side only
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = admin.storage.from(QR_DESIGNS_BUCKET).getPublicUrl(fileName);

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    logger.error('Unexpected upload error', message);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
