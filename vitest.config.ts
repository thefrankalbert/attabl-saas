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
      //
      // Remontes le 2026-08-10 (campagne de couverture, passe 1). Mesure du jour:
      // statements 55,26 / branches 46,85 / functions 57,29 / lines 56,18, apres
      // couverture de outbox-idb (6 -> 93 %), rate-limit et session-admin-user.
      //
      // METHODE: a cliquet. Le plancher suit le reel apres chaque passe, il ne le
      // devance jamais. Un plancher pose au-dessus du reel rend la CI rouge et
      // bloque tous les merges sans qu'une ligne soit mieux testee - c'est ainsi
      // que les seuils d'origine (70/70/65/70) avaient fini par etre effondres a
      // 38/44/30/38 plutot que tenus. La cible reste 70; on y va par passes, en
      // commencant par ce qui protege l'argent et les acces.
      //
      // Passe 2 (2026-08-10) : garde de permission des pages admin. Mesure du
      // jour : statements 55,98 / branches 47,49 / functions 57,52 / lines 56,97.
      //
      // Passe 3 (2026-08-10) : finalisation d'onboarding. Mesure du jour :
      // statements 57,41 / branches 49,11 / functions 58,56 / lines 58,41.
      //
      // Passe 4 (2026-08-11) : tarification Stripe et garde super-admin. Mesure
      // du jour : statements 58,37 / branches 49,81 / functions 59,83 /
      // lines 59,36. Cette passe a trouve un vrai defaut au passage (recherche
      // inverse prix -> plan qui rendait toujours null), corrige dans la meme PR.
      //
      // Passe 5 (2026-08-11) : acceptation d'invitation et listing des
      // invitations en attente (42,68 -> 95,12 % sur invitation.service.ts).
      // Mesure du jour : statements 59,26 / branches 50,94 / functions 60,06 /
      // lines 60,33.
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 59,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
