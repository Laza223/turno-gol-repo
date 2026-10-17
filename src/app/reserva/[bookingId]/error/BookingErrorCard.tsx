import { AlertTriangle, CalendarCheck, XCircle } from 'lucide-react'
import { SubmitButton } from '@/components/ui/submit-button'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { PortalResult, PortalResultLink } from '@/components/world/PortalResult'
import { formatDateLong } from '@/lib/format'
import { buildReserveAgainHref } from '@/lib/booking/reserve-url'
import type { retryDepositPaymentAction } from '@/app/(public)/[slug]/reservar/actions'

/**
 * Qué pasó con el turno cuando el pago no salió:
 * - `retry`: el pago no se procesó pero el turno sigue guardado (queda hold para reintentar).
 * - `released`: el pago no se completó a tiempo y el turno ya no está guardado (la fila puede
 *   seguir en `pending_payment` hasta que la barra el worker: no decimos "se liberó").
 * - `canceled`: la reserva está cancelada.
 * - `past`: la reserva ya se jugó (o no se fue): no hay pago que reintentar.
 */
export type ErrorView = 'retry' | 'released' | 'canceled' | 'past'

/**
 * `withinWindow` = `pending_payment` dentro del hold (`holdExpiresAtMs`). Una reserva confirmada
 * no llega acá: la page la manda a /exito.
 */
export function errorViewFor(status: string, withinWindow: boolean): ErrorView {
  if (status === 'canceled_refunded' || status === 'canceled_no_refund') return 'canceled'
  if (status === 'completed' || status === 'no_show') return 'past'
  return withinWindow ? 'retry' : 'released'
}

/**
 * Pago rechazado o cancelado: dice qué pasó con el pago Y con el turno, y qué hacer. Dentro del
 * hold real (`DEFAULT_EXPIRY_SECONDS`) ofrece reintentar el mismo booking, sin cuenta regresiva;
 * fuera de la ventana el worker ya liberó el turno y manda a la ficha del complejo en ese día.
 *
 * `retryAction` entra por prop: `.../reservar/actions` es `'use server'` y
 * arrastra `node:async_hooks` si se importa como valor.
 */
export function BookingErrorCard({
  bookingId,
  tenantSlug,
  date,
  turn,
  view,
  retryAction,
}: {
  bookingId: string
  tenantSlug: string | null
  /** "YYYY-MM-DD", el día de la reserva: "Reservar de nuevo" abre la ficha en ese día. */
  date: string | null
  /** Hora y cancha del turno que quedó guardado: se muestra al ofrecer reintentar. */
  turn: { courtName: string; timeStart: string; timeEnd: string } | null
  view: ErrorView
  retryAction: typeof retryDepositPaymentAction
}) {
  const reserveAgainHref = buildReserveAgainHref(tenantSlug, date)

  if (view === 'canceled') {
    return (
      <PortalResult
        icon={XCircle}
        title="Reserva cancelada"
        actions={
          <>
            <PortalResultLink href="/mis-reservas">Ver mis reservas</PortalResultLink>
            <PortalResultLink href={reserveAgainHref} variant="outline">
              Reservar de nuevo
            </PortalResultLink>
          </>
        }
      >
        <p>Esta reserva ya no está activa, así que no hay un pago para reintentar.</p>
      </PortalResult>
    )
  }

  if (view === 'past') {
    return (
      <PortalResult
        icon={CalendarCheck}
        title="Esta reserva ya pasó"
        actions={<PortalResultLink href="/mis-reservas">Ver mis reservas</PortalResultLink>}
      >
        <p>Ya no hay un pago para reintentar.</p>
      </PortalResult>
    )
  }

  if (view === 'released') {
    return (
      <PortalResult
        icon={AlertTriangle}
        tone="destructive"
        title="El pago no se procesó"
        actions={<PortalResultLink href={reserveAgainHref}>Reservar de nuevo</PortalResultLink>}
      >
        <p>El pago no se completó a tiempo y el turno ya no está guardado.</p>
        <p>Elegí un horario de nuevo.</p>
      </PortalResult>
    )
  }

  return (
    <PortalResult
      icon={AlertTriangle}
      tone="destructive"
      title="El pago no se procesó"
      actions={
        <form action={retryAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <SubmitButton className={PORTAL_BUTTON} pendingLabel="Reintentando…">
            Reintentar pago
          </SubmitButton>
        </form>
      }
    >
      <p>El pago fue rechazado o cancelado.</p>
      <p>
        Tu turno sigue guardado por poco tiempo. Podés intentar de nuevo con otro medio de pago.
      </p>
      {date && turn && (
        <p className="font-medium text-foreground">
          {/* Dos renglones, cuándo y dónde: sin puntos sueltos al empezar una línea ni "Cancha / E2E 1". */}
          <span className="block">
            {formatDateLong(date)} ·{' '}
            <span className="whitespace-nowrap">
              {turn.timeStart.slice(0, 5)} a {turn.timeEnd.slice(0, 5)}
            </span>
          </span>{' '}
          <span className="block">{turn.courtName}</span>
        </p>
      )}
    </PortalResult>
  )
}
