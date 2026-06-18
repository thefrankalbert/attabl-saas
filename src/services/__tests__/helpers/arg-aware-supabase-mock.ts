/**
 * Argument-aware Supabase mock for multi-tenant isolation tests.
 *
 * Unlike a "dumb" mock that returns a fixed result regardless of the filters
 * applied, this mock CAPTURES every `.eq()/.in()/.is()/.neq()` filter and
 * APPLIES it to the seeded rows when the query resolves. This is what gives an
 * isolation test "teeth": if a service forgets `.eq('tenant_id', ...)`, the
 * mock returns the foreign-tenant rows (read leak) or reports a non-zero
 * `affected` count (write leak), and the assertion fails.
 *
 * Modeled chain (the subset the services under test actually use):
 *   from(table)
 *     .select(cols?) | .insert(rows) | .update(patch) | .delete()
 *     .eq(col, val) | .in(col, vals) | .is(col, val) | .neq(col, val)
 *     .not(col, op, val)            // recorded, only 'in' style is parsed
 *     .like(col, pattern)           // recorded + applied (SQL LIKE -> regex)
 *     .gte(col, val) | .gt | .lte | .lt
 *     .order(col, opts?) | .limit(n) | .range(from, to)
 *     .single() -> first surviving row OR a PGRST116 not-found error
 *     .maybeSingle() -> first surviving row OR null
 *     <await> (thenable) -> all surviving rows as a list
 *
 * Filters narrow ONLY on columns that exist on a row. A filter on a column the
 * row does not have leaves that row untouched (Postgres-like: a missing column
 * would be an error, but for isolation testing we treat "column absent" as
 * "not a discriminator" so seeding stays terse). Dotted relation keys are
 * supported: seed a row with the literal key 'venues.tenant_id' and a service
 * filter `.eq('venues.tenant_id', x)` will narrow on it. This lets the
 * relation-based isolation in table-config.service be exercised.
 *
 * Deterministic, ASCII only, TypeScript strict (no `any`).
 */

/** A seeded DB row. Keys may be plain columns or dotted relation paths. */
export type MockRow = Record<string, unknown>;

/** Shape Supabase returns from a resolved query. */
export interface MockQueryResult<T = unknown> {
  data: T;
  error: MockError | null;
  count?: number | null;
}

/** Minimal Postgres/PostgREST-style error shape. */
export interface MockError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

/** A captured filter to apply against seeded rows. */
interface Filter {
  kind: 'eq' | 'neq' | 'in' | 'is' | 'gte' | 'gt' | 'lte' | 'lt' | 'like' | 'notIn';
  column: string;
  value: unknown;
  values?: unknown[];
}

/** RPC handler signature. */
export type RpcHandler = (
  args: Record<string, unknown>,
) => MockQueryResult | Promise<MockQueryResult>;

const PGRST116: MockError = {
  message: 'JSON object requested, multiple (or no) rows returned',
  code: 'PGRST116',
  details: 'Results contain 0 rows',
};

/**
 * Reads a value from a row, supporting dotted relation keys.
 * Tries the literal key first (e.g. row['venues.tenant_id']); if absent, walks
 * nested objects (e.g. row.venues.tenant_id). Returns a sentinel when the
 * column is not present at all so callers can distinguish "absent" from "null".
 */
const ABSENT = Symbol('absent');

function readColumn(row: MockRow, column: string): unknown | typeof ABSENT {
  if (Object.prototype.hasOwnProperty.call(row, column)) {
    return row[column];
  }
  if (column.includes('.')) {
    const parts = column.split('.');
    let cursor: unknown = row;
    for (const part of parts) {
      if (
        cursor &&
        typeof cursor === 'object' &&
        Object.prototype.hasOwnProperty.call(cursor, part)
      ) {
        cursor = (cursor as Record<string, unknown>)[part];
      } else {
        return ABSENT;
      }
    }
    return cursor;
  }
  return ABSENT;
}

