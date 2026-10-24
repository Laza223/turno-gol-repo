import type { ReactNode } from 'react'
import Link from 'next/link'
import { MessageCircle, Phone, type LucideIcon } from 'lucide-react'
import ReservaShell from '@/components/booking/ReservaDarkShell'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TONE_TEXT, type StatusTone } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import type { ReserveRequest } from '@/lib/booking/reserve-url'
import { PORTAL_BUTTON, PORTAL_BUTTON_OUTLINE, PORTAL_COLUMN } from './PortalAuthFrame'

/** El círculo del ícono de estado: un tinte del tono con un aro de 8 px (el éxito lleva el resplandor esmeralda). */
const BADGE = {
  neutral: 'bg-slate-500/15 ring-8 ring-slate-500/10',
  destructive: 'bg-red-500/15 ring-8 ring-red-500/10',
  success: 'reserva-success-badge',
} as const

/** Título de La Previa: Archivo negra itálica. */
const RESULT_TITLE =
  'text-balance font-display text-3xl font-black italic leading-tight tracking-tight text-foreground'

/**
 * Una pantalla de resultado del portal (el pago se está confirmando, no se procesó, la reserva ya
 * pasó…): ícono de estado en un círculo de 64 px, el título de La Previa, qué pasó en una o dos
 * líneas y la salida, sobre el cascarón con resplandor esmeralda. La misma columna que confirmar,
 * centrada en el alto. El tono pinta el círculo y el ícono: rojo (`destructive`) es de los errores,
 * gris (`neutral`) de lo que no es una falla, y el ámbar no existe acá (es de "Queda 1").
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
    <ReservaShell>
      <div className={cn(PORTAL_COLUMN, 'pb-12')}>
        {/* Un cambio de estado (esperando → confirmado → expirado) se anuncia sin mover el foco. */}
        <div
          aria-live="polite"
          className="flex min-h-[50dvh] flex-col items-center justify-center text-center"
        >
          <div className={cn('flex size-16 items-center justify-center rounded-full', BADGE[tone])}>
            <Icon
              className={cn(
                'size-8',
                TONE_TEXT[tone],
                spin && 'animate-spin motion-reduce:animate-none',
              )}
              aria-hidden
            />
          </div>
          <h1 className={cn(RESULT_TITLE, 'mt-5')}>{title}</h1>
          {children && (
            <div className="mt-3 space-y-2 text-pretty text-base text-muted-foreground">
              {children}
            </div>
          )}
          {actions && <div className="mt-8 w-full space-y-3">{actions}</div>}
        </div>
      </div>
    </ReservaShell>
  )
}

/**
 * La salida de un resultado: un botón de 48 px a todo el ancho. La principal es verde; la otra,
 * `outline`. `external` la vuelve un `<a>` (wa.me, `tel:`), que `next/link` no tiene que prefetchear.
 */
export function PortalResultLink({
  href,
  variant = 'primary',
  external = false,
  children,
}: {
  href: string
  variant?: 'primary' | 'outline'
  external?: boolean
  children: ReactNode
}) {
  const className = cn(
    variant === 'outline'
      ? [buttonVariants({ variant: 'outline' }), PORTAL_BUTTON_OUTLINE]
      : [buttonVariants(), PORTAL_BUTTON],
    // El ícono del contacto no queda pegado al texto (el botón del portal pisa el gap de la base).
    'gap-2',
  )
  if (external) {
    // wa.me abre otra pestaña (la app de WhatsApp); `tel:` marca sin irse de la página.
    const newTab = href.startsWith('http')
    return (
      <a
        href={href}
        className={className}
        {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}

/**
 * "Escribirle al complejo" (WhatsApp) o "Llamar al complejo" (sin número para WhatsApp): la última
 * salida, `outline`. Sin canal marcable no se dibuja (`buildBookingContact` da `null`).
 */
export function PortalResultContact({ contact }: { contact: ReserveRequest | null }) {
  if (!contact) return null
  const whatsapp = contact.channel === 'whatsapp'
  const Icon = whatsapp ? MessageCircle : Phone
  return (
    <PortalResultLink href={contact.href} variant="outline" external>
      <Icon className="size-4 shrink-0" aria-hidden />
      {whatsapp ? 'Escribirle al complejo' : 'Llamar al complejo'}
    </PortalResultLink>
  )
}

/** La silueta de `PortalResult` mientras carga: el mismo círculo, título y dos líneas, en la misma columna. */
export function PortalResultSkeleton() {
  return (
    <ReservaShell>
      <div className={cn(PORTAL_COLUMN, 'pb-12')} role="status" aria-label="Cargando…">
        <div className="flex min-h-[50dvh] flex-col items-center justify-center">
          <Skeleton aria-hidden className="size-16 rounded-full" />
          <Skeleton aria-hidden className="mt-5 h-10 w-3/4" />
          <Skeleton aria-hidden className="mt-3 h-6 w-full" />
          <Skeleton aria-hidden className="mt-2 h-6 w-2/3" />
        </div>
      </div>
    </ReservaShell>
  )
}
