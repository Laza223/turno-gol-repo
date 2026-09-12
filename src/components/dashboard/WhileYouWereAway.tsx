'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarPlus, ChevronDown, HandCoins, XCircle } from 'lucide-react'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { WhileAwayItem } from '@/modules/home/home.types'

const ART_TZ = 'America/Argentina/Buenos_Aires'

function clockLabel(at: Date): string {
  return at.toLocaleTimeString('es-AR', { timeZone: ART_TZ, hour: '2-digit', minute: '2-digit' })
}

function lineFor(item: WhileAwayItem): string {
  switch (item.kind) {
    case 'booking_online':
      return `Reserva online — ${item.courtName} ${item.timeLabel}`
    case 'cancellation':
      return `Cancelación — ${item.courtName} ${item.timeLabel}`
    case 'deposit_paid':
      return `Seña acreditada — ${formatArs(item.amountCents)}`
  }
}

const ICON_BY_KIND = {
  booking_online: CalendarPlus,
  cancellation: XCircle,
  deposit_paid: HandCoins,
} as const

/**
 * El encabezado contesta la pregunta sin desplegar nada: "2 reservas online ·
 * 1 seña acreditada · 1 cancelación" es lo que el dueño necesita a las 9:00, y
 * el detalle solo si algo de eso le llamó la atención. Los tres conteos salen
 * de los propios ítems, no de una query nueva.
 */
function summaryFor(items: WhileAwayItem[]): string {
  if (items.length === 0) return 'Nada nuevo desde la última vez.'
  const counts = { booking_online: 0, deposit_paid: 0, cancellation: 0 }
  for (const item of items) counts[item.kind] += 1
  const parts: string[] = []
  if (counts.booking_online > 0) {
    parts.push(
      counts.booking_online === 1 ? '1 reserva online' : `${counts.booking_online} reservas online`,
    )
  }
  if (counts.deposit_paid > 0) {
    parts.push(
      counts.deposit_paid === 1 ? '1 seña acreditada' : `${counts.deposit_paid} señas acreditadas`,
    )
  }
  if (counts.cancellation > 0) {
    parts.push(counts.cancellation === 1 ? '1 cancelación' : `${counts.cancellation} cancelaciones`)
  }
  return parts.join(' · ')
}

/**
 * "Mientras no estabas" (Fase 2, contrato §4.1): feed de lo que pasó sin el
 * admin — reservas online entrantes (el momento-magia: "el sistema vendió
 * por vos"), cancelaciones, señas acreditadas. Sin Realtime ni polling en v1
 * (mismo criterio que el resto de Hoy): server-render por request.
 *
 * Desde el rediseño del 2026-09-12 llega PLEGADO en teléfono, donde es el
 * bloque que menos urge y el que más alto ocupa. En escritorio arranca
 * abierto porque sobra lugar y cerrarlo sería esconder algo sin motivo.
 */
export function WhileYouWereAway({ items }: { items: WhileAwayItem[] }) {
  const isDesktop = useIsDesktop()
  const [override, setOverride] = useState<boolean | null>(null)
  const hasItems = items.length > 0
  // El default DEPENDE del viewport, así que no puede congelarse en el
  // `useState` inicial: se deriva en cada render y el estado guarda sólo la
  // decisión explícita del usuario.
  const open = override ?? (isDesktop && hasItems)

  // Mientras el usuario no tocó el botón, **la visibilidad la decide CSS**, no
  // este estado. `useIsDesktop` responde `true` durante el render del servidor
  // y toda la hidratación (`getServerSnapshot`), así que derivar de él el
  // `display` haría que en el teléfono la lista naciera ABIERTA y se plegara
  // sola un frame después — justo el parpadeo que el diseño quiere evitar.
  // Con `hidden lg:block` el HTML del servidor ya sale correcto en los dos
  // tamaños, sin JavaScript de por medio.
  const listVisibility = override === null ? 'hidden lg:block' : override ? 'block' : 'hidden'

  return (
    <section aria-labelledby="away-titulo" className="card-premium overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        // Sin eventos no se monta ninguna lista, así que apuntar al id sería
        // una referencia colgada — `aria-valid-attr-value` de axe.
        aria-controls={hasItems ? 'away-lista' : undefined}
        disabled={!hasItems}
        className="flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring enabled:hover:bg-accent/50 sm:px-5"
      >
        <h2 id="away-titulo" className="text-base font-semibold text-foreground">
          Mientras no estabas
        </h2>
        <span className="min-w-0 flex-[1_1_180px] text-sm text-muted-foreground">
          {summaryFor(items)}
        </span>
        {hasItems && (
          <ChevronDown
            className={cn(
              'h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform duration-200',
              // Mismo criterio que la lista: hasta que el usuario decide, la
              // rotación la marca el breakpoint y no el estado hidratado.
              override === null ? 'lg:rotate-180' : override && 'rotate-180',
            )}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Con eventos la lista se monta SIEMPRE y se oculta con `display:none`:
          así el `aria-controls` del botón nunca apunta a un id inexistente
          mientras está plegada, y los links quedan fuera de las queries por rol
          y del orden de tabulación, que es lo que se quiere. */}
      {hasItems && (
        <ul
          id="away-lista"
          className={cn('divide-y divide-border border-t border-border', listVisibility)}
        >
          {items.map((item) => {
            const Icon = ICON_BY_KIND[item.kind]
            return (
              <li key={`${item.kind}-${item.bookingId}`}>
                <Link
                  href={`/reservas/${item.bookingId}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-2 hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {lineFor(item)}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {clockLabel(item.at)}
                  </span>
                  <span className="max-w-28 shrink-0 truncate text-xs text-muted-foreground">
                    {item.contactName}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
