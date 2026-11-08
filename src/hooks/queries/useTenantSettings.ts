'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

/**
 * Colonnes publiques du tenant, celles dont l'interface de commande a besoin
 * pour afficher et imprimer un ticket.
 *
 * POURQUOI CETTE LISTE EXISTE. Ce hook faisait `select('*')`. Il tourne dans le
 * NAVIGATEUR, avec la cle anon, donc les 56 colonnes de `tenants` partaient
 * dans la reponse reseau de toute personne ouvrant la page des commandes -
 * `stripe_customer_id` et les colonnes d'abonnement comprises. Rien ne les
 * affichait, et c'est bien le probleme: la fuite etait invisible a l'ecran et
 * lisible dans l'onglet reseau.
 *
 * Six champs sont lus en aval (OrderDetails et ses enfants: address, logo_url,
 * name, phone, primary_color, slug), plus `id` et `currency` ici. Ajouter un
 * champ a cette liste est une decision: il devient lisible par tout membre du
 * personnel, du serveur au caissier.
 */
const COLONNES_PUBLIQUES = 'id, slug, name, currency, address, phone, logo_url, primary_color';

export interface TenantSettings {
  id: string;
  slug: string;
  name: string;
  currency: string;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
  primary_color: string | null;
}

/**
 * Fetch tenant settings by ID.
 */
export function useTenantSettings(tenantId: string) {
  return useQuery<TenantSettings | null>({
    queryKey: ['tenant-settings', tenantId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('tenants')
        .select(COLONNES_PUBLIQUES)
        .eq('id', tenantId)
        .single();

      if (error) throw error;
      return data as TenantSettings;
    },
    enabled: !!tenantId,
    staleTime: 15 * 60 * 1000,
  });
}
