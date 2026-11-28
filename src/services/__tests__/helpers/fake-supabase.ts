import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

/** Valeur d'une colonne, `relation.colonne` compris (ligne jointe). */
function valueOf(row: Row, col: string): unknown {
  const dot = col.indexOf('.');
  if (dot === -1) return row[col];
  const related = row[col.slice(0, dot)];
  return related && typeof related === 'object' ? (related as Row)[col.slice(dot + 1)] : undefined;
}
export type Result = { data: unknown; error: { code?: string; message: string } | null };

export interface FakeSupabaseOptions {
  /** Colonnes uniques par table (une violation rend l'erreur Postgres 23505). */
  uniques?: Record<string, string[]>;
  /** Fait echouer une ecriture: appele avant chaque insert/update/delete. */
  failWrite?: (table: string, op: 'insert' | 'update' | 'delete', payload: Row | null) => boolean;
  /** Fonctions SQL appelees par `.rpc()`: la logique reelle est testee en pgTAP, pas ici. */
  rpc?: Record<string, (args: Row, db: Record<string, Row[]>) => Result>;
}

/**
 * Faux client Supabase en memoire, assez fidele pour les services de
 * facturation: filtres eq/is/in/lt/lte/gt, tri, limite, retour des lignes
 * touchees, contraintes d'unicite. Chaque requete s'execute d'un seul bloc
 * synchrone, comme une instruction SQL: c'est ce qui rend les tests de
 * concurrence (deux webhooks) fideles a l'atomicite reelle.
 *
 * Jointure `relation!inner(colonnes)` en lecture: la ligne liee est trouvee par
 * `<relation au singulier>_id` (ex: `tenants` par `tenant_id`), attachee sous
 * `row[relation]`, et une ligne sans correspondance est ecartee (inner). Un
 * filtre `relation.colonne` porte sur la ligne liee, comme PostgREST.
 */
export function createFakeSupabase(seed: Record<string, Row[]>, options: FakeSupabaseOptions = {}) {
  const db: Record<string, Row[]> = {};
  for (const [table, rows] of Object.entries(seed)) db[table] = rows.map((r) => ({ ...r }));

  class Query implements PromiseLike<Result> {
    private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    private payload: Row | null = null;
    private filters: Filter[] = [];
    private returning = false;
    private limitN: number | null = null;
    private orders: { col: string; asc: boolean; nullsFirst: boolean }[] = [];
    private mode: 'many' | 'maybeSingle' = 'many';
    private joins: { relation: string; columns: string[] }[] = [];

    constructor(private table: string) {}

    select(columns = '*') {
      for (const m of columns.matchAll(/(\w+)!inner\(([^)]*)\)/g)) {
        this.joins.push({
          relation: m[1],
          columns: m[2].split(',').map((c) => c.trim()),
        });
      }
      if (this.op !== 'select') this.returning = true;
      return this;
    }
    insert(payload: Row) {
      this.op = 'insert';
      this.payload = payload;
      return this;
    }
    update(payload: Row) {
      this.op = 'update';
      this.payload = payload;
      return this;
    }
    delete() {
      this.op = 'delete';
      return this;
    }
    eq(col: string, value: unknown) {
      this.filters.push((r) => valueOf(r, col) === value);
      return this;
    }
    neq(col: string, value: unknown) {
      this.filters.push((r) => valueOf(r, col) !== value);
      return this;
    }
    is(col: string, value: null) {
      this.filters.push((r) => (valueOf(r, col) ?? null) === value);
      return this;
    }
    in(col: string, values: unknown[]) {
      this.filters.push((r) => values.includes(valueOf(r, col)));
      return this;
    }
    contains(col: string, values: unknown[]) {
      this.filters.push((r) => {
        const v = valueOf(r, col);
        return Array.isArray(v) && values.every((x) => v.includes(x));
      });
      return this;
    }
    lt(col: string, value: string) {
      this.filters.push((r) => valueOf(r, col) != null && String(valueOf(r, col)) < value);
      return this;
    }
    lte(col: string, value: string) {
      this.filters.push((r) => valueOf(r, col) != null && String(valueOf(r, col)) <= value);
      return this;
    }
    gt(col: string, value: string) {
      this.filters.push((r) => valueOf(r, col) != null && String(valueOf(r, col)) > value);
      return this;
    }
    order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
      this.orders.push({
        col,
        asc: opts?.ascending ?? true,
        nullsFirst: opts?.nullsFirst ?? false,
      });
      return this;
    }
    limit(n: number) {
      this.limitN = n;
      return this;
    }
    maybeSingle() {
      this.mode = 'maybeSingle';
      return this;
    }

    private run(): Result {
      const rows = (db[this.table] ??= []);
      if (this.op !== 'select' && options.failWrite?.(this.table, this.op, this.payload)) {
        return { data: null, error: { code: 'XX000', message: 'echec simule' } };
      }
      const uniqueCols = options.uniques?.[this.table] ?? [];
      const violates = (candidate: Row, ignore?: Row) =>
        uniqueCols.some(
          (col) =>
            candidate[col] != null && rows.some((r) => r !== ignore && r[col] === candidate[col]),
        );

      if (this.op === 'insert') {
        const row = { ...(this.payload as Row) };
        if (violates(row)) return { data: null, error: { code: '23505', message: 'unique' } };
        rows.push(row);
        return { data: this.returning ? [row] : null, error: null };
      }

      // Jointures (lecture seulement): une ligne sans correspondance disparait.
      const joined =
        this.op === 'select' && this.joins.length > 0
          ? rows.flatMap((r) => {
              const out: Row = { ...r };
              for (const { relation, columns } of this.joins) {
                const fk = `${relation.replace(/s$/, '')}_id`;
                const related = (db[relation] ?? []).find((t) => t.id === r[fk]);
                if (!related) return [];
                out[relation] = Object.fromEntries(columns.map((c) => [c, related[c]]));
              }
              return [out];
            })
          : rows;
      const matched = joined.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === 'update') {
        for (const row of matched) {
          const next = { ...row, ...(this.payload as Row) };
          if (violates(next, row))
            return { data: null, error: { code: '23505', message: 'unique' } };
        }
        for (const row of matched) Object.assign(row, this.payload as Row);
        return { data: this.returning ? matched.map((r) => ({ ...r })) : null, error: null };
      }
      if (this.op === 'delete') {
        db[this.table] = rows.filter((r) => !matched.includes(r));
        return { data: null, error: null };
      }

      let out = matched.map((r) => ({ ...r }));
      for (const { col, asc, nullsFirst } of [...this.orders].reverse()) {
        out = out.sort((a, b) => {
          const an = a[col] == null;
          const bn = b[col] == null;
          if (an || bn) return an === bn ? 0 : an === nullsFirst ? -1 : 1;
          return (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1);
        });
      }
      if (this.limitN !== null) out = out.slice(0, this.limitN);
      if (this.mode === 'maybeSingle') return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    }

    then<T1 = Result, T2 = never>(
      onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    }
  }

  const client = {
    from: (table: string) => new Query(table),
    rpc: (name: string, args: Row) => {
      const handler = options.rpc?.[name];
      return Promise.resolve(
        handler
          ? handler(args, db)
          : { data: null, error: { code: '42883', message: `fonction inconnue: ${name}` } },
      );
    },
  };
  return { client: client as unknown as SupabaseClient, db };
}
