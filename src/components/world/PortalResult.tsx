import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { MessageCircle, Phone, type LucideIcon } from 'lucide-react'
import ReservaShell from '@/components/booking/ReservaDarkShell'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { StatusTone } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import type { ReserveRequest } from '@/lib/booking/reserve-url'

/** La insignia según el tono: verde el festejo, roja la falla y de vidrio lo que no es ninguna de las dos. */
const BADGE = {
  neutral: 'rv-badge rv-badge--neutral',
  destructive: 'rv-badge rv-badge--bad',
  success: 'rv-badge',
} as const

/** La salida principal: la píldora verde de 52 px, a todo el ancho. */
export const RESULT_GO = cn(buttonVariants({ variant: 'pill', size: 'pill' }), 'w-full')
/**
 * La otra salida: la píldora de vidrio del mockup, pintada (sin desenfoque): detrás solo está la
 * luz de fondo, y el vidrio real queda para la cabecera y la barra (dirección §3.3).
 */
export const RESULT_ALT = cn(
  buttonVariants({ variant: 'pill-glass', size: 'pill' }),
  'w-full backdrop-filter-none',
)

/**
 * Una pantalla de resultado del portal (el pago se está confirmando, no se procesó, la reserva ya
 * pasó…), en vidrio (`.done` de `reserva.html` y `estados.html`): la insignia, el título, qué pasó
 * en una o dos líneas, el turno en un ticket si lo hay y la salida. El tono pinta la insignia:
 * rojo (`destructive`) es de los errores y el vidrio neutro (`neutral`) de lo que no es una falla.
 * El ámbar no existe acá: en el portal es de la escasez ("Queda 1").
 */
export function PortalResult({
  icon: Icon,
  tone = 'neutral',
  spin = false,
  title,
  children,
  turn,
  actions,
}: {
  icon: LucideIcon
  tone?: Extract<StatusTone, 'neutral' | 'destructive' | 'success'>
  /** Girando (esperando algo). Con reduce-motion queda quieto. */
  spin?: boolean
  title: string
  /** Qué pasó. Cada hijo es un párrafo. */
  children?: ReactNode
  /** El turno del que se habla (`ReservaTurnLines`): va en un ticket de vidrio pintado. */
  turn?: ReactNode
  actions?: ReactNode
}) {
  return (
    <ReservaShell>
      {/* Un cambio de estado (esperando → confirmado → expirado) se anuncia sin mover el foco. */}
      <div aria-live="polite" className="rv-done min-h-[50dvh] content-center pt-6 md:pt-10">
        <span className={cn(BADGE[tone], 'rv-rise')}>
          <Icon className={cn(spin && 'animate-spin motion-reduce:animate-none')} aria-hidden />
        </span>
        <h1 className="rv-h1 rv-rise" style={{ '--i': 1 } as CSSProperties}>
          {title}
        </h1>
        {children && <div className="rv-sub grid gap-2">{children}</div>}
        {turn && <div className="rv-ticket glass-painted">{turn}</div>}
        {actions && <div className="rv-acts">{actions}</div>}
      </div>
    </ReservaShell>
  )
}

/**
 * La salida de un resultado: una píldora de 52 px a todo el ancho. La principal es verde; la otra,
 * de vidrio. `external` la vuelve un `<a>` (wa.me, `tel:`), que `next/link` no tiene que prefetchear.
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
  const className = variant === 'outline' ? RESULT_ALT : RESULT_GO
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
 * salida, de vidrio. Sin canal marcable no se dibuja (`buildBookingContact` da `null`).
 */
export function PortalResultContact({ contact }: { contact: ReserveRequest | null }) {
  if (!contact) return null
  const whatsapp = contact.channel === 'whatsapp'
  const Icon = whatsapp ? MessageCircle : Phone
  return (
    <PortalResultLink href={contact.href} variant="outline" external>
      <Icon className="size-4.5 shrink-0" aria-hidden />
      {whatsapp ? 'Escribirle al complejo' : 'Llamar al complejo'}
    </PortalResultLink>
  )
}

/** La silueta de `PortalResult` mientras carga: la misma insignia, título y dos líneas, en la misma columna. */
export function PortalResultSkeleton() {
  return (
    <ReservaShell>
      <div
        className="grid min-h-[50dvh] content-center justify-items-center pt-6 md:pt-10"
        role="status"
        aria-label="Cargando…"
      >
        <Skeleton variant="glass" aria-hidden className="mb-[18px] size-[76px] rounded-full" />
        <Skeleton variant="glass" aria-hidden className="h-10 w-3/4 rounded-2xl" />
        <Skeleton variant="glass" aria-hidden className="mt-3 h-5 w-full rounded-xl" />
        <Skeleton variant="glass" aria-hidden className="mt-2 h-5 w-2/3 rounded-xl" />
      </div>
    </ReservaShell>
  )
}
