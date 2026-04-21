import { Zap, MonitorCheck, Ticket } from 'lucide-react';
import { SegmentLandingPage } from '@/components/marketing/SegmentLandingPage';

export default function QuickServicePage() {
  return <SegmentLandingPage segmentKey="quickService" icons={[Zap, MonitorCheck, Ticket]} />;
}
