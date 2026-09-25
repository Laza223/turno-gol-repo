'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import {
  newChargeLine,
  SplitPaymentFields,
  type ChargeLine,
} from '@/components/admin/SplitPaymentFields'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { SelectMenu } from '@/components/ui/select-menu'
import {
  chargeCta,
  chargeSplit,
  chargeTabs,
  counterPaidCents,
  halfOfPending,
  teamDues,
  type ChargeMode,
  type ChargeTab,
} from '@/components/booking/slot-panel/charge-copy'
import {
  selectAllOnFocus,
  selectAllOnMouseDown,
} from '@/components/booking/slot-panel/select-all-on-focus'
import type { GridBooking } from '@/lib/booking/grid-cells'
import { formatArs } from '@/lib/format'
import { METHOD_LABELS, PAYMENT_METHOD_OPTIONS, type MethodKey } from '@/lib/payment-method'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

const TAB_LABEL: Record<ChargeTab, string> = {
  all: 'Todo junto',
  teams: 'Por equipo',
  players: 'Por jugador',
}

/** Tope de líneas de un cobro (el menor de los schemas Zod de las tres acciones). */
const MAX_LINES = 5

const PRIMARY_BUTTON =
  'w-full rounded-lg bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60'

/**
 * Cómo se cobra el turno, en el modal de Hoy. Tres formas para las tres cosas que
 * pasan en el mostrador: paga uno solo ("Todo junto"), paga cada equipo ("Por
 * equipo") o paga cada jugador lo suyo a medida que llega ("Por jugador").
 *
 * Todas cobran por la MISMA Server Action que el panel de la Grilla (el hook
 * `useSlotCharges`): cambia la forma de armar el cobro, no el cobro. El modal
 * queda abierto después de cada uno, así cobrarle a diez jugadores es tocar
 * "Pagó uno" diez veces, no abrir y cerrar diez paneles.
 *
 * `locked` cubre el cobro en curso Y el refresco posterior: hasta que llegan los
 * datos nuevos, los controles están apagados. Sin eso el segundo "Pagó uno"
 * saldría con el saldo viejo.
 */
