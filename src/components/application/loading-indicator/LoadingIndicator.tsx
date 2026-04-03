import * as React from 'react';
import { cn } from '@/lib/utils';

export interface LoadingIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: 'dot-circle' | 'spinner' | 'dots';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function LoadingIndicator({
  type = 'dot-circle',
  size = 'md',
  className,
  ...props
}: LoadingIndicatorProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  const dotSizes = {
    sm: 'w-1 h-1',
    md: 'w-1.5 h-1.5',
    lg: 'w-2.5 h-2.5',
    xl: 'w-3 h-3',
  };

  const baseSize = sizeClasses[size];
  const dotSize = dotSizes[size];

  if (type === 'dot-circle') {
    const dots = Array.from({ length: 8 });

    return (
      <div className={cn('relative inline-block', baseSize, className)} {...props}>
        <style
          dangerouslySetInnerHTML={{
            __html: `
          @keyframes dot-circle-fade {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.15; transform: scale(0.6); }
          }
        `,
          }}
        />
        {dots.map((_, index) => {
          return (
            <div
              key={index}
              className="absolute left-0 top-0 h-full w-full"
              style={{ transform: `rotate(${index * 45}deg)` }}
            >
              <div
                className={cn('mx-auto rounded-full bg-current', dotSize)}
                style={{
                  animation: `dot-circle-fade 1.2s ease-in-out infinite`,
                  animationDelay: `${-(8 - index) * 0.15}s`,
                }}
              />
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback
  return (
    <div
      className={cn(
        'animate-spin rounded-full border-2 border-current border-t-transparent',
        baseSize,
        className,
      )}
      {...props}
    />
  );
}
