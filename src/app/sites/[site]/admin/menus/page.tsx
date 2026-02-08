interface MenusPageProps {
  params: Promise<{ site: string }>;
}

export default async function MenusPage({ params }: MenusPageProps) {
  const { site } = await params;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Menus</h1>
          <p className="mt-2 text-gray-600">Gestion du menu pour {site}</p>
        </div>
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          Ajouter un article
        </button>
      </div>

      {/* Menu items placeholder */}
      <div className="mt-8 rounded-lg bg-white p-6 shadow">
        <p className="text-center text-gray-500">Aucun article au menu</p>
      </div>
    </div>
  );
}
