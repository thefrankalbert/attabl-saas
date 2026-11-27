import type { LaunchIssue } from '../launch-issues';

export type LaunchFixKey =
  | 'launchFixName'
  | 'launchFixDetails'
  | 'launchFixBranding'
  | 'launchFixTables'
  | 'launchFixMenu'
  | 'launchFixQr'
  | 'launchFixGeneric';

const FIELD_TO_KEY: Record<string, LaunchFixKey> = {
  tenantName: 'launchFixName',
  address: 'launchFixDetails',
  city: 'launchFixDetails',
  country: 'launchFixDetails',
  phone: 'launchFixDetails',
  primaryColor: 'launchFixBranding',
  secondaryColor: 'launchFixBranding',
  description: 'launchFixBranding',
  logoUrl: 'launchFixBranding',
  tableCount: 'launchFixTables',
  tableConfigMode: 'launchFixTables',
  tableZones: 'launchFixTables',
  menuItems: 'launchFixMenu',
  qrCta: 'launchFixQr',
  qrDescription: 'launchFixQr',
};

/**
 * Traduit les refus de validation du serveur (chemin `data.tableZones.0.tableCount`)
 * en cle de texte qui dit quel ecran corriger. Le texte technique du serveur
 * n'est jamais montre a l'utilisateur.
 */
export function launchFixKey(details: readonly LaunchIssue[]): LaunchFixKey {
  for (const detail of details) {
    const field = detail.path[1] ?? '';
    const key = FIELD_TO_KEY[field];
    if (key) return key;
  }
  return 'launchFixGeneric';
}
