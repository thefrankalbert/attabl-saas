import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMemberSessionService } from '../member-session.service';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

function buildClient(opts: {
  others?: { id: string }[];
  lookupError?: boolean;
  rpcError?: boolean;
}) {
  const rpc = vi.fn().mockResolvedValue({ error: opts.rpcError ? { message: 'boom' } : null });
  const neq = vi.fn();
  const chain = {
    eq: vi.fn(() => chain),
    neq: (...args: unknown[]) => {
      neq(...args);
      return chain;
    },
    is: vi.fn(() => chain),
    limit: vi.fn(() =>
      Promise.resolve({
        data: opts.others ?? [],
        error: opts.lookupError ? { message: 'db down' } : null,
      }),
    ),
  };
  const client = {
    from: vi.fn(() => ({ select: vi.fn(() => chain) })),
    rpc,
  } as unknown as SupabaseClient;
  return { client, rpc, neq };
}

describe('createMemberSessionService.revokeSessionsAfterRemoval', () => {
  it('revoque les sessions quand aucun autre acces actif ne subsiste', async () => {
    const { client, rpc, neq } = buildClient({ others: [] });
    const res = await createMemberSessionService(client).revokeSessionsAfterRemoval('t1', 'u1');
    expect(res).toBe('revoked');
    expect(rpc).toHaveBeenCalledWith('revoke_user_sessions', { p_user_id: 'u1' });
    expect(neq).toHaveBeenCalledWith('tenant_id', 't1');
  });

  it('TEMOIN: ne coupe pas la session si le membre garde un acces dans un autre restaurant', async () => {
    const { client, rpc } = buildClient({ others: [{ id: 'row-b' }] });
    const res = await createMemberSessionService(client).revokeSessionsAfterRemoval('t1', 'u1');
    expect(res).toBe('kept_other_membership');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('coupe par precaution quand la lecture des autres acces echoue', async () => {
    const { client, rpc } = buildClient({ lookupError: true });
    const res = await createMemberSessionService(client).revokeSessionsAfterRemoval('t1', 'u1');
    expect(res).toBe('revoked');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('signale l echec sans lever quand la fonction SQL refuse', async () => {
    const { client } = buildClient({ rpcError: true });
    const res = await createMemberSessionService(client).revokeSessionsAfterRemoval('t1', 'u1');
    expect(res).toBe('failed');
  });
});
