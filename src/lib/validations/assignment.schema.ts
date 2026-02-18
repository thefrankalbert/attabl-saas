import { z } from 'zod';

export const createAssignmentSchema = z.object({
  table_id: z.string().uuid('Identifiant de table invalide'),
  server_id: z.string().uuid('Identifiant de serveur invalide'),
});

export const claimOrderSchema = z.object({
  server_id: z.string().uuid('Identifiant de serveur invalide'),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type ClaimOrderInput = z.infer<typeof claimOrderSchema>;
