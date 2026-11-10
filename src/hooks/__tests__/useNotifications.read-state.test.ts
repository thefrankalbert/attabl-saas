import { describe, it, expect, vi } from 'vitest';

// "Lu" est par personne (20261109210000): la ligne notification_reads de
// l'utilisateur, filtree par la RLS, ou le drapeau historique partage.

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('@/app/actions/notifications', () => ({
  actionMarkNotificationRead: vi.fn(),
  actionMarkAllNotificationsRead: vi.fn(),
}));

import { toNotification } from '../useNotifications';

const base = {
  id: 'n1',
  tenant_id: 't1',
  user_id: null,
  type: 'info' as const,
  title: 'Nouvelle commande',
  body: null,
  link: null,
  created_at: '2026-11-09T10:00:00Z',
};

describe('useNotifications: etat lu par personne', () => {
  it('diffusee, ni drapeau ni ligne a soi: non lue', () => {
    expect(toNotification({ ...base, read: false, notification_reads: [] }).read).toBe(false);
  });

  it('diffusee, ligne de lecture a soi: lue, et la cle embarquee disparait', () => {
    const n = toNotification({ ...base, read: false, notification_reads: [{ user_id: 'u1' }] });
    expect(n.read).toBe(true);
    expect(n).not.toHaveProperty('notification_reads');
  });

  it('drapeau historique a true: reste lue', () => {
    expect(toNotification({ ...base, read: true, notification_reads: null }).read).toBe(true);
  });
});
