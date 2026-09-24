'use client'

import type { ActionResult } from '@/shared/types/action-result'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RadioChip, RadioChipGroup } from '@/components/ui/radio-chip'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'

export type DepositMethod = 'cash' | 'transfer' | 'other'
export type ConfirmDepositFn = (bookingId: string, method: DepositMethod) => Promise<ActionResult>

const DEPOSIT_METHOD_LABELS: Record<DepositMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  other: 'Otro',
}

/**
 * "Cobrar seña $X" — confirmar a mano la seña de un turno `pending_payment`
 * (paso 3, docs/decisions/2026-09-24-navegacion-panel.md, "Botones de cada
 * fila de Reservas"): la única puerta para `confirmDepositPaymentAction`
 * hasta ahora era `QuickActions.tsx` (fila de /reservas), que se retira.
 *
 * Lo consumen el modal de cobro (Hoy y Grilla) y la página del turno — vive
 * en `@/components` y no en `@/app` porque las dos lo necesitan, y la Server
 * Action llega por PROP (`@/components` no puede importar `'use server'`).
 */
export function CobrarSenaButton({
  bookingId,
  depositAmount,
  confirmDepositPaymentAction,
  onSuccess,
  disabled,
  className,
}: {
  bookingId: string
  depositAmount: number
  confirmDepositPaymentAction: ConfirmDepositFn
  /** Se cobró la seña: el caller refresca (`onMutated` del modal, `router.refresh()` de la página). */
  onSuccess?: () => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<DepositMethod>('cash')

  function openDialog() {
    setMethod('cash')
    setOpen(true)
  }

  async function onConfirm(): Promise<ActionResult> {
    const res = await confirmDepositPaymentAction(bookingId, method)
    if (res.success) {
      toast({ title: 'Seña cobrada', variant: 'success' })
      onSuccess?.()
    }
    return res
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={disabled}
        className={cn(
          'flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 md:h-10',
          className,
        )}
      >
        Cobrar seña {formatArs(depositAmount)}
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cobrar seña"
        description="Indicá cómo se cobró la seña."
        confirmLabel={`Cobrar ${formatArs(depositAmount)}`}
        cancelLabel="Volver"
        onConfirm={onConfirm}
      >
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-foreground">¿Cómo se cobró la seña?</legend>
          <RadioChipGroup value={method} onValueChange={(v) => setMethod(v as DepositMethod)}>
            {(['cash', 'transfer', 'other'] as const).map((m) => (
              <RadioChip key={m} value={m}>
                {DEPOSIT_METHOD_LABELS[m]}
              </RadioChip>
            ))}
          </RadioChipGroup>
        </fieldset>
      </ConfirmDialog>
    </>
  )
}
