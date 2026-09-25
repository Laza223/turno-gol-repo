'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, MessageCircle, Search } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Pager } from '@/components/ui/pager'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { SectionHeader } from '@/components/admin/SectionHeader'
import { formatArs, relativeTimeEs } from '@/lib/format'
import { normalizeForSearch } from '@/lib/search'
import { cn } from '@/lib/utils'
import { CATEGORY_BADGE, chipClass, mediumDateLabel } from '../caja-lib'
import type { StreetMoneyOrigin, StreetMoneyRow } from '@/modules/cashflow/street-money.service'
import { StreetMoneyChargeDialog } from './StreetMoneyChargeDialog'
import { StreetMoneyCancelTabDialog } from './StreetMoneyCancelTabDialog'

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

/**
 * Filas por página. Con 25 la tabla entera entra en un monitor de 1080 sin
 * scroll y todavía deja ver el diario del día abajo; el que busca a alguien
 * puntual usa el buscador, no la página 4.
 */
const PAGE_SIZE = 25

/**
 * Cancha, hora y fecha, en ese orden: si la celda no alcanza, lo que se corta
 * es el mes, no la hora (la antigüedad ya la dice la columna "Desde"). Fecha en
 * formato medio (§8.3): el ISO "2026-09-14" no va cara al usuario.
 */
function originDetail(row: StreetMoneyRow): string {
  if (row.origin === 'booking') {
    return `${row.courtName} · ${row.timeStart.slice(0, 5)}–${row.timeEnd.slice(0, 5)} · ${mediumDateLabel(row.date)}`
  }
  if (row.origin === 'tournament') return row.tournamentName
  return 'Cantina'
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
    `${mediumDateLabel(row.date)} (${timeRange}) en ${row.courtName}. Quedó un saldo pendiente de ` +
    `${formatArs(row.pendingCents)}. ¿Cuándo podrías pasar a saldarlo?`
  return `https://wa.me/${row.contactPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`
}

/**
 * Los 3 orígenes de deuda, unidos. `rows` viene YA armado por
 * street-money.service.ts (fuente única): este componente solo filtra, pagina
 * y dispara el cobro.
 *
 * Es una tabla y no una pila de tarjetas: catorce deudas son catorce registros
 * que se comparan por los mismos cuatro datos (quién, de qué, hace cuánto,
 * cuánto), que es exactamente para lo que sirve una tabla. Cada tarjeta medía
 * ~150 px; cada fila, ~44. Con un complejo de ocho canchas la diferencia es
 * entre una pantalla y un scroll sin fin.
 *
 * El total va como texto en el encabezado, no como tarjeta de KPI arriba: es el
 * mismo número que la lista respalda, y la tarjeta ocupaba el alto de cinco
 * filas para decirlo.
 */
