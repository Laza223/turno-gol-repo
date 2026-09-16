'use client'

import type { FocusEvent, MouseEvent } from 'react'
import { SplitPaymentFields, type ChargeLine } from '@/components/admin/SplitPaymentFields'
import { cn } from '@/lib/utils'
import { METHOD_LABELS, type MethodKey } from '@/lib/payment-method'
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
 * Cobro de a partes (2026-09-15): "Pagó un equipo"/"Pagó uno" son atajos aparte
 * del campo editable, no un reemplazo — la mayoría de los complejos cobra por
 * equipo o jugador por jugador, así que resolverlo en un toque sin tocar el
 * monto es el camino corto. "Pagó un equipo" desaparece con el primer cobro de
 * mostrador; "Pagó uno" se queda mientras falte más de una parte (`ChargeSplit`
 * en `charge-copy.ts`).
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
}: Props) {
  const primaryMethod = lines[0]?.method ?? 'cash'
  const total = lines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0)

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

      {/* Cobrar de a partes. Los complejos casi nunca cobran el turno entero de
          una: o juntan por equipo, o cada jugador paga lo suyo a medida que
          llega. Son atajos aparte del campo editable, no un reemplazo — el
          monto va ADENTRO del rótulo, igual que en el botón grande (H017,
          misma regla que `chargeCta`). "Pagó un equipo" desaparece en cuanto
          entró el primer cobro; "Pagó uno" se queda mientras falte más de una
          parte, porque es el que se toca varias veces. */}
      {(split.canSplitHalf || split.canSplitShare) && (
        <div className="mt-2 flex flex-col gap-2">
          {split.canSplitHalf && (
            <button
              type="button"
              onClick={() => onPartialCharge(split.halfCents, primaryMethod)}
              disabled={isPending}
              className={PARTIAL_BUTTON}
            >
              {isPending ? 'Procesando…' : `Pagó un equipo — ${formatArs(split.halfCents)}`}
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

      <div className="mt-3" onFocus={selectAllOnFocus} onMouseDown={selectAllOnMouseDown}>
        <SplitPaymentFields
          lines={lines}
          onChange={onLinesChange}
          maxLines={5}
          disabled={isPending}
        />
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
