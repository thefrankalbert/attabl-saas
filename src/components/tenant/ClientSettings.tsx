'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { Globe, Info, MessageCircle, ChevronRight, FileText } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useTenant } from '@/contexts/TenantContext';

export default function ClientSettings() {
  const { language, setLanguage, t } = useLanguage();
  const { tenant } = useTenant();

  return (
    <div className="space-y-6">
      {/* Language Section */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center gap-3">
          <Globe className="text-gray-400" size={20} />
          <h2 className="font-semibold text-gray-900">Langue / Language</h2>
        </div>

        <div className="p-4 space-y-4">
          <button
            onClick={() => setLanguage('fr')}
            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 bg-white"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🇫🇷</span>
              <span
                className={`font-medium ${language === 'fr' ? 'text-gray-900' : 'text-gray-500'}`}
              >
                Français
              </span>
            </div>
            {language === 'fr' && <div className="w-2 h-2 rounded-full bg-green-500"></div>}
          </button>

          <button
            onClick={() => setLanguage('en')}
            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 bg-white"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🇬🇧</span>
              <span
                className={`font-medium ${language === 'en' ? 'text-gray-900' : 'text-gray-500'}`}
              >
                English
              </span>
            </div>
            {language === 'en' && <div className="w-2 h-2 rounded-full bg-green-500"></div>}
          </button>
        </div>
      </section>

      {/* About Section */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center gap-3">
          <Info className="text-gray-400" size={20} />
          <h2 className="font-semibold text-gray-900">
            {language === 'fr' ? 'À propos' : 'About'}
          </h2>
        </div>

        <div className="divide-y divide-gray-50">
          {tenant && (
            <div className="p-4 flex items-center justify-between">
              <span className="text-gray-600 text-sm">Restaurant</span>
              <span className="font-medium text-gray-900">{tenant.name}</span>
            </div>
          )}

          <a
            href="#"
            className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3 text-gray-600">
              <FileText size={18} />
              <span className="text-sm">Mentions Légales</span>
            </div>
            <ChevronRight size={16} className="text-gray-400" />
          </a>

          <a
            href="#"
            className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3 text-gray-600">
              <FileText size={18} />
              <span className="text-sm">Politique de Confidentialité</span>
            </div>
            <ChevronRight size={16} className="text-gray-400" />
          </a>
        </div>
      </section>

      {/* Support Section */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 flex items-center gap-3">
          <MessageCircle className="text-blue-500" size={20} />
          <div>
            <h2 className="font-semibold text-gray-900">Besoin d&apos;aide ?</h2>
            <p className="text-xs text-gray-500">Contactez le personnel au restaurant</p>
          </div>
        </div>
      </section>

      <div className="text-center text-xs text-gray-300 mt-8 pb-8">
        Powered by Attabl SaaS v0.1.0
      </div>
    </div>
  );
}
