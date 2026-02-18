'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { OwnerDashboardRow, OwnerDashboardGlobals } from '@/types/restaurant-group.types';

interface OwnerDashboardData {
  restaurants: OwnerDashboardRow[];
  globals: OwnerDashboardGlobals;
}

/**
 * Fetch owner dashboard data via the get_owner_dashboard RPC.
 * Returns per-restaurant KPIs and aggregated globals.
 */
export function useOwnerDashboard(userId: string) {
  return useQuery<OwnerDashboardData>({
    queryKey: ['owner-dashboard', userId],
    queryFn: async () => {
      const supabase = createClient();

      const { data, error } = await supabase.rpc('get_owner_dashboard', {
        p_user_id: userId,
      });

      if (error) {
        throw new Error(`Erreur chargement dashboard: ${error.message}`);
      }

      const restaurants = (data as OwnerDashboardRow[]) || [];

      const globals: OwnerDashboardGlobals = {
        totalRestaurants: restaurants.length,
        totalOrdersToday: restaurants.reduce((sum, r) => sum + Number(r.orders_today), 0),
        totalRevenueToday: restaurants.reduce((sum, r) => sum + Number(r.revenue_today), 0),
        totalOrdersMonth: restaurants.reduce((sum, r) => sum + Number(r.orders_month), 0),
        totalRevenueMonth: restaurants.reduce((sum, r) => sum + Number(r.revenue_month), 0),
      };

      return { restaurants, globals };
    },
    enabled: !!userId,
    refetchInterval: 30_000,
  });
}
