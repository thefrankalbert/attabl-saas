'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';

interface SettingsDomainProps {
  currentDomain: string | null;
  tenantSlug: string;
  onSave: (domain: string | null) => Promise<void>;
}

export default function SettingsDomain({ currentDomain, tenantSlug, onSave }: SettingsDomainProps) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const { toast } = useToast();
  const [domain, setDomain] = useState(currentDomain || '');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(!!currentDomain);
  const [saving, setSaving] = useState(false);

  const handleVerify = async () => {
    if (!domain.trim()) return;
    setVerifying(true);
    try {
      const res = await fetch('/api/domain-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const data = await res.json();
      setVerified(data.verified);
      if (!data.verified) {
        toast({ title: t('domainPending'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('domainPending'), variant: 'destructive' });
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(domain.trim() || null);
      toast({ title: t('domainSaved') });
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await onSave(null);
      setDomain('');
      setVerified(false);
      toast({ title: t('domainRemoved') });
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <TabsContent value="domain" className="mt-0">
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setVerified(false);
            }}
            placeholder={t('customDomainPlaceholder')}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleVerify}
            disabled={verifying || !domain.trim()}
          >
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : t('verifyDomain')}
          </Button>
        </div>

        {domain.trim() && (
          <div className="flex items-center gap-2 text-xs">
            {verified ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-emerald-600">{t('domainVerified')}</span>
              </>
            ) : (
              <>
                <Clock className="w-4 h-4 text-amber-500" />
                <span className="text-amber-600">{t('domainPending')}</span>
              </>
            )}
          </div>
        )}

        <div className="rounded-lg border border-app-border p-3 text-xs text-app-text-secondary">
          <p className="font-medium text-app-text mb-1">{t('dnsConfig')}</p>
          <p>{t('domainInstructions')}</p>
          <code className="block mt-2 bg-app-elevated p-2 rounded text-xs font-mono">
            CNAME &rarr; cname.vercel-dns.com
          </code>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="default"
            onClick={handleSave}
            disabled={saving || !domain.trim()}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('save')}
          </Button>
          {currentDomain && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleRemove}
              disabled={saving}
              className="text-red-600"
            >
              {t('remove')}
            </Button>
          )}
        </div>

        <p className="text-xs text-app-text-muted">
          {t('currentUrl')}{' '}
          <code className="bg-app-elevated px-1 rounded">{tenantSlug}.attabl.com</code>
        </p>
      </div>
    </TabsContent>
  );
}
