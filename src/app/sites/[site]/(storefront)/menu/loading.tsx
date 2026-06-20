import { LoadingIndicator } from '@/components/application/loading-indicator/LoadingIndicator';

export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center bg-white">
      <LoadingIndicator type="dot-circle" size="lg" style={{ color: '#B0B0B0' }} />
    </div>
  );
}
