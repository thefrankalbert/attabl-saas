'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Save, Table2, Layers, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { actionSaveQrDesign, actionAssignQrDesign } from '@/app/actions/qr-design';
import type { Table, Zone } from '@/types/admin.types';
import type { QRDesignConfig } from '@/types/qr-design.types';
import { qrDesignConfigSchema } from '@/lib/validations/qr-design.schema';

export interface QRDesignSummary {
  id: string;
  name: string;
  is_default: boolean;
  config: QRDesignConfig;
}

interface QRAssignmentPanelProps {
  zones: Zone[];
  tables: Table[];
  designs: QRDesignSummary[];
  currentConfig: QRDesignConfig;
  /** Id of the design currently loaded in the editor (null = new/unsaved). */
  currentDesignId: string | null;
  onDesignIdChange: (id: string | null) => void;
  /** Load a saved design's config into the live editor. */
  onLoadDesign: (config: QRDesignConfig) => void;
}

const INHERIT = '__inherit__';

export function QRAssignmentPanel({
  zones,
  tables,
  designs,
  currentConfig,
  currentDesignId,
  onDesignIdChange,
  onLoadDesign,
}: QRAssignmentPanelProps) {
  const t = useTranslations('qrCodes');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [saveOpen, setSaveOpen] = useState(false);
  const [designName, setDesignName] = useState('');
  const [makeDefault, setMakeDefault] = useState(designs.length === 0);

  const hasDefault = designs.some((d) => d.is_default);

  const tablesByZone = useMemo(() => {
    const grouped: Record<string, { zone: Zone; tables: Table[] }> = {};
    for (const zone of zones) grouped[zone.id] = { zone, tables: [] };
    for (const table of tables) grouped[table.zone_id]?.tables.push(table);
    return Object.values(grouped).filter((g) => g.tables.length > 0);
  }, [zones, tables]);

  function resolveDesignName(id: string | null | undefined): string | null {
    if (!id) return null;
    return designs.find((d) => d.id === id)?.name ?? null;
  }

  function loadDesign(design: QRDesignSummary) {
    const parsed = qrDesignConfigSchema.safeParse(design.config);
    if (!parsed.success) {
      toast.error(t('designLoadError'));
      return;
    }
    onLoadDesign(parsed.data);
    onDesignIdChange(design.id);
    toast.success(t('designLoaded', { name: design.name }));
  }

  function saveCurrentDesign() {
    const name = designName.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await actionSaveQrDesign({
        // Pass the loaded id so re-saving updates in place instead of duplicating.
        id: currentDesignId ?? undefined,
        name,
        config: currentConfig,
        isDefault: makeDefault,
      });
      if (res.success) {
        toast.success(t('designSaved', { name }));
        if (res.data?.id) onDesignIdChange(res.data.id);
        setSaveOpen(false);
        setDesignName('');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function assign(target: 'zone' | 'table', targetId: string, value: string) {
    const designId = value === INHERIT ? null : value;
    startTransition(async () => {
      const res = await actionAssignQrDesign({ target, targetId, designId });
      if (res.success) {
        toast.success(t('assignmentSaved'));
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Saved designs + save-current */}
      <div className="bg-app-card rounded-xl border border-app-border p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-app-text-secondary flex items-center gap-2">
            <Layers className="w-4 h-4 text-app-text-muted" />
            {t('savedDesigns')}
          </h3>
          <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Save className="w-4 h-4" />
                {t('saveCurrentDesign')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('saveCurrentDesign')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="qr-design-name" className="mb-1.5 block">
                    {t('designName')}
                  </Label>
                  <Input
                    id="qr-design-name"
                    value={designName}
                    onChange={(e) => setDesignName(e.target.value)}
                    placeholder={t('designNamePlaceholder')}
                    maxLength={80}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="qr-design-default" className="cursor-pointer">
                    {t('setAsDefault')}
                  </Label>
                  <Switch
                    id="qr-design-default"
                    checked={makeDefault}
                    onCheckedChange={setMakeDefault}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={saveCurrentDesign}
                  disabled={isPending || designName.trim().length === 0}
                >
                  {t('save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {designs.length === 0 ? (
          <p className="text-sm text-app-text-muted">{t('noSavedDesigns')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {designs.map((d) => (
              <li key={d.id}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => loadDesign(d)}
                  aria-pressed={currentDesignId === d.id}
                  className={cn(
                    'h-auto gap-1.5 px-3 py-1.5 text-sm font-normal',
                    currentDesignId === d.id && 'ring-2 ring-primary',
                  )}
                >
                  {d.name}
                  {d.is_default && (
                    <Badge variant="secondary" className="gap-1">
                      <Star className="w-3 h-3" />
                      {t('default')}
                    </Badge>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Per zone / per table assignment */}
      <div className="bg-app-card rounded-xl border border-app-border p-5">
        <h3 className="text-sm font-semibold text-app-text-secondary flex items-center gap-2 mb-1">
          <Table2 className="w-4 h-4 text-app-text-muted" />
          {t('assignByZoneTable')}
        </h3>
        <p className="text-xs text-app-text-muted mb-4">{t('assignHint')}</p>

        {tablesByZone.length === 0 ? (
          <p className="text-sm text-app-text-muted">{t('noZonesTables')}</p>
        ) : (
          <div className="space-y-5">
            {tablesByZone.map(({ zone, tables: zoneTables }) => {
              const zoneDesign = resolveDesignName(zone.qr_design_id);
              return (
                <div key={zone.id} className="rounded-lg border border-app-border overflow-hidden">
                  {/* Zone header row */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-app-bg px-4 py-3">
                    <span className="text-sm font-semibold text-app-text flex-1">{zone.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-app-text-muted">{t('zoneDesign')}</span>
                      <Select
                        value={zone.qr_design_id ?? INHERIT}
                        onValueChange={(v) => assign('zone', zone.id, v)}
                        disabled={isPending || designs.length === 0}
                      >
                        <SelectTrigger className="w-44 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT}>{t('useDefault')}</SelectItem>
                          {designs.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Table rows */}
                  <ul className="divide-y divide-app-border">
                    {zoneTables.map((table) => {
                      const specific = resolveDesignName(table.qr_design_id);
                      const resolvedLabel = specific
                        ? t('badgeSpecific')
                        : zoneDesign
                          ? t('badgeInheritZone')
                          : hasDefault
                            ? t('badgeDefault')
                            : t('badgeNone');
                      return (
                        <li
                          key={table.id}
                          className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-2.5"
                        >
                          <span className="text-sm text-app-text-secondary flex-1">
                            {table.display_name}
                          </span>
                          <Badge variant="outline" className="w-fit">
                            {resolvedLabel}
                          </Badge>
                          <Select
                            value={table.qr_design_id ?? INHERIT}
                            onValueChange={(v) => assign('table', table.id, v)}
                            disabled={isPending || designs.length === 0}
                          >
                            <SelectTrigger className="w-44 h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={INHERIT}>{t('inheritZone')}</SelectItem>
                              {designs.map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                  {d.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
