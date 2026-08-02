'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { chipClass } from '../caja-lib'
import type { CashFlowActionResult } from '../actions'
import { occurredAtForDate } from './occurred-at'
import { isValidMovement } from './is-valid-movement'
import { toast } from '@/hooks/use-toast'
import { PAYMENT_METHOD_OPTIONS } from '@/lib/payment-method'
import { MoneyInput } from '@/components/ui/money-input'
import type { CashFlowCategory, CreateCashFlowInput } from '@/modules/cashflow/cashflow.types'

/**
 * createCashFlowAction llega por PROP, no por import: '../actions' es
 * `'use server'` y arrastra drizzle/postgres → `node:async_hooks`, que Vite
 * externaliza en el browser (rompe Storybook). Ver CanteenQuickSale, que
 * comparte la misma action.
 */
export type CreateCashFlowAction = (input: CreateCashFlowInput) => Promise<CashFlowActionResult>

type CfType = 'income' | 'adjustment' | 'expense'

const TYPES: { value: CfType; label: string }[] = [
  { value: 'income', label: 'Ingreso' },
  { value: 'expense', label: 'Gasto' },
  { value: 'adjustment', label: 'Ajuste' },
]

const CATEGORIES: Record<CfType, { value: string; label: string }[]> = {
  income: [
    { value: 'booking', label: 'Reserva' },
    { value: 'product_sale', label: 'Cantina/Bar' },
    { value: 'other', label: 'Otro ingreso' },
  ],
  // La UI nunca ofrece 'operating_expense' (legacy, solo display en historial —
  // ver categoryLabel en caja-lib.ts). Elegir "Gasto" auto-selecciona la
  // primera de esta lista (merchandise, cambio #7 migr. 050).
  expense: [
    { value: 'merchandise', label: 'Mercadería' },
    { value: 'salaries', label: 'Sueldos' },
    { value: 'utilities', label: 'Servicios' },
    { value: 'maintenance', label: 'Mantenimiento' },
    { value: 'other_expense', label: 'Otro gasto' },
  ],
  adjustment: [
    { value: 'no_show_correction', label: 'Corrección por ausencia' },
    { value: 'other', label: 'Otro' },
  ],
}

export function RegisterMovementModal({
  open,
  onClose,
  date,
  cutoffMins,
  createCashFlowAction,
}: {
  open: boolean
  onClose: () => void
  date: string
  /** Día operativo (ver operating-day.ts): occurredAtForDate lo necesita para "hoy". */
  cutoffMins: number
  createCashFlowAction: CreateCashFlowAction
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<CfType>('income')
  const [category, setCategory] = useState('booking')
  const [method, setMethod] = useState('cash')
  const [amountCents, setAmountCents] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  // Fix #55: UUID generado una sola vez por apertura del modal.
  // El server hace ON CONFLICT DO NOTHING con esta clave para ignorar reenvíos.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  // Fase 4 UX: el botón "Guardar" arranca deshabilitado con campos vacíos, en
  // vez de recién avisar el error al clickear.
  const isValid = isValidMovement(amountCents, description)

  function reset() {
    setType('income'); setCategory('booking'); setMethod('cash')
    setAmountCents(null); setDescription(''); setError(null)
    setIdempotencyKey(crypto.randomUUID())
  }

  // Cambiar de tipo re-selecciona la primera categoría válida del combo
  // (contrato VALID_COMBOS del service: una categoría del tipo anterior es 400).
  function selectType(t: CfType) {
    setType(t)
    setCategory(CATEGORIES[t][0]!.value)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (amountCents == null || amountCents <= 0) { setError('Ingresá un monto válido mayor a 0.'); return }
    if (description.trim().length < 1) { setError('Ingresá una descripción.'); return }
    startTransition(async () => {
      try {
        const res = await createCashFlowAction({
          type,
          category: category as CashFlowCategory,
          method: method as 'cash' | 'transfer' | 'mercadopago' | 'other',
          amount: amountCents,
          description: description.trim(),
          occurredAt: occurredAtForDate(date, cutoffMins),
          clientIdempotencyKey: idempotencyKey,
        })
        if (res.success) {
          toast({ title: 'Movimiento registrado', variant: 'success' })
          reset(); router.refresh(); onClose()
        } else setError(res.error)
      } catch (err) {
        // A thrown action must not leave the modal stuck on "Guardando…" — which
        // also locks the close button (handleOpenChange bails while isPending).
        // Report it (a silent catch would hide a real server failure) and recover.
        Sentry.captureException(err)
        setError('No pudimos registrar el movimiento. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return
    if (!next) { reset(); onClose() }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl">
        <DialogHeader><DialogTitle>Agregar movimiento</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
            {/* Columna Izquierda: Tipo y Categoría */}
            <div className="space-y-4">
              <fieldset>
                <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipo</legend>
                <div className="grid grid-cols-3 gap-2">
                  {TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      disabled={isPending}
                      aria-pressed={type === t.value}
                      onClick={() => selectType(t.value)}
                      className={chipClass(type === t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Categoría</legend>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES[type].map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      disabled={isPending}
                      aria-pressed={category === c.value}
                      onClick={() => setCategory(c.value)}
                      className={chipClass(category === c.value)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            {/* Columna Derecha: Método, Monto y Descripción */}
            <div className="space-y-3">
              <fieldset>
                <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Método de pago</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      disabled={isPending}
                      aria-pressed={method === m.value}
                      onClick={() => setMethod(m.value)}
                      className={chipClass(method === m.value)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="space-y-1">
                <label htmlFor="cf-amount" className="text-xs font-medium text-foreground">Monto (pesos)</label>
                <MoneyInput
                  id="cf-amount"
                  valueCents={amountCents}
                  onValueChange={setAmountCents}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="cf-desc" className="text-xs font-medium text-foreground">Descripción</label>
                <textarea id="cf-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                  placeholder="ej: Pago de luz, hielo para cantina..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-ring resize-none" />
              </div>
            </div>
          </div>

          {error && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2.5 pt-2 border-t border-border/60">
            <button type="button" disabled={isPending} onClick={() => handleOpenChange(false)}
              className="h-10 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-60">Cancelar</button>
            <Button type="submit" disabled={!isValid} isLoading={isPending} className="px-5">
              {isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
