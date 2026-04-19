import { describe, it, expect } from 'vitest';
import { LayoutDashboard } from 'lucide-react';
import { computeSidebarSections } from '../nav-sections';
import type { NavGroupConfig } from '../navigation-config';

function g(id: string, sectionKey: NavGroupConfig['sectionKey'], directPath = ''): NavGroupConfig {
  return {
    id,
    titleKey: id,
    icon: LayoutDashboard,
    items: [],
    directPath,
    sectionKey,
  };
}

describe('computeSidebarSections', () => {
  it('keeps insertion order inside each bucket', () => {
    const groups = [
      g('dashboard', 'operations'),
      g('menus', 'catalog'),
      g('orders', 'operations'),
      g('coupons', 'marketing'),
      g('items', 'catalog'),
    ];
    const sections = computeSidebarSections(groups);

    expect(sections.map((s) => s.key)).toEqual(['operations', 'catalog', 'marketing']);
    expect(sections[0].groups.map((x) => x.id)).toEqual(['dashboard', 'orders']);
    expect(sections[1].groups.map((x) => x.id)).toEqual(['menus', 'items']);
    expect(sections[2].groups.map((x) => x.id)).toEqual(['coupons']);
  });

  it('drops groups with no sectionKey', () => {
    const groups = [g('dashboard', 'operations'), { ...g('analyse', undefined) }];
    const sections = computeSidebarSections(groups);

    expect(sections).toHaveLength(1);
    expect(sections[0].groups.map((x) => x.id)).toEqual(['dashboard']);
  });

  it('skips empty sections entirely', () => {
    const groups = [g('dashboard', 'operations')];
    const sections = computeSidebarSections(groups);

    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('operations');
  });
});
