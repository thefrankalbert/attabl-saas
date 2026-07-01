import { defineConfig } from 'vitest/config';
import path from 'path';

// Integration suite: runs against a REAL local Postgres (Supabase) so the stock
// RPCs (destock_order, restock_order, set_opening_stock, get_stock_status) are
// actually executed - the unit suite mocks supabase.rpc and cannot exercise the
// SQL. Kept OUT of `pnpm test` (that config's include is src/**): this one is
// driven by `pnpm test:db` via scripts/run-stock-integration.sh, which stands up
// the DB and injects JOURNEY_SUPABASE_URL / JOURNEY_SUPABASE_SERVICE_ROLE_KEY.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    // Real DB round-trips + one-time bootstrap: give it room.
    testTimeout: 30000,
    hookTimeout: 30000,
    // Single DB, mutating state: never run integration files in parallel.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
