import { createClient } from '@/lib/supabase/server';

export default async function TestDBPage() {
  const supabase = await createClient();

  // Tester la lecture des tenants
  const { data: tenants, error } = await supabase.from('tenants').select('*').limit(5);

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Erreur de connexion</h1>
        <pre className="bg-red-50 p-4 rounded">{JSON.stringify(error, null, 2)}</pre>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">✅ Connexion Supabase réussie !</h1>
      <p className="text-gray-600 mb-4">{tenants?.length || 0} tenant(s) trouvé(s)</p>
      <pre className="bg-gray-100 p-4 rounded">{JSON.stringify(tenants, null, 2)}</pre>
    </div>
  );
}
