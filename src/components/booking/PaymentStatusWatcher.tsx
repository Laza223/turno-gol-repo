'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AlertTriangle, CalendarCheck, Clock, Loader2, XCircle } from 'lucide-react'
import { PortalResult, PortalResultLink } from '@/components/world/PortalResult'
import { buildReservaHref, buildReserveAgainHref } from '@/lib/booking/reserve-url'

type Props = {
  bookingId: string
  initialStatus: string
  expiresAt: string
  /** Para "Reservar de nuevo": la ficha del complejo en el día de la reserva. */
  tenantSlug: string | null
  /** "YYYY-MM-DD" */
  date: string | null
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
}: Props) {
  const [status, setStatus] = useState(initialStatus)
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
      status={status}
      stalled={stalled}
      showDelayNote={showDelayNote}
      tenantSlug={tenantSlug}
      date={date}
    />
  )
}

/**
 * Lo que se ve en cada estado de la espera. Aparte del watcher para poder mostrar cada uno sin
 * esperar los timers de verdad (la nota de los 30 s, el corte por red caída a los ~75 s).
 */
export function PaymentStatusView({
  status,
  stalled,
  showDelayNote,
  tenantSlug,
  date,
}: {
  status: string
  stalled: null | 'expired' | 'error'
  showDelayNote: boolean
  tenantSlug: string | null
  date: string | null
}) {
  const reserveAgainHref = buildReserveAgainHref(tenantSlug, date)

  if (status === 'expired') {
    return (
      <PortalResult
        icon={XCircle}
        title="La reserva expiró"
        actions={<PortalResultLink href={reserveAgainHref}>Reservar de nuevo</PortalResultLink>}
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
        actions={<PortalResultLink href="/mis-reservas">Ver mis reservas</PortalResultLink>}
      >
        <p>
          {failed
            ? 'No pudimos consultar el estado de tu pago. En Mis reservas ves si el turno quedó confirmado. Si pagaste y no aparece, escribile al complejo.'
            : 'No recibimos la confirmación de MercadoPago a tiempo. En Mis reservas ves si el turno quedó confirmado. Si pagaste y no aparece, escribile al complejo.'}
        </p>
      </PortalResult>
    )
  }

  // Default: pending_payment (y confirmed, mientras navega a /exito). Todo el que llega acá ya
  // pasó por MercadoPago, así que no se le muestra cuánto le queda: el corte por tiempo
  // (`stalled`) sigue andando por dentro.
  return (
    <PortalResult icon={Loader2} spin title="Confirmando tu pago…">
      <p>Esto puede tardar unos segundos.</p>
      {showDelayNote && (
        <p className="text-sm">
          ¿Tarda? Si se confirma, te llega un email. También lo ves en Mis reservas.
        </p>
      )}
    </PortalResult>
  )
}
