import { Utensils, MonitorCheck, BookOpen } from 'lucide-react';
import { SegmentLandingPage } from '@/components/marketing/SegmentLandingPage';

export default function RestaurantsPage() {
  return <SegmentLandingPage segmentKey="restaurants" icons={[Utensils, MonitorCheck, BookOpen]} />;
}
