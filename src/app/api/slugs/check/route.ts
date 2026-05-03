import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createSlugService } from '@/services/slug.service';
import { slugCheckLimiter, getClientIp } from '@/lib/rate-limit';

const slugQuerySchema = z.object({
  slug: z
    .string()
    .min(3, 'Slug minimum 3 characters')
    .max(63, 'Slug maximum 63 characters')
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

export async function GET(request: Request): Promise<NextResponse> {
  const ip = getClientIp(request);
  const { success } = await slugCheckLimiter.check(ip);
  if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const result = slugQuerySchema.safeParse({ slug: searchParams.get('slug') });
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues }, { status: 400 });
  }

  const supabase = await createClient();
  const slugService = createSlugService(supabase);
  const available = await slugService.checkSlugAvailable(result.data.slug);

  return NextResponse.json({ available, slug: result.data.slug });
}
