import Link from 'next/link'

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ site: string }>
}) {
  const { site } = await params

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white">
        <div className="p-4">
          <h2 className="text-xl font-bold capitalize">{site}</h2>
          <p className="text-sm text-gray-400">Dashboard Admin</p>
        </div>
        <nav className="mt-4">
          <Link
            href={`/_sites/${site}/admin`}
            className="block px-4 py-2 hover:bg-gray-800"
          >
            Dashboard
          </Link>
          <Link
            href={`/_sites/${site}/admin/orders`}
            className="block px-4 py-2 hover:bg-gray-800"
          >
            Commandes
          </Link>
          <Link
            href={`/_sites/${site}/admin/menus`}
            className="block px-4 py-2 hover:bg-gray-800"
          >
            Menus
          </Link>
          <Link
            href={`/_sites/${site}/admin/settings`}
            className="block px-4 py-2 hover:bg-gray-800"
          >
            Paramètres
          </Link>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-gray-100 p-8">
        {children}
      </main>
    </div>
  )
}
