'use client'

import { useState } from 'react'
import {
  newChargeLine,
  SplitPaymentFields,
  type ChargeLine,
} from '@/components/admin/SplitPaymentFields'
import { formatArs } from '@/lib/format'
import type { MethodKey } from '@/lib/payment-method'
import { chargeCta, type ChargeMode, type ChargeSplit } from './charge-copy'
import { selectAllOnFocus, selectAllOnMouseDown } from './select-all-on-focus'

/**
 * Tope de líneas del cobro. Es el MENOR de los tres schemas Zod que puede
 * recibir este panel (`addBookingChargeSchema` acepta 5; los otros dos, 10):
 * la UI no puede ofrecer una línea que la Server Action del modo `advance`
 * vaya a rechazar. En modo equipo se reparte entre los dos.
 */
const MAX_LINES = 5

/**
 * Los atajos de cobro parcial. 44px en touch (MASTER §10): "Pagó uno" se toca
 * una vez por jugador, así que es el botón MÁS tocado del panel en un turno que
 * se cobra de a poco — errar el dedo acá cuesta un cobro de más.
 */
const PARTIAL_BUTTON =
  'h-11 w-full rounded-lg border border-border bg-card text-sm font-semibold transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:h-10'

type Props = {
  mode: Exclude<ChargeMode, null>
  lines: ChargeLine[]
  onLinesChange: (lines: ChargeLine[]) => void
  pending: number
  error: string | null
  isPending: boolean
  /** Cobra el detalle armado (una o varias líneas), con el monto que esté tipeado. */
  onSubmit: () => void
  /** Cobro de a partes: qué atajos ofrecer y de cuánto es cada uno. */
  split: ChargeSplit
  /** Cobra ese monto exacto con el método elegido, en un solo toque. */
  onPartialCharge: (amountCents: number, method: MethodKey) => void
  /** Cobra las líneas de UN equipo, sin tocar las del otro. */
  onTeamCharge: (teamLines: ChargeLine[]) => void
  /**
   * Monto de un cobro que se cortó por la red y no se sabe si entró, o null.
   * Mientras hay uno, lo único que se puede hacer es reintentarlo.
   */
  retryTotal: number | null
  /** Reenvía ese mismo cobro, con la misma clave de idempotencia. */
  onRetry: () => void
}

/**
 * Cobrar, en un toque: el monto ya viene precargado con lo que falta y el
 * método se elige en el desplegable de la propia línea.
 *
 * 2026-09-17 (pedido del dueño): se fueron las pestañas Efectivo /
 * Transferencia / MercadoPago que había arriba. Eran una SEGUNDA forma de
 * elegir lo mismo que el desplegable de la línea, y sólo escribían el método de
 * la primera — con dos líneas ya mentían sobre lo que se iba a cobrar.
 *
 * D3 (2026-09-15): el monto queda A LA VISTA en los tres modos — antes vivía
 * detrás de "Cobrar otro monto", y el encargado que quiso registrar $20.000 de
 * un turno de $84.000 en rojo no encontraba cómo. El campo arranca precargado
 * con el pendiente (se corrige para abajo, no se escribe de cero) y "Agregar
 * pago dividido" (dentro de `SplitPaymentFields`) suma líneas con otro método,
 * en los tres modos por igual — el backend ya soporta N líneas en los tres.
 *
 * Cobro de a partes: "Dividir pago por equipo" abre dos bloques rotulados, cada
 * uno con SUS líneas y su propio "Cobrar" (un equipo puede juntar la plata con
 * más de un medio), y "Pagó uno" cobra la parte de un jugador en un toque. El
 * primero se ofrece sólo mientras no entró ningún cobro de mostrador; el
 * segundo, mientras falte más de una parte (`ChargeSplit` en `charge-copy.ts`).
 */
