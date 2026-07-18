const SETTINGS_TABS = [
  'identity',
  'branding',
  'billing',
  'hours',
  'sounds',
  'security',
  'contact',
  'espaces',
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function parseSettingsTab(value: string | undefined): SettingsTab {
  // "espaces" est un onglet de navigation (redirige vers une route dediee), pas un
  // TabsContent - le rendre invalide ici evite un pane vide sur un ?tab=espaces direct.
  if (value === 'espaces') {
    return 'identity';
  }
  if (value && SETTINGS_TABS.includes(value as SettingsTab)) {
    return value as SettingsTab;
  }
  return 'identity';
}
