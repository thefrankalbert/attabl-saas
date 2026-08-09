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
      // Ratchet floors: set to the current measured coverage so elle ne peut que
      // MONTER, jamais regresser.
      //
      // Remontes le 2026-08-05 (LOT 7.1 #6). Les valeurs precedentes
      // (38/44/30/38, mesure du 2026-06-18) etaient devenues tres en dessous du
      // reel: un plancher trop bas laisse passer une perte de couverture sans
      // rien signaler, donc il ne protege plus de rien.
      //
      // Mesure du 2026-08-05: statements 50,63 / branches 43,98 /
      // functions 54,06 / lines 51,32. Les planchers sont poses JUSTE en dessous,
      // assez pres pour attraper une regression, assez loin pour ne pas casser la
      // CI sur une variation d'un dixieme.
      thresholds: {
        lines: 49,
        functions: 52,
        branches: 42,
        statements: 48,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
