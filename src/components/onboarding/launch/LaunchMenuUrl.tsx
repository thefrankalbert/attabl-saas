'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Copy, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LaunchMenuUrlProps {
  menuUrl: string;
  accentColor: string;
}

export function LaunchMenuUrl({ menuUrl, accentColor }: LaunchMenuUrlProps) {
  const t = useTranslations('onboarding');
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(menuUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-app-border bg-app-elevated p-4 shadow-sm">
      <p className="mb-2 block text-xs font-medium text-app-text-secondary">{t('menuLinkLabel')}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 break-all rounded-lg border border-app-border bg-app-elevated px-3.5 py-2.5 font-mono text-xs text-app-text shadow-sm">
          {menuUrl}
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('copyUrl')}
          onClick={handleCopyUrl}
          className="h-10 w-10 rounded-lg border-app-border bg-app-elevated shadow-sm transition-colors hover:bg-app-hover"
          title={t('copyUrl')}
        >
          {copied ? (
            <CheckCheck className="h-4 w-4 text-accent" />
          ) : (
            <Copy className="h-4 w-4 text-app-text-secondary" />
          )}
        </Button>
        <a
          href={menuUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-app-border bg-app-elevated shadow-sm transition-colors hover:bg-app-hover"
        >
          <ExternalLink className="h-4 w-4 text-app-text-secondary" />
        </a>
      </div>
      {copied && (
        <p className="mt-2 text-xs font-medium" style={{ color: accentColor }}>
          {t('urlCopied')}
        </p>
      )}
    </div>
  );
}
