import { cn } from '@/lib/utils'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tailwind shape utilities — pass through (e.g. "h-48 rounded-lg w-full") */
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('skeleton rounded-md', className)}
      aria-busy="true"
      {...props}
    />
  )
}
