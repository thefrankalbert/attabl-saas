import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        {/* Elegant spinner avec animation */}
        <div className="relative w-16 h-16 mx-auto mb-4">
          <Loader2 className="w-16 h-16 text-amber-600 animate-spin" />
        </div>

        {/* Texte de chargement */}
        <p className="text-gray-500 text-sm animate-pulse">Chargement...</p>
      </div>
    </div>
  );
}
