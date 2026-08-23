'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ExternalLink, MessageCircle, Undo2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { formatArs } from '@/lib/format'
import { buildWhatsappUrl } from '@/lib/whatsapp'
import { bookingCode } from '@/lib/booking-code'
import { relativeTimeEs } from '@/app/(admin)/analiticas/dashboard-helpers'
import type { PendingRefundRow } from '@/modules/payments/refund.service'
import { MarkRefundSettledDialog, type MarkRefundSettledAction } from './MarkRefundSettledDialog'

/** Por dónde entró la seña. Dice si MercadoPago todavía puede resolverla solo. */
const ORIGIN_TAG: Record<string, string> = {
  mercadopago: 'MercadoPago',
  cash: 'Efectivo',
  transfer: 'Transferencia',
  other: 'Otro medio',
}

/**
 * Aviso al jugador de que la devolución está en camino. Es la mitad del
 * circuito que le falta al complejo: el jugador ya tiene un botón para
 * reclamar, y esto es el botón para responderle sin buscar el teléfono a mano.
 */
function whatsappUrl(row: PendingRefundRow): string | null {
  const detalle =
    row.date && row.timeStart
      ? ` del ${row.date.slice(0, 10).split('-').reverse().slice(0, 2).join('/')} a las ${row.timeStart.slice(0, 5)}`
      : ''
  const codigo = row.bookingId ? ` (${bookingCode(row.bookingId)})` : ''
  const msg =
    `Hola${row.debtorName !== 'Sin nombre' ? ` ${row.debtorName}` : ''}, te escribimos por la ` +
    `devolución de la seña de ${formatArs(row.amountCents)} del turno${detalle}${codigo}.`
  return buildWhatsappUrl(row.contactPhone, msg)
}

export function PendingRefundsList({
  rows,
  action,
}: {
  rows: PendingRefundRow[]
  /** Ver el comentario homólogo en MarkRefundSettledDialog. */
  action: MarkRefundSettledAction
}) {
  const [settling, setSettling] = useState<PendingRefundRow | null>(null)
  // Instante fijo por render (mismo criterio que StreetMoneyList): "hace X" no
  // cambia sin refresh.
  const [nowMs] = useState(() => Date.now())

  const total = rows.reduce((s, r) => s + r.amountCents, 0)

  return (
    <div className="space-y-4">
      {/* Ámbar y con el texto explícito de que el complejo DEBE esta plata: es
          el opuesto de "Plata en la calle", que está a un tab de distancia y se
          ve casi igual. Confundir los dos totales sería caro. */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div>
          {/* amber-800, no 700: el fondo es `bg-amber-500/5`, o sea ámbar con
              opacidad sobre lo que haya atrás, y el par 700/ese compuesto mide
              3.91 — por debajo de AA. Lo detectó axe en la story; el mismo
              par existe en StreetMoneyList, que no tiene story que lo mida. */}
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-400">
            Tenés que devolver
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-amber-800 dark:text-amber-300">
            {formatArs(total)}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">
          <Undo2 className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No debés ninguna devolución"
          description="Cuando canceles un turno con seña o la cancele un jugador dentro del plazo, la devolución va a aparecer acá."
        />
      ) : (
        <ul className="space-y-2" role="list">
          {rows.map((row) => (
            <li
              key={row.refundPaymentId}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-xs"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
                    {ORIGIN_TAG[row.method] ?? row.method}
                  </span>
                  <span className="truncate text-sm font-medium text-foreground">
                    {row.debtorName}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {row.courtName && row.date
                    ? `${row.courtName} · ${row.date} ${row.timeStart?.slice(0, 5) ?? ''} · `
                    : ''}
                  {relativeTimeEs(new Date(row.since).toISOString(), nowMs)}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {/* Sin teléfono no se ofrece el link: un wa.me armado con un
                      número que no existe hace perder el tiempo dos veces. */}
                  {whatsappUrl(row) && (
                    <a
                      href={whatsappUrl(row)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 rounded-sm font-medium text-emerald-800 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-400 md:min-h-0"
                    >
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                      Avisarle por WhatsApp
                    </a>
                  )}
                  {row.bookingId && (
                    <Link
                      href={`/reservas/${row.bookingId}`}
                      className="inline-flex min-h-11 items-center gap-1 rounded-sm font-medium text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:min-h-0"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      Ver el turno
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-base font-bold tabular-nums text-amber-700 dark:text-amber-400">
                  {formatArs(row.amountCents)}
                </span>
                <button
                  type="button"
                  onClick={() => setSettling(row)}
                  className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 md:h-9"
                >
                  Ya devolví
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Devolvés por donde quieras — MercadoPago, transferencia o efectivo. Acá solo queda
        registrado que ya lo hiciste. Si devolvés desde el panel de MercadoPago, la fila desaparece
        sola cuando ellos nos avisan.
      </p>

      <MarkRefundSettledDialog row={settling} onClose={() => setSettling(null)} action={action} />
    </div>
  )
}
