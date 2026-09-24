'use client'

import { useEffect } from 'react'
import { MoneyInput } from '@/components/ui/money-input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { PaymentMethodChips } from '@/components/ui/payment-method-chips'
import { cn } from '@/lib/utils'
import type { ChargeChoice, DepositMethod } from './types'

const CHOICES: Array<{ value: ChargeChoice; label: string }> = [
  { value: 'none', label: 'No cobré' },
  { value: 'partial', label: 'Una parte' },
  { value: 'full', label: 'Todo' },
]

const chipClass = (active: boolean) =>
  cn(
    'h-11 md:h-9 cursor-pointer rounded-lg border text-xs font-semibold transition-colors',
    active
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-card hover:bg-accent',
  )

/**
 * "¿Cobraste algo ahora?" — No cobré (default) / Una parte / Todo, con método
 * y monto sólo cuando corresponde. "Todo" precarga el total; "Una parte" arranca
 * vacío (nunca se inventa un monto). Turno y Evento la comparten tal cual.
 */
type Props = {
  totalCents: number
  choice: ChargeChoice
  method: DepositMethod | null
  amountCents: number | null
  onChoiceChange: (c: ChargeChoice) => void
  onMethodChange: (m: DepositMethod) => void
  onAmountChange: (cents: number | null) => void
}

export function ChargeSection({
  totalCents,
  choice,
  method,
  amountCents,
  onChoiceChange,
  onMethodChange,
  onAmountChange,
}: Props) {
  function handleChoice(next: ChargeChoice) {
    onChoiceChange(next)
    if (next === 'full') {
      onMethodChange(method ?? 'cash')
      onAmountChange(totalCents)
    } else if (next === 'partial') {
      onMethodChange(method ?? 'cash')
      onAmountChange(null)
    } else {
      onAmountChange(null)
    }
  }

  // Hallazgo #1 (redesign booking modal, 2026-09-14): "Todo" precarga el
  // monto con el total DE ESE MOMENTO, pero el precio se puede editar después
  // con "Cambiar" — sin este resync, bajar el precio dejaba un
  // `depositAmount` mayor al `priceOverride` que se manda al server (MoneyInput
  // sólo clampea su PROPIO valor al perder foco, nunca vuelve a mirar el total
  // ajeno). Vive acá — no en cada form — porque los dos (Turno/Evento) la
  // comparten.
  useEffect(() => {
    if (choice === 'full' && amountCents !== totalCents) {
      onAmountChange(totalCents)
    } else if (choice === 'partial' && amountCents != null && amountCents > totalCents) {
      onAmountChange(totalCents)
    }
  }, [choice, totalCents, amountCents, onAmountChange])

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">¿Cobraste algo ahora?</legend>
      <SegmentedControl
        className="grid grid-cols-3 gap-1.5"
        aria-label="¿Cobraste algo ahora?"
        value={choice}
        onValueChange={handleChoice}
        itemClassName={chipClass}
        options={CHOICES}
      />
      {choice !== 'none' && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
          <PaymentMethodChips<DepositMethod>
            className="grid grid-cols-4 gap-1.5"
            aria-label="Método de cobro"
            value={method ?? 'cash'}
            onValueChange={onMethodChange}
          />
          <MoneyInput
            aria-label="Monto cobrado"
            valueCents={amountCents}
            onValueChange={onAmountChange}
            minCents={1}
            maxCents={totalCents}
            placeholder="Monto"
          />
        </div>
      )}
    </fieldset>
  )
}
