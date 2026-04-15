'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { XCircle, RotateCcw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RuptureButtonProps {
  menuItemId: string;
  itemName: string;
  isAvailable?: boolean;
  onRupture?: () => void;
}

export default function RuptureButton({
  menuItemId,
  itemName,
  isAvailable = true,
  onRupture,
}: RuptureButtonProps) {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();
  const t = useTranslations('inventory');

  const handleToggle = async () => {
    if (!confirming) {
      setConfirming(true);
      // Auto-dismiss confirmation after 3 seconds
      setTimeout(() => setConfirming(false), 3000);
      return;
    }

    setLoading(true);
    setConfirming(false);

    const supabase = createClient();
    const newStatus = !isAvailable;

    const { error } = await supabase
      .from('menu_items')
      .update({ is_available: newStatus })
      .eq('id', menuItemId);

    setLoading(false);

    if (error) {
      toast({ title: t('updateError'), variant: 'destructive' });
      return;
    }

    toast({
      title: newStatus
        ? t('itemBackInStock', { name: itemName })
        : t('itemMarkedUnavailable', { name: itemName }),
    });

    onRupture?.();
  };

  if (loading) {
    return (
      <span className="w-5 h-5 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
    );
  }

  // Item currently available → show "Rupture" button
  if (isAvailable) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggle}
        title={confirming ? t('confirmRupture') : t('markRupture')}
        className={cn(
          'p-2.5 rounded shrink-0 min-h-[48px] min-w-[48px]',
          confirming
            ? 'bg-status-error-bg text-status-error animate-pulse'
            : 'text-status-error/60 hover:text-status-error hover:bg-status-error-bg',
        )}
      >
        <XCircle className="w-4 h-4" />
      </Button>
    );
  }

  // Item currently unavailable → show "Remettre en service" button
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      title={confirming ? t('confirmBackInStock') : t('backInStock')}
      className={cn(
        'p-2.5 rounded shrink-0 min-h-[48px] min-w-[48px]',
        confirming
          ? 'bg-status-success-bg text-status-success animate-pulse'
          : 'text-status-success/60 hover:text-status-success hover:bg-status-success-bg',
      )}
    >
      <RotateCcw className="w-4 h-4" />
    </Button>
  );
}
