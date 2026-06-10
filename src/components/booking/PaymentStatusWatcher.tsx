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
  useEffect(() => {
    if (TERMINAL_STATUSES.has(status) || stalled) return

    const id = setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/player/bookings/${bookingId}/status?t=${Date.now()}`,
            { cache: 'no-store' },
          )
          if (!res.ok) {
            failuresRef.current += 1
            if (failuresRef.current >= 5) setStalled((s) => s ?? 'error')
            return
          }
          failuresRef.current = 0
          const json = (await res.json()) as StatusResponse
          setStatus(json.data.status)
        } catch {
          // error de red: tras varios intentos seguidos cortamos el spinner (#46)
          failuresRef.current += 1
          if (failuresRef.current >= 5) setStalled((s) => s ?? 'error')
        }
      })()
    }, 3000)

    return () => clearInterval(id)
  }, [bookingId, status, stalled])

  if (status === 'confirmed') {
    return (
      <div className="flex flex-col items-center text-center" aria-live="polite">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
          <CheckCircle2 className="h-8 w-8 text-emerald-700" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">¡Reserva confirmada!</h1>
        <p className="mt-3 text-sm text-slate-600">Tu pago fue acreditado.</p>
        <Link
          href="/mis-reservas"
          className="mt-8 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          Ver mis reservas
        </Link>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className="flex flex-col items-center text-center" aria-live="polite">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 ring-8 ring-slate-50">
          <XCircle className="h-8 w-8 text-slate-500" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">La reserva expiró</h1>
        <p className="mt-3 text-sm text-slate-600">
          No se completó el pago a tiempo. El turno quedó liberado.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          Reservar de nuevo
        </Link>
      </div>
    )
  }

  if (status === 'canceled_refunded' || status === 'canceled_no_refund') {
    return (
      <div className="flex flex-col items-center text-center" aria-live="polite">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 ring-8 ring-red-50">
          <XCircle className="h-8 w-8 text-red-500" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reserva cancelada</h1>
        <Link
          href="/mis-reservas"
          className="mt-8 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
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
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 ring-8 ring-slate-50">
          <XCircle className="h-8 w-8 text-slate-500" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {stalled === 'error' ? 'No pudimos verificar tu pago' : 'Se acabó el tiempo'}
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          {stalled === 'error'
            ? 'Tuvimos problemas para verificar el estado de tu pago. Si lo completaste, te confirmamos por email apenas se acredite.'
            : 'No recibimos la confirmación a tiempo. Si pagaste, te avisamos por email apenas se acredite; si no, el turno quedó liberado.'}
        </p>
        <Link
          href="/mis-reservas"
          className="mt-8 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          Ver mis reservas
        </Link>
      </div>
    )
  }

  // Default: pending_payment / anything else
  return (
    <div className="flex flex-col items-center text-center" aria-live="polite">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" aria-hidden />
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">Confirmando tu pago…</h2>
      <p className="mt-3 text-sm text-slate-600">Esto puede tardar unos segundos.</p>
      <p className="mt-4 text-sm text-slate-600">
        Te queda{' '}
        <strong>
          <ExpiryCountdown expiresAt={expiresAt} />
        </strong>{' '}
        para completar el pago.
      </p>
      {showDelayNote && (
        <p className="mt-3 text-xs text-slate-400">
          ¿Tarda? Te avisamos por email apenas se confirme.
        </p>
      )}
    </div>
  )
}
