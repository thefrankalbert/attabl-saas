'use client';

import { useState } from 'react';
import { XCircle, RotateCcw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
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
      toast({ title: 'Erreur de mise à jour', variant: 'destructive' });
      return;
    }

    toast({
      title: newStatus ? `${itemName} remis en service` : `${itemName} marqué indisponible`,
    });

    onRupture?.();
  };

  if (loading) {
    return (
      <span className="w-5 h-5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
    );
  }

  // Item currently available → show "Rupture" button
  if (isAvailable) {
    return (
      <button
        onClick={handleToggle}
        title={confirming ? 'Confirmer rupture' : 'Marquer en rupture'}
        className={cn(
          'p-1 rounded transition-all shrink-0',
          confirming
            ? 'bg-red-500/30 text-red-300 animate-pulse'
            : 'text-red-400/60 hover:text-red-400 hover:bg-red-500/10',
        )}
      >
        <XCircle className="w-4 h-4" />
      </button>
    );
  }

  // Item currently unavailable → show "Remettre en service" button
  return (
    <button
      onClick={handleToggle}
      title={confirming ? 'Confirmer remise en service' : 'Remettre en service'}
      className={cn(
        'p-1 rounded transition-all shrink-0',
        confirming
          ? 'bg-green-500/30 text-green-300 animate-pulse'
          : 'text-green-400/60 hover:text-green-400 hover:bg-green-500/10',
      )}
    >
      <RotateCcw className="w-4 h-4" />
    </button>
  );
}
