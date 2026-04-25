import { defineConfig, globalIgnores } from 'eslint/config';

// Viewport breakpoints forbidden in admin/features components.
// Admin components live inside a @container, so they MUST use container
// queries (@sm:, @md:, @lg:, @xl:, @2xl:) - NOT viewport queries
// (sm:, md:, lg:, xl:, 2xl:).
// Using viewport queries makes layout depend on window size instead of
// the available container width, breaking tablet layouts where the
// sidebar shrinks the content area below the viewport breakpoint.
const noViewportInAdminRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow viewport breakpoints (sm:, md:, lg:, xl:, 2xl:) in admin/features components. Use container queries (@sm:, @md:, @lg:, @xl:, @2xl:) instead.',
    },
    messages: {
      useContainerQuery:
        'Found viewport query "{{vq}}" - use container query "{{cq}}" instead in admin/features. ' +
        'Admin components are inside a @container; viewport queries ignore the sidebar width.',
    },
    schema: [],
  },
  create(context) {
    const VP_TO_CQ = {
      'sm:': '@sm:',
      'md:': '@md:',
      'lg:': '@lg:',
      'xl:': '@xl:',
      '2xl:': '@2xl:',
    };

    // Patterns that are legitimately viewport-based even inside admin components:
    // - sm:max-w-* / sm:w-* : Dialog/Sheet sizing (modal overlays the viewport)
    // - lg:hidden / lg:flex / lg:block : sidebar show/hide is viewport-driven
    // - lg:flex-row / lg:flex-col : top-level shell flex direction
    const ALLOWED =
      /(?:sm:|md:|lg:|xl:)(?:max-w-|min-w-|w-\[|hidden|flex$|block$|flex-row|flex-col|flex-col$)/;

    function checkString(node, value) {
      const matches = value.match(/(?<![/@\w])(?:2xl|xl|lg|md|sm):/g);
      if (!matches) return;
      // Skip if the whole value is a known-allowed pattern
      if (ALLOWED.test(value)) return;
      for (const vq of matches) {
        const cq = VP_TO_CQ[vq];
        if (cq) context.report({ node, messageId: 'useContainerQuery', data: { vq, cq } });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') checkString(node, node.value);
      },
      TemplateLiteral(node) {
        node.quasis.forEach((q) => checkString(q, q.value.raw));
      },
    };
  },
};
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
  // Responsive guardrail: interdire les viewport queries dans les composants dashboard.
  // Ces composants sont rendus dans un @container (main-content, AdminLayoutClient:133).
  // Viewport queries (sm:, md:, lg:) ignorent la sidebar et brisent le layout tablette.
  // Regle scopee a dashboard/ uniquement pour eviter les faux positifs sur les Dialogs
  // et AdminLayoutClient qui eux utilisent legitiment les viewport queries.
  {
    files: ['src/components/admin/dashboard/**/*.{ts,tsx}'],
    ignores: ['**/__tests__/**'],
    plugins: { attabl: { rules: { 'no-viewport-in-admin': noViewportInAdminRule } } },
    rules: {
      'attabl/no-viewport-in-admin': 'error',
    },
  },
  // Anti-regression: bloquer les elements HTML natifs en faveur de shadcn/ui
  // Les fichiers dans src/components/ui/ sont exclus (ce sont les composants shadcn eux-memes)
  // Les fichiers __tests__ sont exclus : les mocks natifs <button> y sont
  // intentionnels pour court-circuiter les primitives shadcn complexes.
  {
    files: ['src/**/*.tsx'],
    ignores: ['src/components/ui/**', '**/__tests__/**'],
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
