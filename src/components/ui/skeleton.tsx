import { cn } from '@/lib/utils'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Accessible label announced by screen readers. Defaults to "Cargando…". Set `aria-hidden` to suppress role+label for decorative skeletons. */
  label?: string
  /**
   * `glass`: esqueleto del portal de vidrio, una pieza de vidrio con el brillo de carga (dirección
   * §4.4). Va con la forma exacta de lo que reemplaza (radio y alto los pone `className`).
   */
  variant?: 'default' | 'glass'
}

export function Skeleton({
  className,
  label = 'Cargando…',
  variant = 'default',
  ...props
}: SkeletonProps) {
  const isHidden = props['aria-hidden'] === true || props['aria-hidden'] === 'true'
  return (
    <div
      className={cn(
        variant === 'glass' ? 'skeleton-glass rounded-3xl' : 'skeleton rounded-md',
        className,
      )}
      role={isHidden ? undefined : 'status'}
      aria-label={isHidden ? undefined : label}
      aria-busy={isHidden ? undefined : 'true'}
      {...props}
    />
  )
}
