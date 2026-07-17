import { KitchenSkeleton } from '@/components/admin/kitchen/KitchenSkeleton';

export default function KitchenLoading() {
  return (
    <KitchenSkeleton
      style={{
        padding:
          'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      }}
    />
  );
}
