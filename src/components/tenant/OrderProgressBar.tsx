'use client';

// Deprecated: use OrderTracker instead. Kept as a thin wrapper for backward
// compatibility with any legacy imports.
import OrderTracker from './OrderTracker';

interface OrderProgressBarProps {
  status: string;
  createdAt?: string;
}

export default function OrderProgressBar({
  status,
  createdAt = new Date().toISOString(),
}: OrderProgressBarProps) {
  return <OrderTracker status={status} createdAt={createdAt} />;
}
