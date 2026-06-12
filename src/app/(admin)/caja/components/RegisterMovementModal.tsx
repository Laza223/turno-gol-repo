'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createCashFlowAction } from '../actions'
import { occurredAtForDate } from './occurred-at'
import { toast } from '@/hooks/use-toast'

type CfType = 'income' | 'adjustment' | 'expense'
const CATEGORIES: Record<CfType, { value: string; label: string }[]> = {
  income: [
    { value: 'booking', label: 'Reserva' },
    { value: 'product_sale', label: 'Cantina/Bar' },
    { value: 'other', label: 'Otro ingreso' },
  ],
  expense: [{ value: 'operating_expense', label: 'Gasto operativo' }],
  adjustment: [
    { value: 'no_show_correction', label: 'Corrección por ausencia' },
    { value: 'other', label: 'Otro' },
  ],
}

export function RegisterMovementModal({
  open,
  onClose,
  date,
}: {
  open: boolean
  onClose: () => void
  date: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<CfType>('income')
  const [category, setCategory] = useState('booking')
  const [method, setMethod] = useState('cash')
  const [amountPesos, setAmountPesos] = useState('')
  const [description, setDescription] = useState('')
  // Fix #55: UUID generado una sola vez por apertura del modal.
  // El server hace ON CONFLICT DO NOTHING con esta clave para ignorar reenvíos.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  function reset() {
    setType('income'); setCategory('booking'); setMethod('cash')
    setAmountPesos(''); setDescription(''); setError(null)
    setIdempotencyKey(crypto.randomUUID())
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const pesos = Number(amountPesos)
    if (!Number.isFinite(pesos) || pesos <= 0) { setError('Ingresá un monto válido mayor a 0.'); return }
    if (description.trim().length < 1) { setError('Ingresá una descripción.'); return }
    const amount = Math.round(pesos * 100)
    startTransition(async () => {
      try {
        const res = await createCashFlowAction({
          type,
          category: category as
            | 'booking'
            | 'product_sale'
            | 'other'
            | 'no_show_correction'
            | 'operating_expense',
          method: method as 'cash' | 'transfer' | 'mercadopago' | 'other',
          amount,
          description: description.trim(),
          occurredAt: occurredAtForDate(date),
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
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Agregar movimiento</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="cf-type" className="text-xs font-medium text-slate-700">Tipo</label>
              <select id="cf-type" value={type}
                onChange={(e) => { const t = e.target.value as CfType; setType(t); setCategory(CATEGORIES[t][0].value) }}
                className="h-11 md:h-10 w-full rounded-md border border-slate-200 px-2 text-sm">
                <option value="income">Ingreso</option>
                <option value="expense">Gasto</option>
                <option value="adjustment">Ajuste</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="cf-category" className="text-xs font-medium text-slate-700">Categoría</label>
              <select id="cf-category" value={category} onChange={(e) => setCategory(e.target.value)}
                className="h-11 md:h-10 w-full rounded-md border border-slate-200 px-2 text-sm">
                {CATEGORIES[type].map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="cf-method" className="text-xs font-medium text-slate-700">Método</label>
              <select id="cf-method" value={method} onChange={(e) => setMethod(e.target.value)}
                className="h-11 md:h-10 w-full rounded-md border border-slate-200 px-2 text-sm">
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="mercadopago">MercadoPago</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="cf-amount" className="text-xs font-medium text-slate-700">Monto (pesos)</label>
              <input id="cf-amount" type="number" min="0" step="0.01" value={amountPesos}
                onChange={(e) => setAmountPesos(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                className="h-11 md:h-10 w-full rounded-md border border-slate-200 px-3 text-sm tabular-nums" />
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="cf-desc" className="text-xs font-medium text-slate-700">Descripción</label>
            <textarea id="cf-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full rounded-md border border-slate-200 px-3 py-2 min-h-[44px] md:min-h-0 text-sm" />
          </div>
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" disabled={isPending} onClick={() => handleOpenChange(false)}
              className="h-11 md:h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancelar</button>
            <button type="submit" disabled={isPending}
              className="h-11 md:h-10 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {isPending ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