/** SQL LIKE pattern -> RegExp (only % and _ wildcards). */
function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const translated = escaped.replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${translated}$`);
}

/** Returns true if a single row survives a single filter. */
function rowMatchesFilter(row: MockRow, filter: Filter): boolean {
  const actual = readColumn(row, filter.column);
  // If the row simply does not carry this column, the filter is not a
  // discriminator for it: the row survives. Real Postgres would error on an
  // unknown column, but for isolation testing the relevant discriminators
  // (tenant_id, id, code, status, ...) are always seeded explicitly.
  if (actual === ABSENT) return true;

  switch (filter.kind) {
    case 'eq':
      return actual === filter.value;
    case 'neq':
      return actual !== filter.value;
    case 'is':
      return actual === filter.value;
    case 'in':
      return (filter.values ?? []).includes(actual);
    case 'notIn':
      return !(filter.values ?? []).includes(actual);
    case 'gte':
      return compare(actual, filter.value) >= 0;
    case 'gt':
      return compare(actual, filter.value) > 0;
    case 'lte':
      return compare(actual, filter.value) <= 0;
    case 'lt':
      return compare(actual, filter.value) < 0;
    case 'like':
      return typeof actual === 'string' && likeToRegExp(String(filter.value)).test(actual);
    default:
      return true;
  }
}

/** Comparison that works for numbers and ISO date strings. */
function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const as = String(a);
  const bs = String(b);
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

/** Applies all captured filters; returns surviving rows. */
function applyFilters(rows: MockRow[], filters: Filter[]): MockRow[] {
  return rows.filter((row) => filters.every((f) => rowMatchesFilter(row, f)));
}

/**
 * The query builder returned by from(). Chainable, and thenable so that
 * `await query` (a list query) resolves to all surviving rows.
 */
export interface MockQueryBuilder<T = unknown> extends PromiseLike<MockQueryResult<T>> {
  select(
    columns?: string,
    options?: { count?: 'exact' | 'planned' | 'estimated' },
  ): MockQueryBuilder;
  insert(rows: MockRow | MockRow[]): MockQueryBuilder;
  update(patch: MockRow): MockQueryBuilder;
  delete(): MockQueryBuilder;
  eq(column: string, value: unknown): MockQueryBuilder;
  neq(column: string, value: unknown): MockQueryBuilder;
  in(column: string, values: unknown[]): MockQueryBuilder;
  is(column: string, value: unknown): MockQueryBuilder;
  not(column: string, op: string, value: unknown): MockQueryBuilder;
  like(column: string, pattern: string): MockQueryBuilder;
  gte(column: string, value: unknown): MockQueryBuilder;
  gt(column: string, value: unknown): MockQueryBuilder;
  lte(column: string, value: unknown): MockQueryBuilder;
  lt(column: string, value: unknown): MockQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): MockQueryBuilder;
  limit(n: number): MockQueryBuilder;
  range(from: number, to: number): MockQueryBuilder;
  single<R = unknown>(): Promise<MockQueryResult<R>>;
  maybeSingle<R = unknown>(): Promise<MockQueryResult<R>>;
}

type Operation = 'select' | 'insert' | 'update' | 'delete';

/** The mock client: `.from()` plus seeding/inspection helpers. */
export interface ArgAwareSupabaseMock {
  from(table: string): MockQueryBuilder;
  rpc(name: string, args?: Record<string, unknown>): Promise<MockQueryResult>;
  /** Seed (replace) the rows for a table. */
  seed(table: string, rows: MockRow[]): void;
  /** Force every query on a table to resolve with this error. */
  forceError(table: string, error: MockError): void;
  /** Register an RPC handler. */
  setRpc(name: string, handler: RpcHandler): void;
  /** Rows matched by the most recent update/delete on a table (write reach). */
  affected: Record<string, number>;
  /** Raw access to seeded rows (post-mutation) for assertions. */
  rows(table: string): MockRow[];
}

/**
 * Creates an argument-aware Supabase mock.
 *
 * @example
 *   const db = createArgAwareSupabaseMock();
 *   db.seed('orders', [{ id: 'o1', tenant_id: 'A', status: 'ready' }]);
 *   await orderService.updateStatus('o1', 'A', 'delivered');
 *   expect(db.affected.orders).toBe(1);
 */
export function createArgAwareSupabaseMock(): ArgAwareSupabaseMock {
  const tables = new Map<string, MockRow[]>();
  const errors = new Map<string, MockError>();
  const rpcs = new Map<string, RpcHandler>();
  const affected: Record<string, number> = {};

  function getRows(table: string): MockRow[] {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table)!;
  }

  function makeBuilder(table: string): MockQueryBuilder {
    const filters: Filter[] = [];
    let operation: Operation = 'select';
    let insertRows: MockRow[] = [];
    let updatePatch: MockRow = {};
    let limitN: number | null = null;
    let rangeBounds: { from: number; to: number } | null = null;
    let orderSpec: { column: string; ascending: boolean } | null = null;
    let wantCount = false;

    function forcedError(): MockError | null {
      return errors.get(table) ?? null;
    }

    /** Resolve a list query into surviving rows (the data array). */
    function resolveList(): MockQueryResult {
      const err = forcedError();
      if (err) return { data: [], error: err, count: null };

      if (operation === 'insert') {
        const stored = getRows(table);
        for (const r of insertRows) stored.push({ ...r });
        return { data: insertRows.map((r) => ({ ...r })), error: null, count: insertRows.length };
      }

      const all = getRows(table);
      const survivors = applyFilters(all, filters);

      if (operation === 'update') {
        affected[table] = survivors.length;
        for (const row of survivors) Object.assign(row, updatePatch);
        return { data: survivors.map((r) => ({ ...r })), error: null, count: survivors.length };
      }

      if (operation === 'delete') {
        affected[table] = survivors.length;
        const remaining = all.filter((row) => !survivors.includes(row));
        tables.set(table, remaining);
        return { data: survivors.map((r) => ({ ...r })), error: null, count: survivors.length };
      }

      // select
      let result = survivors.slice();
      if (orderSpec) {
        const { column, ascending } = orderSpec;
        result.sort((a, b) => {
          const cmp = compare(readColumn(a, column), readColumn(b, column));
          return ascending ? cmp : -cmp;
        });
      }
      if (rangeBounds) {
        result = result.slice(rangeBounds.from, rangeBounds.to + 1);
      }
      if (limitN !== null) {
        result = result.slice(0, limitN);
      }
      return {
        data: result.map((r) => ({ ...r })),
        error: null,
        count: wantCount ? survivors.length : null,
      };
    }

    /** Resolve a single-row query. */
    function resolveSingle(allowEmpty: boolean): MockQueryResult {
      const err = forcedError();
      if (err) return { data: null, error: err };

      if (operation === 'insert') {
        const stored = getRows(table);
        const first = insertRows[0];
        if (first) stored.push({ ...first });
        return { data: first ? { ...first } : null, error: null };
      }

      const all = getRows(table);
      const survivors = applyFilters(all, filters);

      if (operation === 'update' || operation === 'delete') {
        affected[table] = survivors.length;
        if (operation === 'update') {
          for (const row of survivors) Object.assign(row, updatePatch);
        } else {
          tables.set(
            table,
            all.filter((row) => !survivors.includes(row)),
          );
        }
        const first = survivors[0] ?? null;
        if (!first && !allowEmpty) return { data: null, error: PGRST116 };
        return { data: first ? { ...first } : null, error: null };
      }

      const first = survivors[0] ?? null;
      if (!first) {
        return allowEmpty ? { data: null, error: null } : { data: null, error: PGRST116 };
      }
      return { data: { ...first }, error: null };
    }

    const builder: MockQueryBuilder = {
      select(_columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated' }) {
        if (operation !== 'insert' && operation !== 'update' && operation !== 'delete') {
          operation = 'select';
        }
        if (options?.count) wantCount = true;
        return builder;
      },
      insert(rows: MockRow | MockRow[]) {
        operation = 'insert';
        insertRows = Array.isArray(rows) ? rows.map((r) => ({ ...r })) : [{ ...rows }];
        return builder;
      },
      update(patch: MockRow) {
        operation = 'update';
        updatePatch = { ...patch };
        return builder;
      },
      delete() {
        operation = 'delete';
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push({ kind: 'eq', column, value });
        return builder;
      },
      neq(column: string, value: unknown) {
        filters.push({ kind: 'neq', column, value });
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push({ kind: 'in', column, value: values, values });
        return builder;
      },
      is(column: string, value: unknown) {
        filters.push({ kind: 'is', column, value });
        return builder;
      },
      not(column: string, op: string, value: unknown) {
        // Supports `.not('status', 'in', '(a,b)')` -> notIn filter.
        if (op === 'in' && typeof value === 'string') {
          const list = value
            .replace(/^\(/, '')
            .replace(/\)$/, '')
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          filters.push({ kind: 'notIn', column, value: list, values: list });
        } else {
          filters.push({ kind: 'neq', column, value });
        }
        return builder;
      },
      like(column: string, pattern: string) {
        filters.push({ kind: 'like', column, value: pattern });
        return builder;
      },
      gte(column: string, value: unknown) {
        filters.push({ kind: 'gte', column, value });
        return builder;
      },
      gt(column: string, value: unknown) {
        filters.push({ kind: 'gt', column, value });
        return builder;
      },
      lte(column: string, value: unknown) {
        filters.push({ kind: 'lte', column, value });
        return builder;
      },
      lt(column: string, value: unknown) {
        filters.push({ kind: 'lt', column, value });
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderSpec = { column, ascending: options?.ascending ?? true };
        return builder;
      },
      limit(n: number) {
        limitN = n;
        return builder;
      },
      range(from: number, to: number) {
        rangeBounds = { from, to };
        return builder;
      },
      single<R = unknown>(): Promise<MockQueryResult<R>> {
        return Promise.resolve(resolveSingle(false) as MockQueryResult<R>);
      },
      maybeSingle<R = unknown>(): Promise<MockQueryResult<R>> {
        return Promise.resolve(resolveSingle(true) as MockQueryResult<R>);
      },
      then<TResult1 = MockQueryResult, TResult2 = never>(
        onfulfilled?:
          | ((value: MockQueryResult) => TResult1 | PromiseLike<TResult1>)
          | undefined
          | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
      ): PromiseLike<TResult1 | TResult2> {
        return Promise.resolve(resolveList()).then(onfulfilled, onrejected);
      },
    };

    return builder;
  }

  return {
    from(table: string) {
      return makeBuilder(table);
    },
    async rpc(name: string, args: Record<string, unknown> = {}) {
      const handler = rpcs.get(name);
      if (!handler) {
        return { data: null, error: { message: `RPC ${name} not registered`, code: 'PGRST202' } };
      }
      return handler(args);
    },
    seed(table: string, rows: MockRow[]) {
      tables.set(
        table,
        rows.map((r) => ({ ...r })),
      );
    },
    forceError(table: string, error: MockError) {
      errors.set(table, error);
    },
    setRpc(name: string, handler: RpcHandler) {
      rpcs.set(name, handler);
    },
    affected,
    rows(table: string) {
      return getRows(table).map((r) => ({ ...r }));
    },
  };
}
