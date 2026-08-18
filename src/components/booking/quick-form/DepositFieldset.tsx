'use client'

import { MoneyInput } from '@/components/ui/money-input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { calcDepositCents } from '@/lib/booking/pricing'
import { DEPOSIT_METHODS } from './constants'
import type { DepositMethod } from './constants'

/** Sentinel de "Sin seña": Radix RadioGroup exige un `value` string, no `null`. */
const NONE = 'none'
type DepositValue = DepositMethod | typeof NONE

/** Mismas clases que ya tenían los `<button>` sueltos (F-007). */
const depositChipClass = (active: boolean) =>
  cn(
    'h-10 rounded-md border text-xs font-semibold transition-colors',
    active
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-card hover:bg-accent',
  )

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

  // F-007: era un toggle (reclickear el método activo lo apagaba a "Sin
  // seña") — con un radiogroup de verdad eso no aplica (un radio no se
  // desmarca reclickeándose, es semántica del rol). "Sin seña" sigue ahí
  // como opción explícita, a un click: se pierde el atajo de reclick, no la
  // función.
  function handleDepositChange(v: DepositValue) {
    if (v === NONE) {
      onDepositMethodChange(null)
      onDepositCentsChange(null)
      return
    }
    onDepositMethodChange(v)
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
      <SegmentedControl
        className="grid grid-cols-4 gap-1.5"
        aria-label="Seña"
        value={depositMethod ?? NONE}
        onValueChange={handleDepositChange}
        disabled={isPending || taken}
        itemClassName={depositChipClass}
        options={[
          { value: NONE, label: 'Sin seña' },
          ...DEPOSIT_METHODS.map((m) => ({ value: m.value, label: m.label })),
        ]}
      />
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
