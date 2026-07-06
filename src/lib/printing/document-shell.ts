/**
 * Shared premium document shell for all printable / exported documents
 * (receipt, A4 invoice, stock sheets, kitchen ticket).
 *
 * One visual language, aligned with the admin dashboard: neutral ink palette,
 * Inter typography, generous spacing, hairline rules, tabular figures. Each
 * document supplies its own body; the shell owns the page frame, base type,
 * and print rules so every exported document looks consistent.
 */

export type DocumentFormat = 'thermal80' | 'a4';

/** Escape user-controlled strings before interpolating into HTML. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Design tokens shared by every document (Linear-inspired neutral system). */
const TOKENS = `
  --ink: #18181b;
  --ink-soft: #3f3f46;
  --muted: #71717a;
  --faint: #a1a1aa;
  --line: #e4e4e7;
  --line-soft: #f4f4f5;
  --subtle: #fafafa;
  --paper: #ffffff;
  --accent: #2563eb;
  --pos: #059669;
  --neg: #dc2626;
`;

const BASE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root { ${TOKENS} }

  html, body {
    font-family: 'Inter', -apple-system, 'Segoe UI', system-ui, sans-serif;
    color: var(--ink);
    background: var(--paper);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
  }

  .doc-title {
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--ink);
  }
  .doc-eyebrow {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--faint);
  }
  .doc-muted { color: var(--muted); }
  .doc-num { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }
  .doc-hr { border: none; border-top: 1px solid var(--line); }
  .doc-hr--strong { border: none; border-top: 1.5px solid var(--ink); }

  /* Brand header (restaurant identity), shared by every document. */
  .doc-brand { display: flex; align-items: center; gap: 12px; }
  .doc-brand__logo { max-height: 44px; max-width: 140px; object-fit: contain; }
  .doc-brand__name { font-size: 17px; font-weight: 700; letter-spacing: -0.02em; }
  .doc-brand__meta { font-size: 11px; color: var(--muted); line-height: 1.5; margin-top: 2px; }

  /* Data table shared style. */
  table.doc-table { width: 100%; border-collapse: collapse; }
  table.doc-table th {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--faint); text-align: left;
    padding: 8px 10px; border-bottom: 1px solid var(--line);
  }
  table.doc-table td {
    font-size: 12px; color: var(--ink-soft);
    padding: 9px 10px; border-bottom: 1px solid var(--line-soft);
    vertical-align: top;
  }
  table.doc-table td.num, table.doc-table th.num {
    text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  table.doc-table tr:last-child td { border-bottom: none; }

  .doc-footer {
    color: var(--faint); font-size: 9px; letter-spacing: 0.04em;
    text-transform: uppercase;
  }
`;

const FORMAT_CSS: Record<DocumentFormat, string> = {
  thermal80: `
    body { width: 302px; margin: 0 auto; font-size: 13px; }
    .doc-page { padding: 16px 14px; }
    @media print {
      body { width: 100%; }
      @page { margin: 0; size: 80mm auto; }
    }
  `,
  a4: `
    body { font-size: 13px; }
    .doc-page {
      width: 210mm; min-height: 297mm; margin: 0 auto;
      padding: 20mm 18mm; background: var(--paper);
    }
    @media screen { body { background: #f4f4f5; padding: 24px 0; } .doc-page { box-shadow: 0 1px 3px rgba(0,0,0,.08); } }
    @media print { @page { margin: 0; size: A4; } body { background: #fff; } .doc-page { box-shadow: none; margin: 0; } }
  `,
};

export interface DocumentShellInput {
  format: DocumentFormat;
  /** Document <title>. */
  title: string;
  /** Inner HTML for the page body (the document supplies its own structure). */
  body: string;
  /** Optional extra CSS scoped to this document. */
  css?: string;
}

/** Wrap a document body in the shared premium HTML shell. */
export function renderDocumentShell({ format, title, body, css = '' }: DocumentShellInput): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>${BASE_CSS}${FORMAT_CSS[format]}${css}</style>
</head>
<body>
  <div class="doc-page">${body}</div>
</body>
</html>`;
}

export interface BrandHeaderInput {
  name?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
}

/**
 * Shared restaurant identity block. `align` controls layout: 'center' for the
 * thermal receipt, 'left' for A4 documents where it sits beside document meta.
 */
export function renderBrandHeader(
  tenant: BrandHeaderInput,
  align: 'center' | 'left' = 'left',
): string {
  const logo = tenant.logoUrl
    ? `<img class="doc-brand__logo" src="${escapeHtml(tenant.logoUrl)}" alt="${escapeHtml(tenant.name || '')}" />`
    : '';
  const meta = [tenant.address, tenant.phone ? `Tel : ${tenant.phone}` : '']
    .filter(Boolean)
    .map((line) => escapeHtml(String(line)))
    .join('<br />');

  if (align === 'center') {
    return `<div style="text-align:center;">
      ${tenant.logoUrl ? `<img class="doc-brand__logo" style="margin:0 auto 8px;display:block;" src="${escapeHtml(tenant.logoUrl)}" alt="${escapeHtml(tenant.name || '')}" />` : ''}
      <div class="doc-brand__name">${escapeHtml(tenant.name || 'Restaurant')}</div>
      ${meta ? `<div class="doc-brand__meta">${meta}</div>` : ''}
    </div>`;
  }

  return `<div class="doc-brand">
    ${logo}
    <div>
      <div class="doc-brand__name">${escapeHtml(tenant.name || 'Restaurant')}</div>
      ${meta ? `<div class="doc-brand__meta">${meta}</div>` : ''}
    </div>
  </div>`;
}