export function StreetMoneyList({ rows }: { rows: StreetMoneyRow[] }) {
  const [filter, setFilter] = useState<StreetMoneyOrigin | 'all'>('all')
  // H092: buscar a una persona puntual sin leer fila por fila una lista que
  // solo ordena por antigüedad.
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [charging, setCharging] = useState<StreetMoneyRow | null>(null)
  // H117: la fila 'Fiado' se anula desde acá — mismo registro que en Vender.
  const [canceling, setCanceling] = useState<StreetMoneyRow | null>(null)
  // Instante fijo por render: "hace X" no cambia sin refresh.
  const [nowMs] = useState(() => Date.now())
  const sectionRef = useRef<HTMLElement>(null)

  const normalizedQuery = normalizeForSearch(query)
  const filtered = rows.filter((r) => {
    if (filter !== 'all' && r.origin !== filter) return false
    if (normalizedQuery && !normalizeForSearch(r.debtorName).includes(normalizedQuery)) return false
    return true
  })
  const total = rows.reduce((s, r) => s + r.pendingCents, 0)
  // Un filtro nuevo sobre la página 3 podría dejar menos de tres páginas: el
  // clamp evita mostrar una página vacía con "Anteriores" como única salida.
  const lastPage = Math.max(Math.ceil(filtered.length / PAGE_SIZE) - 1, 0)
  const current = Math.min(page, lastPage)
  const pageRows = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  function changeFilter(next: StreetMoneyOrigin | 'all') {
    setFilter(next)
    setPage(0)
  }

  function changePage(next: number) {
    setPage(next)
    // El paginador queda abajo de 25 filas: sin esto, "Siguientes" deja la
    // vista en el FINAL de la página nueva.
    sectionRef.current?.scrollIntoView({ block: 'start' })
  }

  const actions = (row: StreetMoneyRow) => {
    const wa = whatsappUrl(row)
    return (
      // `relative z-10`: la fila entera es un link al turno (ver abajo) y estos
      // controles tienen que quedar por encima de esa superficie.
      <div className="relative z-10 flex shrink-0 items-center justify-end gap-1">
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Escribirle por WhatsApp a ${row.debtorName}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:w-9"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
        {row.origin === 'canteen_tab' && (
          <button
            type="button"
            onClick={() => setCanceling(row)}
            aria-label={`Anular fiado — ${row.debtorName}`}
            className="inline-flex h-11 items-center rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-red-700 md:h-9 dark:hover:text-red-400"
          >
            Anular
          </button>
        )}
        <button
          type="button"
          onClick={() => setCharging(row)}
          // H105: 21 filas repiten "Cobrar" — el nombre accesible dice a quién
          // y cuánto (gramática de interacción §48-53).
          aria-label={`Cobrar ${formatArs(row.pendingCents)} — ${row.debtorName}`}
          className="inline-flex h-11 items-center rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent md:h-9"
        >
          Cobrar
        </button>
      </div>
    )
  }

  /**
   * El nombre lleva a la ficha del cliente (el único lugar donde se sanciona a
   * un moroso); los turnos de invitado no tienen ficha y quedan como texto. Va
   * `relative z-10` por encima del link de la fila, igual que las acciones.
   */
  const debtor = (row: StreetMoneyRow) =>
    row.origin === 'booking' && row.playerId ? (
      <Link
        href={`/jugadores/${row.playerId}`}
        className="relative z-10 truncate rounded-sm font-medium text-foreground underline decoration-dotted underline-offset-4 hover:text-emerald-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-emerald-400"
      >
        {row.debtorName}
      </Link>
    ) : (
      <span className="truncate font-medium text-foreground">{row.debtorName}</span>
    )

  /**
   * Toda la fila de un turno abre el turno (Fitts, MASTER §6.6): era un link
   * "Ver el turno" de 90 px en una tarjeta de 700. El link vive en el detalle y
   * se estira sobre la fila con un `::after` absoluto, así "Cobrar" sigue siendo
   * un botón y no un control anidado adentro de un link.
   */
  const detail = (row: StreetMoneyRow) =>
    row.origin === 'booking' ? (
      <Link
        href={`/reservas/${row.refId}`}
        className="truncate rounded-sm text-muted-foreground after:absolute after:inset-0 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="sr-only">Ver el turno: </span>
        {originDetail(row)}
      </Link>
    ) : (
      <span className="truncate text-muted-foreground">{originDetail(row)}</span>
    )

  const badge = (row: StreetMoneyRow) => (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium',
        ORIGIN_BADGE[row.origin],
      )}
    >
      {ORIGIN_TAG[row.origin]}
    </span>
  )

  const amount = (row: StreetMoneyRow) => (
    <span className="font-semibold tabular-nums text-red-700 dark:text-red-400">
      {formatArs(row.pendingCents)}
    </span>
  )

  return (
    <section ref={sectionRef} aria-labelledby="deudas-titulo" className="scroll-mt-20 space-y-3">
      <SectionHeader
        id="deudas-titulo"
        title="Sin cobrar"
        meta={
          rows.length > 0 ? (
            <>
              <span className="font-semibold text-foreground">{formatArs(total)}</span> ·{' '}
              {rows.length} {rows.length === 1 ? 'pendiente' : 'pendientes'}
            </>
          ) : null
        }
      />

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Buscar por nombre"
              placeholder="Buscar por nombre…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(0)
              }}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Filtrar por origen">
            {ORIGIN_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => changeFilter(f.value)}
                aria-pressed={filter === f.value}
                className={chipClass(filter === f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title={rows.length === 0 ? 'Nada por cobrar' : 'Nada en este filtro'}
          description={
            rows.length === 0
              ? 'No hay turnos sin cobrar, fiados abiertos ni cuotas de torneo pendientes.'
              : 'Probá con otro filtro o con otro nombre.'
          }
          className="border-0 py-8"
        />
      ) : (
        <ResponsiveList
          flat
          table={
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Quién
                  </th>
                  <th className="py-2 pr-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Detalle
                  </th>
                  <th className="py-2 pr-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Desde
                  </th>
                  <th className="py-2 pr-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Debe
                  </th>
                  <th className="py-2">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageRows.map((row) => (
                  <tr
                    key={`${row.origin}-${row.refId}`}
                    className={cn(
                      'relative transition-colors hover:bg-accent/50',
                      row.origin === 'booking' && 'cursor-pointer',
                    )}
                  >
                    <td className="max-w-[14rem] py-1.5 pr-3">
                      <div className="flex min-w-0 items-center gap-2">
                        {badge(row)}
                        {debtor(row)}
                      </div>
                    </td>
                    <td className="w-full max-w-0 py-1.5 pr-3">
                      <div className="flex min-w-0">{detail(row)}</div>
                    </td>
                    <td className="w-px whitespace-nowrap py-1.5 pr-3 text-muted-foreground">
                      {relativeTimeEs(row.since.toISOString(), nowMs)}
                    </td>
                    <td className="w-px whitespace-nowrap py-1.5 pr-3 text-right">{amount(row)}</td>
                    <td className="w-px py-1.5">{actions(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
          cards={
            <ul className="divide-y divide-border border-b border-border">
              {pageRows.map((row) => (
                <li key={`${row.origin}-${row.refId}`} className="relative space-y-1 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {badge(row)}
                      {debtor(row)}
                    </div>
                    {amount(row)}
                  </div>
                  {/* "hace X días" en su propio renglón: nunca se trunca (H087). */}
                  <div className="flex min-w-0 text-xs">{detail(row)}</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {relativeTimeEs(row.since.toISOString(), nowMs)}
                    </span>
                    {actions(row)}
                  </div>
                </li>
              ))}
            </ul>
          }
        />
      )}

      <Pager
        label="Paginación de lo sin cobrar"
        page={current}
        total={filtered.length}
        pageSize={PAGE_SIZE}
        onPageChange={changePage}
      />

      <StreetMoneyChargeDialog row={charging} onClose={() => setCharging(null)} />
      <StreetMoneyCancelTabDialog row={canceling} onClose={() => setCanceling(null)} />
    </section>
  )
}
