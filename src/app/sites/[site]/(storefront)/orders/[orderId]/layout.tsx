import type { Metadata } from 'next';
import { storefrontPageMetadata } from '@/lib/storefront-page-metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ site: string }>;
}): Promise<Metadata> {
  const { site } = await params;
  return storefrontPageMetadata(site, 'trackingTitle');
}

export default function PageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
