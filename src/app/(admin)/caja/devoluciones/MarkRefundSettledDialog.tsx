'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { PAYMENT_METHOD_OPTIONS, type MethodKey } from '@/lib/payment-method'
import type { PendingRefundRow } from '@/modules/payments/refund.service'
import type { MarkRefundSettledResult } from './actions'

/** Firma de la Server Action que registra la devolución. */
export type MarkRefundSettledAction = (
  refundPaymentId: string,
  method: string,
) => Promise<MarkRefundSettledResult>

/**
 * "Ya devolví": el complejo registra que la plata salió.
 *
 * El método que se elige acá es por dónde viajó DE VERDAD, que puede no ser el
 * mismo por el que había entrado la seña — se cobró por MercadoPago y se
 * devolvió por transferencia es el caso más común hoy. Efectivo y transferencia
 * generan además el egreso en la caja del día.
 *
 * No se puede deshacer (decisión del dueño): queda registrado quién tildó,
 * cuándo y por qué medio, y eso alcanza como prueba frente al jugador.
 */
export function MarkRefundSettledDialog({
  row,
  onClose,
  action,
}: {
  row: PendingRefundRow | null
  onClose: () => void
  /**
   * Por PROP, no por import: './actions' es `'use server'` y arrastra
   * `node:async_hooks` (vía request-context), que rompe cualquier bundle de
   * browser — Storybook incluido. El type import sí es seguro: se borra en
   * compilación.
   */
  action: MarkRefundSettledAction
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [method, setMethod] = useState<MethodKey>('mercadopago')

  // Al abrir con otra fila: limpiar el error y proponer el mismo medio por el
  // que entró la seña, que es el camino más probable.
  const [lastId, setLastId] = useState<string | null>(null)
  if (row && row.refundPaymentId !== lastId) {
    setLastId(row.refundPaymentId)
    setError(null)
    setMethod((row.method as MethodKey) ?? 'mercadopago')
  }

  function handleConfirm() {
    if (!row) return
    setError(null)
    startTransition(async () => {
      const result = await action(row.refundPaymentId, method)
      if (!result.success) {
        setError(result.error)
        return
      }
      if (result.alreadySettled) {
        toast({ title: 'Esta devolución ya estaba marcada.' })
      } else if (result.cashFlowSkipped) {
        toast({
          title: 'Devolución registrada',
          description:
            'La caja de ese día ya estaba cerrada, así que el egreso no se agregó. Registralo a mano si lo necesitás.',
        })
      } else {
        toast({ title: 'Devolución registrada' })
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open={row !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Ya devolviste esta seña?</DialogTitle>
        </DialogHeader>

        {row && (
          <div className="space-y-4">
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>
                Monto: <strong className="text-foreground">{formatArs(row.amountCents)}</strong>
              </li>
              <li>
                Jugador: <strong className="text-foreground">{row.debtorName}</strong>
              </li>
            </ul>

            <div className="space-y-1">
              <label htmlFor="refund-method" className="block text-sm font-medium text-foreground">
                ¿Por dónde se la devolviste?
              </label>
              <select
                id="refund-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as MethodKey)}
                className="flex h-11 w-full rounded-lg border border-border bg-card px-3.5 text-base md:h-10 md:text-sm text-foreground shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                {PAYMENT_METHOD_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              Esto <strong className="text-foreground">no mueve plata en MercadoPago</strong>: solo
              registra que ya la devolviste.
              {(method === 'cash' || method === 'transfer') && (
                <> Se va a anotar como gasto en la caja del día.</>
              )}{' '}
              No se puede deshacer.
            </p>

            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 md:h-10"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-50 md:h-10"
              >
                {isPending ? 'Registrando…' : 'Sí, ya devolví'}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
