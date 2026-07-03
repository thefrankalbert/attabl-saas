import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/app-version';

// Always reflects the deployment currently serving the request - never cached,
// so a client polling it learns about a new deploy within one poll interval.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { version: APP_VERSION },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
