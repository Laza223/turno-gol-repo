import { ArrowRight, Link2, Wallet } from 'lucide-react'
import { BookingCard } from '@/components/booking/BookingCard'
import type { GridBooking } from '@/lib/booking/grid-cells'
import { formatArs } from '@/lib/format'
import { TONE_BADGE, TONE_TEXT } from '@/lib/status-tone'
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
/** 30 %: el `deposit_percentage` por defecto de un complejo nuevo. */
const DEPOSIT_CENTS = 900_000

const slotPill =
  'inline-flex h-10 min-w-16 items-center justify-center rounded-full border-[1.5px] border-emerald-400 px-2.5 text-base font-semibold tabular-nums text-foreground'

/** El celular del jugador en la página de un complejo, con el turno elegido y la seña por pagar. */
export function SenaPhone() {
  return (
    <figure
      role="img"
      aria-label={`Ejemplo: la página de un complejo en el celular del jugador, con el turno de las 20:00 elegido y una seña de ${formatArs(DEPOSIT_CENTS)} para pagar por MercadoPago`}
      className="relative mx-auto w-full max-w-[340px]"
    >
      <div
        aria-hidden
        className="hero-glow-blob pointer-events-none absolute -inset-6 -z-10 opacity-70 sm:-inset-16"
      />
      <div className="mockup-card rounded-[2.25rem] p-2.5">
        <div className="overflow-hidden rounded-[1.75rem] bg-background" aria-hidden>
          <div className="border-b border-border px-4 py-2.5 text-center text-xs text-muted-foreground">
            turnogol.app/tu-complejo
          </div>
          <div className="px-4 pt-5">
            <p className="font-display text-[28px] font-black italic leading-none tracking-[-0.02em] text-foreground">
              Tu complejo
            </p>
            <p className="mt-2 text-sm text-muted-foreground">Cancha 2 · Fútbol 5 · Hoy</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {['19:00', '20:00', '21:00', '22:00'].map((t) => (
                <span
                  key={t}
                  className={cn(
                    slotPill,
                    t === '20:00' && 'border-primary bg-primary text-primary-foreground',
                  )}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-6 rounded-t-3xl border-t border-border bg-card px-4 pb-5 pt-5">
            <p className="text-sm font-medium text-muted-foreground">Seña para reservar</p>
            <p className="mt-1 font-display text-[40px] font-bold leading-none tabular-nums tracking-[-0.03em] text-foreground">
              {formatArs(DEPOSIT_CENTS)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              de {formatArs(PRICE_CENTS)} · el resto, en la cancha
            </p>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-border p-3">
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  TONE_BADGE.info,
                )}
              >
                <Wallet className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">MercadoPago</span>
                <span className="block text-xs text-muted-foreground">
                  Pagás la seña online ahora
                </span>
              </span>
            </div>
            <span className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground">
              Pagar seña
            </span>
          </div>
        </div>
      </div>
      <ExampleTag className="absolute -right-2 top-6 bg-background" />
    </figure>
  )
}

/** Paso 1: el link del complejo y sus horarios libres. */
export function PageLinkFragment() {
  return (
    <div className="card-premium rounded-2xl p-5 sm:p-6" aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 text-base font-semibold text-foreground">
          <Link2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="truncate">turnogol.app/tu-complejo</span>
        </span>
        <ExampleTag />
      </div>
      <p className="mt-5 text-sm font-medium text-muted-foreground">Libres hoy</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {['18:00', '19:00', '21:00', '23:00'].map((t) => (
          <span key={t} className={slotPill}>
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Paso 3: la seña entra a la cuenta del complejo. */
export function MoneyFragment() {
  return (
    <div className="card-premium rounded-2xl p-5 sm:p-6" aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">Seña · Cancha 2 · 20:00</span>
        <ExampleTag />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="font-display text-[40px] font-bold leading-none tabular-nums tracking-[-0.03em] text-emerald-300">
          + {formatArs(DEPOSIT_CENTS)}
        </span>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2">
          <Wallet className={cn('h-4 w-4', TONE_TEXT.info)} />
          <span className="text-sm font-semibold text-foreground">Tu cuenta de MercadoPago</span>
        </span>
      </div>
    </div>
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
  }),
  '1-20:00': exampleBooking('g2', 2, '20:00', '21:00', {
    playerFirstName: 'Nico',
    playerLastName: 'P.',
    depositStatus: 'paid',
    depositAmount: DEPOSIT_CENTS,
    totalPaid: DEPOSIT_CENTS,
    pending: PRICE_CENTS - DEPOSIT_CENTS,
  }),
  '0-21:00': exampleBooking('g3', 1, '21:00', '22:00', {
    playerFirstName: 'Seba',
    playerLastName: 'L.',
    depositStatus: 'paid',
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
 * Paso 4: un pedazo de la Grilla del panel con la `BookingCard` real. `inert`:
 * son botones del panel, acá no abren nada ni reciben foco.
 */
export function GridFragment() {
  return (
    <figure
      role="img"
      aria-label="Ejemplo de la grilla del panel: la reserva de las 20:00 en la Cancha 2 aparece con la seña cobrada y lo que falta cobrar en la cancha"
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
      </div>
    </figure>
  )
}
