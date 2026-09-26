'use client'

import React from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { gridMoneyVisual } from '@/lib/booking/slot-visual'
import { TONE_BORDER, TONE_TEXT, TONE_TINT } from '@/lib/status-tone'
import { holdExpiresAtIso, holdRemainingLabel } from '@/lib/booking/hold'
import { formatArs } from '@/lib/format'
import { useNowMsAfterHydration } from '@/hooks/use-now'
import type { GridBooking } from './BookingGrid'

/** Un tick por segundo: el contador muestra mm:ss. */
const ONE_SECOND = 1000

type BookingCardProps = {
  booking: GridBooking | null
  timeStart: string
  isPast: boolean
  /** Índice 0-based de la cancha (columna) y del slot horario VISIBLE (fila). */
  col: number
  row: number
  span?: number
  /** Fila de arranque de los slots en el CSS Grid: 2 sin banda de colapso, 3 con ella. */
  rowOffset?: number
  /**
   * El chip "N sin cobrar" está encendido y este turno es de los que deben
   * plata: se le pone un anillo para encontrarlo en una matriz llena. No es un
   * estado del turno — es el foco de la pantalla.
   *
   * Resalta lo que importa en vez de apagar el resto: bajarle la opacidad a las
   * demás celdas hunde el contraste del texto por debajo de AA (los tokens de
   * color están calibrados justo arriba del mínimo y cualquier `/N` los diluye).
   */
  spotlighted?: boolean
  /** Pulso de atención (MASTER §5.3): la reserva acaba de entrar por Realtime. */
  isNew?: boolean
  /**
   * ¿Ya terminó este turno? (`hasBookingEnded`, GridScroller). Solo cambia algo
   * para `confirmed`: con `pending>0` y `ended`, la celda pasa a "No cobrado"
   * aunque el auto-complete todavía no lo pasó a `completed` (tarda ~30 min).
   * Default `false`: un slot libre no tiene turno que terminar.
   */
  ended?: boolean
  courtId?: string
  courtName: string
  onSlotClick?: (courtId: string, slotTime: string) => void
  /** Panel lateral de detalle+acciones (solo slots ocupados): lo controla BookingGrid, uno a la vez. */
  detailOpen?: boolean
  onDetailChange?: (bookingId: string | null) => void
}

/** Posición explícita en la grilla CSS: rowOffset deja lugar a la columna de horas, la fila de headers y la banda de colapso. */
function placement(col: number, row: number, span: number, rowOffset: number): React.CSSProperties {
  return { gridColumn: col + 2, gridRow: `${row + rowOffset} / span ${span}` }
}

/**
 * El mapa de estados de esta celda (`gridMoneyVisual`) vive en
 * `@/lib/booking/slot-visual` — compartido con `GridLegend`. Variante "Entra
 * entera" (decisión del dueño, 2026-09-25): el COLOR es SOLO de la plata
 * (rojo lo jugado y no cobrado, verde lo pagado entero, el resto sin color);
 * el ÍCONO + label comunican qué es.
 */

/**
 * Cuánto le queda al hold, en la celda de la grilla del staff (B15 / decisión
 * v2 D1: "marca «pagando ahora» en la grilla del staff").
 *
 * Es un componente propio, y no un valor calculado arriba, para que el reloj
 * se suscriba SOLO mientras hay un hold en pantalla: la grilla de un sábado
 * tiene decenas de celdas y ninguna otra necesita tickear.
 *
 * Sin esto el encargado leía "Esperando seña" sin saber si faltaban 10
 * segundos o si el jugador ya había abandonado — o sea, si atender el teléfono
 * del que llama por esa cancha o hacerlo esperar.
 */
function HoldCountdown({ createdAt }: { createdAt: string | Date }) {
  // `0` hasta hidratar, igual que `ExpiryCountdown`. Antes arrancaba con
  // `useState(() => Date.now())`: el servidor pintaba mm:ss con SU reloj y el
  // cliente hidrataba con el suyo, así que el texto casi nunca coincidía y
  // React tiraba "Hydration failed" y regeneraba la grilla ENTERA en el
  // navegador cada vez que había una seña en curso a la vista.
  const nowMs = useNowMsAfterHydration(ONE_SECOND)
  if (nowMs === 0) {
    return (
      <span aria-hidden="true" className="tabular-nums whitespace-nowrap">
        –:––
      </span>
    )
  }

  const heldUntil = holdExpiresAtIso(createdAt)
  const remaining = holdRemainingLabel(heldUntil, nowMs)
  // Vencido por reloj: la fila sigue reteniendo la cancha hasta que la barre el
  // worker, así que no se dice "libre".
  //
  // `whitespace-nowrap`: "liberando…" es mucho más largo que el "4:32" que
  // reemplaza, y sin esto se va a una segunda línea. La celda entonces se leía
  // "Esperando seña / liberando…", como si fueran dos estados a la vez y con el
  // segundo en minúscula. Prefiere recortar el contador antes que partirlo.
  return (
    <span className="tabular-nums whitespace-nowrap">
      {remaining.expired ? 'liberando…' : remaining.label}
    </span>
  )
}

