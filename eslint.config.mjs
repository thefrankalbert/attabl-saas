import { defineConfig, globalIgnores } from 'eslint/config';

// Container queries forbidden for admin PAGE layout.
// Market standard for a sidebar dashboard = viewport breakpoints
// (sm:, md:, lg:, xl:, 2xl:). A single shell @container equals
// "viewport minus sidebar", so keying layout to it makes a real desktop
// render the tablet layout (the content area is narrower than the window).
// Container queries are correct ONLY on self-contained immersive surfaces
// that own their @container (POS, KDS, fullscreen PaymentModal) - those are
// excluded from this rule's file scope below.
// See .claude/rules/03-responsive-design.md
const noContainerQueryInAdminLayoutRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow container queries (@container, @sm:, @md:, @lg:, @xl:, ...) in admin page-layout components. Use viewport breakpoints (sm:, md:, lg:, xl:) instead.',
    },
    messages: {
      useViewport:
        'Container query "{{cq}}" is banned in admin layout - use a viewport breakpoint ' +
        '(sm:/md:/lg:/xl:) instead. A shell @container is viewport-minus-sidebar and makes ' +
        'desktop render the tablet layout. Container queries belong only on self-contained ' +
        'immersive surfaces (POS/KDS/modal) that own their @container.',
    },
    schema: [],
  },
  create(context) {
    function checkString(node, value) {
      const matches = value.match(/@container\b|@(?:sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl):/g);
      if (!matches) return;
      for (const cq of matches) {
        context.report({ node, messageId: 'useViewport', data: { cq } });
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
    // Generated service worker bundle (built by `serwist build`, see serwist.config.mjs)
    'public/sw.js',
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
  // Responsive guardrail (STRONG - all admin, not just dashboard): admin page
  // layout must use viewport breakpoints, the market standard. Container queries
  // are banned here because a shell @container is viewport-minus-sidebar and made
  // desktop render the tablet layout (incident 2026-07-03). Immersive surfaces that
  // legitimately own their own @container (POS, KDS, fullscreen PaymentModal) are
  // excluded. See .claude/rules/03-responsive-design.md + 11-deploy-visual-safety.md
  {
    files: [
      'src/components/admin/**/*.{ts,tsx}',
      'src/app/sites/**/admin/**/*.{ts,tsx}',
      'src/components/features/settings/**/*.{ts,tsx}',
      'src/components/features/users/**/*.{ts,tsx}',
    ],
    ignores: [
      '**/__tests__/**',
      // Immersive full-screen surfaces (no sidebar) that OWN their @container -
      // there the container ~ viewport, so container queries are correct.
      'src/components/admin/POSClient.tsx',
      'src/components/admin/KitchenClient.tsx',
      'src/components/admin/PaymentModal.tsx',
      'src/components/features/pos/**',
      'src/components/features/kitchen/**',
    ],
    plugins: {
      attabl: {
        rules: { 'no-container-query-in-admin-layout': noContainerQueryInAdminLayoutRule },
      },
    },
    rules: {
      'attabl/no-container-query-in-admin-layout': 'error',
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
  // Anti-regression iOS: tout <Input>/<Textarea> (ou natif) dont la font-size
  // effective est < 16px sur mobile declenche l'auto-zoom Safari iOS au focus
  // (zoom persistant = layout "casse"). La base shadcn est saine (text-base
  // md:text-sm) : seuls les overrides className non prefixes sont dangereux.
  // Pattern autorise : text-base md:text-sm / text-[16px] md:text-[14px].
  // Incident 2026-07-11 : recherche storefront + notes cuisine zoomes sur iPhone.
  {
    files: ['src/**/*.tsx'],
    ignores: ['src/components/ui/**', '**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXOpeningElement[name.name=/^(Input|Textarea|input|textarea)$/] JSXAttribute[name.name="className"] Literal[value=/(^|[^:\\w-])text-(xs|sm|\\[(?:[1-9]|1[0-5])(?:\\.\\d+)?px\\])/]',
          message:
            'Font < 16px sur un champ de saisie sans prefixe de breakpoint = auto-zoom iOS au focus. Utiliser text-base md:text-sm (ou text-[16px] md:text-[14px]) pour garder la petite taille en desktop seulement.',
        },
        {
          selector:
            'JSXOpeningElement[name.name=/^(Input|Textarea|input|textarea)$/] JSXAttribute[name.name="className"] TemplateElement[value.raw=/(^|[^:\\w-])text-(xs|sm|\\[(?:[1-9]|1[0-5])(?:\\.\\d+)?px\\])/]',
          message:
            'Font < 16px sur un champ de saisie sans prefixe de breakpoint = auto-zoom iOS au focus. Utiliser text-base md:text-sm (ou text-[16px] md:text-[14px]) pour garder la petite taille en desktop seulement.',
        },
      ],
    },
  },
  // Anti-regression design system: interdire la couleur de marque lime (#CCFF00)
  // et les classes de palette brute lime/green/emerald dans les surfaces ADMIN.
  // Contexte : #168 a aligne l'admin sur shadcn neutral + accent bleu. Le lime
  // est la couleur de MARQUE ATTABL, legitime cote tenant/marketing/auth/onboarding
  // mais INTERDITE dans l'admin. Les fuites passees (ErrorLayout, global-error,
  // DONUT_COLORS) etaient du lime hardcode invisible en navigation normale.
  // L'admin utilise les tokens semantiques (text-status-success, bg-status-success-bg)
  // et CHART_PALETTE pour les charts - JAMAIS de hex brut ni de classe green/lime.
  // Voir .claude/rules/09-admin-color-system.md
  {
    files: [
      'src/components/admin/**/*.{ts,tsx}',
      'src/app/admin/**/*.{ts,tsx}',
      'src/app/sites/**/admin/**/*.{ts,tsx}',
      'src/hooks/queries/useDashboardStats.ts',
      'src/hooks/useDashboardData.ts',
      'src/components/shared/ErrorLayout.tsx',
      'src/app/global-error.tsx',
    ],
    ignores: ['**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        // Hex ban = brand lime #CCFF00 + the full Tailwind lime scale (50..900),
        // so nobody can sneak lime back in via a neighbouring hex value.
        // Other green hexes stay allowed on purpose (e.g. the sanctioned emerald
        // avatar gradients #059669 in components/admin/tenants).
        {
          selector:
            'Literal[value=/CCFF00|F7FEE7|ECFCCB|D9F99D|BEF264|A3E635|84CC16|65A30D|4D7C0F|3F6212|365314/i]',
          message:
            'Hex lime interdit en admin (#CCFF00 et toute la gamme lime Tailwind). Utiliser les tokens neutres/bleus ou CHART_PALETTE (@/lib/design-tokens). Le lime est reserve au tenant/marketing.',
        },
        {
          selector:
            'TemplateElement[value.raw=/CCFF00|F7FEE7|ECFCCB|D9F99D|BEF264|A3E635|84CC16|65A30D|4D7C0F|3F6212|365314/i]',
          message:
            'Hex lime interdit en admin (#CCFF00 et toute la gamme lime Tailwind). Utiliser les tokens neutres/bleus ou CHART_PALETTE (@/lib/design-tokens). Le lime est reserve au tenant/marketing.',
        },
        {
          selector: 'Literal[value=/-(lime|green|emerald)-[0-9]/]',
          message:
            'Classe de palette brute (lime/green/emerald) interdite en admin. Utiliser les tokens semantiques (text-status-success, bg-status-success-bg, etc.).',
        },
        {
          selector: 'TemplateElement[value.raw=/-(lime|green|emerald)-[0-9]/]',
          message:
            'Classe de palette brute (lime/green/emerald) interdite en admin. Utiliser les tokens semantiques (text-status-success, bg-status-success-bg, etc.).',
        },
        // Ce bloc REMPLACE la regle no-restricted-syntax du bloc iOS ci-dessus
        // pour les fichiers admin (flat config: dernier bloc gagne par regle) ;
        // on re-liste donc les selecteurs anti-zoom iOS ici.
        {
          selector:
            'JSXOpeningElement[name.name=/^(Input|Textarea|input|textarea)$/] JSXAttribute[name.name="className"] Literal[value=/(^|[^:\\w-])text-(xs|sm|\\[(?:[1-9]|1[0-5])(?:\\.\\d+)?px\\])/]',
          message:
            'Font < 16px sur un champ de saisie sans prefixe de breakpoint = auto-zoom iOS au focus. Utiliser text-base md:text-sm (ou text-[16px] md:text-[14px]) pour garder la petite taille en desktop seulement.',
        },
        {
          selector:
            'JSXOpeningElement[name.name=/^(Input|Textarea|input|textarea)$/] JSXAttribute[name.name="className"] TemplateElement[value.raw=/(^|[^:\\w-])text-(xs|sm|\\[(?:[1-9]|1[0-5])(?:\\.\\d+)?px\\])/]',
          message:
            'Font < 16px sur un champ de saisie sans prefixe de breakpoint = auto-zoom iOS au focus. Utiliser text-base md:text-sm (ou text-[16px] md:text-[14px]) pour garder la petite taille en desktop seulement.',
        },
      ],
    },
  },
]);

export default eslintConfig;
