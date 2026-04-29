import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { serverActionLimiter, getClientIp } from '@/lib/rate-limit';

/**
 * GET /api/onboarding/proxy-image?url=<supabase-storage-url>
 *
 * Proxies an image from Supabase Storage through this Next.js server,
 * so the browser receives it from the same origin as the app.
 *
 * WHY: html2canvas taints the canvas when an image is loaded from a different
 * origin without proper CORS headers. Even if the QR template uses the image
 * with crossOrigin="anonymous", Supabase Storage may not return the required
 * Access-Control-Allow-Origin header for that origin/bucket. Proxying through
 * our own origin sidesteps the entire CORS problem.
 *
 * SECURITY: only URLs starting with our configured Supabase URL are accepted,
 * preventing this endpoint from becoming an open SSRF gateway.
 */
export async function GET(request: Request) {
  try {
    // Rate limit: 30 requests / 1 min per IP (covers normal export flow with logo + design)
    const ip = getClientIp(request);
    const { success: allowed } = await serverActionLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const url = new URL(request.url).searchParams.get('url');
    if (!url) {
      return NextResponse.json({ error: 'missing url parameter' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return NextResponse.json({ error: 'server not configured' }, { status: 500 });
    }

    // Allowlist: only proxy from our Supabase project.
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: 'invalid url' }, { status: 400 });
    }
    const allowedOrigin = new URL(supabaseUrl).origin;
    if (parsed.origin !== allowedOrigin || parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'url not allowed' }, { status: 403 });
    }

    const upstream = await fetch(parsed.toString(), {
      headers: { Accept: 'image/*' },
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: 'upstream fetch failed' }, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'not an image' }, { status: 415 });
    }

    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Cache aggressively client-side; the bucket file is content-addressed.
        'Cache-Control': 'public, max-age=3600, immutable',
        // Allow the canvas to stay clean (defensive — same-origin already does this).
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    logger.error('proxy-image failed', { err });
    return NextResponse.json({ error: 'proxy failed' }, { status: 500 });
  }
}
