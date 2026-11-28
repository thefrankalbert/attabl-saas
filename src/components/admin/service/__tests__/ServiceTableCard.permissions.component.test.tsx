// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { ServiceTableCard } from '../ServiceTableCard';
import type { ServiceTableVM } from '../service.types';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { getEffectiveLevels } from '@/lib/permissions';
import type { PermissionMap, Poste } from '@/types/permission.types';

// X13: la page /service est ouverte a tous, mais assigner ou liberer un serveur
// exige settings.edit (plan de salle, actions/assignments.ts). Le bouton
// "liberer" etait offert a tous, et le serveur refusait ensuite.

const actor: { poste: Poste; overrides: PermissionMap } = { poste: 'manager', overrides: {} };
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
      postes={[actor.poste]}
      levels={getEffectiveLevels({ postes: [actor.poste], permission_overrides: actor.overrides })}
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
  actor.poste = 'manager';
  actor.overrides = {};
});

describe('ServiceTableCard - liberer une table', () => {
  it('le gerant voit le bouton liberer', () => {
    renderCard();
    expect(screen.getByLabelText('release')).toBeInTheDocument();
  });

  it('un serveur ne le voit pas', () => {
    actor.poste = 'waiter';
    renderCard();
    expect(screen.queryByLabelText('release')).toBeNull();
  });

  it('un serveur a qui le proprietaire donne settings.edit le voit', () => {
    actor.poste = 'waiter';
    actor.overrides = { 'settings.edit': true };
    renderCard();
    expect(screen.getByLabelText('release')).toBeInTheDocument();
  });

  it('un gerant a qui on a retire settings.edit ne le voit pas', () => {
    actor.overrides = { 'settings.edit': false };
    renderCard();
    expect(screen.queryByLabelText('release')).toBeNull();
  });
});
