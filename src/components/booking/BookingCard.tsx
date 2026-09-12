'use client'

import React from 'react'
import { Plus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { gridSlotVisual, slotPendingCents } from '@/lib/booking/slot-visual'
import { holdExpiresAtIso, holdRemainingLabel } from '@/lib/booking/hold'
import { formatArs } from '@/lib/format'
import { useNowMsAfterHydration } from '@/hooks/use-now'
import type { GridBooking } from './BookingGrid'
import { quickPopoverSide, type QuickPopoverSide } from './grid/quick-popover-side'

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
   * El chip "Por cobrar hoy" está encendido y este turno es de los que deben
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
  courtId?: string
  courtName: string
  onSlotClick?: (courtId: string, slotTime: string) => void
  /** Panel lateral de detalle+acciones (solo slots ocupados): lo controla BookingGrid, uno a la vez. */
  detailOpen?: boolean
  onDetailChange?: (bookingId: string | null) => void
  /**
   * Alta rápida (Fase 3): si el caller devuelve contenido, la celda libre se
   * envuelve en un Popover anclado a ella misma y el click lo abre en vez de
   * ir directo al modal. Sin esto la celda se comporta como antes.
   */
  quickOpen?: boolean
  renderQuickForm?: () => React.ReactNode
  onQuickClose?: () => void
}

/** Posición explícita en la grilla CSS: rowOffset deja lugar a la columna de horas, la fila de headers y la banda de colapso. */
function placement(col: number, row: number, span: number, rowOffset: number): React.CSSProperties {
  return { gridColumn: col + 2, gridRow: `${row + rowOffset} / span ${span}` }
}

