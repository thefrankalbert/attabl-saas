import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/services/**', 'src/lib/validations/**', 'src/lib/**'],
      // Ratchet floors: set to the current measured coverage (2026-06-18) so coverage
      // can only go UP, never regress. Previous 70/65 values were aspirational and never
      // enforced in CI (the gate ran `pnpm test`, not `pnpm test:coverage`), so they were
      // decorative. Now that CI runs `test:coverage`, these floors actually gate PRs.
      // Raise them toward the 70/65 target as tests are added.
      thresholds: {
        lines: 38,
        functions: 44,
        branches: 30,
        statements: 38,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
