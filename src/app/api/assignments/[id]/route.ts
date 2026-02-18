import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { assignmentLimiter, getClientIp } from '@/lib/rate-limit';
import { createAssignmentService } from '@/services/assignment.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = getClientIp(request);
    const { success: allowed } = await assignmentLimiter.check(ip);
    if (!allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { id } = await params;
    const service = createAssignmentService(supabase);
    await service.releaseAssignment(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ServiceError)
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    logger.error('Assignment DELETE error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
