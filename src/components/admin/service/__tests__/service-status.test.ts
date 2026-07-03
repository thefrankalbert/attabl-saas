import { describe, it, expect } from 'vitest';
import { buildTableVMs } from '../service-status';
import type { OpenTableSession } from '@/services/service-manager.service';
import type { Table, TableAssignment, Zone } from '@/types/admin.types';

function table(overrides: Partial<Table> & { id: string; table_number: string }): Table {
  return {
    is_active: true,
    capacity: 4,
    display_name: null,
    ...overrides,
  } as unknown as Table;
}

function zoneWith(tables: Table[]): Zone & { tables: Table[] } {
  return { id: 'z1', tables } as unknown as Zone & { tables: Table[] };
}

function assignment(tableId: string): TableAssignment {
  return {
    id: 'a1',
    table_id: tableId,
    server_id: 's1',
    started_at: '2026-07-03T18:00:00.000Z',
    ended_at: null,
  } as unknown as TableAssignment;
}

function session(tableNumber: string, openedAt: string): OpenTableSession {
  return { table_number: tableNumber, opened_at: openedAt };
}

describe('buildTableVMs', () => {
  it('marks a table occupied when it has an open session (the POS-order case)', () => {
    const t = table({ id: 't1', table_number: 'BAR-1' });
    const vms = buildTableVMs([zoneWith([t])], [], [session('BAR-1', '2026-07-03T19:12:00.000Z')]);
    expect(vms).toHaveLength(1);
    expect(vms[0].status).toBe('occupied');
    expect(vms[0].since).toBe('2026-07-03T19:12:00.000Z');
  });

  it('matches an open session by display_name too', () => {
    const t = table({ id: 't1', table_number: 'INT-5', display_name: 'Terrasse 5' });
    const vms = buildTableVMs(
      [zoneWith([t])],
      [],
      [session('Terrasse 5', '2026-07-03T20:00:00.000Z')],
    );
    expect(vms[0].status).toBe('occupied');
  });

  it('marks a table occupied when a server is assigned even without a session', () => {
    const t = table({ id: 't1', table_number: 'BAR-1' });
    const vms = buildTableVMs([zoneWith([t])], [assignment('t1')], []);
    expect(vms[0].status).toBe('occupied');
    // assignment start wins as the "since" anchor
    expect(vms[0].since).toBe('2026-07-03T18:00:00.000Z');
  });

  it('is free when there is neither a session nor an assignment', () => {
    const t = table({ id: 't1', table_number: 'BAR-1' });
    const vms = buildTableVMs([zoneWith([t])], [], []);
    expect(vms[0].status).toBe('free');
    expect(vms[0].since).toBeUndefined();
  });

  it('skips inactive tables', () => {
    const t = table({ id: 't1', table_number: 'BAR-1', is_active: false });
    const vms = buildTableVMs([zoneWith([t])], [], [session('BAR-1', '2026-07-03T19:12:00.000Z')]);
    expect(vms).toHaveLength(0);
  });
});
