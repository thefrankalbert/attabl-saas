interface SettingsPageProps {
  params: Promise<{ site: string }>
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { site } = await params

  return (
    <div>
      <h1 className="text-2xl font-bold">Paramètres</h1>
      <p className="mt-2 text-gray-600">
        Configuration du restaurant {site}
      </p>

      {/* Settings form placeholder */}
      <div className="mt-8 rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-medium">Informations générales</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Nom du restaurant
            </label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder={site}
              disabled
            />
          </div>
        </div>
      </div>
    </div>
  )
}
