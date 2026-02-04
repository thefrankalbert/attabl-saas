interface OrdersPageProps {
  params: Promise<{ site: string }>
}

export default async function OrdersPage({ params }: OrdersPageProps) {
  const { site } = await params

  return (
    <div>
      <h1 className="text-2xl font-bold">Commandes</h1>
      <p className="mt-2 text-gray-600">
        Gestion des commandes pour {site}
      </p>

      {/* Orders table placeholder */}
      <div className="mt-8 rounded-lg bg-white p-6 shadow">
        <p className="text-center text-gray-500">Aucune commande pour le moment</p>
      </div>
    </div>
  )
}
