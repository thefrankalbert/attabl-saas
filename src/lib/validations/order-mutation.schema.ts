import { z } from 'zod';

// Body schema for POST /api/orders/mutations - the single idempotent endpoint
// that carries offline-replayable order mutations (status change, server
// assignment, release). Every variant carries a client_request_id so a replay
// from the durable outbox is deduped server-side.

const clientRequestId = z.string().uuid();

export const orderMutationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('status'),
    client_request_id: clientRequestId,
    orderId: z.string().uuid(),
    // Full status validation is done by actionUpdateOrderStatus; keep this a
    // bounded string so we never forward junk.
    status: z.string().min(1).max(50),
  }),
  z.object({
    type: z.literal('assign'),
    client_request_id: clientRequestId,
    tableId: z.string().uuid(),
    serverId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('release'),
    client_request_id: clientRequestId,
    assignmentId: z.string().uuid(),
  }),
]);

export type OrderMutationInput = z.infer<typeof orderMutationSchema>;
