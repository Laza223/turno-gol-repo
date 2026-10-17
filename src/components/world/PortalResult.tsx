import type { ReactNode } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TONE_TEXT, type StatusTone } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import {
  PORTAL_BUTTON,
  PORTAL_BUTTON_OUTLINE,
  PORTAL_COLUMN,
  PORTAL_TITLE,
} from './PortalAuthFrame'

/**
 * Una pantalla de resultado del portal (el pago se está confirmando, no se procesó, la reserva ya
 * pasó…): ícono de estado de 32 px, el título del mundo, qué pasó en una o dos líneas y la salida.
 * La misma columna que confirmar, centrada en el alto. Plana y sin tarjeta. El tono pinta solo el
 * ícono: rojo (`destructive`) es de los errores, gris (`neutral`) de lo que no es una falla, y el
 * ámbar no existe acá (es de "Queda 1").
 */
export function PortalResult({
  icon: Icon,
  tone = 'neutral',
  spin = false,
  title,
  children,
  actions,
}: {
  icon: LucideIcon
  tone?: Extract<StatusTone, 'neutral' | 'destructive' | 'success'>
  /** Girando (esperando algo). Con reduce-motion queda quieto. */
  spin?: boolean
  title: string
  /** Qué pasó. Cada hijo es un párrafo. */
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className={cn(PORTAL_COLUMN, 'pb-12')}>
      {/* Un cambio de estado (esperando → confirmado → expirado) se anuncia sin mover el foco. */}
      <div aria-live="polite" className="flex min-h-[50dvh] flex-col justify-center">
        <Icon
          className={cn(
            'size-8',
            TONE_TEXT[tone],
            spin && 'animate-spin motion-reduce:animate-none',
          )}
          aria-hidden
        />
        <h1 className={cn(PORTAL_TITLE, 'mt-4 text-balance')}>{title}</h1>
        {children && (
          <div className="mt-2 space-y-2 text-pretty text-base text-muted-foreground">
            {children}
          </div>
        )}
        {actions && <div className="mt-8 space-y-3">{actions}</div>}
      </div>
    </div>
  )
}

/** La salida de un resultado: un botón de 48 px a todo el ancho. La principal es verde; la otra, `outline`. */
export function PortalResultLink({
  href,
  variant = 'primary',
  children,
}: {
  href: string
  variant?: 'primary' | 'outline'
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        variant === 'outline'
          ? [buttonVariants({ variant: 'outline' }), PORTAL_BUTTON_OUTLINE]
          : [buttonVariants(), PORTAL_BUTTON],
      )}
    >
      {children}
    </Link>
  )
}

/** La silueta de `PortalResult` mientras carga: el mismo ícono, título y dos líneas, en la misma columna. */
export function PortalResultSkeleton() {
  return (
    <div className={cn(PORTAL_COLUMN, 'pb-12')} role="status" aria-label="Cargando…">
      <div className="flex min-h-[50dvh] flex-col justify-center">
        <Skeleton aria-hidden className="size-8 rounded-full" />
        <Skeleton aria-hidden className="mt-4 h-9 w-3/4" />
        <Skeleton aria-hidden className="mt-2 h-6 w-full" />
        <Skeleton aria-hidden className="mt-2 h-6 w-2/3" />
      </div>
    </div>
  )
}
