import type { ReactNode } from 'react'
import { Check, Globe } from 'lucide-react'
import { BookingCard } from '@/components/booking/BookingCard'
import type { GridBooking } from '@/lib/booking/grid-cells'
import { formatArs } from '@/lib/format'
import { TONE_BADGE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { ExampleTag } from './ExampleTag'

/**
 * Los fragmentos de producto de /para-complejos. Todo lo que muestran es un
 * EJEMPLO (nombres, horarios y plata) y lo dicen: el dueño los lee como "así se
 * ve", nunca como datos de un complejo real. Lo que sí es real es el
 * vocabulario: la grilla usa la misma `BookingCard` del panel, así que sus
 * rótulos y colores son los que el dueño va a ver después.
 */

const PRICE_CENTS = 3_000_000
const PHONE_PRICE_CENTS = 1_500_000

const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold'

function PhoneRow({
  time,
  title,
  sub,
  children,
}: {
  time: string
  title: string
  sub: string
  children?: ReactNode
}) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2">
      <span className="w-11 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
        {time}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      {children}
    </div>
  )
}

function Paid() {
  return (
    <span className={cn(chip, TONE_BADGE.success)}>
      Cobrado <Check className="h-3 w-3" aria-hidden />
    </span>
  )
}

/** El celular del dueño con la pantalla Hoy del panel: entra una reserva, se cobra un turno y sube la caja. */
export function NochePhone() {
  return (
    <figure
      role="img"
      aria-label="Ejemplo: la pantalla Hoy del panel en el celular, con los turnos de la noche, una reserva online que entra, un cobro que se completa y la caja del día que sube"
      className="relative mx-auto w-full max-w-[340px] lg:max-w-[380px]"
    >
      <div
        aria-hidden
        className="hero-glow-blob pointer-events-none absolute -inset-6 -z-10 opacity-70 sm:-inset-16"
      />
      <div className="mockup-card rounded-[2.25rem] p-2.5">
        <div className="overflow-hidden rounded-[1.75rem] bg-background" aria-hidden>
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="font-display text-xl font-black italic leading-none text-foreground">
              Hoy
            </span>
            <ExampleTag />
          </div>
          <div className="divide-y divide-border">
            <PhoneRow time="19:00" title="Diego F. · Fijo" sub="Cancha 1">
              <Paid />
            </PhoneRow>
            <PhoneRow time="20:00" title="Nico P." sub="Cancha 2">
              <span className="grid justify-items-end">
                <span
                  className={cn(
                    chip,
                    TONE_BADGE.warning,
                    'tg-noche-out col-start-1 row-start-1 whitespace-nowrap',
                  )}
                >
                  Falta {formatArs(PHONE_PRICE_CENTS)}
                </span>
                <span className="tg-noche-in col-start-1 row-start-1">
                  <Paid />
                </span>
              </span>
            </PhoneRow>
            <PhoneRow time="21:00" title="Seba L." sub="Cancha 1">
              <Paid />
            </PhoneRow>
            <div className="relative">
              <PhoneRow time="22:00" title="Libre" sub="Cancha 2" />
              <div className="tg-noche-new absolute inset-0 bg-background">
                <PhoneRow time="22:00" title="Nueva reserva · online" sub="Cancha 2">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                      TONE_BADGE.info,
                    )}
                  >
                    <Globe className="h-4 w-4" />
                  </span>
                </PhoneRow>
              </div>
              <div className="tg-noche-ring pointer-events-none absolute inset-1 rounded-xl border-2 border-emerald-400" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-4">
            <span className="text-sm font-medium text-muted-foreground">Caja de hoy</span>
            <span className="grid justify-items-end font-display text-[28px] font-bold leading-none tabular-nums tracking-[-0.03em] text-foreground">
              <span className="tg-noche-out col-start-1 row-start-1">{formatArs(7_500_000)}</span>
              <span className="tg-noche-in col-start-1 row-start-1 text-emerald-300">
                {formatArs(9_000_000)}
              </span>
            </span>
          </div>
        </div>
      </div>
    </figure>
  )
}

