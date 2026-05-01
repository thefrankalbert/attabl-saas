// Deprecated: use OrderTracker instead. Kept as a thin wrapper for backward
// compatibility with any legacy imports. No 'use client' needed - this file
// adds no state/effects; OrderTracker declares 'use client' itself.
import OrderTracker from './OrderTracker';

interface OrderProgressBarProps {
  status: string;
  createdAt?: string;
}

export default function OrderProgressBar({ status }: OrderProgressBarProps) {
  return <OrderTracker status={status} />;
}