export function HoyChargeSection({
  booking,
  mode,
  capacity,
  lines,
  onLinesChange,
  error,
  isPending,
  locked,
  onSubmit,
  onPartialCharge,
  onTeamCharge,
  retryTotal,
  onRetry,
}: {
  booking: GridBooking
  mode: Exclude<ChargeMode, null>
  capacity: number | undefined
  lines: ChargeLine[]
  onLinesChange: (lines: ChargeLine[]) => void
  error: string | null
  /** Hay un cobro saliendo: los botones dicen "Procesando…". */
  isPending: boolean
  /** Cobro en curso o datos refrescándose: nada se puede tocar. */
  locked: boolean
  onSubmit: () => void
  onPartialCharge: (amountCents: number, method: MethodKey, team?: 1 | 2) => void
  onTeamCharge: (teamLines: ChargeLine[], team?: 1 | 2) => void
  /** Monto de un cobro que se cortó por la red y no se sabe si entró, o null. */
  retryTotal: number | null
  onRetry: () => void
}) {
  const pending = typeof booking.pending === 'number' ? booking.pending : 0
  const tabs = chargeTabs(booking, capacity)
  const [picked, setPicked] = useState<ChargeTab>(tabs.initial)
  // Si la pestaña elegida dejó de existir (se cobró lo suficiente para que "por
  // equipo" ya no tenga sentido), se cae a "todo junto" en vez de quedar en blanco.
  const tab = tabs.available.includes(picked) ? picked : 'all'
  const [playerMethod, setPlayerMethod] = useState<MethodKey>('cash')

  // Con un cobro sin confirmar no se puede armar otro: si el primero entró y el
  // segundo es igual, el servidor lo tomaría por un reintento y no lo cobraría.
  const awaitingRetry = retryTotal !== null
  const disabled = locked || awaitingRetry
  const total = lines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0)

  return (
    <section className="flex flex-col gap-3">
      {tabs.available.length > 1 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">¿Cómo pagan?</p>
          <SegmentedControl
            aria-label="Cómo pagan"
            value={tab}
            onValueChange={setPicked}
            disabled={disabled}
            options={tabs.available.map((t) => ({ value: t, label: TAB_LABEL[t] }))}
            className="flex gap-1 rounded-xl border border-border bg-card p-1"
            itemClassName={(active) =>
              cn(
                // `px-1` en el teléfono: con `px-2`, a 375 px "Por jugador" se partía
                // en dos renglones dentro de un segmento de 94 px.
                'h-10 flex-1 rounded-lg px-1 text-sm font-semibold transition-colors sm:px-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent',
              )
            }
          />
        </div>
      )}

      {tab === 'all' && (
        <>
          <div onFocus={selectAllOnFocus} onMouseDown={selectAllOnMouseDown}>
            <SplitPaymentFields
              lines={lines}
              onChange={onLinesChange}
              maxLines={MAX_LINES}
              disabled={disabled}
              idPrefix="hoy-cobro"
            />
          </div>
          {!awaitingRetry && (
            <button
              type="button"
              onClick={onSubmit}
              disabled={disabled}
              className={cn(PRIMARY_BUTTON, 'h-12 text-base')}
            >
              {isPending ? 'Procesando…' : chargeCta(mode, pending, total)}
            </button>
          )}
        </>
      )}

      {tab === 'teams' && (
        <TeamsTab
          booking={booking}
          capacity={capacity}
          disabled={disabled}
          isPending={isPending}
          onTeamCharge={onTeamCharge}
          onPartialCharge={onPartialCharge}
        />
      )}

      {tab === 'players' && (
        <PlayersTab
          booking={booking}
          capacity={capacity}
          method={playerMethod}
          onMethodChange={setPlayerMethod}
          disabled={disabled}
          isPending={isPending}
          onPartialCharge={onPartialCharge}
        />
      )}

      {/* red-700/red-300 (idiom de `status-tone.ts`), no `text-destructive`: el
          token es red-600 en los DOS temas y sobre la superficie oscura da 3.87:1. */}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {awaitingRetry && (
        <>
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            Se cortó la conexión y no sabemos si ese cobro entró. Reintentalo antes de cobrar otra
            cosa: si ya había entrado, no se cobra dos veces.
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={locked}
            className={cn(PRIMARY_BUTTON, 'h-12 text-base')}
          >
            {isPending ? 'Procesando…' : `Reintentar cobro de ${formatArs(retryTotal)}`}
          </button>
        </>
      )}
    </section>
  )
}

/**
 * Los dos equipos lado a lado, cada uno con lo que le falta y su propio
 * "Cobrar". Cada cobro se guarda con su equipo (decisión del dueño, 2026-09-25,
 * que reabre la del 2026-09-15): si alguien del Equipo 2 paga $ 6.000, se le
 * descuentan al Equipo 2 y no al total. Lo cobrado sin equipo (cobros viejos o
 * "Todo junto") se le cuenta primero al Equipo 1, como antes (`teamDues`).
 *
 * Un equipo que pagó queda con su tilde y sin formulario; el otro sigue
 * debiendo hasta que pague, aunque se cierre el modal y se vuelva otro día.
 */
