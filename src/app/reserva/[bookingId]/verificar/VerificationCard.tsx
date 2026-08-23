import { CheckCircle2, Clock3, XCircle } from 'lucide-react'
import { bookingCode } from '@/lib/booking-code'

export type VerificationBooking = {
  tenantName: string
  city: string
  courtName: string
  /** "YYYY-MM-DD" */
  date: string
  /** "HH:MM:SS" o "HH:MM" */
  timeStart: string
  timeEnd: string
}

type Verdict = {
  tone: 'ok' | 'warn' | 'bad'
  title: string
  detail: string
}

/** `booking_status` → veredicto visible para quien escanea el QR (el complejo). */
function verdictFor(status: string): Verdict {
  switch (status) {
    case 'confirmed':
      return { tone: 'ok', title: 'Reserva confirmada', detail: 'El turno está vigente.' }
    case 'completed':
      return { tone: 'ok', title: 'Reserva completada', detail: 'El turno ya fue jugado.' }
    case 'pending_payment':
      return {
        tone: 'warn',
        title: 'Seña pendiente de pago',
        detail: 'La reserva todavía no está confirmada.',
      }
    case 'canceled_refunded':
    case 'canceled_no_refund':
      return { tone: 'bad', title: 'Reserva cancelada', detail: 'Este turno fue cancelado.' }
    case 'expired':
      return { tone: 'bad', title: 'Reserva expirada', detail: 'La seña no se pagó a tiempo.' }
    case 'no_show':
      return {
        tone: 'bad',
        title: 'Ausencia registrada',
        detail: 'El jugador no se presentó al turno.',
      }
    default:
      return {
        tone: 'warn',
        title: 'Estado desconocido',
        detail: 'Consultá el panel del complejo.',
      }
  }
}

const TONE_STYLES: Record<
  Verdict['tone'],
  { ring: string; badge: string; icon: typeof CheckCircle2 }
> = {
  ok: {
    ring: 'bg-emerald-100 dark:bg-emerald-500/10 ring-emerald-50 dark:ring-emerald-400/20',
    badge: 'text-emerald-700 dark:text-emerald-300',
    icon: CheckCircle2,
  },
  warn: {
    ring: 'bg-amber-100 dark:bg-amber-500/10 ring-amber-50 dark:ring-amber-400/20',
    badge: 'text-amber-600 dark:text-amber-300',
    icon: Clock3,
  },
  bad: {
    ring: 'bg-red-100 dark:bg-red-500/10 ring-red-50 dark:ring-red-400/20',
    badge: 'text-red-600 dark:text-red-300',
    icon: XCircle,
  },
}

/**
 * Card de verificación por QR — la ve el complejo al escanear el comprobante
 * del jugador. Sin datos personales del jugador (Ley 25.326): solo estado del
 * turno + complejo/cancha/horario, que el club ya conoce.
 */
export function VerificationCard({
  status,
  booking,
  bookingId,
}: {
  status: string
  booking: VerificationBooking
  bookingId: string
}) {
  const verdict = verdictFor(status)
  const tone = TONE_STYLES[verdict.tone]
  const Icon = tone.icon

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <div
        className={`mb-5 flex h-16 w-16 items-center justify-center rounded-full ring-8 ${tone.ring}`}
      >
        <Icon className={`h-8 w-8 ${tone.badge}`} aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{verdict.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{verdict.detail}</p>

      <dl className="mt-6 w-full space-y-2 rounded-xl border border-border bg-card p-4 text-left text-sm shadow-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Complejo</dt>
          <dd className="font-medium text-foreground">
            {booking.tenantName} · {booking.city}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Cancha</dt>
          <dd className="font-medium text-foreground">{booking.courtName}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Fecha</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {booking.date.split('-').reverse().join('/')}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Horario</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {booking.timeStart.slice(0, 5)}–{booking.timeEnd.slice(0, 5)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-muted-foreground">
        Verificado por TurnoGol · código {bookingCode(bookingId)}
      </p>
    </div>
  )
}

/** Estado sin match: UUID inválido, reserva inexistente, o tenant no visible públicamente. */
export function VerificationNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <XCircle className="h-10 w-10 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-lg font-bold text-foreground">No pudimos verificar esta reserva</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        El código no corresponde a una reserva válida.
      </p>
    </div>
  )
}
