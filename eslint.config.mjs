import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Désactive les règles ESLint qui conflictent avec Prettier
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Coverage & tests output
    'coverage/**',
    // Utility scripts (Node.js, not Next.js)
    'scripts/**',
    // Claude Code worktrees (isolated development branches)
    '.claude/**',
    '.worktrees/**',
    // Skill/template assets bundled with plugins (not part of our codebase)
    '.agents/**',
    // Root-level prototype / scratch files
    'prototype-*.{js,jsx,ts,tsx}',
  ]),
  // Accessibility: promote critical jsx-a11y rules from warning to error so
  // CI rejects regressions (alt text, role/aria mismatches, labels, kbd
  // interaction). Less-objective rules (click-events-have-key-events,
  // no-static-element-interactions) stay as warnings because they
  // over-trigger on framer-motion and drag-drop surfaces.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/ui/**', 'src/__tests__/**', '**/__tests__/**'],
    rules: {
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      'jsx-a11y/img-redundant-alt': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/tabindex-no-positive': 'error',
      'jsx-a11y/scope': 'error',
    },
  },
  // Anti-regression: bloquer les elements HTML natifs en faveur de shadcn/ui
  // Les fichiers dans src/components/ui/ sont exclus (ce sont les composants shadcn eux-memes)
  {
    files: ['src/**/*.tsx'],
    ignores: ['src/components/ui/**'],
    rules: {
      'react/forbid-elements': [
        'warn',
        {
          forbid: [
            {
              element: 'button',
              message: 'Utiliser <Button> de @/components/ui/button au lieu de <button> natif.',
            },
            {
              element: 'input',
              message:
                'Utiliser <Input> de @/components/ui/input au lieu de <input> natif (sauf type="file" et type="color").',
            },
            {
              element: 'select',
              message: 'Utiliser <Select> de @/components/ui/select au lieu de <select> natif.',
            },
            {
              element: 'textarea',
              message:
                'Utiliser <Textarea> de @/components/ui/textarea au lieu de <textarea> natif.',
            },
            {
              element: 'table',
              message: 'Utiliser <Table> de @/components/ui/table au lieu de <table> natif.',
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
