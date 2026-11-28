'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { choiceChipClass, SegmentedControl } from '@/components/ui/segmented-control'
import { useToast } from '@/hooks/use-toast'
import type { AbonadoRow } from '@/modules/abonados/abonado.types'
import type {
  AbonadoBillingMode,
  UpdateAbonadoAgreementResult,
} from '@/modules/settlements/settlement.types'

type Props = {
  abonado: AbonadoRow
  updateAction: (input: {
    abonadoId: string
    billingMode: AbonadoBillingMode
    pricePerSession: number
    agreedAmount: number
  }) => Promise<UpdateAbonadoAgreementResult>
  onClose: () => void
  onSuccess: () => void
}

const MODE_OPTIONS: Array<{ value: AbonadoBillingMode; label: string }> = [
  { value: 'per_session', label: 'Por cada turno' },
  { value: 'monthly', label: 'Por mes' },
  { value: 'pack', label: 'Pack de turnos' },
]

/**
 * Cambia cómo paga un turno fijo que ya existe (por ejemplo, pasar una escuelita cargada
 * con tarifa por turno a un acuerdo por mes). Nombre, teléfono, día y horario se editan
 * en "Editar turno fijo" (`AbonadoEditDialog`).
 */
export function AbonadoAgreementDialog({ abonado, updateAction, onClose, onSuccess }: Props) {
  const { toast } = useToast()
  const [billingMode, setBillingMode] = useState<AbonadoBillingMode>(abonado.billingMode)
  const [pricePerSession, setPricePerSession] = useState<number | null>(
    abonado.pricePerSession > 0 ? abonado.pricePerSession : null,
  )
  const [agreedAmount, setAgreedAmount] = useState<number | null>(
    abonado.agreedAmount > 0 ? abonado.agreedAmount : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleModeChange(next: AbonadoBillingMode) {
    setBillingMode(next)
    setError(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending) return

    if (billingMode !== 'monthly' && (!pricePerSession || pricePerSession <= 0)) {
      setError('Ingresá el precio por turno.')
      return
    }

    setError(null)
    startTransition(async () => {
      const res = await updateAction({
        abonadoId: abonado.id,
        billingMode,
        pricePerSession: billingMode === 'monthly' ? 0 : (pricePerSession ?? 0),
        agreedAmount: agreedAmount ?? 0,
      })
      if (!res.success) {
        startTransition(() => setError(res.error))
        return
      }
      toast({
        title: 'Listo, cambió cómo paga',
        description:
          res.updatedBookings === 1
            ? 'Se actualizó 1 turno que viene.'
            : res.updatedBookings > 1
              ? `Se actualizaron ${res.updatedBookings} turnos que vienen.`
              : 'Los próximos turnos van a seguir este acuerdo.',
        variant: 'success',
      })
      onSuccess()
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            Cómo paga · {abonado.contactName}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>¿Cómo paga?</Label>
            <SegmentedControl<AbonadoBillingMode>
              className="grid grid-cols-3 gap-1.5"
              aria-label="¿Cómo paga?"
              value={billingMode}
              onValueChange={handleModeChange}
              itemClassName={choiceChipClass}
              options={MODE_OPTIONS}
            />
          </div>

          {billingMode === 'monthly' ? (
            <div className="space-y-1.5">
              <Label htmlFor="edit-abonado-month-price">
                Precio por mes{' '}
                <span className="font-normal text-muted-foreground">(o $ 0 si va sin costo)</span>
              </Label>
              <MoneyInput
                id="edit-abonado-month-price"
                valueCents={agreedAmount}
                onValueChange={setAgreedAmount}
                minCents={0}
                placeholder="Ej: 250000"
              />
              <p className="text-xs text-muted-foreground">
                Los turnos que vienen y todavía no se cobraron dejan de tener precio por fecha: se
                cobra el mes.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-abonado-session-price">
                  {billingMode === 'pack' ? 'Precio por turno fuera del pack' : 'Precio por turno'}
                </Label>
                <MoneyInput
                  id="edit-abonado-session-price"
                  valueCents={pricePerSession}
                  onValueChange={setPricePerSession}
                  minCents={1}
                  required
                />
              </div>
              {billingMode === 'pack' && (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-abonado-pack-price">
                    Valor sugerido del pack de 4{' '}
                    <span className="font-normal text-muted-foreground">(opcional)</span>
                  </Label>
                  <MoneyInput
                    id="edit-abonado-pack-price"
                    valueCents={agreedAmount}
                    onValueChange={setAgreedAmount}
                    minCents={0}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Solo cambia los turnos que vienen y todavía no se cobraron ni se saldaron.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} className="gap-1.5">
              <Check className="h-4 w-4" aria-hidden />
              {isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
