'use client';

import { useCallback, useMemo, useState } from 'react';
import { parseTip, tipPresets, MAX_KEYPAD_DIGITS } from './payment-amounts';

/**
 * Amounts of the payment screen, in MAJOR units: tip choice, cash received on
 * the keypad, change due. Split out of PaymentModal.
 */
export function usePaymentAmounts(finalTotal: number, currency: string) {
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [tipFixed, setTipFixed] = useState<number>(0);
  const [customTip, setCustomTip] = useState<string>('');
  const [showCustomTip, setShowCustomTip] = useState(false);

  const tipAmount = useMemo(
    () => (showCustomTip ? parseTip(customTip, currency) : tipFixed),
    [tipFixed, customTip, showCustomTip, currency],
  );
  const totalWithTip = finalTotal + tipAmount;
  const receivedAmount = parseFloat(amountReceived) || 0;
  const change = Math.max(0, receivedAmount - totalWithTip);
  const amountRemaining = Math.max(0, totalWithTip - receivedAmount);
  const cashIsValid = receivedAmount >= totalWithTip;

  const handleKeypadPress = useCallback((key: string) => {
    if (key === 'C') {
      setAmountReceived('');
    } else if (key === 'BACK') {
      setAmountReceived((prev) => prev.slice(0, -1));
    } else {
      setAmountReceived((prev) => {
        if (prev === '0' && key !== '00') return key;
        if (prev.length + key.length > MAX_KEYPAD_DIGITS) return prev;
        return prev + key;
      });
    }
  }, []);

  const setExactCashAmount = useCallback(() => {
    setAmountReceived(String(Math.round(totalWithTip)));
  }, [totalWithTip]);

  const addCashAmount = useCallback(
    (delta: number) => setAmountReceived(String(Math.round(receivedAmount + delta))),
    [receivedAmount],
  );

  const tipProps = {
    presets: tipPresets(currency),
    tipFixed,
    showCustomTip,
    customTip,
    onFixed: (amount: number) => {
      setTipFixed(amount);
      setShowCustomTip(false);
      setCustomTip('');
    },
    onCustom: () => {
      setShowCustomTip(true);
      setTipFixed(0);
    },
    onCustomChange: setCustomTip,
  };

  return {
    tipAmount,
    totalWithTip,
    receivedAmount,
    change,
    amountRemaining,
    cashIsValid,
    handleKeypadPress,
    setExactCashAmount,
    addCashAmount,
    tipProps,
  };
}
