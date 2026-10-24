'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AlertTriangle, CalendarCheck, Clock, Loader2, XCircle } from 'lucide-react'
import {
  PortalResult,
  PortalResultContact,
  PortalResultLink,
} from '@/components/world/PortalResult'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { SubmitButton } from '@/components/ui/submit-button'
import { ReservaTurnLines } from '@/components/booking/ReservaTurnLines'
import {
  buildReservaHref,
  buildReserveAgainHref,
  type ReserveRequest,
} from '@/lib/booking/reserve-url'
import type { retryDepositPaymentAction } from '@/app/(public)/[slug]/reservar/actions'

/** Qué turno es (lo arma la page con `ReservaTurnLines` en mente). */
type Turn = {
  startsOn: string
  timeStart: string
  timeEnd: string
  courtName: string
  tenantName?: string
}

/**
 * "Pagar la seña" para quien cortó el pago. Lo arma la page solo si la acción lo puede cobrar;
 * `null` = no se ofrece. `action` entra por prop: `.../reservar/actions` es `'use server'`.
 */
type PayDeposit = {
  /** "20:14": hasta qué hora, en el texto (`holdPayUntilLabel`). */
  until: string
  /** ISO del mismo instante: el watcher esconde el botón cuando llega. */
  deadline: string
  action: typeof retryDepositPaymentAction
}

type Props = {
  bookingId: string
  initialStatus: string
  expiresAt: string
  /** Para "Reservar de nuevo": la ficha del complejo en el día de la reserva. */
  tenantSlug: string | null
  /** "YYYY-MM-DD" */
  date: string | null
  turn?: Turn | null
  pay?: PayDeposit | null
  /** "Escribirle al complejo" (`buildBookingContact`) en los estados en que el pago quedó en duda. */
  contact?: ReserveRequest | null
}

const TERMINAL_STATUSES = new Set([
  'confirmed',
  'expired',
  'canceled_refunded',
  'canceled_no_refund',
  'no_show',
  'completed',
])

type StatusResponse = {
  data: { status: string; depositStatus: string; expiresAt: string }
}

