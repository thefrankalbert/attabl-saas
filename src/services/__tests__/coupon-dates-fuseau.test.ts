import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCouponService } from '../coupon.service';

// B35 (revue ligne par ligne, lot B2b-2): la date de fin saisie sans heure
// ("2026-12-31") etait stockee telle quelle, donc a 00:00 UTC. La validation
// compare `valid_until < maintenant`: un coupon "valable jusqu'au 31/12" etait
// refuse TOUT le 31/12. La fin est maintenant la derniere milliseconde du jour,
// dans le fuseau du restaurant (deduit de son pays).

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

function clientFor(country: string | null, readError: { message: string } | null = null) {
  const writes: Array<Record<string, unknown>> = [];
  const client = {
    from: (table: string) => {
      if (table === 'tenants') {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () =>
            readError ? { data: null, error: readError } : { data: { country }, error: null },
        };
        return q;
      }
      return {
        insert: (row: Record<string, unknown>) => {
          writes.push(row);
          return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
        },
        update: (row: Record<string, unknown>) => {
          writes.push(row);
          const q = { eq: () => q, then: (r: (v: unknown) => unknown) => r({ error: null }) };
          return q;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, writes };
}

const base = { code: 'NOEL', discount_type: 'fixed' as const, discount_value: 500 };

describe('coupon: bornes de dates dans le fuseau du restaurant (B35)', () => {
  it('Cameroun (UTC+1): fin = 31/12 23:59:59.999 heure de Douala', async () => {
    const { client, writes } = clientFor('Cameroun');
    await createCouponService(client).createCoupon('t1', {
      ...base,
      valid_from: '2026-12-01',
      valid_until: '2026-12-31',
    });
    expect(writes[0].valid_until).toBe('2026-12-31T22:59:59.999Z');
    expect(writes[0].valid_from).toBe('2026-11-30T23:00:00.000Z');
  });

  it('Burkina Faso (UTC+0): fin = 31/12 23:59:59.999 UTC', async () => {
    const { client, writes } = clientFor('Burkina Faso');
    await createCouponService(client).updateCoupon('c1', 't1', {
      ...base,
      valid_until: '2026-12-31',
    });
    expect(writes[0].valid_until).toBe('2026-12-31T23:59:59.999Z');
  });

  it('le coupon reste valide le dernier jour a midi (heure locale)', async () => {
    const { client, writes } = clientFor('Cameroun');
    await createCouponService(client).createCoupon('t1', { ...base, valid_until: '2026-12-31' });
    const midiDouala = new Date('2026-12-31T11:00:00.000Z');
    expect(new Date(String(writes[0].valid_until)) < midiDouala).toBe(false);
  });

  it('temoin: un instant complet (avec heure) est garde tel quel', async () => {
    const { client, writes } = clientFor('Cameroun');
    await createCouponService(client).createCoupon('t1', {
      ...base,
      valid_until: '2026-12-31T18:00:00.000Z',
    });
    expect(writes[0].valid_until).toBe('2026-12-31T18:00:00.000Z');
  });

  // Contre-audit 2 (defaut 5): une erreur de LECTURE du pays ne retombe plus
  // sur Africa/Abidjan en silence.
  it('erreur de lecture du pays: INTERNAL, rien n est ecrit', async () => {
    const { client, writes } = clientFor('Cameroun', { message: 'boom' });
    await expect(
      createCouponService(client).createCoupon('t1', { ...base, valid_until: '2026-12-31' }),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(writes).toEqual([]);
  });

  it('temoin: pays lu mais inconnu ou absent: repli sur Africa/Abidjan (UTC+0)', async () => {
    for (const country of [null, 'Atlantide']) {
      const { client, writes } = clientFor(country);
      await createCouponService(client).createCoupon('t1', { ...base, valid_until: '2026-12-31' });
      expect(writes[0].valid_until).toBe('2026-12-31T23:59:59.999Z');
    }
  });
});
