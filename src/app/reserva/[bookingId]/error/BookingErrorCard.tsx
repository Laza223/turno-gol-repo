import { AlertTriangle, CalendarCheck, Clock, XCircle } from 'lucide-react'
import { SubmitButton } from '@/components/ui/submit-button'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import {
  PortalResult,
  PortalResultContact,
  PortalResultLink,
} from '@/components/world/PortalResult'
import { ReservaTurnLines } from '@/components/booking/ReservaTurnLines'
import { buildReserveAgainHref, type ReserveRequest } from '@/lib/booking/reserve-url'
import type { DepositPayState } from '@/lib/booking/hold'
import type { retryDepositPaymentAction } from '@/app/(public)/[slug]/reservar/actions'

/**
 * Qué pasó con el turno cuando el pago no salió:
 * - `retry`: el pago no se procesó pero el turno sigue guardado (queda hold para reintentar).
 * - `processing`: el turno sigue guardado y MercadoPago tiene OTRO pago de la reserva en revisión:
 *   ofrecer reintentar sería invitar al doble cobro.
 * - `unavailable`: el turno sigue guardado, pero desde acá no se puede cobrar (MercadoPago del
 *   complejo desconectado): la acción mandaría a /pendiente sin nada que pagar.
 * - `released`: el pago no se completó a tiempo y el turno ya no está guardado (la fila puede
 *   seguir en `pending_payment` hasta que la barra el worker: no decimos "se liberó").
 * - `canceled`: la reserva está cancelada.
 * - `past`: la reserva ya se jugó (o no se fue): no hay pago que reintentar.
 */
export type ErrorView = 'retry' | 'processing' | 'unavailable' | 'released' | 'canceled' | 'past'

/**
 * `payState` = `depositPayState` de la reserva: la misma regla que /pendiente y Mis reservas. Una
 * reserva confirmada no llega acá: la page la manda a /exito.
 */
export function errorViewFor(status: string, payState: DepositPayState | null): ErrorView {
  if (status === 'canceled_refunded' || status === 'canceled_no_refund') return 'canceled'
  if (status === 'completed' || status === 'no_show') return 'past'
  if (payState === 'open') return 'retry'
  if (payState === 'processing') return 'processing'
  if (payState === 'unavailable') return 'unavailable'
  return 'released'
}

/**
 * Pago rechazado o cancelado: dice qué pasó con el pago Y con el turno, y qué hacer. Dentro del
 * hold real (`DEFAULT_EXPIRY_SECONDS`) ofrece reintentar el mismo booking y dice hasta qué hora (la
 * del reloj, sin cuenta regresiva), con "Elegir otro turno" de salida; fuera de la ventana el
 * worker ya liberó el turno y manda a la ficha del complejo en ese día. En las dos, el contacto del
 * complejo: quien pagó y no lo ve confirmado tiene a quién escribirle.
 *
 * `retryAction` entra por prop: `.../reservar/actions` es `'use server'` y
 * arrastra `node:async_hooks` si se importa como valor.
 */
export function BookingErrorCard({
  bookingId,
  tenantSlug,
  date,
  startsOn,
  turn,
  view,
  payUntil,
  contact,
  retryAction,
}: {
  bookingId: string
  tenantSlug: string | null
  /** "YYYY-MM-DD", el día de la reserva: "Reservar de nuevo" abre la ficha en ese día. */
  date: string | null
  /** "YYYY-MM-DD", el día CALENDARIO en que se juega (de `starts_at`): lo que lee el jugador. */
  startsOn: string | null
  /** Hora y cancha del turno que quedó guardado: se muestra al ofrecer reintentar. */
  turn: { courtName: string; timeStart: string; timeEnd: string } | null
  view: ErrorView
  /** "20:14": hasta qué hora se puede reintentar (`holdPayUntilLabel`). Solo en `retry`. */
  payUntil: string | null
  /** "Escribirle al complejo" (`buildBookingContact`); `null` si no hay número marcable. */
  contact: ReserveRequest | null
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

  if (view === 'processing') {
    return (
      <PortalResult
        icon={Clock}
        title="Tenés un pago en revisión"
        actions={
          <>
            <PortalResultLink href="/mis-reservas">Ver mis reservas</PortalResultLink>
            <PortalResultContact contact={contact} />
          </>
        }
      >
        <p>MercadoPago todavía está revisando un pago de esta reserva.</p>
        <p>Si se aprueba, el turno queda confirmado. Lo ves en Mis reservas.</p>
        {startsOn && turn && <ReservaTurnLines startsOn={startsOn} {...turn} />}
      </PortalResult>
    )
  }

  if (view === 'unavailable') {
    return (
      <PortalResult
        icon={AlertTriangle}
        tone="destructive"
        title="El pago no se procesó"
        actions={
          <>
            <PortalResultLink href={reserveAgainHref}>Elegir otro turno</PortalResultLink>
            <PortalResultContact contact={contact} />
          </>
        }
      >
        <p>El pago fue rechazado o cancelado.</p>
        <p>Por ahora no se puede reintentar el pago desde acá. Escribile al complejo.</p>
        {startsOn && turn && <ReservaTurnLines startsOn={startsOn} {...turn} />}
      </PortalResult>
    )
  }

  if (view === 'released') {
    return (
      <PortalResult
        icon={AlertTriangle}
        tone="destructive"
        title="El pago no se procesó"
        actions={
          <>
            <PortalResultLink href={reserveAgainHref}>Reservar de nuevo</PortalResultLink>
            <PortalResultContact contact={contact} />
          </>
        }
      >
        <p>El pago no se completó a tiempo y el turno ya no está guardado.</p>
        <p>Elegí un horario de nuevo. Si llegaste a pagar, escribile al complejo.</p>
      </PortalResult>
    )
  }

  return (
    <PortalResult
      icon={AlertTriangle}
      tone="destructive"
      title="El pago no se procesó"
      actions={
        <>
          <form action={retryAction}>
            <input type="hidden" name="bookingId" value={bookingId} />
            <SubmitButton className={PORTAL_BUTTON} pendingLabel="Reintentando…">
              Reintentar pago
            </SubmitButton>
          </form>
          <PortalResultLink href={reserveAgainHref} variant="outline">
            Elegir otro turno
          </PortalResultLink>
          <PortalResultContact contact={contact} />
        </>
      }
    >
      <p>El pago fue rechazado o cancelado.</p>
      <p>
        {payUntil
          ? `Tu turno sigue guardado: podés pagar hasta las ${payUntil} con otro medio de pago.`
          : 'Tu turno sigue guardado. Podés intentar de nuevo con otro medio de pago.'}
      </p>
      {startsOn && turn && <ReservaTurnLines startsOn={startsOn} {...turn} />}
    </PortalResult>
  )
}
