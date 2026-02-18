import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { assignmentLimiter, getClientIp } from '@/lib/rate-limit';
import { createAssignmentService } from '@/services/assignment.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { claimOrderSchema } from '@/lib/validations/assignment.schema';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = getClientIp(request);
    const { success: allowed } = await assignmentLimiter.check(ip);
    if (!allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const headersList = await headers();
    const tenantSlug = headersList.get('x-tenant-slug');
    if (!tenantSlug) return NextResponse.json({ error: 'Tenant non identifié' }, { status: 400 });

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .single();
    if (!tenant) return NextResponse.json({ error: 'Tenant non trouvé' }, { status: 404 });

    const { id } = await params;
    const body = await request.json();
    const parsed = claimOrderSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Données invalides' }, { status: 400 });

    const service = createAssignmentService(supabase);
    await service.claimOrder(id, parsed.data.server_id, tenant.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ServiceError)
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    logger.error('Claim order error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
