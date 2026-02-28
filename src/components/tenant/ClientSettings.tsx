'use client';

import { useLocale } from 'next-intl';
import { Globe, Info, MessageCircle, ChevronRight, FileText } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';

export default function ClientSettings() {
  const locale = useLocale();
  const { tenant } = useTenant();

  const setLocale = (newLocale: string) => {
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      {/* Language Section */}
      <section className="bg-white rounded-xl shadow-sm border border-neutral-100 overflow-hidden">
        <div className="p-4 border-b border-neutral-50 flex items-center gap-3">
          <Globe className="text-neutral-400" size={20} />
          <h2 className="font-semibold text-neutral-900">Langue / Language</h2>
        </div>

        <div className="p-4 space-y-4">
          <button
            onClick={() => setLocale('fr-FR')}
            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-neutral-50 bg-white"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🇫🇷</span>
              <span
                className={`font-medium ${locale.startsWith('fr') ? 'text-neutral-900' : 'text-neutral-500'}`}
              >
                Français
              </span>
            </div>
            {locale.startsWith('fr') && <div className="w-2 h-2 rounded-full bg-green-500"></div>}
          </button>

          <button
            onClick={() => setLocale('en-US')}
            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-neutral-50 bg-white"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🇬🇧</span>
              <span
                className={`font-medium ${locale.startsWith('en') ? 'text-neutral-900' : 'text-neutral-500'}`}
              >
                English
              </span>
            </div>
            {locale.startsWith('en') && <div className="w-2 h-2 rounded-full bg-green-500"></div>}
          </button>
        </div>
      </section>

      {/* About Section */}
      <section className="bg-white rounded-xl shadow-sm border border-neutral-100 overflow-hidden">
        <div className="p-4 border-b border-neutral-50 flex items-center gap-3">
          <Info className="text-neutral-400" size={20} />
          <h2 className="font-semibold text-neutral-900">
            {locale.startsWith('fr') ? 'À propos' : 'About'}
          </h2>
        </div>

        <div className="divide-y divide-neutral-50">
          {tenant && (
            <div className="p-4 flex items-center justify-between">
              <span className="text-neutral-600 text-sm">Restaurant</span>
              <span className="font-medium text-neutral-900">{tenant.name}</span>
            </div>
          )}

          <a
            href="#"
            className="flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-center gap-3 text-neutral-600">
              <FileText size={18} />
              <span className="text-sm">Mentions Légales</span>
            </div>
            <ChevronRight size={16} className="text-neutral-400" />
          </a>

          <a
            href="#"
            className="flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-center gap-3 text-neutral-600">
              <FileText size={18} />
              <span className="text-sm">Politique de Confidentialité</span>
            </div>
            <ChevronRight size={16} className="text-neutral-400" />
          </a>
        </div>
      </section>

      {/* Support Section */}
      <section className="bg-white rounded-xl shadow-sm border border-neutral-100 overflow-hidden">
        <div className="p-4 flex items-center gap-3">
          <MessageCircle className="text-blue-500" size={20} />
          <div>
            <h2 className="font-semibold text-neutral-900">Besoin d&apos;aide ?</h2>
            <p className="text-xs text-neutral-500">Contactez le personnel au restaurant</p>
          </div>
        </div>
      </section>

      <div className="text-center text-xs text-neutral-300 mt-8 pb-8">
        Powered by Attabl SaaS v0.1.0
      </div>
    </div>
  );
}
