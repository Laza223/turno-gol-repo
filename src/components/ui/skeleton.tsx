import { cn } from '@/lib/utils'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Accessible label announced by screen readers. Defaults to "Cargando…". Set `aria-hidden` to suppress role+label for decorative skeletons. */
  label?: string
}

export function Skeleton({ className, label = 'Cargando…', ...props }: SkeletonProps) {
  const isHidden = props['aria-hidden'] === true || props['aria-hidden'] === 'true'
  return (
    <div
      className={cn('skeleton rounded-md', className)}
      role={isHidden ? undefined : 'status'}
      aria-label={isHidden ? undefined : label}
      aria-busy={isHidden ? undefined : 'true'}
      {...props}
    />
  )
}
