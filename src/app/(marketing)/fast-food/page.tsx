import { MonitorCheck, Smartphone, Users } from 'lucide-react';
import { SegmentLandingPage } from '@/components/marketing/SegmentLandingPage';

export default function FastFoodPage() {
  return <SegmentLandingPage segmentKey="fastFood" icons={[MonitorCheck, Smartphone, Users]} />;
}
