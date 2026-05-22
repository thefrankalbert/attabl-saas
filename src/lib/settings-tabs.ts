export const SETTINGS_TABS = [
  'identity',
  'branding',
  'billing',
  'sounds',
  'security',
  'contact',
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function parseSettingsTab(value: string | undefined): SettingsTab {
  if (value && SETTINGS_TABS.includes(value as SettingsTab)) {
    return value as SettingsTab;
  }
  return 'identity';
}
