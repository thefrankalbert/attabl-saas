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
  // OFF-05. L'encaissement d'une commande DEJA OUVERTE (table en cours, panneau
  // impayes) appelait actionMarkOrderPaid en direct, hors du dispositif outbox:
  // une coupure reseau faisait echouer l'encaissement avec un toast rouge alors
  // que le caissier avait deja empoche l'argent, et la table restait ouverte en
  // base. L'idempotence est indispensable ici, markPaid ecrivant dans le grand
  // livre payments.
  z.object({
    type: z.literal('pay'),
    client_request_id: clientRequestId,
    orderId: z.string().uuid(),
    // Valide finement par markOrderPaidSchema cote action; borne ici pour ne
    // jamais transmettre n'importe quoi.
    method: z.string().min(1).max(50),
    // Unites MINEURES entieres (le pourboire est stocke en minor dans orders).
    tipMinor: z.number().int().nonnegative().optional(),
  }),
  // OFF-12. Les actions AU NIVEAU ARTICLE de l'ecran cuisine passaient en direct,
  // hors outbox. Un cuisinier qui marque 14 articles "prets" pendant une coupure
  // recoltait 14 erreurs rouges et perdait tout son travail, alors que le meme
  // geste au niveau COMMANDE etait deja durable. Meme dispositif, meme
  // idempotence: le rejeu porte la meme cle et le serveur deduplique.
  z.object({
    type: z.literal('item_status'),
    client_request_id: clientRequestId,
    orderId: z.string().uuid(),
    // Borne haute alignee sur une commande realiste; la validation fine est
    // faite par updateItemStatusSchema cote action.
    itemIds: z.array(z.string().uuid()).min(1).max(200),
    status: z.string().min(1).max(50),
  }),
  z.object({
    type: z.literal('course_held'),
    client_request_id: clientRequestId,
    orderId: z.string().uuid(),
    course: z.string().min(1).max(50),
    held: z.boolean(),
  }),
]);

export type OrderMutationInput = z.infer<typeof orderMutationSchema>;
