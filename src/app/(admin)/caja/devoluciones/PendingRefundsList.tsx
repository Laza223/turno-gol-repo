'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ExternalLink, Mail, MessageCircle, Undo2 } from 'lucide-react'
import { StatCard } from '@/components/admin/StatCard'
import { EmptyState } from '@/components/ui/empty-state'
import { formatArs } from '@/lib/format'
import { buildWhatsappUrl } from '@/lib/whatsapp'
import { bookingCode } from '@/lib/booking-code'
import { relativeTimeEs } from '@/lib/format'
import type { PendingRefundRow } from '@/modules/payments/refund.service'
import { MarkRefundSettledDialog, type MarkRefundSettledAction } from './MarkRefundSettledDialog'

/** Por dónde entró la seña. Dice si MercadoPago todavía puede resolverla solo. */
const ORIGIN_TAG: Record<string, string> = {
  mercadopago: 'MercadoPago',
  cash: 'Efectivo',
  transfer: 'Transferencia',
  other: 'Otro medio',
}

/** "YYYY-MM-DD" → "29/08". Sin `new Date`: evita el corrimiento por zona. */
function shortDate(date: string): string {
  return date.slice(0, 10).split('-').reverse().slice(0, 2).join('/')
}

/**
 * Aviso al jugador de que la devolución está en camino. Es la mitad del
 * circuito que le falta al complejo: el jugador ya tiene un botón para
 * reclamar, y esto es el botón para responderle sin buscar el teléfono a mano.
 */
function whatsappUrl(row: PendingRefundRow): string | null {
  const detalle =
    row.date && row.timeStart
      ? ` del ${shortDate(row.date)} a las ${row.timeStart.slice(0, 5)}`
      : ''
  const codigo = row.bookingId ? ` (${bookingCode(row.bookingId)})` : ''
  const msg =
    `Hola${row.debtorName !== 'Sin nombre' ? ` ${row.debtorName}` : ''}, te escribimos por la ` +
    `devolución de la seña de ${formatArs(row.amountCents)} del turno${detalle}${codigo}.`
  return buildWhatsappUrl(row.contactPhone, msg)
}

/** El mismo aviso, por el canal que queda cuando no hay número marcable. */
function mailtoUrl(row: PendingRefundRow): string {
  const detalle =
    row.date && row.timeStart
      ? ` del ${shortDate(row.date)} a las ${row.timeStart.slice(0, 5)}`
      : ''
  const codigo = row.bookingId ? ` (${bookingCode(row.bookingId)})` : ''
  const asunto = `Devolución de tu seña${codigo}`
  const cuerpo =
    `Hola${row.debtorName !== 'Sin nombre' ? ` ${row.debtorName}` : ''}, te escribimos por la ` +
    `devolución de la seña de ${formatArs(row.amountCents)} del turno${detalle}${codigo}.`
  return `mailto:${row.contactEmail}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
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
      {/* StatCard compartido, no un card armado a mano (H085/H086): rojo
          (destructive) porque es plata que SALE del complejo, lo opuesto de
          "Deudas" en StreetMoneyList (accent="amber", plata pendiente de
          ENTRAR) — antes las dos maquetas eran distintas Y del mismo hue.
          MASTER §2.5: ingresos/pendiente de cobro en verde/ámbar, egresos en
          rojo SIEMPRE. */}
      <StatCard
        label="Tenés que devolver"
        value={formatArs(total)}
        icon={<Undo2 className="h-4 w-4" aria-hidden="true" />}
        accent="red"
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No debés ninguna devolución"
          description="Cuando canceles un turno con seña o la cancele un jugador dentro del plazo, la devolución va a aparecer acá. Devolvés vos desde MercadoPago, transferencia o efectivo; acá queda registrado."
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
                {/* Dos renglones, no uno truncado: "hace X" no puede quedar
                    cortado por el ancho de pantalla (H088), mismo criterio
                    que StreetMoneyList. */}
                {row.courtName && row.date && (
                  <p className="truncate text-xs text-muted-foreground">
                    {row.courtName} · {shortDate(row.date)} {row.timeStart?.slice(0, 5) ?? ''}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
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
                  {/* Sin teléfono queda el email, que es NOT NULL para
                      cualquier jugador con cuenta. Antes de esto, la fila de
                      alguien sin teléfono cargado no ofrecía ningún canal: el
                      complejo sabía a quién le debe y no tenía desde dónde
                      avisarle. */}
                  {!whatsappUrl(row) && row.contactEmail && (
                    <a
                      href={mailtoUrl(row)}
                      className="inline-flex min-h-11 items-center gap-1 rounded-sm font-medium text-emerald-800 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-400 md:min-h-0"
                    >
                      <Mail className="h-3.5 w-3.5" aria-hidden />
                      Avisarle por email
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
                <span className="text-base font-bold tabular-nums text-red-700 dark:text-red-400">
                  {formatArs(row.amountCents)}
                </span>
                <button
                  type="button"
                  onClick={() => setSettling(row)}
                  // H105: mismo criterio que StreetMoneyList — el nombre
                  // accesible dice a quién y cuánto, no solo el label genérico.
                  aria-label={`Ya devolví ${formatArs(row.amountCents)} — ${row.debtorName}`}
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
