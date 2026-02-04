import { headers } from 'next/headers';

export default async function SitePage() {
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug');

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-4">
        Restaurant: {tenantSlug}
      </h1>
      <p className="text-gray-600">
        Menu client en construction...
      </p>
    </div>
  );
}