function TeamsTab({
  booking,
  capacity,
  disabled,
  isPending,
  onTeamCharge,
  onPartialCharge,
}: {
  booking: GridBooking
  capacity: number | undefined
  disabled: boolean
  isPending: boolean
  onTeamCharge: (teamLines: ChargeLine[], team?: 1 | 2) => void
  onPartialCharge: (amountCents: number, method: MethodKey, team?: 1 | 2) => void
}) {
  const pending = typeof booking.pending === 'number' && booking.pending > 0 ? booking.pending : 0
  const dues = teamDues(booking)
  // La mitad de cada equipo sobre lo que se cobra en el mostrador (sin la seña):
  // lo que ya puso cada uno es su mitad menos lo que le falta.
  const base = pending + counterPaidCents(booking)
  const half1 = halfOfPending(base)
  const teams = [
    { team: 1 as const, due: dues.team1Cents, half: half1 },
    { team: 2 as const, due: dues.team2Cents, half: base - half1 },
  ]
  const playerCents = chargeSplit(booking, capacity).shareCents
  // Con los dos equipos debiendo y alguno que ya puso algo, las dos tarjetas
  // guardan el renglón de "Ya pagó": los campos y los botones quedan a la misma altura.
  const reserveNote =
    teams.every(({ due }) => due > 0) && teams.some(({ due, half }) => half - due > 0)

  return (
    // Lado a lado; si un equipo divide su pago en dos medios, una debajo de la otra:
    // en media tarjeta el segundo monto no entra al lado de su medio de pago.
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:has-[[data-split]]:grid-cols-1">
      {teams.map(({ team, due, half }) => (
        // La key lleva el monto: cuando entra un cobro y lo que falta cambia, la
        // tarjeta se rearma con la plata nueva en vez de dejar la vieja tipeada.
        <TeamCard
          key={`${team}-${due}`}
          team={team}
          due={due}
          paidCents={Math.max(0, half - due)}
          reserveNote={reserveNote}
          playerCents={playerCents}
          disabled={disabled}
          isPending={isPending}
          onCharge={onTeamCharge}
          onPlayerCharge={onPartialCharge}
        />
      ))}
    </div>
  )
}

function TeamCard({
  team,
  due,
  paidCents,
  reserveNote,
  playerCents,
  disabled,
  isPending,
  onCharge,
  onPlayerCharge,
}: {
  team: 1 | 2
  due: number
  /** Lo que ya puso este equipo para su mitad. */
  paidCents: number
  /** Guardar el renglón de "Ya pagó" aunque este equipo no haya puesto nada. */
  reserveNote: boolean
  /** Lo que pone un jugador, si se sabe cuántos entran en la cancha. */
  playerCents: number | null
  disabled: boolean
  isPending: boolean
  onCharge: (teamLines: ChargeLine[], team?: 1 | 2) => void
  onPlayerCharge: (amountCents: number, method: MethodKey, team?: 1 | 2) => void
}) {
  const [lines, setLines] = useState<ChargeLine[]>(() => [newChargeLine(due, 'cash', team)])
  const line = lines[0]
  const amount = lines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0)
  // El monto en palabras recién cuando se toca: precargado es el "Falta" de arriba,
  // y repetido en media tarjeta ocupa tres renglones (en la notebook del mostrador
  // empujaba "Pagó uno" fuera de la vista).
  const touched = lines.length > 1 || line?.amountCents !== due

  if (due === 0) {
    return (
      <div
        role="group"
        aria-label={`Equipo ${team}`}
        // Arriba y no estirada al alto de la otra: una caja verde vacía del tamaño
        // de la tarjeta que todavía debe distraía de la que hay que cobrar.
        className="flex flex-col gap-1 self-start rounded-xl border border-success/30 bg-success/5 p-4 dark:bg-success/10"
      >
        <p className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
          Equipo {team}
          <span className={cn('inline-flex items-center gap-1', TONE_TEXT.success)}>
            <Check aria-hidden className="h-4 w-4" />
            Pagó
          </span>
        </p>
        {paidCents > 0 && (
          <p className="text-xs tabular-nums text-muted-foreground">
            {formatArs(paidCents)} cobrados
          </p>
        )}
      </div>
    )
  }

  // "Pagó uno" con el equipo: el caso del complejo piloto, que cobra jugador por
  // jugador pero quiere saber de qué equipo es cada uno. Solo si falta más que
  // una parte: si falta justo una, el "Cobrar" de arriba ya es ese cobro.
  const canChargePlayer = playerCents !== null && due > playerCents

  return (
    <div
      role="group"
      aria-label={`Equipo ${team}`}
      data-split={lines.length > 1 || undefined}
      className="flex flex-col gap-3 rounded-xl border border-border p-4"
      onFocus={selectAllOnFocus}
      onMouseDown={selectAllOnMouseDown}
    >
      <div>
        <p className="flex items-baseline justify-between gap-2 text-sm font-semibold text-foreground">
          Equipo {team}
          <span className="tabular-nums">
            <span className="font-normal text-muted-foreground">Falta </span>
            {formatArs(due)}
          </span>
        </p>
        {reserveNote && (
          <p className="mt-0.5 min-h-4 text-xs tabular-nums text-muted-foreground">
            {paidCents > 0 && `Ya pagó ${formatArs(paidCents)}`}
          </p>
        )}
      </div>
      <SplitPaymentFields
        lines={lines}
        onChange={setLines}
        maxLines={3}
        disabled={disabled}
        idPrefix={`hoy-equipo-${team}`}
        groupLabel={`del Equipo ${team}`}
        showWords={touched}
      />
      <button
        type="button"
        onClick={() => onCharge(lines, team)}
        disabled={disabled || amount <= 0}
        // El nombre accesible contiene el texto visible ("Cobrar $24.000"): quien
        // maneja por voz activa el botón diciendo lo que ve (WCAG 2.5.3).
        aria-label={`Cobrar ${formatArs(amount)} al Equipo ${team}`}
        className={cn(PRIMARY_BUTTON, 'h-11 text-sm md:h-10')}
      >
        {isPending ? 'Procesando…' : `Cobrar ${formatArs(amount)}`}
      </button>
      {canChargePlayer && (
        <button
          type="button"
          onClick={() => onPlayerCharge(playerCents, line?.method ?? 'cash', team)}
          disabled={disabled}
          aria-label={`Pagó uno del Equipo ${team}: ${formatArs(playerCents)}`}
          className="h-11 w-full rounded-lg border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:h-10"
        >
          Pagó uno · {formatArs(playerCents)}
        </button>
      )}
    </div>
  )
}

