import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';

/**
 * Order annotation service - manager notes (append-only audit trail) + house
 * accounts (ardoise / running unpaid tab). Both are multi-tenant; every query is
 * tenant-scoped. Notes are immutable (the DB has no UPDATE/DELETE policy on
 * order_notes). House-account balances come from the SECDEF RPC
 * get_house_account_balances (outstanding = due - net ledger over attached,
 * non-paid/non-comp/non-cancelled orders).
 *
 * FK id-space: created_by / settled_by are admin_users.id (the membership-row PK,
 * = getAuthenticatedUserForTenant.adminUserId), NOT the auth user id - the same
 * id-space as payments.created_by.
 *
 * MONEY UNITS: outstanding is an integer in the currency's MINOR units.
 */

export interface OrderNote {
  id: string;
  note: string;
  createdAt: string;
  createdBy: string | null;
  authorName: string | null;
}

interface AddOrderNoteInput {
  note: string;
  createdBy?: string | null;
}

interface CreateHouseAccountInput {
  name: string;
  description?: string | null;
  createdBy?: string | null;
}

export interface HouseAccountBalance {
  accountId: string;
  name: string;
  status: 'open' | 'settled';
  openOrders: number;
  /** Integer minor units. */
  outstanding: number;
}

interface SettleHouseAccountInput {
  settledBy?: string | null;
}

export function createOrderAnnotationService(supabase: SupabaseClient) {
  return {
    /**
     * Append a manager note to an order (immutable audit trail). Tenant-scoped.
     * The DB RLS only allows INSERT + SELECT on order_notes, so the row can never
     * be edited or deleted afterwards.
     */
    async addOrderNote(
      orderId: string,
      tenantId: string,
      { note, createdBy }: AddOrderNoteInput,
    ): Promise<OrderNote> {
      const { data, error } = await supabase
        .from('order_notes')
        .insert({
          tenant_id: tenantId,
          order_id: orderId,
          note,
          created_by: createdBy ?? null,
        })
        .select('id, note, created_at, created_by, author:admin_users(full_name)')
        .single();

      if (error || !data) {
        throw new ServiceError('Erreur lors de l ajout de la note', 'INTERNAL', error);
      }
      return mapNote(data);
    },

    /**
     * List the notes of an order, oldest first. Tenant + order scoped.
     */
    async listOrderNotes(orderId: string, tenantId: string): Promise<OrderNote[]> {
      const { data, error } = await supabase
        .from('order_notes')
        .select('id, note, created_at, created_by, author:admin_users(full_name)')
        .eq('tenant_id', tenantId)
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      if (error) {
        throw new ServiceError('Erreur lors du chargement des notes', 'INTERNAL', error);
      }
      return (data ?? []).map(mapNote);
    },

    /**
     * Create a house account (ardoise). Tenant-scoped.
     */
    async createHouseAccount(
      tenantId: string,
      { name, description, createdBy }: CreateHouseAccountInput,
    ): Promise<{ id: string }> {
      const { data, error } = await supabase
        .from('house_accounts')
        .insert({
          tenant_id: tenantId,
          name,
          description: description ?? null,
          created_by: createdBy ?? null,
        })
        .select('id')
        .single();

      if (error || !data) {
        throw new ServiceError('Erreur lors de la creation de l ardoise', 'INTERNAL', error);
      }
      return { id: data.id as string };
    },

    /**
     * List all house accounts of the tenant with their outstanding balance,
     * via the SECDEF RPC (asserts membership + computes due - ledger net).
     */
    async listHouseAccountsWithBalances(tenantId: string): Promise<HouseAccountBalance[]> {
      const { data, error } = await supabase.rpc('get_house_account_balances', {
        p_tenant_id: tenantId,
      });

      if (error) {
        throw new ServiceError('Erreur lors du chargement des ardoises', 'INTERNAL', error);
      }
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        accountId: row.account_id as string,
        name: row.name as string,
        status: (row.status as 'open' | 'settled') ?? 'open',
        openOrders: Number(row.open_orders ?? 0),
        outstanding: Number(row.outstanding ?? 0),
      }));
    },

    /**
     * Attach an order to a house account (put it "sur l'ardoise"). Verifies the
     * account belongs to the tenant BEFORE linking, then scopes the orders update
     * by tenant_id. Both belt (app filter) and suspenders (RLS).
     */
    async attachOrderToHouseAccount(
      orderId: string,
      tenantId: string,
      accountId: string,
    ): Promise<void> {
      const { data: account, error: accErr } = await supabase
        .from('house_accounts')
        .select('id')
        .eq('id', accountId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (accErr) {
        throw new ServiceError('Erreur lors du chargement de l ardoise', 'INTERNAL', accErr);
      }
      if (!account) {
        throw new ServiceError('Ardoise introuvable', 'NOT_FOUND');
      }

      const { error } = await supabase
        .from('orders')
        .update({ house_account_id: accountId })
        .eq('id', orderId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors de la mise sur l ardoise', 'INTERNAL', error);
      }
    },

    /**
     * Detach an order from any house account. Tenant-scoped.
     */
    async detachOrderFromHouseAccount(orderId: string, tenantId: string): Promise<void> {
      const { error } = await supabase
        .from('orders')
        .update({ house_account_id: null })
        .eq('id', orderId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors du retrait de l ardoise', 'INTERNAL', error);
      }
    },

    /**
     * Settle (solder) a house account: mark it settled, stamp who + when.
     * Tenant-scoped.
     */
    async settleHouseAccount(
      accountId: string,
      tenantId: string,
      { settledBy }: SettleHouseAccountInput,
    ): Promise<void> {
      const { error } = await supabase
        .from('house_accounts')
        .update({
          status: 'settled',
          settled_at: new Date().toISOString(),
          settled_by: settledBy ?? null,
        })
        .eq('id', accountId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors du solde de l ardoise', 'INTERNAL', error);
      }
    },
  };
}

/** Normalize a raw order_notes row (with embedded author) to OrderNote. */
function mapNote(row: Record<string, unknown>): OrderNote {
  const author = row.author as { full_name?: string | null } | null | undefined;
  return {
    id: row.id as string,
    note: row.note as string,
    createdAt: row.created_at as string,
    createdBy: (row.created_by as string | null) ?? null,
    authorName: author?.full_name ?? null,
  };
}
