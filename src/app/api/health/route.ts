import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('tenants').select('id').limit(1);

    const dbLatency = Date.now() - start;

    if (error) {
      logger.error('Health check: database query failed', error);
      return NextResponse.json(
        { status: 'error', db: 'down', latency: dbLatency },
        { status: 503 },
      );
    }

    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      latency: dbLatency,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Health check: database unreachable', err);
    return NextResponse.json({ status: 'error', db: 'unreachable' }, { status: 503 });
  }
}
