import { LoadingIndicator } from '@/components/application/loading-indicator/LoadingIndicator';

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg">
      <LoadingIndicator type="dot-circle" size="lg" className="text-app-text-muted" />
    </div>
  );
}
