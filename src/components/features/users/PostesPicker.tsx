'use client';

import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { buildRoleConfig } from '@/lib/role-config';
import { STAFF_POSTES, type StaffPoste } from '@/types/permission.types';

interface PostesPickerProps {
  /** Prefixe des `id` des cases (deux formulaires peuvent coexister). */
  idPrefix: string;
  value: readonly StaffPoste[];
  onChange: (postes: StaffPoste[]) => void;
}

/**
 * Cases a cocher des 10 postes attribuables (le proprietaire n'en fait pas
 * partie). Plusieurs postes se cumulent: la personne obtient les droits de
 * chacun. L'ordre rendu est l'ordre canonique, quel que soit l'ordre des clics.
 */
export default function PostesPicker({ idPrefix, value, onChange }: PostesPickerProps) {
  const t = useTranslations('users');
  const config = buildRoleConfig(t);

  const toggle = (poste: StaffPoste, checked: boolean) => {
    const next = new Set(value);
    if (checked) next.add(poste);
    else next.delete(poste);
    onChange(STAFF_POSTES.filter((p) => next.has(p)));
  };

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group">
      {STAFF_POSTES.map((poste) => {
        const { icon: Icon, label } = config[poste];
        const id = `${idPrefix}-${poste}`;
        return (
          <div
            key={poste}
            className="flex min-h-[44px] items-start gap-3 rounded-lg border border-app-border p-3"
          >
            <Checkbox
              id={id}
              className="mt-0.5"
              checked={value.includes(poste)}
              onCheckedChange={(checked) => toggle(poste, checked === true)}
            />
            <div className="min-w-0">
              <Label htmlFor={id} className="flex cursor-pointer items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </Label>
              <p className="mt-1 text-xs text-app-text-secondary">{t(`posteDesc.${poste}`)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
