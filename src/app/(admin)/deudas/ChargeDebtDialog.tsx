'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { chargeDebtAction, type ChargeDebtResult } from './actions'
import type { DebtRow } from './queries'

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'mercadopago', label: 'MercadoPago' },
  { value: 'other', label: 'Otro' },
] as const

type Method = (typeof METHOD_OPTIONS)[number]['value']

type ChargeLine = {
  id: string
  amountPesos: string
  method: Method
}

type Props = {
  debt: DebtRow | null
  onClose: () => void
  onSuccess?: () => void
}

export function ChargeDebtDialog({ debt, onClose, onSuccess }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Track the ID of the debt being edited to avoid state retention across different dialogs
  const [lastDebtId, setLastDebtId] = useState<string | null>(null)
  const [charges, setCharges] = useState<ChargeLine[]>([])

  if (debt && debt.id !== lastDebtId) {
    setLastDebtId(debt.id)
    setError(null)
    const initialAmount = Math.max(0, Math.round(debt.pending / 100))
    setCharges([
      {
        id: crypto.randomUUID(),
        amountPesos: initialAmount > 0 ? String(initialAmount) : '',
        method: 'cash',
      },
    ])
  }

  if (!debt) return null

  function handleClose() {
    setError(null)
    setLastDebtId(null)
    onClose()
  }

  function addChargeLine() {
    setCharges((prev) => [
      ...prev,
      { id: crypto.randomUUID(), amountPesos: '', method: 'transfer' },
    ])
  }

  function removeChargeLine(id: string) {
    setCharges((prev) => prev.filter((c) => c.id !== id))
  }

  function updateCharge(id: string, field: 'amountPesos' | 'method', value: string) {
    setCharges((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    )
  }

  function quickAllCash() {
    setCharges([
      {
        id: crypto.randomUUID(),
        amountPesos: String(Math.round(debt!.pending / 100)),
        method: 'cash',
      },
    ])
  }

  const totalChargingCents = charges.reduce((acc, c) => {
    const pesos = Number(c.amountPesos)
    return acc + (Number.isFinite(pesos) && pesos > 0 ? Math.round(pesos * 100) : 0)
  }, 0)

  const remainingDebtAfterCharge = Math.max(0, debt.pending - totalChargingCents)

  function submit() {
    setError(null)

    const parsedCharges: { amount: number; method: Method }[] = []
    for (const c of charges) {
      const pesos = Number(c.amountPesos)
      if (!Number.isFinite(pesos) || pesos <= 0) {
        setError('Todos los cobros deben tener un monto mayor a $0.')
        return
      }
      parsedCharges.push({ amount: Math.round(pesos * 100), method: c.method })
    }

    if (parsedCharges.length === 0) {
      setError('Debes ingresar al menos una línea de cobro.')
      return
    }

    const totalCents = parsedCharges.reduce((s, c) => s + c.amount, 0)
    if (totalCents > debt!.pending) {
      setError(`El cobro total (${formatArs(totalCents)}) supera la deuda pendiente (${formatArs(debt!.pending)}).`)
      return
    }

    const clientIdempotencyKey = crypto.randomUUID()

    startTransition(async () => {
      const res: ChargeDebtResult = await chargeDebtAction({
        bookingId: debt!.id,
        charges: parsedCharges,
        clientIdempotencyKey,
      })

      if (res.success) {
        toast({
          title: remainingDebtAfterCharge > 0 ? 'Pago registrado parcial' : 'Deuda saldada por completo',
          description: `Se registró el pago por ${formatArs(totalCents)}.`,
          variant: 'success',
        })
        setLastDebtId(null)
        onClose()
        if (onSuccess) onSuccess()
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  const label = `${debt.courtName} · ${debt.date} (${debt.timeStart.slice(0, 5)} - ${debt.timeEnd.slice(0, 5)})`

  return (
    <Dialog open={debt !== null} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Saldar Deuda</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{label}</p>

        <div className="space-y-4">
          {/* Breakdown */}
          <dl className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Precio original del turno</dt>
              <dd className="font-semibold text-foreground">{formatArs(debt.priceSnapshot)}</dd>
            </div>
            {debt.depositCounted > 0 && (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Seña abonada</dt>
                <dd className="text-foreground">−{formatArs(debt.depositCounted)}</dd>
              </div>
            )}
            {debt.chargesTotal > 0 && (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Pagos cobrados previamente</dt>
                <dd className="text-foreground">−{formatArs(debt.chargesTotal)}</dd>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-border pt-1.5">
              <dt className="font-medium text-foreground">Deuda actual pendiente</dt>
              <dd className="font-bold text-red-600 dark:text-red-400">{formatArs(debt.pending)}</dd>
            </div>
          </dl>

          {debt.notesInternal && (
            <div className="rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-300 border border-amber-500/20">
              <span className="font-semibold">Nota previa de deuda:</span> {debt.notesInternal}
            </div>
          )}

          {/* Quick action button */}
          <button
            type="button"
            onClick={quickAllCash}
            className="w-full h-10 rounded-lg border border-dashed border-emerald-500/40 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
          >
            Saldar todo en efectivo — {formatArs(debt.pending)}
          </button>

          {/* Charges inputs */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ingresar pago(s) de deuda
            </label>
            {charges.map((line) => (
              <div key={line.id} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Monto"
                    value={line.amountPesos}
                    onChange={(e) => updateCharge(line.id, 'amountPesos', e.target.value)}
                    className="w-full h-10 rounded-lg border border-input bg-background pl-7 pr-3 text-sm font-medium tabular-nums focus:outline-hidden focus:ring-2 focus:ring-ring"
                  />
                </div>
                <select
                  value={line.method}
                  onChange={(e) => updateCharge(line.id, 'method', e.target.value as Method)}
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
                >
                  {METHOD_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {charges.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeChargeLine(line.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-input text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    aria-label="Eliminar cobro"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}

            {charges.length < 5 && (
              <button
                type="button"
                onClick={addChargeLine}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline pt-1"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar pago dividido
              </button>
            )}
          </div>

          {/* Remaining balance preview */}
          <div className="rounded-lg bg-accent/50 p-3 text-sm flex items-center justify-between">
            <span className="text-muted-foreground font-medium">Deuda restante post-pago:</span>
            <span
              className={`font-semibold tabular-nums ${
                remainingDebtAfterCharge > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {remainingDebtAfterCharge > 0
                ? `${formatArs(remainingDebtAfterCharge)} (Queda saldo)`
                : '$0 — ¡Deuda Saldada!'}
            </span>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive font-medium">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="h-10 px-4 rounded-lg border border-input bg-background text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="h-10 px-4 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Registrando...' : 'Registrar pago de deuda'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
