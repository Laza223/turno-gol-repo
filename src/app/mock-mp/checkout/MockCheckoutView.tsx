import { formatArsContable, formatDateLong } from '@/lib/format'

export type MockBookingSummary = {
  deposit_amount: number
  date: string
  time_start: string
  time_end: string
  court_name: string
  tenant_name: string
  tenant_id: string
}

type Props = {
  booking: MockBookingSummary
  bookingId: string
  /** `mockPay`/`mockReject`/`mockCancel` — Server Actions reales (`'use server'`) de `./actions`. */
  payAction: (formData: FormData) => Promise<void>
  rejectAction: (formData: FormData) => Promise<void>
  cancelAction: (formData: FormData) => Promise<void>
}

/**
 * Simulador de checkout de MercadoPago (harness de test, solo alcanzable con
 * `MP_MOCK_MODE=1`). Ojo: NO usa los tokens de tema del resto de la app
 * (`bg-white`/`text-slate-*` fijos, no `bg-card`/`text-foreground`) — es
 * deliberado, reproduce el look real del MP mock, no un descuido de theming.
 */
export function MockCheckoutView({
  booking,
  bookingId,
  payAction,
  rejectAction,
  cancelAction,
}: Props) {
  const timeStart = booking.time_start.slice(0, 5)
  const timeEnd = booking.time_end.slice(0, 5)

  return (
    // El fondo de PÁGINA quedaba fuera de la protección de theming que promete
    // el comentario de arriba: sin fondo propio hereda `body { bg-background }`,
    // que sí sigue el tema del sistema, y en dark se renderizaba casi negro
    // detrás de la tarjeta blanca fija (🟢 QA 2026-08-14).
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center bg-slate-100 px-4 py-12">
      {/* Mock banner */}
      <div className="mb-6 w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="mr-1" aria-hidden>
          ⚠
        </span>
        <strong>Entorno de prueba (MOCK)</strong> — no se cobra dinero real.
      </div>

      <div className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        {/* Header */}
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          MercadoPago — simulador
        </p>
        <h1 className="text-xl font-bold text-slate-900">Pago de seña</h1>

        {/* Booking details */}
        <dl className="mt-5 space-y-2 rounded-lg bg-slate-50 px-4 py-3 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Complejo</dt>
            <dd className="font-medium text-slate-800">{booking.tenant_name}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Cancha</dt>
            <dd className="font-medium text-slate-800">{booking.court_name}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Fecha</dt>
            <dd className="font-medium text-slate-800">{formatDateLong(booking.date)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Horario</dt>
            <dd className="font-medium text-slate-800">
              {timeStart}–{timeEnd}
            </dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-slate-200 pt-2">
            <dt className="font-semibold text-slate-700">Seña</dt>
            <dd className="font-bold text-slate-900">
              {formatArsContable(booking.deposit_amount)}
            </dd>
          </div>
        </dl>

        {/* Action buttons */}
        <form className="mt-6 flex flex-col gap-3">
          <input type="hidden" name="booking" value={bookingId} />

          {/* Pay (approved) */}
          <button
            type="submit"
            formAction={payAction}
            // `text-white` a mano sobre `bg-primary` daba 2.59:1 en dark (bajo el
            // 4.5:1 de AA): la vista no fuerza tema, así que el par correcto es el
            // del design system (`text-primary-foreground`, 7.9:1 — MASTER §2.4).
            // 🟡 QA 2026-08-14.
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-emerald-700"
          >
            Pagar (aprobado)
          </button>

          {/* Reject */}
          <button
            type="submit"
            formAction={rejectAction}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-red-300 bg-white px-5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
          >
            Pago rechazado
          </button>

          {/* Cancel */}
          <button
            type="submit"
            formAction={cancelAction}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg px-5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50"
          >
            Cancelar
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">ID de reserva: {bookingId}</p>
      </div>
    </div>
  )
}
