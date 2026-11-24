import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAssignmentService } from '../assignment.service';

// B9 (revue ligne par ligne, lot B2b-2): la prise en charge ne filtrait aucun
// statut. Un serveur pouvait "prendre" une commande deja payee ou annulee, et le
// rapport de performance lui attribuait le chiffre (attribution par server_id).
//
// Double qui APPLIQUE les filtres de l'UPDATE a une ligne de commande, comme
// Postgres: c'est le resultat (ligne touchee ou non) qui est verifie.

interface OrderRow {
  id: string;
  tenant_id: string;
  server_id: string | null;
  status: string;
  payment_status: string;
}

function clientWith(row: OrderRow) {
  const client = {
    from: () => ({
      update: (patch: Partial<OrderRow>) => {
        const preds: Array<(r: OrderRow) => boolean> = [];
        const q = {
          eq: (c: keyof OrderRow, v: unknown) => (preds.push((r) => r[c] === v), q),
          neq: (c: keyof OrderRow, v: unknown) => (preds.push((r) => r[c] !== v), q),
          in: (c: keyof OrderRow, vs: unknown[]) => (preds.push((r) => vs.includes(r[c])), q),
          or: (expr: string) => {
            const me = expr.split('server_id.eq.')[1];
            preds.push((r) => r.server_id === null || r.server_id === me);
            return q;
          },
          then: (resolve: (v: { count: number; error: null }) => unknown) => {
            const hit = preds.every((p) => p(row));
            if (hit) Object.assign(row, patch);
            return resolve({ count: hit ? 1 : 0, error: null });
          },
        };
        return q;
      },
    }),
  };
  return client as unknown as SupabaseClient;
}

const base: OrderRow = {
  id: 'o1',
  tenant_id: 't1',
  server_id: null,
  status: 'ready',
  payment_status: 'pending',
};

describe('claimOrder: statut de la commande (B9)', () => {
  it('refuse une commande deja payee (CONFLICT), server_id inchange', async () => {
    const row = { ...base, payment_status: 'paid' };
    await expect(
      createAssignmentService(clientWith(row)).claimOrder('o1', 's1', 't1'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(row.server_id).toBeNull();
  });

  it('refuse une commande annulee (CONFLICT), server_id inchange', async () => {
    const row = { ...base, status: 'cancelled' };
    await expect(
      createAssignmentService(clientWith(row)).claimOrder('o1', 's1', 't1'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(row.server_id).toBeNull();
  });

  it('refuse une commande offerte ou remboursee', async () => {
    for (const payment_status of ['comp', 'refunded']) {
      const row = { ...base, payment_status };
      await expect(
        createAssignmentService(clientWith(row)).claimOrder('o1', 's1', 't1'),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(row.server_id).toBeNull();
    }
  });

  it('temoin: prend une commande en cours non reglee (y compris un acompte)', async () => {
    for (const payment_status of ['pending', 'partial']) {
      const row = { ...base, payment_status };
      await createAssignmentService(clientWith(row)).claimOrder('o1', 's1', 't1');
      expect(row.server_id).toBe('s1');
    }
  });

  it('temoin: une commande servie mais pas encore payee reste prenable', async () => {
    const row = { ...base, status: 'delivered' };
    await createAssignmentService(clientWith(row)).claimOrder('o1', 's1', 't1');
    expect(row.server_id).toBe('s1');
  });
});
