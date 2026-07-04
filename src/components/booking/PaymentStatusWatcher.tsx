'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import ExpiryCountdown from './ExpiryCountdown'

type Props = {
  bookingId: string
  initialStatus: string
  expiresAt: string
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

export default function PaymentStatusWatcher({ bookingId, initialStatus, expiresAt }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [showDelayNote, setShowDelayNote] = useState(false)
  // `stalled` corta el spinner indefinido: 'expired' = se agotó el tiempo sin
  // transición terminal (#45, #48); 'error' = el polling falló repetidamente (#46).
  const [stalled, setStalled] = useState<null | 'expired' | 'error'>(null)
  const mountTimeRef = useRef(Date.now())
  const failuresRef = useRef(0)

  // Delay note: show after 30s still pending
  useEffect(() => {
    if (TERMINAL_STATUSES.has(status)) return
    const delay = 30_000 - (Date.now() - mountTimeRef.current)
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
    const BASE_MS = 3000
    const MAX_MS = 30_000

    const scheduleNext = (delayMs: number) => {
      const id = setTimeout(() => {
        if (cancelled) return
        void (async () => {
          try {
            const res = await fetch(
              `/api/player/bookings/${bookingId}/status?t=${Date.now()}`,
              { cache: 'no-store' },
            )
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
            setStatus(json.data.status)
            if (!cancelled) scheduleNext(BASE_MS)
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
      return id
    }

    scheduleNext(BASE_MS)
    return () => {
      cancelled = true
    }
  }, [bookingId, status, stalled])

  if (status === 'confirmed') {
    return (
      <div className="flex flex-col items-center text-center" aria-live="polite">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-8 ring-emerald-500/10">
          <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-black italic tracking-tight text-foreground">¡Reserva confirmada!</h1>
        <p className="mt-3 text-sm text-muted-foreground">Tu pago fue acreditado.</p>
        <Link
          href="/mis-reservas"
          className="mt-8 inline-flex h-12 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25"
        >
          Ver mis reservas
        </Link>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className="flex flex-col items-center text-center" aria-live="polite">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-500/15 ring-8 ring-slate-500/10">
          <XCircle className="h-8 w-8 text-muted-foreground" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-black italic tracking-tight text-foreground">La reserva expiró</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          No se completó el pago a tiempo. El turno quedó liberado.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-12 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25"
        >
          Reservar de nuevo
        </Link>
      </div>
    )
  }

  if (status === 'canceled_refunded' || status === 'canceled_no_refund') {
    return (
      <div className="flex flex-col items-center text-center" aria-live="polite">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 ring-8 ring-red-500/10">
          <XCircle className="h-8 w-8 text-red-600 dark:text-red-300" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-black italic tracking-tight text-foreground">Reserva cancelada</h1>
        <Link
          href="/mis-reservas"
          className="mt-8 inline-flex h-12 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25"
        >
          Ver mis reservas
        </Link>
      </div>
    )
  }

  // Tiempo agotado o polling caído: cortamos el spinner y damos una salida (#45/#46/#48)
  if (stalled) {
    return (
      <div className="flex flex-col items-center text-center" aria-live="polite" role="status">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-500/15 ring-8 ring-slate-500/10">
          <XCircle className="h-8 w-8 text-muted-foreground" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-black italic tracking-tight text-foreground">
          {stalled === 'error' ? 'No pudimos verificar tu pago' : 'Se acabó el tiempo'}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {stalled === 'error'
            ? 'Tuvimos problemas para verificar el estado de tu pago. Si lo completaste, te confirmamos por email apenas se acredite.'
            : 'No recibimos la confirmación a tiempo. Si pagaste, te avisamos por email apenas se acredite; si no, el turno quedó liberado.'}
        </p>
        <Link
          href="/mis-reservas"
          className="mt-8 inline-flex h-12 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25"
        >
          Ver mis reservas
        </Link>
      </div>
    )
  }

  // Default: pending_payment / anything else
  return (
    <div className="flex flex-col items-center text-center" aria-live="polite">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-8 ring-emerald-500/10">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600 dark:text-emerald-400" aria-hidden />
      </div>
      <h2 className="font-display text-2xl font-black italic tracking-tight text-foreground">Confirmando tu pago…</h2>
      <p className="mt-3 text-sm text-muted-foreground">Esto puede tardar unos segundos.</p>
      <p className="mt-4 text-sm text-muted-foreground">
        Te queda{' '}
        <strong>
          <ExpiryCountdown expiresAt={expiresAt} />
        </strong>{' '}
        para completar el pago.
      </p>
      {showDelayNote && (
        <p className="mt-3 text-xs text-muted-foreground">
          ¿Tarda? Te avisamos por email apenas se confirme.
        </p>
      )}
    </div>
  )
}
