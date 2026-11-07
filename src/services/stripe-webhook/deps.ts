import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

/**
 * Ce dont chaque gestionnaire d'evenement a besoin, injecte par la fabrique.
 *
 * Le client Supabase est celui de la route (admin, service_role: un webhook
 * n'a pas de session utilisateur a qui appliquer RLS), et le client Stripe
 * celui deja construit apres la verification de signature.
 */
export interface StripeWebhookDeps {
  supabase: SupabaseClient;
  stripe: Stripe;
}
