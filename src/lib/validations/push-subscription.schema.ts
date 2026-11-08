import { z } from 'zod';
import { verifierEndpointPush } from '@/lib/push/endpoints-autorises';

/**
 * Validation d'un abonnement aux notifications push (POST /api/push-subscriptions).
 *
 * L'`endpoint` acceptait `z.string().url()`, donc n'importe quelle adresse:
 * `http://169.254.169.254/...`, `http://127.0.0.1:5432/`. Comme le serveur
 * appelle ensuite cette adresse lui-meme pour envoyer la notification, c'etait
 * une porte vers l'interieur de l'infrastructure, ouverte a tout titulaire de
 * compte. On refuse donc des l'enregistrement ce qui ne vient pas d'un service
 * de push de navigateur (voir `@/lib/push/endpoints-autorises`).
 */
export const subscribeSchema = z.object({
  endpoint: z
    .string()
    .url()
    .refine((valeur) => verifierEndpointPush(valeur).autorise, {
      message: "Cette adresse d'abonnement ne vient pas d'un service de notifications connu",
    }),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});
