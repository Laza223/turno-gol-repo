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
  const mountTimeRef = useRef(Date.now())

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

  // Polling effect — re-runs whenever status changes so early-return cleans up.
  // Cache-bust query param: dev/SSR caches occasionally serve stale 'pending'
  // even with `cache: 'no-store'`; a varying URL guarantees a fresh response.
  useEffect(() => {
    if (TERMINAL_STATUSES.has(status)) return

    const id = setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/player/bookings/${bookingId}/status?t=${Date.now()}`,
            { cache: 'no-store' },
          )
          if (!res.ok) return
          const json = (await res.json()) as StatusResponse
          setStatus(json.data.status)
        } catch {
          // transient network error — keep polling
        }
      })()
    }, 3000)

    return () => clearInterval(id)
  }, [bookingId, status])

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
