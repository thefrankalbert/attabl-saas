import { notFound } from 'next/navigation';
import { PreviewClient } from './preview-client';

/**
 * DEV-ONLY live design canvas for the Command Center ("Mes etablissements")
 * redesign. Renders the v2 components with mock data and a scenario toggle, so
 * the layout can be iterated visually without auth or live DB. Returns 404 in
 * production - it is never a real route for users. Lives outside /admin so the
 * middleware auth guard does not redirect it to /login.
 */
export const dynamic = 'force-static';

export default function CommandCenterPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <PreviewClient />;
}
