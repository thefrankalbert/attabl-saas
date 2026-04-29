'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Download, FileText, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { createSupportsService } from '@/services/supports.service';
import { useToast } from '@/components/ui/use-toast';
import { ChevaletControls } from './ChevaletControls';
import { ChevaletPreview } from './ChevaletPreview';
import type { ChevaletConfig, TenantForEditor, UnitSystem } from '@/types/supports.types';

// 1cm = 118.11px at 300 DPI - default positions in cm
function buildDefaultConfig(tenant: TenantForEditor): ChevaletConfig {
  return {
    unit: 'cm',
    background: tenant.primaryColor,
    accentColor: tenant.secondaryColor,
    logo: { visible: !!tenant.logoUrl, x: 1, y: 0.8, width: 2.5 },
    name: { visible: true, x: 1, y: 4.2, fontSize: 18, text: tenant.name },
    tagline: {
      visible: !!tenant.description,
      x: 1,
      y: 5.8,
      fontSize: 10,
      text: tenant.description ?? '',
    },
    qrCode: { x: 14.5, y: 0.8, width: 6, style: 'classic', menuUrl: tenant.menuUrl },
    verso: 'none',
  };
}

interface ChevaletEditorProps {
  tenant: TenantForEditor;
  savedConfig: ChevaletConfig | null;
}

export function ChevaletEditor({ tenant, savedConfig }: ChevaletEditorProps) {
  const t = useTranslations('sidebar.supports');
  const { toast } = useToast();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const [config, setConfig] = useState<ChevaletConfig>(
    savedConfig ?? buildDefaultConfig(tenant),
  );
  const [unit, setUnit] = useState<UnitSystem>(savedConfig?.unit ?? 'cm');

  const supabase = createClient();
  const service = createSupportsService(supabase);

  const persistConfig = useCallback(
    async (cfg: ChevaletConfig) => {
      setSaveStatus('saving');
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: adminUser } = await supabase
          .from('admin_users')
          .select('tenant_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!adminUser) return;
        await service.saveConfig(adminUser.tenant_id, cfg);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      }
    },
    [supabase, service],
  );

  // Debounced autosave - 2 seconds after last change
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistConfig(config);
    }, 2000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [config, persistConfig]);

  const handleChange = (patch: Partial<ChevaletConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  const handleUnitChange = (u: UnitSystem) => {
    setUnit(u);
    setConfig((prev) => ({ ...prev, unit: u }));
  };

  const handleExportPdf = async () => {
    await persistConfig(config);
    try {
      const res = await fetch('/api/supports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          format: 'pdf',
          menuUrl: tenant.menuUrl,
          tenantSlug: tenant.slug,
        }),
      });
      if (!res.ok) {
        toast({ title: 'Erreur export PDF', variant: 'destructive' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chevalet-${tenant.slug}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Erreur export PDF', variant: 'destructive' });
    }
  };

  const handleExportPng = async () => {
    const el = previewRef.current;
    if (!el) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el, { scale: 4, useCORS: true, backgroundColor: null });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `chevalet-${tenant.slug}.png`;
      a.click();
    } catch {
      toast({ title: 'Erreur export PNG', variant: 'destructive' });
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Panneau gauche - controles */}
      <div className="w-80 shrink-0 border-r border-app-border h-full overflow-hidden flex flex-col">
        <ChevaletControls
          config={config}
          unit={unit}
          onUnitChange={handleUnitChange}
          onChange={handleChange}
        />
      </div>

      {/* Zone droite - preview + export */}
      <div className="flex-1 flex flex-col items-center justify-start gap-6 p-6 overflow-y-auto">
        {/* Statut sauvegarde */}
        <div className="w-full flex justify-end">
          {saveStatus !== 'idle' && (
            <span className="flex items-center gap-1.5 text-xs text-app-text-muted">
              <Save className="w-3 h-3" />
              {saveStatus === 'saving' ? t('saving') : t('saved')}
            </span>
          )}
        </div>

        {/* Preview */}
        <ChevaletPreview
          config={config}
          logoUrl={tenant.logoUrl}
          previewRef={previewRef}
        />

        {/* Boutons export */}
        <div className="flex gap-3">
          <Button
            type="button"
            onClick={() => void handleExportPdf()}
            className="flex items-center gap-2 h-10 px-5 text-sm font-semibold"
          >
            <FileText className="w-4 h-4" />
            {t('exportPdf')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleExportPng()}
            className="flex items-center gap-2 h-10 px-5 text-sm font-semibold"
          >
            <Download className="w-4 h-4" />
            {t('exportPng')}
          </Button>
        </div>
      </div>
    </div>
  );
}