const DISPLAY_NAME_MAX_LENGTH = 24

/**
 * Corta en el límite de palabra y marca el corte con "…" (H058): antes cortaba
 * a lo bruto en 24 chars y un nombre largo terminaba en un fragmento roto tipo
 * "Reserva sin confirmar (h" — sin nada que avise que se cortó.
 */
function truncateDisplayName(name: string): string {
  if (name.length <= DISPLAY_NAME_MAX_LENGTH) return name
  const cut = name.slice(0, DISPLAY_NAME_MAX_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`
}

function bookingDisplayName(booking: GridBooking): string | null {
  if (booking.guestName) return truncateDisplayName(booking.guestName)
  if (booking.playerFirstName) {
    return truncateDisplayName(`${booking.playerFirstName} ${booking.playerLastName ?? ''}`.trim())
  }
  return null
}

function BookingCardComponent({
  booking,
  timeStart,
  isPast,
  col,
  row,
  span = 1,
  rowOffset = 2,
  spotlighted = false,
  isNew = false,
  ended = false,
  courtId,
  courtName,
  onSlotClick,
  detailOpen = false,
  onDetailChange,
}: BookingCardProps) {
  if (!booking) {
    const interactive = !isPast && !!onSlotClick && !!courtId

    if (!interactive) {
      // Pasado: transparente, el eje ya marca la hora. Cancha pausada: gris
      // neutro no clickeable. Solo las líneas de la hoja (variante "Entra
      // entera"): la celda libre dejó de ser una cajita con borde propio.
      return (
        <div
          aria-hidden
          style={placement(col, row, span, rowOffset)}
          className={cn(
            'border-b border-l border-border/60',
            isPast ? 'bg-transparent' : 'bg-muted/20',
          )}
        />
      )
    }

    // Libre: SOLO las líneas de la hoja + Plus SIEMPRE visible al 40% — en
    // touch no hay hover y la affordance no se adivina (pages/grilla.md §2,
    // desvío documentado de §2.6). El click abre DIRECTO el modal de alta
    // (§3bis): no hay superficie intermedia. Sin margen ni card propia: toda
    // la celda es el botón (44px tocable en el teléfono, MASTER §10).
    return (
      <button
        type="button"
        style={placement(col, row, span, rowOffset)}
        data-col={col}
        data-row={row}
        onClick={() => onSlotClick?.(courtId!, timeStart)}
        aria-label={`Reservar turno ${timeStart} en ${courtName}`}
        className={cn(
          'group flex h-full w-full cursor-pointer items-center justify-center',
          'border-b border-l border-border/60',
          'transition-colors duration-150 hover:bg-primary/5',
          'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        )}
      >
        <Plus
          aria-hidden
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors duration-150 lg:h-4 lg:w-4',
            'group-hover:text-emerald-600 group-focus-visible:text-emerald-600',
            'dark:group-hover:text-emerald-400 dark:group-focus-visible:text-emerald-400',
          )}
        />
      </button>
    )
  }

  // El color es de la plata (variante "Entra entera", decisión del dueño
  // 2026-09-25): `gridMoneyVisual`, NO `gridSlotVisual` (esa sigue viva para
  // el modal de cobro de Hoy). `started` = `isPast` de la fila propia del
  // turno: como el turno solo renderiza UNA celda (en su slot de inicio),
  // `isPast` de ESTE render es exactamente "¿ya empezó?".
  const visual = gridMoneyVisual({ ...booking, ended, started: isPast })
  const displayName = bookingDisplayName(booking)
  const StateIcon = visual.icon
  const hasAmount = visual.amountCents !== null
  // Corto = monto pelado siempre; largo agrega "Falta" solo si hubo pago
  // parcial (los estados sin monto usan el propio label en las dos
  // variantes, ej. "Bloqueado", "Pagado").
  const money = hasAmount
    ? {
        short: formatArs(visual.amountCents!),
        long: visual.partial
          ? `Falta ${formatArs(visual.amountCents!)}`
          : formatArs(visual.amountCents!),
      }
    : { short: visual.label, long: visual.label }
  // Tinte + borde de color solo en rojo/verde/ámbar; lo neutral usa la receta
  // fija de la hoja (DESIGN.md §Grilla de turnos).
  const colored = visual.tone !== 'neutral'

  // Click/tap/Enter abre el panel lateral (Fase 3) con el detalle Y las
  // acciones. Antes esto abría un popover de sólo-lectura por hover: se sacó
  // porque hover no existe en touch (el mostrador usa tablet) y porque mirar
  // sin poder cobrar obligaba a irse a /reservas con alguien esperando.
  // El panel lo renderiza BookingGrid, uno solo para toda la grilla.
  //
  // La hora NO se repite en la celda: el eje sticky es la única fuente; el
  // rango completo vive en el aria-label y en el panel.
  return (
    <button
      type="button"
      style={placement(col, row, span, rowOffset)}
      data-col={col}
      data-row={row}
      onClick={() => onDetailChange?.(booking.id)}
      aria-haspopup="dialog"
      aria-expanded={detailOpen}
      // El sufijo "falta cobrar" se mantiene literal (no `money.long`, que
      // solo dice "Falta" con pago parcial): un lector de pantalla necesita
      // el verbo, no solo el número.
      aria-label={`${courtName} ${timeStart}–${booking.timeEnd}: ${displayName ? `${displayName}, ${visual.label || 'confirmada'}` : visual.label || 'confirmada'}${hasAmount ? `, falta cobrar ${formatArs(visual.amountCents!)}` : ''}`}
      className={cn(
        // `bg-card` abajo y el tinte en el `<span>` de adentro: los tintes son
        // translúcidos, y sobre la grilla la línea de "ahora" (que pasa por
        // DEBAJO de las tarjetas) se veía a través de ellas tachando nombres.
        'relative m-[3px] flex min-w-0 cursor-pointer overflow-hidden rounded-md border-l-[3px] bg-card text-left',
        'transition-shadow hover:shadow-md',
        colored ? TONE_BORDER[visual.tone] : 'border-l-slate-400 dark:border-l-slate-500',
        isNew && 'animate-slot-pulse',
        // Anillo rojo sólido, el tono de "No cobrado": el chip que lo enciende
        // es rojo y lo que marca es plata pendiente. Sin `/N`: el token está
        // calibrado para el contraste de 3:1 de un borde.
        spotlighted && 'ring-2 ring-inset ring-destructive',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      )}
    >
      {/* El contenedor de la consulta por ancho es este `<span>` y no el
          `<button>`: sobre un botón Chrome no aplica `container-type`. */}
      <span
        className={cn(
          '@container flex min-w-0 flex-1 flex-col justify-between px-1 py-[3px] lg:px-1.5 lg:py-1',
          visual.striped && 'slot-blocked-stripes',
          colored ? TONE_TINT[visual.tone] : 'bg-secondary/50 dark:bg-secondary',
        )}
      >
        <span
          lang="es"
          className="truncate text-xs leading-[1.2] font-semibold text-foreground @min-[3.5rem]:line-clamp-2 @min-[3.5rem]:whitespace-normal @min-[3.5rem]:hyphens-auto @min-[8.5rem]:text-sm"
        >
          {displayName ?? ' '}
        </span>
        {/* Un bloqueo de 2 h no es un evento: ya lo dice el rayado. */}
        {span > 1 && booking.type !== 'block' && (
          <span className="hidden text-xs text-muted-foreground @min-[4.5rem]:block">
            Evento · {span} h
          </span>
        )}
        <span
          className={cn(
            'flex min-w-0 items-center gap-1 text-xs font-semibold tabular-nums',
            colored ? TONE_TEXT[visual.tone] : 'text-muted-foreground',
          )}
        >
          {/* Angosta: si hay plata, la plata (en su color) le gana el lugar al ícono. */}
          {StateIcon && (
            <StateIcon
              aria-hidden
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                hasAmount && '@min-[3.75rem]:hidden @min-[7rem]:block',
              )}
            />
          )}
          <span className="hidden truncate @min-[3.75rem]:inline @min-[7rem]:hidden">
            {money.short}
          </span>
          <span className="hidden truncate @min-[7rem]:inline">{money.long}</span>
          {booking.status === 'pending_payment' && booking.createdAt && (
            <HoldCountdown createdAt={booking.createdAt} />
          )}
        </span>
      </span>
    </button>
  )
}

export const BookingCard = React.memo(BookingCardComponent)
