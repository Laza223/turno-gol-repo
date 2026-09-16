'use client'

import { useState, type FocusEvent, type MouseEvent } from 'react'
import {
  newChargeLine,
  SplitPaymentFields,
  type ChargeLine,
} from '@/components/admin/SplitPaymentFields'
import { MoneyInput } from '@/components/ui/money-input'
import { cn } from '@/lib/utils'
import { METHOD_LABELS, PAYMENT_METHOD_OPTIONS, type MethodKey } from '@/lib/payment-method'
import { formatArs } from '@/lib/format'
import { chargeCta, type ChargeMode, type ChargeSplit } from './charge-copy'

/**
 * Los tres métodos que se usan en el mostrador, en orden de frecuencia. "Otro"
 * queda fuera a propósito: existe para el detalle de un cobro raro y se elige
 * desde el `<select>` de cada línea, no acá arriba.
 */
const QUICK_METHODS: MethodKey[] = ['cash', 'transfer', 'mercadopago']

/**
 * Los atajos de cobro parcial. 44px en touch (MASTER §10): "Pagó uno" se toca
 * una vez por jugador, así que es el botón MÁS tocado del panel en un turno que
 * se cobra de a poco — errar el dedo acá cuesta un cobro de más.
 */
const PARTIAL_BUTTON =
  'h-11 w-full rounded-lg border border-border text-sm font-semibold transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:h-10'

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
  /** Cobra una sola fila del pago por equipo, sin tocar las demás líneas. */
  onLineCharge: (amountCents: number | null, method: MethodKey) => void
}

