'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ACTIONS, ENTITY_TYPES } from './types';

interface AuditLogFiltersProps {
  filterAction: string;
  filterEntity: string;
  searchEmail: string;
  setFilterAction: Dispatch<SetStateAction<string>>;
  setFilterEntity: Dispatch<SetStateAction<string>>;
  setSearchEmail: Dispatch<SetStateAction<string>>;
  setPage: Dispatch<SetStateAction<number>>;
  onReset: () => void;
}

export default function AuditLogFilters({
  filterAction,
  filterEntity,
  searchEmail,
  setFilterAction,
  setFilterEntity,
  setSearchEmail,
  setPage,
  onReset,
}: AuditLogFiltersProps) {
  const t = useTranslations('auditLog');
  const tc = useTranslations('common');

  const entityLabel = (type: string) => {
    const key = `entity_${type}` as Parameters<typeof t>[0];
    try {
      return t(key);
    } catch {
      return type;
    }
  };

  return (
    <div className="bg-app-card rounded-xl border border-app-border/60 p-4 space-y-3 animate-in fade-in slide-in-from-top-1">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-semibold text-app-text mb-1 block">
            {t('filterAction')}
          </Label>
          <Select
            value={filterAction || '__all__'}
            onValueChange={(val) => {
              setFilterAction(val === '__all__' ? '' : val);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{tc('all')}</SelectItem>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {t(
                    `action${a.charAt(0).toUpperCase()}${a.slice(1)}` as
                      | 'actionCreate'
                      | 'actionUpdate'
                      | 'actionDelete',
                  ) || a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-app-text mb-1 block">
            {t('filterEntity')}
          </Label>
          <Select
            value={filterEntity || '__all__'}
            onValueChange={(val) => {
              setFilterEntity(val === '__all__' ? '' : val);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{tc('all')}</SelectItem>
              {ENTITY_TYPES.map((e) => (
                <SelectItem key={e} value={e}>
                  {entityLabel(e)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-app-text mb-1 block">
            {t('filterUser')}
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-app-text-muted" />
            <Input
              value={searchEmail}
              onChange={(e) => {
                setSearchEmail(e.target.value);
                setPage(0);
              }}
              placeholder={t('searchPlaceholder')}
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>
      </div>
      {(filterAction || filterEntity || searchEmail) && (
        <Button variant="ghost" size="sm" onClick={onReset} className="text-xs">
          {t('clearFilters')}
        </Button>
      )}
    </div>
  );
}
