import { Megaphone } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createAnnouncementService } from '@/services/announcement.service';
import { sanitizeTypography } from '@/lib/utils/sanitize-typography';

/**
 * Bandeau des annonces du restaurant (Marketing > Annonces), en tete de toutes
 * les pages de la vitrine. Rien quand aucune annonce n'est en cours.
 */
export async function AnnouncementBanner({ tenantId }: { tenantId: string }) {
  const supabase = await createClient();
  const announcements =
    await createAnnouncementService(supabase).listVisibleAnnouncements(tenantId);
  if (announcements.length === 0) return null;
  const t = await getTranslations('tenant');

  return (
    <div
      role="region"
      aria-label={t('announcementsLabel')}
      className="shrink-0 bg-[var(--color-ink)] text-white"
    >
      {announcements.map((a) => (
        <div
          key={a.id}
          className="flex items-start gap-2 border-b border-white/10 px-4 py-2 last:border-b-0"
        >
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          <div className="min-w-0 text-[12.5px] leading-snug">
            <p className="font-semibold">{sanitizeTypography(a.title)}</p>
            {a.description && (
              <p className="line-clamp-2 text-white/75">{sanitizeTypography(a.description)}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
