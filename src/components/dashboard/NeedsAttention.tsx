import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Undo2, XCircle } from 'lucide-react'
import { TONE_BADGE, TONE_BORDER, TONE_TINT, type StatusTone } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { formatArs, relativeTimeEs } from '@/lib/format'
import type { AttentionItem } from '@/modules/home/home.types'

/** Copy exacto del contrato (verbatim, nunca parafraseado) — un componente
 * reusable no puede importar VALORES del dominio (solo tipos), así que este
 * literal se mantiene igual a `ATTENTION_EMPTY_COPY` en
 * `@/modules/home/home.lib` a mano; `home.lib.test.ts` es la fuente de
 * verdad que lo verifica contra el contrato. */
const ATTENTION_EMPTY_COPY = 'Nada pendiente. Todo cobrado y cerrado.'

/**
 * Tono por alerta = ESTADO DE LA PLATA, no severidad genérica. Rojo es plata
 * que el complejo tendría que tener y no tiene (turno jugado sin cobrar);
 * ámbar es plata que está trabada en las dos direcciones — la que el complejo
 * debe devolver y la seña que el jugador no llegó a pagar. Antes las tres
 * filas eran idénticas con un ícono ámbar igual para todas, así que la única
 * que exige plata ya no se distinguía de un aviso de higiene.
 */
const TONE_BY_KIND: Record<AttentionItem['kind'], StatusTone> = {
  unpaid_completed_booking: 'destructive',
  pending_refunds: 'warning',
  failed_deposit: 'warning',
}

const ICON_BY_KIND = {
  unpaid_completed_booking: AlertTriangle,
  failed_deposit: XCircle,
  pending_refunds: Undo2,
} as const

/** Renglón principal: quién y dónde. El rango horario va aparte para que no se
 *  parta al medio en 375px (`whitespace-nowrap` sobre el `<span>`). */
function headlineFor(item: AttentionItem): { text: string; timeLabel?: string } {
  switch (item.kind) {
    case 'unpaid_completed_booking':
      return { text: `${item.contactName} · ${item.courtName}`, timeLabel: item.timeLabel }
    case 'failed_deposit':
      return { text: `${item.contactName} · ${item.courtName}` }
    case 'pending_refunds':
      return {
        text:
          item.count === 1
            ? `1 devolución pendiente · ${formatArs(item.totalCents)}`
            : `${item.count} devoluciones pendientes · ${formatArs(item.totalCents)}`,
      }
  }
}

/**
 * Segundo renglón: qué pasa y DESDE CUÁNDO. `since` ya llegaba en los tres
 * kinds y solo se usaba para ordenar (`sortAttentionItems`); pintarlo es lo
 * que deja ver de un vistazo si el turno sin cobrar es de recién o de hace
 * seis horas, que es exactamente lo que decide si hay que salir a buscar a
 * alguien. Mismo helper que ya usan `/caja/deudas` y `/caja/devoluciones`.
 */
function subtitleFor(item: AttentionItem, nowMs: number): string {
  const ago = relativeTimeEs(item.since.toISOString(), nowMs)
  switch (item.kind) {
    case 'unpaid_completed_booking':
      return `Jugada y sin cobrar · ${ago}`
    case 'failed_deposit':
      return `Seña rechazada · ${ago}`
    case 'pending_refunds':
      return `La más vieja, ${ago}`
  }
}

function actionFor(item: AttentionItem): { label: string; href: string } {
  switch (item.kind) {
    case 'unpaid_completed_booking':
      return {
        label: `Cobrar ${formatArs(item.pendingCents)}`,
        href: `/reservas/${item.bookingId}`,
      }
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
 * El vacío dejó de ser un `EmptyState` de 200px y pasó a ser una línea de
 * 44px: en los dos momentos del día en que el dueño abre esta pantalla casi
 * siempre está vacío, y una tarjeta vacía de ese tamaño empujaba el tablero
 * —lo que sí quiere ver— fuera de la primera pantalla del teléfono. El copy
 * se explica solo, así que no necesita el título arriba diciendo de qué está
 * vacío.
 */
export function NeedsAttention({ items, nowMs }: { items: AttentionItem[]; nowMs: number }) {
  if (items.length === 0) {
    return (
      <div
        role="status"
        className={cn(
          'flex min-h-11 items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm font-medium',
          TONE_BADGE.success,
        )}
      >
        <CheckCircle2 className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        <p>{ATTENTION_EMPTY_COPY}</p>
      </div>
    )
  }

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
                <p className="text-sm font-semibold leading-tight text-foreground">
                  {headline.text}
                  {headline.timeLabel && (
                    <>
                      {' · '}
                      <span className="whitespace-nowrap tabular-nums">{headline.timeLabel}</span>
                    </>
                  )}
                </p>
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