/**
 * "Pagó uno", el botón que más se toca: uno por jugador. Muestra cuánta gente ya
 * puso, que es lo que evita cobrarle dos veces al mismo. El monto sale del
 * precio del turno dividido por los jugadores de la cancha; con el turno casi
 * saldado cobra lo que queda y no más.
 */
function PlayersTab({
  booking,
  capacity,
  method,
  onMethodChange,
  disabled,
  isPending,
  onPartialCharge,
}: {
  booking: GridBooking
  capacity: number | undefined
  method: MethodKey
  onMethodChange: (method: MethodKey) => void
  disabled: boolean
  isPending: boolean
  onPartialCharge: (amountCents: number, method: MethodKey) => void
}) {
  const pending = typeof booking.pending === 'number' ? booking.pending : 0
  const share = chargeSplit(booking, capacity).shareCents ?? 0
  const amount = Math.min(share, pending)
  // Cuánta gente ya pagó lo dice el resumen de arriba (`SlotPriceSummary`): repetirlo
  // acá sería el mismo dato dos veces. Solo se aclara el caso vacío.
  const status = counterPaidCents(booking) === 0 ? 'Todavía no pagó nadie' : null

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm tabular-nums text-muted-foreground">
        {status ? `${status} · ` : ''}cada uno {formatArs(share)}
      </p>
      <div className="flex items-stretch gap-2">
        <SelectMenu
          id="hoy-jugador-metodo"
          aria-label={`Medio de pago de este jugador: ${METHOD_LABELS[method]}`}
          value={method}
          onChange={(v) => onMethodChange(v as MethodKey)}
          options={PAYMENT_METHOD_OPTIONS}
          disabled={disabled}
          className="h-14 w-36 shrink-0"
        />
        <button
          type="button"
          onClick={() => onPartialCharge(amount, method)}
          disabled={disabled || amount <= 0}
          className={cn(PRIMARY_BUTTON, 'h-14 text-base')}
        >
          {isPending ? 'Procesando…' : `Pagó uno — ${formatArs(amount)}`}
        </button>
      </div>
    </div>
  )
}
