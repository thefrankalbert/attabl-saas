'use client';

import { useTranslations } from 'next-intl';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface POSNoteDialogProps {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

/** Kitchen note for one cart line (accessible dialog: title, Escape, focus). */
export function POSNoteDialog({ open, value, onChange, onCancel, onSave }: POSNoteDialogProps) {
  const tc = useTranslations('common');
  const seg = useSegmentTerms();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{seg.productionNoteTitle}</DialogTitle>
        </DialogHeader>
        <Textarea
          autoFocus
          aria-label={seg.productionNoteTitle}
          className="w-full h-32 p-3 border border-app-border rounded-lg bg-app-elevated text-base sm:text-sm text-app-text placeholder:text-app-text-muted outline-none focus:border-accent/40 resize-none"
          placeholder={seg.productionNotePlaceholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" className="rounded-xl min-h-[44px]" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button variant="default" className="rounded-xl min-h-[44px]" onClick={onSave}>
            {tc('save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
