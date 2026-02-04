interface AdminDashboardProps {
  params: Promise<{ site: string }>
}

export default async function AdminDashboard({ params }: AdminDashboardProps) {
  const { site } = await params

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-gray-600">
        Bienvenue sur le tableau de bord de {site}
      </p>

      {/* Stats cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-sm font-medium text-gray-500">Commandes du jour</h3>
          <p className="mt-2 text-3xl font-bold">0</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-sm font-medium text-gray-500">Revenus du jour</h3>
          <p className="mt-2 text-3xl font-bold">0 €</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-sm font-medium text-gray-500">Articles au menu</h3>
          <p className="mt-2 text-3xl font-bold">0</p>
        </div>
      </div>
    </div>
  )
}
