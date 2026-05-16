import { resolveCorrelationId, runWithRequestContext } from '@/lib/request-context';

/**
 * Runs an API route handler with a request-scoped correlation ID (ALS + response header).
 */
export function runApiRoute(
  request: Request,
  handler: () => Promise<Response> | Response,
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));

  return Promise.resolve(
    runWithRequestContext(correlationId, async () => {
      const response = await handler();
      const headers = new Headers(response.headers);
      headers.set('x-correlation-id', correlationId);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }),
  );
}
