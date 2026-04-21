import { Hotel, Building2, Globe } from 'lucide-react';
import { SegmentLandingPage } from '@/components/marketing/SegmentLandingPage';

export default function HotelsPage() {
  return <SegmentLandingPage segmentKey="hotels" icons={[Hotel, Building2, Globe]} />;
}
