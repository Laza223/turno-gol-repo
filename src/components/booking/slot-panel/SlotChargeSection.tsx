'use client'

import { Wallet } from 'lucide-react'
import { SplitPaymentFields, type ChargeLine } from '@/components/admin/SplitPaymentFields'
import { CHARGE_COPY, type ChargeMode } from './charge-copy'

type Props = {
  mode: Exclude<ChargeMode, null>
  lines: ChargeLine[]
  onLinesChange: (lines: ChargeLine[]) => void
  pending: number
  error: string | null
  isPending: boolean
  onSubmit: () => void
}

/** Sección de cobro: método mixto + CTA, según el `ChargeMode` vigente. */
export function SlotChargeSection({
  mode,
  lines,
  onLinesChange,
  pending,
  error,
  isPending,
  onSubmit,
}: Props) {
  return (
    <section className="rounded-lg border border-border p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Wallet aria-hidden className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
        {CHARGE_COPY[mode].title}
      </h3>
      <SplitPaymentFields
        lines={lines}
        onChange={onLinesChange}
        // El adelanto va por addBookingChargeAction, que acepta UNA
        // línea: mostrar el mixto y después mandar sólo la primera
        // sería cobrar de menos sin avisar.
        maxLines={mode === 'advance' ? 1 : 5}
        quickAllCashCents={pending}
        disabled={isPending}
      />
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
        className="mt-3 h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 md:h-10"
      >
        {isPending ? 'Procesando…' : CHARGE_COPY[mode].cta}
      </button>
    </section>
  )
}
