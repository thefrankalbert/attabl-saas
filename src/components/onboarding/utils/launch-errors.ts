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
 * Traduit les erreurs de validation du serveur ("data.tableZones.0.tableCount:
 * Too big...") en cle de texte qui dit quel ecran corriger. Le texte technique
 * du serveur n'est jamais montre a l'utilisateur.
 */
export function launchFixKey(details: readonly string[]): LaunchFixKey {
  for (const detail of details) {
    const path = detail.split(':')[0] ?? '';
    const field = path.split('.')[1] ?? '';
    const key = FIELD_TO_KEY[field];
    if (key) return key;
  }
  return 'launchFixGeneric';
}
