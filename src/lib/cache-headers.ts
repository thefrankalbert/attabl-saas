import { NextResponse } from 'next/server';

type CacheStrategy = 'static' | 'dynamic' | 'private' | 'realtime';

const CACHE_STRATEGIES: Record<CacheStrategy, string> = {
  static: 'public, max-age=300, s-maxage=600, stale-while-revalidate=60',
  dynamic: 'private, max-age=60, stale-while-revalidate=30',
  private: 'private, no-cache, must-revalidate',
  realtime: 'no-store, no-cache, must-revalidate',
};

export function withCacheHeaders(response: NextResponse, strategy: CacheStrategy): NextResponse {
  response.headers.set('Cache-Control', CACHE_STRATEGIES[strategy]);
  return response;
}

export function jsonWithCache<T>(data: T, strategy: CacheStrategy, status = 200): NextResponse {
  const response = NextResponse.json(data, { status });
  response.headers.set('Cache-Control', CACHE_STRATEGIES[strategy]);
  return response;
}
