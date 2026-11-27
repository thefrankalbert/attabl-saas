import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import {
  loadCronHeartbeats,
  loadSupportContact,
  saveSupportContact,
} from '../platform-settings.service';
import { toSupportContact } from '@/lib/support-contact';
import { supportContactSchema } from '@/lib/validations/platform-admin.schema';

const NOW = new Date('2026-11-15T12:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

function heartbeatClient(rows: unknown[]) {
  return {
    from: () => ({ select: async () => ({ data: rows, error: null }) }),
  } as unknown as SupabaseClient;
}

function settingsClient(result: { data: unknown; error: { message: string } | null }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => result,
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

describe('loadCronHeartbeats', () => {
  it('rend une ligne par tache attendue, et signale celle jamais vue passer', async () => {
    const res = await loadCronHeartbeats(heartbeatClient([]), NOW);
    expect(res.map((h) => h.job)).toEqual([
      'reminders',
      'freeze-expired-trials',
      'reconcile-payments',
      'flutterwave-renewals',
      'flutterwave-reconcile',
      'trial-idle-emails',
    ]);
    expect(res.every((h) => h.needsAttention && h.lastRunAt === null)).toBe(true);
  });

  it('ne signale rien quand chaque tache est passee a temps (temoin negatif)', async () => {
    const res = await loadCronHeartbeats(
      heartbeatClient([
        { job: 'reminders', last_run_at: ago(2), last_status: 'ok', last_duration_ms: 120 },
        {
          job: 'freeze-expired-trials',
          last_run_at: ago(600),
          last_status: 'ok',
          last_duration_ms: 50,
        },
        {
          job: 'reconcile-payments',
          last_run_at: ago(540),
          last_status: 'ok',
          last_duration_ms: 50,
        },
        {
          job: 'flutterwave-renewals',
          last_run_at: ago(600),
          last_status: 'ok',
          last_duration_ms: 9,
        },
        {
          job: 'flutterwave-reconcile',
          last_run_at: ago(350),
          last_status: 'ok',
          last_duration_ms: 9,
        },
        {
          job: 'trial-idle-emails',
          last_run_at: ago(600),
          last_status: 'ok',
          last_duration_ms: 30,
        },
      ]),
      NOW,
    );
    expect(res.some((h) => h.needsAttention)).toBe(false);
  });

  it('signale les rappels silencieux depuis plus de 10 min et un passage en erreur', async () => {
    const res = await loadCronHeartbeats(
      heartbeatClient([
        { job: 'reminders', last_run_at: ago(11), last_status: 'ok', last_duration_ms: 120 },
        {
          job: 'freeze-expired-trials',
          last_run_at: ago(60),
          last_status: 'error',
          last_duration_ms: 50,
        },
        {
          job: 'reconcile-payments',
          last_run_at: ago(26 * 60),
          last_status: 'ok',
          last_duration_ms: 50,
        },
        {
          job: 'flutterwave-renewals',
          last_run_at: ago(600),
          last_status: 'ok',
          last_duration_ms: 9,
        },
        // Toutes les 6 h: 8 h de silence = un passage manque.
        {
          job: 'flutterwave-reconcile',
          last_run_at: ago(8 * 60),
          last_status: 'ok',
          last_duration_ms: 9,
        },
        {
          job: 'trial-idle-emails',
          last_run_at: ago(600),
          last_status: 'ok',
          last_duration_ms: 30,
        },
      ]),
      NOW,
    );
    expect(res.map((h) => h.needsAttention)).toEqual([true, true, true, false, true, false]);
  });
});

describe('loadSupportContact', () => {
  it('rend le numero enregistre', async () => {
    const c = await loadSupportContact(
      settingsClient({ data: { value: { phone: '+237 6 99 00 11 22' } }, error: null }),
    );
    expect(c).toEqual({ display: '+237 6 99 00 11 22', digits: '237699001122' });
  });

  it('ne rend aucun numero sans ligne ou si la lecture echoue (jamais un numero code en dur)', async () => {
    expect(await loadSupportContact(settingsClient({ data: null, error: null }))).toBeNull();
    expect(
      await loadSupportContact(settingsClient({ data: null, error: { message: 'panne' } })),
    ).toBeNull();
  });
});

describe('numero du support', () => {
  it('normalise l affichage et garde les chiffres pour wa.me et tel:', () => {
    expect(toSupportContact('  226  55 21 22 93 ')).toEqual({
      display: '+226 55 21 22 93',
      digits: '22655212293',
    });
  });

  it('accepte un numero international et refuse lettres, trop court ou trop long', () => {
    expect(supportContactSchema.safeParse({ phone: '+226 55 21 22 93' }).success).toBe(true);
    expect(supportContactSchema.safeParse({ phone: '+226 55 21 abc' }).success).toBe(false);
    expect(supportContactSchema.safeParse({ phone: '+226 55' }).success).toBe(false);
    expect(supportContactSchema.safeParse({ phone: '+1234567890123456' }).success).toBe(false);
    // Sans "+" et indicatif, wa.me et tel: viseraient un autre pays.
    expect(supportContactSchema.safeParse({ phone: '70 12 34 56' }).success).toBe(false);
    expect(supportContactSchema.safeParse({ phone: '00226 55 21 22 93' }).success).toBe(false);
    expect(supportContactSchema.safeParse({ phone: '+0226 55 21 22 93' }).success).toBe(false);
  });
});

describe('saveSupportContact', () => {
  function writeClient(upsertError: { message: string } | null) {
    const calls: { table: string; op: string; row: unknown }[] = [];
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: { value: { phone: '+226 55 21 22 93' } }, error: null }),
    };
    const client = {
      from: (table: string) => ({
        ...chain,
        upsert: async (row: unknown) => {
          calls.push({ table, op: 'upsert', row });
          return { error: upsertError };
        },
        insert: async (row: unknown) => {
          calls.push({ table, op: 'insert', row });
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;
    return { client, calls };
  }

  it('enregistre le numero et trace l ancien et le nouveau dans le journal', async () => {
    const { client, calls } = writeClient(null);
    const c = await saveSupportContact(client, '+237 6 99 00 11 22', { userId: 'u1' });
    expect(c.digits).toBe('237699001122');
    expect(calls).toEqual([
      expect.objectContaining({ table: 'platform_settings', op: 'upsert' }),
      expect.objectContaining({
        table: 'platform_audit_log',
        row: expect.objectContaining({
          action: 'update_support_contact',
          actor_user_id: 'u1',
          metadata: { from: '+226 55 21 22 93', to: '+237 6 99 00 11 22' },
        }),
      }),
    ]);
  });

  it('leve une erreur INTERNAL et n ecrit pas de trace si l enregistrement echoue', async () => {
    const { client, calls } = writeClient({ message: 'panne' });
    await expect(
      saveSupportContact(client, '+237 6 99 00 11 22', { userId: 'u1' }),
    ).rejects.toMatchObject({
      code: 'INTERNAL',
    });
    expect(calls.some((c) => c.table === 'platform_audit_log')).toBe(false);
  });
});