const HOURS = ['19:00', '20:00', '21:00', '22:00'] as const
const COURTS = ['Cancha 1', 'Cancha 2'] as const

function exampleBooking(
  id: string,
  court: number,
  timeStart: string,
  timeEnd: string,
  over: Partial<GridBooking>,
): GridBooking {
  return {
    id,
    courtId: `c${court}`,
    date: '2026-01-01',
    timeStart,
    timeEnd,
    status: 'confirmed',
    type: 'spontaneous',
    guestName: null,
    playerFirstName: null,
    playerLastName: null,
    priceSnapshot: PRICE_CENTS,
    totalPaid: 0,
    pending: PRICE_CENTS,
    ...over,
  }
}

/** [cancha, hora] → turno de ejemplo; lo que no está, queda libre. */
const GRID_BOOKINGS: Record<string, GridBooking> = {
  '0-19:00': exampleBooking('g1', 1, '19:00', '20:00', {
    type: 'fixed',
    playerFirstName: 'Diego',
    playerLastName: 'F.',
    totalPaid: PRICE_CENTS,
    pending: 0,
  }),
  '1-20:00': exampleBooking('g2', 2, '20:00', '21:00', {
    playerFirstName: 'Nico',
    playerLastName: 'P.',
    totalPaid: PRICE_CENTS / 2,
    pending: PRICE_CENTS / 2,
  }),
  '0-21:00': exampleBooking('g3', 1, '21:00', '22:00', {
    playerFirstName: 'Seba',
    playerLastName: 'L.',
    totalPaid: PRICE_CENTS,
    pending: 0,
  }),
  '1-22:00': exampleBooking('g4', 2, '22:00', '23:00', {
    type: 'fixed',
    playerFirstName: 'Juan',
    playerLastName: 'M.',
  }),
}

/**
 * Un pedazo de la Grilla del panel con la `BookingCard` real. `inert`:
 * son botones del panel, acá no abren nada ni reciben foco.
 */
export function GridFragment() {
  return (
    <figure
      role="img"
      aria-label="Ejemplo de la grilla del panel: turnos fijos, turnos cobrados y lo que falta cobrar en cada cancha"
      className="card-premium overflow-hidden rounded-2xl"
    >
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
        <span className="text-sm font-medium text-muted-foreground">Grilla · Hoy</span>
        <ExampleTag />
      </div>
      <div
        inert
        aria-hidden
        className="grid grid-cols-[56px_repeat(2,minmax(0,1fr))] grid-rows-[36px_repeat(4,60px)] border-t border-border"
      >
        {COURTS.map((c, i) => (
          <div
            key={c}
            style={{ gridColumn: i + 2, gridRow: 1 }}
            className="flex items-center border-l border-border/60 px-2 text-xs font-semibold text-foreground"
          >
            {c}
          </div>
        ))}
        {HOURS.map((h, row) => (
          <div
            key={h}
            style={{ gridColumn: 1, gridRow: row + 2 }}
            className="border-b border-border/60 px-2 pt-1 text-xs tabular-nums text-muted-foreground"
          >
            {h}
          </div>
        ))}
        {HOURS.flatMap((h, row) =>
          COURTS.map((c, col) => (
            <BookingCard
              key={`${col}-${h}`}
              booking={GRID_BOOKINGS[`${col}-${h}`] ?? null}
              timeStart={h}
              isPast={false}
              col={col}
              row={row}
              courtName={c}
            />
          )),
        )}
        <div
          style={{ gridColumn: 3, gridRow: 5 }}
          className="tg-noche-pulse pointer-events-none m-0.5 rounded-lg border-2 border-emerald-400"
        />
      </div>
    </figure>
  )
}