export default function PaymentStatusWatcher({
  bookingId,
  initialStatus,
  expiresAt,
  tenantSlug,
  date,
  turn = null,
  pay = null,
  contact = null,
}: Props) {
  const [status, setStatus] = useState(initialStatus)
  // "Pagar la seña" se esconde cuando el hold ya no deja margen para pagar (`pay.deadline`): la
  // acción igual lo rechazaría, pero mandarlo a /error para eso es peor que no ofrecerlo.
  const [payOpen, setPayOpen] = useState(pay !== null)
  const [showDelayNote, setShowDelayNote] = useState(false)
  // `stalled` corta el spinner indefinido: 'expired' = se agotó el tiempo sin
  // transición terminal (#45, #48); 'error' = el polling falló repetidamente (#46).
  const [stalled, setStalled] = useState<null | 'expired' | 'error'>(null)
  // `useRef(Date.now())` leía el reloj DURANTE el render (react-hooks/purity):
  // el inicializador de useRef corre en render igual que el cuerpo. Se captura
  // en el primer efecto, que es cuando el componente realmente existe en el
  // cliente. `?? Date.now()` cubre el orden de efectos sin ramas raras.
  const mountTimeRef = useRef<number | null>(null)
  const failuresRef = useRef(0)

  useEffect(() => {
    mountTimeRef.current ??= Date.now()
  }, [])

  // Confirmado: se va a la pantalla de éxito, sin una intermedia propia. Si ya estamos en
  // /exito (la page monta este watcher cuando la reserva todavía no estaba confirmada), basta con
  // pedirle al servidor que la vuelva a leer. Mientras tanto se sigue viendo "Confirmando…".
  const router = useRouter()
  const pathname = usePathname()
  const navigatedRef = useRef(false)
  useEffect(() => {
    if (status !== 'confirmed' || navigatedRef.current) return
    navigatedRef.current = true
    if (pathname.endsWith('/exito')) router.refresh()
    else router.replace(buildReservaHref(bookingId, 'exito'))
  }, [status, pathname, router, bookingId])

  // Delay note: show after 30s still pending
  useEffect(() => {
    if (TERMINAL_STATUSES.has(status)) return
    const delay = 30_000 - (Date.now() - (mountTimeRef.current ?? Date.now()))
    if (delay <= 0) {
      setShowDelayNote(true)
      return
    }
    const id = setTimeout(() => setShowDelayNote(true), delay)
    return () => clearTimeout(id)
  }, [status])

  // Tiempo agotado: si el contador de expiración llega a 0 (con un pequeño margen
  // para un webhook tardío) y el backend aún no transicionó, dejamos de mostrar
  // "Confirmando…" para siempre y pasamos a la UI de tiempo agotado (#45, #48).
  useEffect(() => {
    if (TERMINAL_STATUSES.has(status)) return
    const ms = new Date(expiresAt).getTime() + 5000 - Date.now()
    if (ms <= 0) {
      // El hold ya venció antes de montar: se corta el spinner de una. Es la
      // rama inmediata del mismo timeout de abajo, no una cascada — el updater
      // es idempotente (`s ?? 'expired'`) y el efecto no depende de `stalled`.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStalled((s) => s ?? 'expired')
      return
    }
    const id = setTimeout(() => setStalled((s) => s ?? 'expired'), ms)
    return () => clearTimeout(id)
  }, [status, expiresAt])

  const payDeadline = pay?.deadline ?? null
  useEffect(() => {
    if (!payDeadline) return
    const ms = new Date(payDeadline).getTime() - Date.now()
    if (ms <= 0) {
      // Rama inmediata del mismo timeout (la página quedó abierta o volvió del fondo): idempotente.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPayOpen(false)
      return
    }
    const id = setTimeout(() => setPayOpen(false), ms)
    return () => clearTimeout(id)
  }, [payDeadline])

  // Polling effect — re-runs whenever status/stalled changes so early-return cleans up.
  // Cache-bust query param: dev/SSR caches occasionally serve stale 'pending'
  // even with `cache: 'no-store'`; a varying URL guarantees a fresh response.
  // Uses recursive setTimeout with exponential backoff (3s → 6s → 12s, cap 30s)
  // so transient 5xx bursts don't hammer the server (#63).
  useEffect(() => {
    if (TERMINAL_STATUSES.has(status) || stalled) return

    let cancelled = false
    let timerId: ReturnType<typeof setTimeout> | undefined
    const BASE_MS = 3000
    const MAX_MS = 30_000

    const scheduleNext = (delayMs: number) => {
      timerId = setTimeout(() => {
        if (cancelled) return
        void (async () => {
          try {
            const res = await fetch(`/api/player/bookings/${bookingId}/status?t=${Date.now()}`, {
              cache: 'no-store',
            })
            if (!res.ok) {
              failuresRef.current += 1
              if (failuresRef.current >= 5) {
                setStalled((s) => s ?? 'error')
                return
              }
              scheduleNext(Math.min(delayMs * 2, MAX_MS))
              return
            }
            failuresRef.current = 0
            const json = (await res.json()) as StatusResponse
            if (cancelled) return
            setStatus(json.data.status)
            scheduleNext(BASE_MS)
          } catch {
            // error de red: backoff exponencial y corte tras 5 fallos (#46, #63)
            failuresRef.current += 1
            if (failuresRef.current >= 5) {
              setStalled((s) => s ?? 'error')
              return
            }
            scheduleNext(Math.min(delayMs * 2, MAX_MS))
          }
        })()
      }, delayMs)
    }

    scheduleNext(BASE_MS)
    return () => {
      cancelled = true
      if (timerId !== undefined) clearTimeout(timerId)
    }
  }, [bookingId, status, stalled])

  return (
    <PaymentStatusView
      bookingId={bookingId}
      status={status}
      stalled={stalled}
      showDelayNote={showDelayNote}
      tenantSlug={tenantSlug}
      date={date}
      turn={turn}
      pay={payOpen ? pay : null}
      contact={contact}
    />
  )
}

/**
 * Lo que se ve en cada estado de la espera. Aparte del watcher para poder mostrar cada uno sin
 * esperar los timers de verdad (la nota de los 30 s, el corte por red caída a los ~75 s).
 */
