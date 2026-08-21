'use client'

import { MoneyInput } from '@/components/ui/money-input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { cn } from '@/lib/utils'
import { DEPOSIT_METHODS } from './constants'
import type { DepositMethod } from './constants'

/** Sentinel de "no cobré nada": Radix RadioGroup exige un `value` string, no `null`. */
const NONE = 'none'
/**
 * Sentinel de "todavía no eligió". Ningún `Item` matchea este valor, así que
 * el grupo arranca sin nada marcado y el submit puede exigir una respuesta.
 */
const UNSET = ''

/** Lo que el operador afirmó sobre la plata: un método, o "no cobré". */
export type DepositChoice = DepositMethod | typeof NONE

/** Mismas clases que ya tenían los `<button>` sueltos (F-007). */
const depositChipClass = (active: boolean) =>
  cn(
    'h-10 rounded-md border text-xs font-semibold transition-colors',
    active
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-card hover:bg-accent',
  )

type Props = {
  /** `null` = todavía no eligió; `'none'` = eligió explícitamente "No cobré". */
  depositChoice: DepositChoice | null
  depositCents: number | null
  onDepositChoiceChange: (choice: DepositChoice) => void
  onDepositCentsChange: (cents: number | null) => void
  isPending: boolean
  taken: boolean
}

/**
 * Qué se cobró al crear el turno a mano: "No cobré" + los 3 métodos de
 * `DEPOSIT_METHODS`, más el monto cuando hay método elegido. El estado vive en
 * el padre (lo necesita `submit`); acá solo la UI.
 *
 * Sin preselección y sin monto sugerido, las dos a pedido del dueño. El
 * mostrador y el portal online son mundos distintos: `settings.deposit_percentage`
 * es la política de lo que se le cobra por adelantado al que reserva por la web,
 * y precargar ese número acá hacía que un complejo con la seña en 100% creara
 * turnos "pagados completos" con un solo click, sin que nadie tipeara el monto.
 * Acá la plata la afirma quien está en el mostrador, o dice que no cobró nada.
 */
export function DepositFieldset({
  depositChoice,
  depositCents,
  onDepositChoiceChange,
  onDepositCentsChange,
  isPending,
  taken,
}: Props) {
  function handleDepositChange(v: DepositChoice) {
    onDepositChoiceChange(v)
    // El monto arranca vacío siempre: cambiar de método no arrastra lo tipeado
    // para el anterior, y "No cobré" no puede quedarse con un monto colgado.
    onDepositCentsChange(null)
  }

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium">¿Cobraste algo ahora?</legend>
      <SegmentedControl
        className="grid grid-cols-4 gap-1.5"
        aria-label="¿Cobraste algo ahora?"
        value={depositChoice ?? UNSET}
        onValueChange={(v) => handleDepositChange(v as DepositChoice)}
        disabled={isPending || taken}
        itemClassName={depositChipClass}
        options={[
          { value: NONE, label: 'No cobré' },
          ...DEPOSIT_METHODS.map((m) => ({ value: m.value, label: m.label })),
        ]}
      />
      {depositChoice !== null && depositChoice !== NONE && (
        <MoneyInput
          aria-label="Cuánto cobraste"
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
