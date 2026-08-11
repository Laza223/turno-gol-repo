'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ExternalLink, MessageCircle, Wallet } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { formatArs } from '@/lib/format'
import { relativeTimeEs } from '@/app/(admin)/analiticas/dashboard-helpers'
import { CATEGORY_BADGE, chipClass } from '../caja-lib'
import type { StreetMoneyOrigin, StreetMoneyRow } from '@/modules/cashflow/street-money.service'
import { StreetMoneyChargeDialog } from './StreetMoneyChargeDialog'

const ORIGIN_FILTERS: { value: StreetMoneyOrigin | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'booking', label: 'Turnos' },
  { value: 'canteen_tab', label: 'Cantina' },
  { value: 'tournament', label: 'Torneos' },
]

// Reusa la paleta por categoría de cash_flows (caja-lib.ts): booking/product_sale/
// tournament son exactamente los 3 orígenes de Plata en la calle, ya con su color.
const ORIGIN_BADGE: Record<StreetMoneyOrigin, string> = {
  booking: CATEGORY_BADGE.booking,
  canteen_tab: CATEGORY_BADGE.product_sale,
  tournament: CATEGORY_BADGE.tournament,
}

const ORIGIN_TAG: Record<StreetMoneyOrigin, string> = {
  booking: 'Turno',
  canteen_tab: 'Fiado',
  tournament: 'Torneo',
}

function originDetail(row: StreetMoneyRow): string {
  if (row.origin === 'booking') {
    return `${row.courtName} · ${row.date} ${row.timeStart.slice(0, 5)}-${row.timeEnd.slice(0, 5)}`
  }
  if (row.origin === 'tournament') return row.tournamentName
  return row.note ?? 'Cantina'
}

/**
 * El link de cobranza por WhatsApp, con el mensaje ya redactado. Venía de la
 * lista vieja de `/jugadores/deudas` (absorbida en Fase 4) y se conserva tal
 * cual: mandar el mensaje ES la acción real de cobrar un turno atrasado, y
 * perderla habría dejado al encargado buscando el teléfono a mano.
 */
function whatsappUrl(row: StreetMoneyRow): string | null {
  if (row.origin !== 'booking' || !row.contactPhone) return null
  const timeRange = `${row.timeStart.slice(0, 5)} - ${row.timeEnd.slice(0, 5)}`
  const msg =
    `Hola${row.debtorName ? ` ${row.debtorName}` : ''}, te contactamos por el turno del ` +
    `${row.date} (${timeRange}) en ${row.courtName}. Quedó un saldo pendiente de ` +
    `${formatArs(row.pendingCents)}. ¿Cuándo podrías pasar a saldarlo?`
  return `https://wa.me/${row.contactPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`
}

/**
 * Los 3 orígenes de deuda, unidos (criterio de salida #2 del contrato de
 * Fase 1). `rows` viene YA armado por street-money.service.ts (fuente
 * única) — este componente solo filtra por chip y dispara el cobro.
 */
export function StreetMoneyList({ rows }: { rows: StreetMoneyRow[] }) {
  const [filter, setFilter] = useState<StreetMoneyOrigin | 'all'>('all')
  const [charging, setCharging] = useState<StreetMoneyRow | null>(null)
  // Instante fijo por render (mismo criterio que FiadosList): "hace X" no
  // cambia sin refresh.
  const [nowMs] = useState(() => Date.now())

  const filtered = filter === 'all' ? rows : rows.filter((r) => r.origin === filter)
  const total = rows.reduce((s, r) => s + r.pendingCents, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Plata en la calle
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-amber-800 dark:text-amber-300">
            {formatArs(total)}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">
          <Wallet className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar por origen">
        {ORIGIN_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={chipClass(filter === f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title={rows.length === 0 ? 'Sin plata en la calle' : 'Nada en este filtro'}
          description={
            rows.length === 0
              ? 'No hay turnos sin cobrar, fiados abiertos ni cuotas de torneo pendientes.'
              : 'Probá con otro filtro de origen.'
          }
        />
      ) : (
        <ul className="space-y-2" role="list">
          {filtered.map((row) => (
            <li
              key={`${row.origin}-${row.refId}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-xs"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ORIGIN_BADGE[row.origin]}`}
                  >
                    {ORIGIN_TAG[row.origin]}
                  </span>
                  {/* Fase 4: la ficha del cliente es el único lugar donde se
                      sanciona a un moroso (antes eso vivía en la lista muerta
                      /jugadores/deudas). Los turnos de invitado no tienen
                      ficha: ahí el nombre queda como texto. */}
                  {row.origin === 'booking' && row.playerId ? (
                    <Link
                      href={`/jugadores/${row.playerId}`}
                      className="truncate rounded-sm text-sm font-medium text-foreground underline decoration-dotted underline-offset-4 hover:text-emerald-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-emerald-400"
                    >
                      {row.debtorName}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-medium text-foreground">
                      {row.debtorName}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {originDetail(row)} · {relativeTimeEs(row.since.toISOString(), nowMs)}
                </p>
                {row.origin === 'booking' && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {whatsappUrl(row) && (
                      <a
                        href={whatsappUrl(row)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1 rounded-sm font-medium text-emerald-800 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-400 md:min-h-0"
                      >
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                        Escribirle por WhatsApp
                      </a>
                    )}
                    <Link
                      href={`/reservas/${row.refId}`}
                      className="inline-flex min-h-11 items-center gap-1 rounded-sm font-medium text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:min-h-0"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      Ver el turno
                    </Link>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-base font-bold tabular-nums text-red-600 dark:text-red-400">
                  {formatArs(row.pendingCents)}
                </span>
                <button
                  type="button"
                  onClick={() => setCharging(row)}
                  className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 md:h-9"
                >
                  Cobrar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <StreetMoneyChargeDialog row={charging} onClose={() => setCharging(null)} />
    </div>
  )
}
