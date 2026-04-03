import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('tenants').select('id').limit(1);

    if (error) {
      logger.error('Health check: database query failed', error);
      return NextResponse.json({ status: 'degraded' }, { status: 503 });
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    logger.error('Health check: database unreachable', err);
    return NextResponse.json({ status: 'error' }, { status: 503 });
  }
}
