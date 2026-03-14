import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { redirect } from 'next/navigation';
import { TablesClient } from '@/components/admin/settings/TablesClient';

export const dynamic = 'force-dynamic';

export default async function TablesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const supabase = await createClient();

  // ─── Auth check ──────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Resolve tenant from URL slug
  const tenant = await getTenant(site);

  if (!tenant) {
    redirect('/login');
  }

  // Verify user belongs to this tenant
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant.id)
    .single();

  if (!adminUser) {
    redirect('/login');
  }

  const tenantId = tenant.id;

  // ─── Fetch or create venue ───────────────────────────
  let { data: venues } = await supabase.from('venues').select('*').eq('tenant_id', tenantId);

  if (!venues || venues.length === 0) {
    const { data: newVenue, error: venueErr } = await supabase
      .from('venues')
      .insert([
        {
          tenant_id: tenantId,
          name: 'Principal',
          is_default: true,
        },
      ])
      .select()
      .single();

    if (venueErr || !newVenue) {
      // Fallback: render empty state
      return (
        <TablesClient
          venueId=""
          initialZones={[]}
          initialTables={[]}
          initialSelectedZoneId={null}
        />
      );
    }

    venues = [newVenue];
  }

  const venue = venues[0];
  const venueId = venue.id as string;

  // ─── Fetch zones ─────────────────────────────────────
  const { data: zonesData } = await supabase
    .from('zones')
    .select('*')
    .eq('venue_id', venueId)
    .order('display_order');

  const zones = zonesData || [];

  // ─── Fetch tables for first zone ─────────────────────
  let initialTables: {
    id: string;
    zone_id: string;
    table_number: string;
    display_name: string;
    capacity: number;
    is_active: boolean;
  }[] = [];
  let selectedZoneId: string | null = null;

  if (zones.length > 0) {
    selectedZoneId = zones[0].id;
    const { data: tablesData } = await supabase
      .from('tables')
      .select('*')
      .eq('zone_id', zones[0].id)
      .order('table_number');

    initialTables = (tablesData || []) as typeof initialTables;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <TablesClient
        venueId={venueId}
        initialZones={zones}
        initialTables={initialTables}
        initialSelectedZoneId={selectedZoneId}
      />
    </div>
  );
}
