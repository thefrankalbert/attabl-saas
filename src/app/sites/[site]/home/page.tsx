import { redirect } from 'next/navigation';

export default async function HomePage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  redirect(`/sites/${site}`);
}
