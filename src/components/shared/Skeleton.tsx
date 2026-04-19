import * as React from 'react';

import { cn } from '@/lib/utils';

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-gray-100 animate-pulse rounded-md', className)}
      {...props}
    />
  );
}

function SkeletonCard({ className, ...props }: SkeletonProps) {
  return <Skeleton className={cn('w-full h-40', className)} {...props} />;
}

function SkeletonCircle({ className, ...props }: SkeletonProps) {
  return <Skeleton className={cn('w-10 h-10 rounded-full', className)} {...props} />;
}

function SkeletonLine({ className, ...props }: SkeletonProps) {
  return <Skeleton className={cn('h-4 w-full', className)} {...props} />;
}

export default Skeleton;
export { Skeleton, SkeletonCard, SkeletonCircle, SkeletonLine };
export type { SkeletonProps };
