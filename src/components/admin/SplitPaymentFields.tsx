'use client'

import { Plus, Trash2 } from 'lucide-react'
import { MoneyInput } from '@/components/ui/money-input'
import { SelectMenu } from '@/components/ui/select-menu'
import { formatArs } from '@/lib/format'
import { PAYMENT_METHOD_OPTIONS, type MethodKey } from '@/lib/payment-method'

/**
 * `team` es del cobro por equipo del turno: agrupa las líneas en pantalla y
 * viaja con cada cobro, que se guarda con su equipo (`cash_flows.booking_team`,
 * decisión del dueño del 2026-09-25). Es solo "Equipo 1" o "Equipo 2": el
 * sistema no registra quién es cada persona.
 */
export type ChargeLine = {
  id: string
  amountCents: number | null
  method: MethodKey
  team?: 1 | 2
}

export function newChargeLine(
  amountCents: number | null = null,
  method: MethodKey = 'cash',
  team?: 1 | 2,
): ChargeLine {
  return { id: crypto.randomUUID(), amountCents, method, ...(team ? { team } : {}) }
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
  /** Si se pasa, muestra el atajo de un tap "Cobrar todo en efectivo — $X". */
  quickAllCashCents,
  /**
   * Si se pasa, el atajo COBRA de una (llama a la misma Server Action que
   * "Registrar cobro"), en vez de sólo rellenar las líneas. Recibe el
   * callback en lugar de armar las líneas acá adentro: el caller es quien
   * sabe qué acción disparar y ya tiene su propio manejo de error/toast.
   */
  onQuickAllCash,
  disabled = false,
  /** Default: las 4 (incluye 'other'). Cantina no admite 'other' (canteen.types.ts). */
  methodOptions = PAYMENT_METHOD_OPTIONS,
  /**
   * Prefijo de los `id` de cada campo (`${idPrefix}-amount-1`,
   * `${idPrefix}-method-1`, …). `SelectMenu` exige `id`, y con varias
   * instancias en la misma pantalla (los dos equipos) tienen que ser únicos.
   */
  idPrefix,
  /**
   * Se intercala en el nombre accesible de cada campo, p. ej. `del Equipo 1`.
   * El texto visible del select es sólo el valor ("Efectivo"), que no dice
   * QUÉ se está eligiendo ni de quién.
   */
  groupLabel,
  showWords = true,
}: {
  lines: ChargeLine[]
  onChange: (lines: ChargeLine[]) => void
  maxLines?: number
  quickAllCashCents?: number
  onQuickAllCash?: () => void
  disabled?: boolean
  methodOptions?: { value: MethodKey; label: string }[]
  idPrefix: string
  groupLabel?: string
  /** El monto en palabras debajo de cada campo (`MoneyInput`). */
  showWords?: boolean
}) {
  function update(id: string, patch: Partial<Pick<ChargeLine, 'amountCents' | 'method'>>) {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function add() {
    onChange([...lines, newChargeLine(null, 'transfer', lines[0]?.team)])
  }

  function remove(id: string) {
    onChange(lines.filter((l) => l.id !== id))
  }

  function quickAllCash() {
    if (quickAllCashCents == null) return
    if (onQuickAllCash) {
      onQuickAllCash()
      return
    }
    onChange([newChargeLine(quickAllCashCents, 'cash')])
  }

  const suffix = groupLabel ? ` ${groupLabel}` : ''
  function fieldLabel(base: string, i: number) {
    return lines.length > 1 ? `${base}${suffix} · cobro ${i + 1}` : `${base}${suffix}`
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
          Cobrar todo en efectivo — {formatArs(quickAllCashCents)}
        </button>
      )}

      {lines.map((line, i) => (
        // Arriba y no al centro: el monto en palabras va debajo del campo y, centrado,
        // el método quedaba corrido hacia abajo respecto del monto.
        <div key={line.id} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <MoneyInput
              id={`${idPrefix}-amount-${i + 1}`}
              valueCents={line.amountCents}
              onValueChange={(cents) => update(line.id, { amountCents: cents })}
              minCents={1}
              placeholder="Monto"
              disabled={disabled}
              showWords={showWords}
              aria-label={fieldLabel('Monto', i)}
            />
          </div>
          {/* Mismo desplegable que "Editar cancha" y el campo "Hora" del buscador
              público: el `<select>` nativo que había acá era el único control del
              panel que se veía del navegador y no de la app (pedido del dueño,
              2026-09-17). Altura y radio se bajan a los del MoneyInput de al lado
              — el default del primitivo (h-12/rounded-xl) es el de un formulario
              de página, no el de una fila de cobro. */}
          <SelectMenu
            id={`${idPrefix}-method-${i + 1}`}
            value={line.method}
            onChange={(v) => update(line.id, { method: v as MethodKey })}
            options={methodOptions}
            disabled={disabled}
            aria-label={fieldLabel('Método de pago', i)}
            // 9.75rem: "Transferencia" a 14px más el chevron no entra en menos
            // y quedaba cortado ("Transferen…"). `bg-card` para que el campo sea
            // la MISMA superficie que el MoneyInput de al lado — el default del
            // primitivo (`bg-background`) es medio tono más gris y se notaba.
            // `text-sm` también en el teléfono: el primitivo trae `text-base
            // md:text-sm` por la regla de iOS (zoomea los campos de menos de
            // 16px), pero esto es un `<button>`, no un campo donde se tipea —
            // iOS no lo zoomea y a 16px "Transferencia" no entra en 375px.
            className="h-11 w-[9.75rem] shrink-0 rounded-lg bg-card text-sm md:h-10"
          />
          {lines.length > 1 && (
            <button
              type="button"
              onClick={() => remove(line.id)}
              disabled={disabled}
              className="flex h-11 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-60 md:h-10"
              aria-label={`Eliminar cobro ${i + 1}${suffix}`}
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
          // Con los dos equipos en pantalla hay DOS botones con este mismo
          // texto: sin el sufijo, el nombre accesible no los distingue.
          {...(groupLabel ? { 'aria-label': `Agregar pago dividido ${groupLabel}` } : {})}
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
