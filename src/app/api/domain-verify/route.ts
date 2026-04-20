import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { domainVerifySchema } from '@/lib/validations/domain.schema';
import { domainVerifyLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 0. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await domainVerifyLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // 1. Auth check: only authenticated users can verify domains
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
    }

    // 2. Parse and validate input
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const parseResult = domainVerifySchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message ?? 'Invalid domain';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { domain } = parseResult.data;

    // 3. Check if CNAME is pointing to Vercel
    const response = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=CNAME`,
    );
    const data = await response.json();

    const verified =
      data.Answer?.some(
        (record: { data: string }) =>
          record.data === 'cname.vercel-dns.com.' || record.data === 'cname.vercel-dns.com',
      ) || false;

    return NextResponse.json({ verified, domain });
  } catch (error) {
    logger.error('Domain verification error', error);
    return NextResponse.json({ verified: false });
  }
}
