import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const { domain } = await request.json();

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json({ error: 'Domain required' }, { status: 400 });
    }

    // Check if CNAME is pointing to Vercel
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
