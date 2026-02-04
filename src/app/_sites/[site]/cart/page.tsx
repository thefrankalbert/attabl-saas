interface CartPageProps {
  params: Promise<{ site: string }>
}

export default async function CartPage({ params }: CartPageProps) {
  const { site } = await params

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">Votre panier</h1>
      <p className="mt-2 text-gray-600">Restaurant: {site}</p>
      {/* Cart items will be displayed here */}
    </div>
  )
}
