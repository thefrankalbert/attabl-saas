import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const loadEnv = () => {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    const envFile = fs.readFileSync(envPath, 'utf8');
    const envVars: Record<string, string> = {};

    envFile.split('\n').forEach((line) => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        envVars[key] = value;
      }
    });
    return envVars;
  } catch (e) {
    console.error('Error loading .env.local:', e);
    return {};
  }
};

const env = { ...loadEnv(), ...process.env };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const email = env.SUPERADMIN_EMAIL;
const password = env.SUPERADMIN_PASSWORD;
const restaurantName = env.SUPERADMIN_RESTAURANT_NAME ?? 'La Grande Table';
const slug = env.SUPERADMIN_TENANT_SLUG ?? 'la-grande-table';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

if (!email || !password) {
  console.error(
    'Missing SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD in .env.local (required, never hardcode credentials)',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function createSuperAdmin() {
  console.log('Creating Super Admin access...');

  let userId: string | null = null;

  const {
    data: { users },
  } = await supabase.auth.admin.listUsers();
  const existingUser = users?.find((u) => u.email === email);

  if (existingUser) {
    console.log('User already exists, resetting password...');
    userId = existingUser.id;
    await supabase.auth.admin.updateUserById(userId, { password });
  } else {
    console.log('Creating new user...');
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      console.error('Error creating user:', createError);
      return;
    }
    userId = newUser.user.id;
  }

  if (!userId) throw new Error('Failed to get User ID');

  console.log(`Ensuring tenant ${slug}...`);
  const { data: existingTenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  let tenantId = existingTenant?.id;

  if (!tenantId) {
    const { data: newTenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        slug,
        name: restaurantName,
        subscription_plan: 'premium',
        subscription_status: 'active',
        is_active: true,
      })
      .select()
      .single();

    if (tenantError) {
      console.error('Error creating tenant:', tenantError);
      return;
    }
    tenantId = newTenant.id;
  }

  console.log('Linking admin role...');
  const { data: existingLink } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .single();

  if (!existingLink) {
    const { error: linkError } = await supabase.from('admin_users').insert({
      user_id: userId,
      tenant_id: tenantId,
      email,
      full_name: 'Super Admin',
      role: 'superadmin',
      is_active: true,
    });

    if (linkError) {
      console.error('Error linking admin:', linkError);
      return;
    }
  }

  const { data: existingVenue } = await supabase
    .from('venues')
    .select('id')
    .eq('tenant_id', tenantId)
    .single();

  if (!existingVenue) {
    await supabase.from('venues').insert({
      tenant_id: tenantId,
      slug: 'main',
      name: 'Salle Principale',
      type: 'restaurant',
      is_active: true,
    });
  }

  console.log('\nSuper admin ready');
  console.log('-----------------------------------');
  console.log(
    `URL:      https://${slug}.attabl.com/admin (or http://${slug}.localhost:3000/admin)`,
  );
  console.log(`Email:    ${email}`);
  console.log('Password: (from SUPERADMIN_PASSWORD in .env.local)');
  console.log('-----------------------------------');
}

createSuperAdmin();