export function SlotChargeSection({
  mode,
  lines,
  onLinesChange,
  pending,
  error,
  isPending,
  onSubmit,
  split,
  onPartialCharge,
  onTeamCharge,
  retryTotal,
  onRetry,
}: Props) {
  const primaryMethod = lines[0]?.method ?? 'cash'
  // Con un cobro sin confirmar no se puede armar otro: si el primero entró y el
  // segundo es igual (el Equipo 2, otro "Pagó uno"), el servidor lo tomaría por
  // un reintento y no lo cobraría (R3 de la revisión del PR #326).
  const awaitingRetry = retryTotal !== null
  const locked = isPending || awaitingRetry
  const total = lines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0)

  // Pago dividido por equipo. Se apaga solo apenas entra el primer cobro de
  // mostrador (`canSplitHalf` pasa a false) y exige que los DOS equipos tengan
  // al menos una línea: en el instante entre un cobro exitoso y el refresco del
  // turno las líneas vuelven a una sola sin equipo, y ahí se cae a la vista
  // normal en vez de dibujar un equipo huérfano.
  const [teamMode, setTeamMode] = useState(false)
  const teams = [1, 2].map((t) => lines.filter((l) => l.team === t)) as [ChargeLine[], ChargeLine[]]
  const showTeams = teamMode && split.canSplitHalf && teams[0].length > 0 && teams[1].length > 0

  function splitByTeam() {
    const half = split.halfCents
    setTeamMode(true)
    onLinesChange([
      newChargeLine(half, primaryMethod, 1),
      newChargeLine(Math.max(0, pending - half), primaryMethod, 2),
    ])
  }

  function mergeTeams() {
    setTeamMode(false)
    onLinesChange([newChargeLine(pending, primaryMethod)])
  }

  /**
   * Reemplaza las líneas de un equipo dejando las del otro intactas y en su
   * lugar. El `team` se re-estampa acá y no en `SplitPaymentFields`: el control
   * compartido no sabe nada de equipos, sólo maneja una lista de líneas.
   */
  function setTeamLines(team: 1 | 2, next: ChargeLine[]) {
    const tagged = next.map((l) => ({ ...l, team }))
    onLinesChange(team === 1 ? [...tagged, ...teams[1]] : [...teams[0], ...tagged])
  }

  return (
    // Sin caja: el panel entero era una hoja con dos recuadros adentro y un
    // tercero al pie. Un filete de 1px alcanza para separar bloques y no le
    // come 24px de ancho útil al cobro (plan de diseño 2026-09-17 §5).
    <section className="border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Cobro
        </h3>
        {showTeams && (
          <button
            type="button"
            onClick={mergeTeams}
            disabled={locked}
            className="flex min-h-11 items-center text-xs font-medium text-emerald-800 hover:underline disabled:opacity-60 md:min-h-0 dark:text-emerald-400"
          >
            Cobrar en un solo pago
          </button>
        )}
      </div>

      {/* Cobrar de a partes. Los complejos casi nunca cobran el turno entero de
          una: o juntan por equipo, o cada jugador paga lo suyo a medida que
          llega.

          "Dividir pago por equipo" (2026-09-16, pedido del dueño) reemplaza al
          viejo "Pagó un equipo", que cobraba la mitad de un toque sin mostrar
          nada: ahora parte el cobro en dos bloques rotulados Equipo 1 / Equipo 2,
          cada uno con sus líneas, su método y su propio "Cobrar". Así el que
          está en el mostrador ve los dos equipos y cobra a cada uno cuando paga
          — juntos con el botón grande, o por separado con el de su bloque.
          Se ofrece sólo mientras no entró ningún cobro; después, el panel ya
          dice qué equipo falta.

          "Pagó uno" sigue siendo de un toque: se toca una vez por jugador, y
          abrir un formulario por cada uno sería fricción pura. */}
      {!showTeams && (split.canSplitHalf || split.canSplitShare) && (
        // En escritorio, lado a lado: el panel es más ancho y apilados empujaban
        // las acciones del turno debajo del borde. Si queda uno solo, ocupa la fila.
        <div className="mt-3 flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
          {split.canSplitHalf && (
            <button
              type="button"
              onClick={splitByTeam}
              disabled={locked}
              className={PARTIAL_BUTTON}
            >
              Dividir pago por equipo
            </button>
          )}
          {split.canSplitShare && split.shareCents !== null && (
            <button
              type="button"
              onClick={() => onPartialCharge(split.shareCents ?? 0, primaryMethod)}
              disabled={locked}
              className={PARTIAL_BUTTON}
            >
              {isPending ? 'Procesando…' : `Pagó uno — ${formatArs(split.shareCents)}`}
            </button>
          )}
        </div>
      )}

      <div className="mt-3" onFocus={selectAllOnFocus} onMouseDown={selectAllOnMouseDown}>
        {showTeams ? (
          <div className="space-y-4">
            {([1, 2] as const).map((team) => {
              const teamLines = teams[team - 1]
              const other = teams[team === 1 ? 1 : 0]
              const teamTotal = teamLines.reduce((s, l) => s + (l.amountCents ?? 0), 0)
              return (
                <div key={team}>
                  {/* "Cobrar" al lado del rótulo y no al final de la fila: monto +
                      método + botón en una sola línea no entra en el panel de un
                      teléfono sin aplastar el monto, que es justo lo que hay que leer. */}
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground">Equipo {team}</p>
                    <button
                      type="button"
                      onClick={() => onTeamCharge(teamLines)}
                      disabled={locked}
                      aria-label={`Cobrar al Equipo ${team}`}
                      className="h-9 shrink-0 rounded-lg border border-border bg-card px-3 text-xs font-semibold transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      {isPending ? 'Procesando…' : `Cobrar ${formatArs(teamTotal)}`}
                    </button>
                  </div>
                  <SplitPaymentFields
                    lines={teamLines}
                    onChange={(next) => setTeamLines(team, next)}
                    maxLines={Math.max(1, MAX_LINES - other.length)}
                    disabled={locked}
                    idPrefix={`equipo-${team}`}
                    groupLabel={`del Equipo ${team}`}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <SplitPaymentFields
            lines={lines}
            onChange={onLinesChange}
            maxLines={MAX_LINES}
            disabled={locked}
            idPrefix="slot-cobro"
          />
        )}
      </div>

      {/* red-700/red-300 (idiom de `status-tone.ts`), no `text-destructive`: el
          token es red-600 en los DOS temas y sobre la superficie oscura da 3.87:1. */}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {awaitingRetry && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
          Se cortó la conexión y no sabemos si ese cobro entró. Reintentalo antes de cobrar otra
          cosa: si ya había entrado, no se cobra dos veces.
        </p>
      )}

      <button
        type="button"
        onClick={awaitingRetry ? onRetry : onSubmit}
        disabled={isPending}
        className="mt-3 h-12 w-full rounded-lg bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {isPending
          ? 'Procesando…'
          : awaitingRetry
            ? `Reintentar cobro de ${formatArs(retryTotal)}`
            : chargeCta(mode, pending, total)}
      </button>
    </section>
  )
}
