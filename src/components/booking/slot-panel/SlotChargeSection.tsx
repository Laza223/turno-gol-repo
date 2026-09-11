'use client'

import { useState } from 'react'
import {
  newChargeLine,
  SplitPaymentFields,
  type ChargeLine,
} from '@/components/admin/SplitPaymentFields'
import { cn } from '@/lib/utils'
import { METHOD_LABELS, type MethodKey } from '@/lib/payment-method'
import { chargeCta, type ChargeMode } from './charge-copy'

/**
 * Los tres métodos que se usan en el mostrador, en orden de frecuencia. "Otro"
 * queda fuera a propósito: existe para el detalle de un cobro raro y vive
 * detrás de "Cobrar otro monto", que es donde se arma un cobro a mano.
 */
const QUICK_METHODS: MethodKey[] = ['cash', 'transfer', 'mercadopago']

type Props = {
  mode: Exclude<ChargeMode, null>
  lines: ChargeLine[]
  onLinesChange: (lines: ChargeLine[]) => void
  pending: number
  error: string | null
  isPending: boolean
  /** Cobra el detalle armado a mano (una o varias líneas). */
  onSubmit: () => void
  /** Cobra TODO lo pendiente con ese método, en un solo toque. */
  onFullCharge: (method: MethodKey) => void
}

/**
 * Cobrar, en dos toques: elegir el método (Efectivo ya viene elegido) y tocar el
 * botón, que dice el monto.
 *
 * Antes había un formulario abierto con el campo del monto en blanco más un
 * atajo punteado "Cobrar todo en efectivo" al costado — dos caminos para lo
 * mismo, y el largo pedía escribir un número que el panel ya sabía: lo que
 * falta. Escribir un monto distinto sigue existiendo, pero como excepción.
 */
export function SlotChargeSection({
  mode,
  lines,
  onLinesChange,
  pending,
  error,
  isPending,
  onSubmit,
  onFullCharge,
}: Props) {
  const [method, setMethod] = useState<MethodKey>('cash')
  const [customOpen, setCustomOpen] = useState(false)

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
            onClick={() => setMethod(m)}
            aria-pressed={method === m}
            disabled={isPending}
            className={cn(
              // 44px en touch (MASTER §10): el panel entra desde abajo en el
              // teléfono y este es el PRIMER toque del cobro.
              'h-11 flex-1 rounded-md px-2 font-semibold transition-colors disabled:opacity-60 md:h-9',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
              method === m
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {METHOD_LABELS[m]}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onFullCharge(method)}
        disabled={isPending}
        className="mt-3 h-12 w-full rounded-lg bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {isPending ? 'Procesando…' : chargeCta(mode, pending)}
      </button>

      {/* red-700/red-300 (idiom de `status-tone.ts`), no `text-destructive`: el
          token es red-600 en los DOS temas y sobre la superficie oscura da 3.87:1. */}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {customOpen ? (
        <div className="mt-3 border-t border-border pt-3">
          <SplitPaymentFields
            lines={lines}
            onChange={onLinesChange}
            // El adelanto va por addBookingChargeAction, que acepta UNA
            // línea: mostrar el mixto y después mandar sólo la primera
            // sería cobrar de menos sin avisar.
            maxLines={mode === 'advance' ? 1 : 5}
            disabled={isPending}
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={isPending}
            className="mt-3 h-11 w-full rounded-lg border border-border text-sm font-semibold transition-colors hover:bg-accent disabled:opacity-60 md:h-10"
          >
            {isPending ? 'Procesando…' : 'Registrar este cobro'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            // El detalle arranca con lo que falta y el método ya elegido: se
            // abre para CORREGIR un monto, no para escribirlo de cero.
            if (lines.length === 0) onLinesChange([newChargeLine(pending, method)])
            setCustomOpen(true)
          }}
          disabled={isPending}
          className="mt-2 w-full text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
        >
          Cobrar otro monto
        </button>
      )}
    </section>
  )
}