/**
 * El mapa canónico de estados vive en `@/lib/booking/slot-visual` desde Fase 3
 * — compartido con la leyenda de la grilla y con el listado de /reservas, que
 * antes tenían cada uno su copia a mano (y ya habían divergido en los tintes).
 *
 * La regla de lectura no cambió (pages/grilla.md §2, MASTER §2.6): el COLOR
 * comunica el estado de la plata, el ÍCONO + label comunican qué es.
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
  courtId,
  courtName,
  onSlotClick,
  detailOpen = false,
  onDetailChange,
  quickOpen = false,
  renderQuickForm,
  onQuickClose,
}: BookingCardProps) {
  // Se decide al tocar la celda, que es cuando se conoce dónde quedó en
  // pantalla. Ver quick-popover-side.ts.
  const [quickSide, setQuickSide] = React.useState<QuickPopoverSide>('right')

  if (!booking) {
    const interactive = !isPast && !!onSlotClick && !!courtId

    if (!interactive) {
      // Pasado: transparente, el eje ya marca la hora. Cancha pausada: gris
      // neutro no clickeable.
      return (
        <div
          aria-hidden
          style={placement(col, row, span, rowOffset)}
          className={cn('m-0.5 rounded-md', isPast ? 'bg-transparent' : 'bg-muted/40')}
        />
      )
    }

    // Libre: superficie card con borde (visible, no lavado emerald) + Plus
    // SIEMPRE visible al 40% — en touch no hay hover y la affordance no se
    // adivina (pages/grilla.md §2, desvío documentado de §2.6).
    const freeButton = (
      <button
        type="button"
        style={placement(col, row, span, rowOffset)}
        data-col={col}
        data-row={row}
        onClick={(e) => {
          if (renderQuickForm) {
            setQuickSide(
              quickPopoverSide(e.currentTarget.getBoundingClientRect(), window.innerWidth),
            )
          }
          onSlotClick?.(courtId!, timeStart)
        }}
        aria-label={`Reservar turno ${timeStart} en ${courtName}`}
        className={cn(
          'group m-0.5 flex cursor-pointer items-center justify-center rounded-md',
          'border border-border/60 bg-card',
          'hover:border-emerald-500 hover:bg-emerald-500/5 dark:hover:border-emerald-400',
          'transition-colors duration-150',
          'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          quickOpen && 'border-emerald-500 bg-emerald-500/5',
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

    if (!renderQuickForm) return freeButton

    // El Popover se ancla a la celda: el admin ve el formulario donde tocó, sin
    // perder de vista la grilla. `Root` sin contenido montado cuesta un contexto
    // por celda; el `Content` sólo se portaliza cuando está abierto.
    return (
      <Popover open={quickOpen} onOpenChange={(v) => !v && onQuickClose?.()}>
        <PopoverTrigger asChild>{freeButton}</PopoverTrigger>
        <PopoverContent
          align="start"
          side={quickSide}
          sideOffset={6}
          collisionPadding={12}
          className="w-auto p-3"
        >
          {renderQuickForm()}
        </PopoverContent>
      </Popover>
    )
  }

  const visual = gridSlotVisual(booking)
  const pendingCents = slotPendingCents(booking)
  const displayName = bookingDisplayName(booking)
  const StateIcon = visual.icon

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
      aria-label={`${courtName} ${timeStart}–${booking.timeEnd}: ${displayName ? `${displayName}, ${visual.label}` : visual.label}${pendingCents !== null ? `, falta cobrar ${formatArs(pendingCents)}` : ''}`}
      className={cn(
        'm-0.5 flex cursor-pointer overflow-hidden rounded-md border-l-[3px] text-left',
        visual.cell,
        visual.borderL,
        // La alarma NO se atenúa con isPast: un turno sin cobrar es pasado por
        // definición, y apagarlo sería apagar justo lo que pide atención.
        isPast && !visual.alarm && 'opacity-90 saturate-50',
        visual.alarm && 'slot-alarm-ring',
        isNew && 'animate-slot-pulse',
        spotlighted && 'ring-2 ring-inset ring-destructive/70',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      )}
    >
      {/* DOS líneas, nunca tres. El saldo era una tercera línea que en una fila
          de 52 px se recortaba; ahora va al costado del nombre, en el color del
          estado y en negrita — que es lo que se busca de lejos en una matriz de
          7 canchas. */}
      {/* Dos renglones, nunca tres, en los dos tamaños. Lo que cambia con el
          ancho es QUÉ va en el segundo: en escritorio el monto entra al lado del
          nombre y abajo queda el rótulo del estado; en la columna de 44 px del
          teléfono el monto no entra arriba, así que baja y desplaza al rótulo —
          que el color y el ícono ya comunican. El ancho se resuelve por CSS y no
          por un hook de viewport: así no hay un cuadro con la tipografía del
          tamaño equivocado antes de que el hook responda. */}
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-1 py-1 lg:px-2 lg:py-1.5">
        <span className="flex min-w-0 flex-col gap-1.5 lg:flex-row lg:items-baseline lg:justify-between">
          <span className="truncate text-[11px] font-semibold leading-tight text-foreground lg:text-[13px]">
            {displayName ?? ' '}
          </span>
          {pendingCents !== null && (
            <span
              className={cn(
                'hidden shrink-0 whitespace-nowrap text-[13px] font-bold leading-tight tabular-nums lg:inline',
                visual.labelText,
              )}
            >
              {formatArs(pendingCents)}
            </span>
          )}
        </span>
        <span
          className={cn(
            'flex min-w-0 items-center gap-1 text-[10px] font-semibold leading-tight lg:text-[11px]',
            visual.labelText,
          )}
        >
          <StateIcon aria-hidden className="h-3 w-3 shrink-0" />
          {pendingCents !== null && (
            <span className="truncate tabular-nums lg:hidden">{formatArs(pendingCents)}</span>
          )}
          <span className={cn('truncate', pendingCents !== null && 'hidden lg:inline')}>
            {visual.label}
          </span>
          {booking.status === 'pending_payment' && booking.createdAt && (
            <HoldCountdown createdAt={booking.createdAt} />
          )}
        </span>
      </span>
    </button>
  )
}

export const BookingCard = React.memo(BookingCardComponent)
