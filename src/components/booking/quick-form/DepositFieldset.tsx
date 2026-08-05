'use client'

import { MoneyInput } from '@/components/ui/money-input'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { calcDepositCents } from '@/lib/booking/pricing'
import { DEPOSIT_METHODS } from './constants'
import type { DepositMethod } from './constants'

type Props = {
  /** Precio de la franja, en centavos. `null` = sin regla de precio configurada. */
  price: number | null
  /** `settings.deposit_percentage` del complejo. Sugiere el monto de la seña. */
  depositPercentage: number
  depositMethod: DepositMethod | null
  depositCents: number | null
  onDepositMethodChange: (method: DepositMethod | null) => void
  onDepositCentsChange: (cents: number | null) => void
  isPending: boolean
  taken: boolean
}

/**
 * Fieldset de seña: "Sin seña" + los 3 métodos de `DEPOSIT_METHODS`, más el
 * monto (`MoneyInput`) cuando hay un método elegido. El estado vive en el
 * padre (lo necesita `submit`); acá solo la UI y el cálculo de sugerencia.
 */
export function DepositFieldset({
  price,
  depositPercentage,
  depositMethod,
  depositCents,
  onDepositMethodChange,
  onDepositCentsChange,
  isPending,
  taken,
}: Props) {
  /** Sugerencia de seña, o `null` si el complejo no configuró porcentaje. */
  const suggestedDeposit = (() => {
    if (price == null) return null
    const cents = calcDepositCents(price, depositPercentage)
    return cents > 0 ? cents : null
  })()

  function toggleDeposit(method: DepositMethod) {
    if (depositMethod === method) {
      onDepositMethodChange(null)
      onDepositCentsChange(null)
      return
    }
    onDepositMethodChange(method)
    // Pre-cargado con el % del complejo — pero SOLO si da algo mayor a $0.
    // Un complejo con `deposit_percentage: 0` (no pide seña online, config
    // válida y la del seed) dejaba el monto en $0, y el submit lo rechazaba:
    // el atajo se convertía en un callejón sin salida. Con la sugerencia vacía,
    // el admin tipea el monto y sigue.
    onDepositCentsChange(suggestedDeposit)
  }

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium">
        Seña
        {suggestedDeposit != null && (
          <span className="text-muted-foreground"> · sugerida {formatArs(suggestedDeposit)}</span>
        )}
      </legend>
      <div className="grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={() => {
            onDepositMethodChange(null)
            onDepositCentsChange(null)
          }}
          aria-pressed={depositMethod === null}
          disabled={isPending || taken}
          className={cn(
            'h-10 rounded-md border text-xs font-semibold transition-colors',
            depositMethod === null
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card hover:bg-accent',
          )}
        >
          Sin seña
        </button>
        {DEPOSIT_METHODS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => toggleDeposit(m.value)}
            aria-pressed={depositMethod === m.value}
            disabled={isPending || taken}
            className={cn(
              'h-10 rounded-md border text-xs font-semibold transition-colors',
              depositMethod === m.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card hover:bg-accent',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      {depositMethod && (
        <MoneyInput
          aria-label="Monto de la seña"
          valueCents={depositCents}
          onValueChange={onDepositCentsChange}
          disabled={isPending}
          minCents={0}
          showWords={false}
        />
      )}
    </fieldset>
  )
}
