'use client'

import { useState } from 'react'
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
  onPartialCharge: (amountCents: number, method: MethodKey) => void
  onTeamCharge: (teamLines: ChargeLine[]) => void
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
                'h-10 flex-1 rounded-lg px-2 text-sm font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
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
          disabled={disabled}
          isPending={isPending}
          onTeamCharge={onTeamCharge}
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
 * Los dos equipos, cada uno con lo que le falta y su propio "Cobrar". Lo que
 * cada equipo debe se DEDUCE de lo cobrado (`teamDues`): el sistema no guarda
 * quién pagó. Un equipo saldado queda como una línea "Equipo 1 ✓" y no como un
 * formulario vacío.
 */
function TeamsTab({
  booking,
  disabled,
  isPending,
  onTeamCharge,
}: {
  booking: GridBooking
  disabled: boolean
  isPending: boolean
  onTeamCharge: (teamLines: ChargeLine[]) => void
}) {
  const dues = teamDues(booking)
  const teams = [
    { team: 1 as const, due: dues.team1Cents, paid: dues.team1Paid },
    { team: 2 as const, due: dues.team2Cents, paid: dues.team2Paid },
  ]
  return (
    <div className="flex flex-col gap-4">
      {teams.map(({ team, due, paid }) =>
        paid && due === 0 ? (
          <p
            key={team}
            className="flex items-center justify-between rounded-lg bg-success/10 px-3 py-2.5 text-sm font-semibold text-emerald-800 dark:bg-success/15 dark:text-emerald-300"
          >
            <span>Equipo {team} ✓</span>
            <span className="text-xs font-medium">Pagó</span>
          </p>
        ) : due > 0 ? (
          // La key lleva el monto: cuando entra un cobro y lo que falta cambia, el
          // bloque se rearma con la plata nueva en vez de dejar la vieja tipeada.
          <TeamBlock
            key={`${team}-${due}`}
            team={team}
            due={due}
            disabled={disabled}
            isPending={isPending}
            onCharge={onTeamCharge}
          />
        ) : null,
      )}
    </div>
  )
}

function TeamBlock({
  team,
  due,
  disabled,
  isPending,
  onCharge,
}: {
  team: 1 | 2
  due: number
  disabled: boolean
  isPending: boolean
  onCharge: (teamLines: ChargeLine[]) => void
}) {
  const [teamLines, setTeamLines] = useState<ChargeLine[]>(() => [newChargeLine(due, 'cash')])
  const total = teamLines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0)

  return (
    <div onFocus={selectAllOnFocus} onMouseDown={selectAllOnMouseDown}>
      {/* "Cobrar" al lado del rótulo y no al final de la fila: monto + método +
          botón en una sola línea no entra en un teléfono sin aplastar el monto,
          que es justo lo que hay que leer. */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Equipo {team}</p>
        <button
          type="button"
          onClick={() => onCharge(teamLines)}
          disabled={disabled}
          // El nombre accesible contiene el texto visible ("Cobrar $24.000"): quien
          // maneja por voz activa el botón diciendo lo que ve (WCAG 2.5.3).
          aria-label={isPending ? undefined : `Cobrar ${formatArs(total)} al Equipo ${team}`}
          className="h-10 shrink-0 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {isPending ? 'Procesando…' : `Cobrar ${formatArs(total)}`}
        </button>
      </div>
      <SplitPaymentFields
        lines={teamLines}
        onChange={setTeamLines}
        maxLines={3}
        disabled={disabled}
        idPrefix={`hoy-equipo-${team}`}
        groupLabel={`del Equipo ${team}`}
      />
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
