import { QrCode, Coffee, Clock } from 'lucide-react';
import { SegmentLandingPage } from '@/components/marketing/SegmentLandingPage';

export default function BarsCafesPage() {
  return <SegmentLandingPage segmentKey="barsCafes" icons={[QrCode, Coffee, Clock]} />;
}