/**
 * Cobrar, en dos toques: elegir el método (Efectivo ya viene elegido) y tocar el
 * botón, que dice el monto.
 *
 * D3 (2026-09-15): el monto queda A LA VISTA en los tres modos — antes vivía
 * detrás de "Cobrar otro monto", y el encargado que quiso registrar $20.000 de
 * un turno de $84.000 en rojo no encontraba cómo. El campo arranca precargado
 * con el pendiente (se corrige para abajo, no se escribe de cero) y "Agregar
 * pago dividido" (dentro de `SplitPaymentFields`) suma líneas con otro método,
 * en los tres modos por igual — el backend ya soporta N líneas en los tres.
 *
 * Cobro de a partes: "Dividir pago por equipo" abre dos filas rotuladas, cada
 * una con su propio "Cobrar", y "Pagó uno" cobra la parte de un jugador en un
 * toque. El primero se ofrece sólo mientras no entró ningún cobro de mostrador;
 * el segundo, mientras falte más de una parte (`ChargeSplit` en
 * `charge-copy.ts`).
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
  onLineCharge,
}: Props) {
  const primaryMethod = lines[0]?.method ?? 'cash'
  const total = lines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0)

  // Pago dividido por equipo. Se apaga solo apenas entra el primer cobro de
  // mostrador (`canSplitHalf` pasa a false) y exige exactamente dos líneas: en
  // el instante entre un cobro exitoso y el refresco del turno las líneas vuelven
  // a una sola, y ahí se cae a la vista normal en vez de dibujar un equipo huérfano.
  const [teamMode, setTeamMode] = useState(false)
  const showTeams = teamMode && split.canSplitHalf && lines.length === 2

  function splitByTeam() {
    const half = split.halfCents
    setTeamMode(true)
    onLinesChange([
      newChargeLine(half, primaryMethod),
      newChargeLine(Math.max(0, pending - half), primaryMethod),
    ])
  }

  function mergeTeams() {
    setTeamMode(false)
    onLinesChange([newChargeLine(pending, primaryMethod)])
  }

  function updateLine(id: string, patch: Partial<Pick<ChargeLine, 'amountCents' | 'method'>>) {
    onLinesChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function selectMethod(m: MethodKey) {
    if (lines.length === 0) return
    onLinesChange([{ ...lines[0]!, method: m }, ...lines.slice(1)])
  }

  /**
   * Diagnóstico Stream D (2026-09-15): editar EN EL SITIO un valor ya
   * agrupado en miles ("24.000" + una tecla al final, único lugar donde puede
   * estar el caret) lo corrompe — `money.ts` reinterpreta el separador de
   * miles ya escrito como coma decimal. Seleccionar todo el texto al enfocar
   * hace que la PRIMERA tecla reemplace el valor entero: el admin vuelve a
   * escribir el monto en vez de "corregirlo" por el medio, que es la única
   * operación que rompe el parser. Vía delegación de foco/mouse de React
   * (bubblean desde React 17): no toca `money-input.tsx` ni
   * `SplitPaymentFields.tsx`, que quedan fuera de este alcance.
   *
   * `onFocus` solo no alcanza en un click real: el navegador posiciona el
   * caret en el punto tocado como parte del propio `mousedown` (ANTES de que
   * el `focus` corra `.select()`), así que la selección queda pisada por el
   * click que la originó — medido con Storybook en Chromium real (el unit
   * test con `fireEvent.focus` no lo agarra porque no simula el mousedown).
   * Frenar ese `mousedown` con `preventDefault` cuando el campo TODAVÍA no
   * estaba enfocado, y enfocarlo a mano, evita que el navegador llegue a
   * poner el caret — un click posterior con el campo YA enfocado no entra acá
   * y reposiciona el caret con normalidad (corregir un dígito puntual).
   */
  function selectAllOnMouseDown(e: MouseEvent<HTMLDivElement>) {
    const target = e.target
    if (
      target instanceof HTMLInputElement &&
      target.type === 'text' &&
      document.activeElement !== target
    ) {
      e.preventDefault()
      target.focus()
    }
  }

  function selectAllOnFocus(e: FocusEvent<HTMLDivElement>) {
    const target = e.target
    if (target instanceof HTMLInputElement && target.type === 'text') target.select()
  }

  return (
    <section className="rounded-lg border border-border p-3">
      {!showTeams && (
        <div
          role="group"
          aria-label="Método de pago"
          className="flex gap-1 rounded-lg bg-muted p-1 text-sm"
        >
          {QUICK_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => selectMethod(m)}
              aria-pressed={primaryMethod === m}
              disabled={isPending}
              className={cn(
                // 44px en touch (MASTER §10): el panel entra desde abajo en el
                // teléfono y este es el PRIMER toque del cobro.
                'h-11 flex-1 rounded-md px-2 font-semibold transition-colors disabled:opacity-60 md:h-9',
                'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                primaryMethod === m
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {METHOD_LABELS[m]}
            </button>
          ))}
        </div>
      )}

      {/* Cobrar de a partes. Los complejos casi nunca cobran el turno entero de
          una: o juntan por equipo, o cada jugador paga lo suyo a medida que
          llega.

          "Dividir pago por equipo" (2026-09-16, pedido del dueño) reemplaza al
          viejo "Pagó un equipo", que cobraba la mitad de un toque sin mostrar
          nada: ahora parte el cobro en dos filas rotuladas Equipo 1 / Equipo 2,
          igual que el pago dividido, cada una con su monto, su método y su
          propio "Cobrar". Así el que está en el mostrador ve los dos equipos y
          cobra a cada uno cuando paga — juntos con el botón grande, o por
          separado con el de su fila. Se ofrece sólo mientras no entró ningún
          cobro; después, el panel ya dice qué equipo falta.

          "Pagó uno" sigue siendo de un toque: se toca una vez por jugador, y
          abrir un formulario por cada uno sería fricción pura. */}
      {!showTeams && (split.canSplitHalf || split.canSplitShare) && (
        <div className="mt-2 flex flex-col gap-2">
          {split.canSplitHalf && (
            <button
              type="button"
              onClick={splitByTeam}
              disabled={isPending}
              className={PARTIAL_BUTTON}
            >
              Dividir pago por equipo
            </button>
          )}
          {split.canSplitShare && split.shareCents !== null && (
            <button
              type="button"
              onClick={() => onPartialCharge(split.shareCents ?? 0, primaryMethod)}
              disabled={isPending}
              className={PARTIAL_BUTTON}
            >
              {isPending ? 'Procesando…' : `Pagó uno — ${formatArs(split.shareCents)}`}
            </button>
          )}
        </div>
      )}

      <div
        // En modo equipo no hay chips de método arriba: sin esto la caja arranca con un hueco.
        className={showTeams ? undefined : 'mt-3'}
        onFocus={selectAllOnFocus}
        onMouseDown={selectAllOnMouseDown}
      >
        {showTeams ? (
          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={line.id}>
                {/* "Cobrar" al lado del rótulo y no al final de la fila: monto + método +
                    botón en una sola línea no entra en el panel de un teléfono sin
                    aplastar el monto, que es justo lo que hay que leer. */}
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">Equipo {i + 1}</p>
                  <button
                    type="button"
                    onClick={() => onLineCharge(line.amountCents, line.method)}
                    disabled={isPending}
                    aria-label={`Cobrar al Equipo ${i + 1}`}
                    className="h-9 shrink-0 rounded-lg border border-border px-3 text-xs font-semibold transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    {isPending ? 'Procesando…' : `Cobrar ${formatArs(line.amountCents ?? 0)}`}
                  </button>
                </div>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <MoneyInput
                      valueCents={line.amountCents}
                      onValueChange={(cents) => updateLine(line.id, { amountCents: cents })}
                      minCents={1}
                      placeholder="Monto"
                      disabled={isPending}
                      aria-label={`Monto del Equipo ${i + 1}`}
                    />
                  </div>
                  <select
                    value={line.method}
                    onChange={(e) => updateLine(line.id, { method: e.target.value as MethodKey })}
                    disabled={isPending}
                    aria-label={`Método de pago del Equipo ${i + 1}`}
                    className="h-10 rounded-lg border border-input bg-background px-2 text-base font-medium text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring disabled:opacity-60 md:text-sm"
                  >
                    {PAYMENT_METHOD_OPTIONS.map((m) => (
                      <option
                        key={m.value}
                        value={m.value}
                        className="bg-background text-foreground dark:bg-slate-900 dark:text-slate-100"
                      >
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={mergeTeams}
              disabled={isPending}
              className="flex min-h-11 items-center text-xs font-medium text-emerald-800 hover:underline disabled:opacity-60 md:min-h-0 dark:text-emerald-400"
            >
              Cobrar en un solo pago
            </button>
          </div>
        ) : (
          <SplitPaymentFields
            lines={lines}
            onChange={onLinesChange}
            maxLines={5}
            disabled={isPending}
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

      <button
        type="button"
        onClick={onSubmit}
        disabled={isPending}
        className="mt-3 h-12 w-full rounded-lg bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {isPending ? 'Procesando…' : chargeCta(mode, pending, total)}
      </button>
    </section>
  )
}