export function PaymentStatusView({
  bookingId,
  status,
  stalled,
  showDelayNote,
  tenantSlug,
  date,
  turn = null,
  pay = null,
  contact = null,
}: {
  /** Para el form de "Pagar la seña": sin él no se dibuja. */
  bookingId?: string
  status: string
  stalled: null | 'expired' | 'error'
  showDelayNote: boolean
  tenantSlug: string | null
  date: string | null
  turn?: Turn | null
  /** Abierto y con plazo: "Pagar la seña". `null` = no se ofrece (o ya no se puede). */
  pay?: PayDeposit | null
  contact?: ReserveRequest | null
}) {
  const reserveAgainHref = buildReserveAgainHref(tenantSlug, date)

  if (status === 'expired') {
    return (
      <PortalResult
        icon={XCircle}
        title="La reserva expiró"
        actions={
          <>
            <PortalResultLink href={reserveAgainHref}>Reservar de nuevo</PortalResultLink>
            <PortalResultContact contact={contact} />
          </>
        }
      >
        <p>
          No se completó el pago a tiempo y el turno quedó liberado. Si llegaste a pagar, escribile
          al complejo.
        </p>
      </PortalResult>
    )
  }

  if (status === 'canceled_refunded' || status === 'canceled_no_refund') {
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
        <p>Esta reserva ya no está activa. El detalle lo ves en Mis reservas.</p>
      </PortalResult>
    )
  }

  // Un turno que ya se jugó (o al que no se fue): no hay nada que confirmar ni pagar.
  if (status === 'completed' || status === 'no_show') {
    return (
      <PortalResult
        icon={CalendarCheck}
        title="Esta reserva ya pasó"
        actions={<PortalResultLink href="/mis-reservas">Ver mis reservas</PortalResultLink>}
      >
        <p>Ya no hay nada para confirmar ni para pagar.</p>
      </PortalResult>
    )
  }

  // Tiempo agotado o polling caído: cortamos el spinner y damos una salida (#45/#46/#48)
  if (stalled) {
    const failed = stalled === 'error'
    return (
      <PortalResult
        icon={failed ? AlertTriangle : Clock}
        tone={failed ? 'destructive' : 'neutral'}
        title={failed ? 'No pudimos verificar tu pago' : 'Se acabó el tiempo'}
        actions={
          <>
            <PortalResultLink href="/mis-reservas">Ver mis reservas</PortalResultLink>
            <PortalResultContact contact={contact} />
          </>
        }
      >
        <p>
          {failed
            ? 'No pudimos consultar el estado de tu pago. En Mis reservas ves si el turno quedó confirmado. Si pagaste y no aparece, escribile al complejo.'
            : 'No recibimos la confirmación de MercadoPago a tiempo. En Mis reservas ves si el turno quedó confirmado. Si pagaste y no aparece, escribile al complejo.'}
        </p>
      </PortalResult>
    )
  }

  // Default: pending_payment (y confirmed, mientras navega a /exito). Quien vuelve de MercadoPago
  // ya pagado espera acá sin cuenta regresiva (el corte por tiempo, `stalled`, sigue por dentro). Y
  // quien cortó el pago sin pagar (cerró MercadoPago, volvió atrás, recargó) tiene con qué pagar:
  // el turno a la vista y "Pagar la seña" con la hora límite, mientras se pueda.
  return (
    <PortalResult
      icon={Loader2}
      spin
      title="Confirmando tu pago…"
      actions={
        pay && bookingId ? (
          <form action={pay.action}>
            <input type="hidden" name="bookingId" value={bookingId} />
            <SubmitButton className={PORTAL_BUTTON} pendingLabel="Abriendo MercadoPago…">
              Pagar la seña
            </SubmitButton>
          </form>
        ) : undefined
      }
    >
      <p>Esto puede tardar unos segundos.</p>
      {turn && <ReservaTurnLines {...turn} />}
      {showDelayNote && (
        <p className="text-sm">
          ¿Tarda? Si se confirma, te llega un email. También lo ves en Mis reservas.
        </p>
      )}
      {pay && bookingId && <p>¿No llegaste a pagar? Podés pagar hasta las {pay.until}.</p>}
    </PortalResult>
  )
}
