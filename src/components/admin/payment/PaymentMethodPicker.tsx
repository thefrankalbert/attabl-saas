'use client';

import { useTranslations } from 'next-intl';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useEnabledPaymentMethods } from '@/contexts/PaymentMethodsContext';
import {
  ACTIVE_PAYMENT_METHOD_IDS,
  DEFAULT_PAYMENT_METHODS,
  type PaymentMethodId,
} from '@/lib/payments/methods';

/** Moyens que la caisse sait enregistrer: especes, ou carte sur le terminal du restaurant. */
const PICKABLE: readonly PaymentMethodId[] = ['cash', 'card'];

/**
 * Moyens proposes au caissier: actifs dans le registre ET actives pour le
 * restaurant (`enabled_payment_methods`, defaut especes + carte). Les especes
 * restent le repli si l'intersection est vide.
 */
export function usePaymentMethodChoices(): PaymentMethodId[] {
  const enabled = useEnabledPaymentMethods() ?? DEFAULT_PAYMENT_METHODS;
  const choices = PICKABLE.filter(
    (id) => ACTIVE_PAYMENT_METHOD_IDS.includes(id) && enabled.includes(id),
  );
  return choices.length > 0 ? choices : ['cash'];
}

/** Garde le moyen choisi tant qu'il est propose, sinon retombe sur le defaut. */
export function effectivePaymentMethod(
  chosen: PaymentMethodId | null,
  choices: readonly PaymentMethodId[],
): PaymentMethodId {
  return chosen && choices.includes(chosen) ? chosen : defaultPaymentMethod(choices);
}

/** Choix initial: especes quand elles sont proposees, sinon le premier moyen. */
export function defaultPaymentMethod(choices: readonly PaymentMethodId[]): PaymentMethodId {
  return choices.includes('cash') ? 'cash' : (choices[0] ?? 'cash');
}

interface PaymentMethodPickerProps {
  value: PaymentMethodId;
  onChange: (method: PaymentMethodId) => void;
  choices: readonly PaymentMethodId[];
  disabled?: boolean;
}

/** Selecteur Especes / Carte (terminal). Masque quand un seul moyen est propose. */
export function PaymentMethodPicker({
  value,
  onChange,
  choices,
  disabled,
}: PaymentMethodPickerProps) {
  const t = useTranslations('payment');
  if (choices.length < 2) return null;

  const label = (id: PaymentMethodId) => (id === 'card' ? t('cardTerminal') : t('cash'));

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value}
      onValueChange={(next) => {
        // Radix renvoie '' quand on reclique le choix actif: on garde le choix.
        const picked = choices.find((id) => id === next);
        if (picked) onChange(picked);
      }}
      disabled={disabled}
      aria-label={t('paymentMethod')}
      className="w-full shrink-0"
    >
      {choices.map((id) => (
        // Choix actif aux couleurs des pastilles de l'admin (ReportsSummaryHeader,
        // StockHistoryFilters): `bg-accent` y est presque noir et le texte par
        // defaut le rendait illisible (constate au navigateur le 2026-11-14).
        <ToggleGroupItem
          key={id}
          value={id}
          className="min-h-[44px] flex-1 text-sm font-bold data-[state=on]:border-app-text data-[state=on]:bg-app-text data-[state=on]:text-app-bg"
        >
          {label(id)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
