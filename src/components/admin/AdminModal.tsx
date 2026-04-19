'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'max-w-[calc(100vw-2rem)] sm:max-w-md md:max-w-md',
  md: 'max-w-[calc(100vw-2rem)] sm:max-w-lg md:max-w-lg',
  lg: 'max-w-[calc(100vw-2rem)] sm:max-w-2xl md:max-w-2xl lg:max-w-4xl',
};

export default function AdminModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
}: AdminModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          'p-0 flex flex-col gap-0 max-h-[85dvh] sm:max-h-[calc(100dvh-4rem)]',
          sizeClasses[size],
        )}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-app-border shrink-0">
          <DialogTitle className="text-lg font-bold tracking-tight text-app-text">
            {title}
          </DialogTitle>
          <DialogDescription className={description ? 'text-sm text-app-text-muted' : 'sr-only'}>
            {description ?? title}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
