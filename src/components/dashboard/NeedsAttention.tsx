import Link from 'next/link'
import { Undo2, XCircle } from 'lucide-react'
import { TONE_BADGE, TONE_BORDER, TONE_TINT, type StatusTone } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { formatArs, relativeTimeEs } from '@/lib/format'
import type { AttentionItem } from '@/modules/home/home.types'

/**
 * Tono por alerta = ESTADO DE LA PLATA, no severidad genérica: ámbar es plata
 * que está trabada en las dos direcciones — la que el complejo debe devolver y
 * la seña que el jugador no llegó a pagar. El turno jugado sin cobrar (que era
 * la fila roja) salió de acá el 2026-09-19: se cobra desde el tablero "Turnos
 * de hoy", que es donde está el cliente esperando en el mostrador.
 */
const TONE_BY_KIND: Record<AttentionItem['kind'], StatusTone> = {
  pending_refunds: 'warning',
  failed_deposit: 'warning',
}

const ICON_BY_KIND = {
  failed_deposit: XCircle,
  pending_refunds: Undo2,
} as const

/** Renglón principal: quién y dónde, o cuántas devoluciones y por cuánto. */
function headlineFor(item: AttentionItem): string {
  switch (item.kind) {
    case 'failed_deposit':
      return `${item.contactName} · ${item.courtName}`
    case 'pending_refunds':
      return item.count === 1
        ? `1 devolución pendiente · ${formatArs(item.totalCents)}`
        : `${item.count} devoluciones pendientes · ${formatArs(item.totalCents)}`
  }
}

/**
 * Segundo renglón: qué pasa y DESDE CUÁNDO. `since` ya llegaba en los tres
 * kinds y solo se usaba para ordenar (`sortAttentionItems`); pintarlo es lo
 * que deja ver de un vistazo si la seña se cayó recién o hace seis horas, que
 * es lo que decide si hay que llamar al jugador. Mismo helper que ya usan
 * `/caja/deudas` y `/caja/devoluciones`.
 */
function subtitleFor(item: AttentionItem, nowMs: number): string {
  const ago = relativeTimeEs(item.since.toISOString(), nowMs)
  switch (item.kind) {
    case 'failed_deposit':
      return `Seña rechazada · ${ago}`
    case 'pending_refunds':
      return `La más vieja, ${ago}`
  }
}

function actionFor(item: AttentionItem): { label: string; href: string } {
  switch (item.kind) {
    case 'failed_deposit':
      return { label: 'Ver reserva', href: `/reservas/${item.bookingId}` }
    // "Gestionar" no decía a dónde llevaba y era el único botón de la pantalla
    // que no nombraba su destino.
    case 'pending_refunds':
      return { label: 'Ver devoluciones', href: '/caja/cuentas' }
  }
}

/**
 * "Necesita tu atención" (Fase 2, contrato §4.1 + taxonomía
 * docs/decisions/2026-08-02-taxonomia-alertas-hoy.md): SOLO las anomalías de
 * la lista cerrada, cada una con su acción al lado.
 *
 * Va PRIMERO en la pantalla desde el rediseño del 2026-09-12: es el único
 * bloque que exige hacer algo, y estaba en el medio de dos bloques de lectura
 * (MASTER §9, serial position: lo crítico primero o último, nunca en el
 * medio). A las 17:00, con el cliente parado en el mostrador, el botón de
 * cobrar tiene que caer bajo el pulgar sin scrollear.
 *
 * Vacío no dibuja nada (decisión del dueño, 2026-09-24). Antes era una línea
 * verde, "Nada pendiente…", que ocupaba el primer renglón de la pantalla del
 * mostrador para decir "todo en orden" justo arriba de los turnos por cobrar
 * del tablero: dos mensajes que se contradecían a la vista.
 */
export function NeedsAttention({ items, nowMs }: { items: AttentionItem[]; nowMs: number }) {
  if (items.length === 0) return null

  return (
    <section aria-labelledby="atencion-titulo" className="card-premium overflow-hidden rounded-2xl">
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h2 id="atencion-titulo" className="text-base font-semibold text-foreground">
          Necesita tu atención
        </h2>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {items.length === 1 ? '1 pendiente' : `${items.length} pendientes`}
        </span>
      </header>

      <ul className="divide-y divide-border">
        {items.map((item) => {
          const Icon = ICON_BY_KIND[item.kind]
          const tone = TONE_BY_KIND[item.kind]
          const action = actionFor(item)
          const headline = headlineFor(item)
          // `pending_refunds` no tiene bookingId —es agregado— y además es
          // único por render, así que su propio kind alcanza.
          const key = 'bookingId' in item ? item.bookingId : item.kind
          return (
            <li
              key={key}
              className={cn(
                'flex flex-wrap items-center gap-x-3.5 gap-y-3 border-l-[3px] py-3 pl-[13px] pr-4 sm:pl-[17px] sm:pr-5',
                TONE_BORDER[tone],
                TONE_TINT[tone],
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  TONE_BADGE[tone],
                )}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>

              <div className="min-w-0 flex-[1_1_220px]">
                <p className="text-sm font-semibold leading-tight text-foreground">{headline}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{subtitleFor(item, nowMs)}</p>
              </div>

              {/* En 375px el botón toma el ancho completo en su propio renglón
                  (el `flex-wrap` del `li`); de `sm` para arriba vuelve a la
                  derecha de la fila. 44px de alto en los dos casos. */}
              <Link
                href={action.href}
                className="flex min-h-11 w-full shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
              >
                {action.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
