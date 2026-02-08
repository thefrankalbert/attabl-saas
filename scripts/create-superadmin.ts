import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual env var loading to avoid dotenv dependency
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

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function createSuperAdmin() {
  console.log('🚀 Creating Super Admin Access...');

  const email = 'superadmin@attabl.com';
  const password = 'AttablPossible2026!';
  const restaurantName = 'La Grande Table';
  const slug = 'la-grande-table';

  // 1. Create or Get User
  console.log(`Checking user ${email}...`);
  // Try to get user first by email (admin.listUsers might be needed but expensive, let's just try create)
  // Actually simpler to delete if exists or just sign in?
  // We will use admin.createUser which will fail if exists, then we catch

  let userId: string | null = null;

  // First, try to find user
  const {
    data: { users },
    error: listError,
  } = await supabase.auth.admin.listUsers();
  const existingUser = users?.find((u) => u.email === email);

  if (existingUser) {
    console.log('User already exists, resetting password...');
    userId = existingUser.id;
    await supabase.auth.admin.updateUserById(userId, { password: password });
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

  // 2. Create Tenant
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

  // 3. Link Admin User
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

  // 4. Create Venue
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

  console.log('\n✅ SUPER ADMIN CREATED SUCCESSFULLY');
  console.log('-----------------------------------');
  console.log(
    `URL:      https://${slug}.attabl.com/admin (or http://${slug}.localhost:3000/admin)`,
  );
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  console.log('-----------------------------------');
}

createSuperAdmin();
