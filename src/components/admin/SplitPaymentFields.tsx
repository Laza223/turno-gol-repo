'use client'

import { Plus, Trash2 } from 'lucide-react'
import { MoneyInput } from '@/components/ui/money-input'
import { formatArs } from '@/lib/format'
import { PAYMENT_METHOD_OPTIONS, type MethodKey } from '@/lib/payment-method'

export type ChargeLine = { id: string; amountCents: number | null; method: MethodKey }

export function newChargeLine(
  amountCents: number | null = null,
  method: MethodKey = 'cash',
): ChargeLine {
  return { id: crypto.randomUUID(), amountCents, method }
}

/**
 * N líneas de {monto, método} — el control de cobro con método mixto (D2,
 * criterio de salida #3 del contrato de Fase 1). Extraído de
 * `deudas/ChargeDebtDialog.tsx` (turnos, primer caller) para reusarlo tal
 * cual en fiados de cantina y cuotas de torneo — misma UI, un solo lugar
 * donde vive la interacción de "pago dividido".
 */
export function SplitPaymentFields({
  lines,
  onChange,
  maxLines = 5,
  /** Si se pasa, muestra el atajo de un tap "Pagar todo en efectivo — $X". */
  quickAllCashCents,
  disabled = false,
  /** Default: las 4 (incluye 'other'). Cantina no admite 'other' (canteen.types.ts). */
  methodOptions = PAYMENT_METHOD_OPTIONS,
}: {
  lines: ChargeLine[]
  onChange: (lines: ChargeLine[]) => void
  maxLines?: number
  quickAllCashCents?: number
  disabled?: boolean
  methodOptions?: { value: MethodKey; label: string }[]
}) {
  function update(id: string, patch: Partial<Pick<ChargeLine, 'amountCents' | 'method'>>) {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function add() {
    onChange([...lines, newChargeLine(null, 'transfer')])
  }

  function remove(id: string) {
    onChange(lines.filter((l) => l.id !== id))
  }

  function quickAllCash() {
    if (quickAllCashCents == null) return
    onChange([newChargeLine(quickAllCashCents, 'cash')])
  }

  return (
    <div className="space-y-2">
      {quickAllCashCents != null && quickAllCashCents > 0 && (
        <button
          type="button"
          onClick={quickAllCash}
          disabled={disabled}
          // emerald-800, no emerald-700: a 12px sobre el fondo atenuado de los
          // contenedores que montan este control (#e2e7ee) el 700 da 4.41:1 y
          // el 800 da 6.2:1. Sobre blanco puro el 700 pasaría (4.57:1) — el
          // fondo tintado es lo que lo tira abajo del umbral.
          className="w-full h-10 rounded-lg border border-dashed border-emerald-500/40 text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors disabled:opacity-60"
        >
          Pagar todo en efectivo — {formatArs(quickAllCashCents)}
        </button>
      )}

      {lines.map((line, i) => (
        <div key={line.id} className="flex items-center gap-2">
          <div className="flex-1">
            <MoneyInput
              valueCents={line.amountCents}
              onValueChange={(cents) => update(line.id, { amountCents: cents })}
              minCents={1}
              placeholder="Monto"
              disabled={disabled}
            />
          </div>
          <select
            value={line.method}
            onChange={(e) => update(line.id, { method: e.target.value as MethodKey })}
            disabled={disabled}
            // Sin nombre accesible, axe lo marca `select-name`: en un lector de
            // pantalla el control se anuncia sólo por su valor ("Efectivo") y
            // no se entiende qué se está eligiendo. Con varias líneas de cobro
            // hay varios selects idénticos, así que el índice va en el nombre.
            aria-label={lines.length > 1 ? `Método de pago del cobro ${i + 1}` : 'Método de pago'}
            className="h-10 rounded-lg border border-input bg-background px-3 text-base md:text-sm font-medium text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring disabled:opacity-60"
          >
            {methodOptions.map((m) => (
              <option
                key={m.value}
                value={m.value}
                className="bg-background text-foreground dark:bg-slate-900 dark:text-slate-100"
              >
                {m.label}
              </option>
            ))}
          </select>
          {lines.length > 1 && (
            <button
              type="button"
              onClick={() => remove(line.id)}
              disabled={disabled}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-input text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-60"
              aria-label="Eliminar cobro"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}

      {lines.length < maxLines && (
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          // `text-primary` en claro ES emerald-700 (--primary), así que a 12px
          // sobre el fondo atenuado daba 4.47:1. Mismo criterio que el atajo de
          // arriba: un tono más oscuro en claro, emerald-400 en oscuro.
          className="flex min-h-11 items-center gap-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-400 hover:underline pt-1 md:min-h-0 disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar pago dividido
        </button>
      )}
    </div>
  )
}
