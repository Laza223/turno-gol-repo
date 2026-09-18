'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Mail, MessageCircle } from 'lucide-react'
import { SectionHeader } from '@/components/admin/SectionHeader'
import { Pager } from '@/components/ui/pager'
import { formatArs, relativeTimeEs } from '@/lib/format'
import { buildWhatsappUrl } from '@/lib/whatsapp'
import { bookingCode } from '@/lib/booking-code'
import type { PendingRefundRow } from '@/modules/payments/refund.service'
import { mediumDateLabel } from '../caja-lib'
import { MarkRefundSettledDialog, type MarkRefundSettledAction } from './MarkRefundSettledDialog'

/** Por dónde entró la seña. Dice si MercadoPago todavía puede resolverla solo. */
const ORIGIN_TAG: Record<string, string> = {
  mercadopago: 'MercadoPago',
  cash: 'Efectivo',
  transfer: 'Transferencia',
  other: 'Otro medio',
}

/**
 * Devoluciones por página. La sección va arriba de las deudas: con más filas
 * que esto empujaría la tabla de deudas y el diario del día fuera de la vista.
 * Vienen de la más vieja a la más nueva, así que la página 1 es la cola por
 * donde se empieza.
 */
const PAGE_SIZE = 5

/** "del lun 14 de septiembre a las 21:00", o nada si el turno no trae fecha. */
function turnoDetalle(row: PendingRefundRow): string {
  return row.date && row.timeStart
    ? ` del ${mediumDateLabel(row.date.slice(0, 10))} a las ${row.timeStart.slice(0, 5)}`
    : ''
}

/**
 * Aviso al jugador de que la devolución está en camino. Es la mitad del
 * circuito que le falta al complejo: el jugador ya tiene un botón para
 * reclamar, y esto es el botón para responderle sin buscar el teléfono a mano.
 */
function whatsappUrl(row: PendingRefundRow): string | null {
  const codigo = row.bookingId ? ` (${bookingCode(row.bookingId)})` : ''
  const msg =
    `Hola${row.debtorName !== 'Sin nombre' ? ` ${row.debtorName}` : ''}, te escribimos por la ` +
    `devolución de la seña de ${formatArs(row.amountCents)} del turno${turnoDetalle(row)}${codigo}.`
  return buildWhatsappUrl(row.contactPhone, msg)
}

/** El mismo aviso, por el canal que queda cuando no hay número marcable. */
function mailtoUrl(row: PendingRefundRow): string {
  const codigo = row.bookingId ? ` (${bookingCode(row.bookingId)})` : ''
  const asunto = `Devolución de tu seña${codigo}`
  const cuerpo =
    `Hola${row.debtorName !== 'Sin nombre' ? ` ${row.debtorName}` : ''}, te escribimos por la ` +
    `devolución de la seña de ${formatArs(row.amountCents)} del turno${turnoDetalle(row)}${codigo}.`
  return `mailto:${row.contactEmail}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
}

/**
 * Lo que el complejo tiene que devolver. **Con cero filas no se dibuja nada.**
 *
 * Antes ocupaba el lugar de honor de Cuentas con una tarjeta en $ 0 y un
 * párrafo explicando qué iba a aparecer ahí algún día. Una devolución pendiente
 * es rara (una cancelación con seña cobrada dentro del plazo), y en un complejo
 * que no cobra seña por MercadoPago directamente no puede existir: el bloque
 * vacío era permanente para la mayoría. Con una sola regla —sin filas, no hay
 * sección— se resuelven los dos casos sin leer la configuración del complejo.
 *
 * Cuando SÍ hay algo, es plata que sale y es urgente: por eso la página lo pone
 * primero, arriba de las deudas.
 */
export function PendingRefundsList({
  rows,
  action,
}: {
  rows: PendingRefundRow[]
  /** Ver el comentario homólogo en MarkRefundSettledDialog. */
  action: MarkRefundSettledAction
}) {
  const [settling, setSettling] = useState<PendingRefundRow | null>(null)
  // Instante fijo por render (mismo criterio que StreetMoneyList).
  const [nowMs] = useState(() => Date.now())
  const [page, setPage] = useState(0)

  if (rows.length === 0) return null

  const total = rows.reduce((s, r) => s + r.amountCents, 0)
  // Marcar la última devolución de la última página la deja vacía: el clamp
  // muestra la anterior.
  const lastPage = Math.max(Math.ceil(rows.length / PAGE_SIZE) - 1, 0)
  const current = Math.min(page, lastPage)
  const pageRows = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  return (
    <section aria-labelledby="devolver-titulo" className="space-y-3">
      {/* Rojo porque es plata que SALE (MASTER §2.5), lo opuesto de "Deudas",
          que es plata pendiente de ENTRAR. */}
      <SectionHeader
        id="devolver-titulo"
        title="Tenés que devolver"
        meta={
          <>
            <span className="font-semibold text-red-700 dark:text-red-400">{formatArs(total)}</span>{' '}
            · {rows.length} {rows.length === 1 ? 'seña' : 'señas'}
          </>
        }
      />

      <ul className="divide-y divide-border border-b border-border" role="list">
        {pageRows.map((row) => {
          const wa = whatsappUrl(row)
          return (
            <li
              key={row.refundPaymentId}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
                    {ORIGIN_TAG[row.method] ?? row.method}
                  </span>
                  <span className="truncate text-sm font-medium text-foreground">
                    {row.debtorName}
                  </span>
                  {row.courtName && row.date && (
                    <span className="truncate text-xs text-muted-foreground">
                      {row.courtName} · {mediumDateLabel(row.date.slice(0, 10))}{' '}
                      {row.timeStart?.slice(0, 5) ?? ''}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 text-xs">
                  {/* La antigüedad nunca se trunca (H088): va en su propio renglón. */}
                  <span className="text-muted-foreground">
                    {relativeTimeEs(new Date(row.since).toISOString(), nowMs)}
                  </span>
                  {/* Sin teléfono no se ofrece el link: un wa.me armado con un
                      número que no existe hace perder el tiempo dos veces. */}
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 rounded-sm font-medium text-emerald-800 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-400 md:min-h-0"
                    >
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                      Avisarle por WhatsApp
                    </a>
                  )}
                  {/* Sin teléfono queda el email, que es NOT NULL para cualquier
                      jugador con cuenta. */}
                  {!wa && row.contactEmail && (
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
                <span className="text-sm font-semibold tabular-nums text-red-700 dark:text-red-400">
                  {formatArs(row.amountCents)}
                </span>
                <button
                  type="button"
                  onClick={() => setSettling(row)}
                  // H105: el nombre accesible dice a quién y cuánto.
                  aria-label={`Ya devolví ${formatArs(row.amountCents)} — ${row.debtorName}`}
                  className="inline-flex h-11 items-center rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent md:h-9"
                >
                  Ya devolví
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <Pager
        label="Paginación de devoluciones"
        page={current}
        total={rows.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      <p className="text-xs text-muted-foreground">
        Devolvés por donde quieras — MercadoPago, transferencia o efectivo. Acá solo queda
        registrado que ya lo hiciste; si devolvés desde el panel de MercadoPago, la fila desaparece
        sola cuando ellos nos avisan.
      </p>

      <MarkRefundSettledDialog row={settling} onClose={() => setSettling(null)} action={action} />
    </section>
  )
}
