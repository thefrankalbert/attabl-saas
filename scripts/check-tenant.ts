
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const loadEnv = () => {
    try {
        const envPath = path.join(process.cwd(), '.env.local');
        const envFile = fs.readFileSync(envPath, 'utf8');
        const envVars: Record<string, string> = {};
        envFile.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
            }
        });
        return envVars;
    } catch { return {}; }
};

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkTenant() {
    const { data: tenant, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', 'la-grande-table')
        .single();

    if (error) console.error('Error fetching tenant:', error);
    else console.log('Tenant found:', tenant);
}

checkTenant();
