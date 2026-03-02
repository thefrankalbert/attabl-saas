import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const domainVerifySchema = z.object({
  domain: z
    .string()
    .min(1, 'Domain required')
    .max(253, 'Domain too long')
    .regex(
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
      'Invalid domain format',
    ),
});

export async function POST(request: Request) {
  try {
    // 1. Auth check: only authenticated users can verify domains
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
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
