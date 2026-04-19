import type { NavGroupConfig } from './navigation-config';

export type SidebarSectionKey = 'operations' | 'catalog' | 'marketing';

export interface SidebarSection {
  key: SidebarSectionKey;
  /** i18n key in 'sidebar' namespace to resolve the uppercase mono header */
  labelKey: string;
  groups: NavGroupConfig[];
}

const SECTION_ORDER: SidebarSectionKey[] = ['operations', 'catalog', 'marketing'];

const SECTION_LABEL_KEYS: Record<SidebarSectionKey, string> = {
  operations: 'sectionOperations',
  catalog: 'sectionCatalog',
  marketing: 'sectionMarketing',
};

/**
 * Split an ordered list of nav groups into the three sidebar sections
 * shown in the redesigned admin sidebar (Operations / Catalog / Marketing).
 * Groups without a sectionKey (or with one not covered here) are dropped.
 * Groups that are hidden by the current establishment segment can be
 * pre-filtered before calling this.
 */
export function computeSidebarSections(groups: NavGroupConfig[]): SidebarSection[] {
  const buckets: Record<SidebarSectionKey, NavGroupConfig[]> = {
    operations: [],
    catalog: [],
    marketing: [],
  };

  for (const group of groups) {
    if (!group.sectionKey) continue;
    buckets[group.sectionKey].push(group);
  }

  return SECTION_ORDER.map((key) => ({
    key,
    labelKey: SECTION_LABEL_KEYS[key],
    groups: buckets[key],
  })).filter((section) => section.groups.length > 0);
}
