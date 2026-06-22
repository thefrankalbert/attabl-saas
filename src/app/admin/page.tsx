import { redirect } from 'next/navigation';

/**
 * Super-admin platform root. There is no dashboard at /admin itself; the platform
 * entry point is /admin/tenants. Without this page, /admin returned a 404 (only the
 * /admin/tenants subroute existed). Redirect to the real entry point; /admin/tenants
 * enforces the super-admin auth check, so no auth is duplicated here.
 */
export default function AdminRootPage() {
  redirect('/admin/tenants');
}
