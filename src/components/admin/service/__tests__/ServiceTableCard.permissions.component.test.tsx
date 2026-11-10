// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { ServiceTableCard } from '../ServiceTableCard';
import type { ServiceTableVM } from '../service.types';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import type { AdminRole } from '@/types/admin.types';
import type { PermissionCode } from '@/types/permission.types';

// X13: la page /service est ouverte a tous, mais assigner ou liberer un serveur
// exige un role de gerant ET orders.manage (actions/assignments.ts). Le bouton
// "liberer" etait offert a tous, et le serveur refusait ensuite.

const actor: { role: string; perms: Record<string, boolean> } = {
  role: 'manager',
  perms: { 'orders.manage': true },
};
const vm = {
  table: { id: 't1', table_number: '5', display_name: null, capacity: 4 },
  zone: undefined,
  status: 'occupied',
  assignment: { id: 'a1', table_id: 't1', server_id: 's1' },
  since: undefined,
} as unknown as ServiceTableVM;

const labels = {
  free: 'free',
  occupied: 'occupied',
  reserved: 'reserved',
  cleaning: 'cleaning',
  seatsShort: 'pl',
  emptyServerDropHint: 'drop',
  emptyServerCleaningHint: 'clean',
  emptyServerReserved: 'res',
  sinceSince: 'since',
  releaseAria: 'release',
};

function renderCard() {
  const noop = () => {};
  return render(
    <PermissionsProvider
      role={actor.role as AdminRole}
      permissions={actor.perms as Record<PermissionCode, boolean>}
    >
      <ServiceTableCard
        vm={vm}
        selected={false}
        dragOver={false}
        serverVM={undefined}
        labels={labels}
        onSelect={noop}
        onRelease={noop}
        onDragOver={noop}
        onDragLeave={noop}
        onDrop={noop}
      />
    </PermissionsProvider>,
  );
}

afterEach(() => {
  actor.role = 'manager';
  actor.perms = { 'orders.manage': true };
});

describe('ServiceTableCard - liberer une table', () => {
  it('le gerant voit le bouton liberer', () => {
    renderCard();
    expect(screen.getByLabelText('release')).toBeInTheDocument();
  });

  it('un serveur ne le voit pas, meme avec orders.manage', () => {
    actor.role = 'waiter';
    renderCard();
    expect(screen.queryByLabelText('release')).toBeNull();
  });

  it('un gerant a qui on a retire orders.manage ne le voit pas', () => {
    actor.perms = { 'orders.manage': false };
    renderCard();
    expect(screen.queryByLabelText('release')).toBeNull();
  });
});
