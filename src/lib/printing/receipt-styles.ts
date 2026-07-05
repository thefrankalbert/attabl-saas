/**
 * Feuille de style du recu client premium (imprimante thermique 80mm).
 * La couleur primaire du tenant est injectee dans deux regles (.tenant-name, .item-qty).
 */
export function receiptStyles(primaryColor: string): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      width: 302px;
      margin: 0 auto;
      padding: 0;
      color: #18181b;
      background: #fff;
      -webkit-font-smoothing: antialiased;
    }

    .receipt {
      padding: 16px 14px;
    }

    /* --- Header ----------------------------------- */
    .header {
      text-align: center;
      padding-bottom: 14px;
    }
    .header .tenant-name {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: ${primaryColor};
      margin-bottom: 2px;
    }
    .header .tenant-info {
      font-size: 10px;
      color: #a1a1aa;
      line-height: 1.5;
    }

    /* --- Dividers ---------------------------------- */
    .divider {
      border: none;
      border-top: 1px solid #e4e4e7;
      margin: 12px 0;
    }
    .divider--strong {
      border-top: 2px solid #18181b;
      margin: 14px 0;
    }

    /* --- Order info card --------------------------- */
    .info-card {
      background: #fafafa;
      border: 1px solid #f4f4f5;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 2px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 3px 0;
    }
    .info-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #a1a1aa;
      font-weight: 600;
    }
    .info-value {
      font-size: 12px;
      font-weight: 700;
      color: #18181b;
      font-variant-numeric: tabular-nums;
    }
    .info-value--mono {
      font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
    }

    /* --- Items section ----------------------------- */
    .items-header {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #a1a1aa;
      font-weight: 600;
      padding: 0 0 6px;
    }
    .item-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      padding: 5px 0;
    }
    .item-qty {
      font-size: 12px;
      font-weight: 800;
      color: ${primaryColor};
      min-width: 18px;
      text-align: center;
    }
    .item-name {
      flex: 1;
      font-size: 12px;
      color: #18181b;
      line-height: 1.3;
    }
    .item-price {
      font-size: 12px;
      font-weight: 700;
      color: #18181b;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .item-detail {
      font-size: 10px;
      color: #71717a;
      padding: 1px 0 1px 26px;
      line-height: 1.4;
    }
    .item-detail--note {
      color: #ca8a04;
    }
    .item-detail--mod {
      color: #2563eb;
    }

    /* --- Breakdown --------------------------------- */
    .breakdown-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #71717a;
      padding: 2px 0;
    }
    .breakdown-row--discount {
      color: #dc2626;
    }
    .breakdown-row--tip {
      color: #059669;
    }

    /* --- Total ------------------------------------- */
    .total-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0 4px;
    }
    .total-label {
      font-size: 14px;
      font-weight: 800;
      color: #18181b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .total-amount {
      font-size: 20px;
      font-weight: 900;
      color: #18181b;
      font-variant-numeric: tabular-nums;
    }
    .total-currency {
      font-size: 12px;
      font-weight: 600;
      color: #a1a1aa;
      margin-left: 4px;
    }

    /* --- Payment badge ----------------------------- */
    .payment-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #71717a;
      background: #f4f4f5;
      border: 1px solid #e4e4e7;
      border-radius: 4px;
      padding: 3px 10px;
    }

    /* --- Footer ------------------------------------ */
    .footer {
      text-align: center;
      padding-top: 6px;
    }
    .footer .thank-you {
      font-size: 13px;
      font-weight: 700;
      color: #18181b;
      margin-bottom: 4px;
    }
    .footer .tenant-url {
      font-size: 10px;
      color: #a1a1aa;
      letter-spacing: 0.02em;
    }
    .footer .powered {
      font-size: 9px;
      color: #d4d4d8;
      margin-top: 8px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    /* --- Print styles ------------------------------ */
    @media print {
      body { width: 100%; }
      @page { margin: 0; size: 80mm auto; }
      .info-card { background: #fff; border: 1px solid #e4e4e7; }
    }
  `;
}
