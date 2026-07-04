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
    <div className="mb-6 p-4 rounded-xl bg-app-elevated border border-app-border">
      <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted mb-3">
        {t('menuLinkLabel')}
      </p>
      <div className="flex items-center gap-2">
        <div className="flex-1 px-4 py-2.5 bg-app-bg rounded-xl border border-app-border font-mono text-xs text-app-text break-all">
          {menuUrl}
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('copyUrl')}
          onClick={handleCopyUrl}
          className="p-2.5 bg-app-bg rounded-xl border border-app-border hover:border-accent/40 transition-colors h-10 w-10"
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
          className="p-2.5 bg-app-bg rounded-xl border border-app-border hover:border-accent/40 transition-colors"
        >
          <ExternalLink className="h-4 w-4 text-app-text-secondary" />
        </a>
      </div>
      {copied && (
        <p className="text-xs mt-2 font-medium" style={{ color: accentColor }}>
          {t('urlCopied')}
        </p>
      )}
    </div>
  );
}
