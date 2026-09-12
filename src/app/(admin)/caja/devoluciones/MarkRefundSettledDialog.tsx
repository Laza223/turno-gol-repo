'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import type { ActionResult } from '@/shared/types/action-result'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RadioChip, RadioChipGroup } from '@/components/ui/radio-chip'
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
 *
 * Clase B de la gramática de interacción: `ConfirmDialog` con las consecuencias
 * a la vista, sin frase tipeada. Era Clase C y la frase se retiró por decisión
 * del dueño — elegir el medio explícitamente y confirmar con un botón que dice
 * el monto ya son dos decisiones conscientes, y tipear es lo más caro de todo
 * lo que se hace en el mostrador.
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
  const [method, setMethod] = useState<MethodKey>('mercadopago')

  // Al abrir con otra fila: proponer el mismo medio por el que entró la seña,
  // que es el camino más probable.
  const [lastId, setLastId] = useState<string | null>(null)
  if (row && row.refundPaymentId !== lastId) {
    setLastId(row.refundPaymentId)
    setMethod((row.method as MethodKey) ?? 'mercadopago')
  }

  async function onConfirm(): Promise<ActionResult> {
    if (!row) return { success: false, error: 'No hay ninguna devolución seleccionada.' }
    try {
      const result = await action(row.refundPaymentId, method)
      if (!result.success) return result
      if (result.alreadySettled) {
        toast({ title: 'Esta devolución ya estaba marcada.' })
      } else {
        toast({ title: 'Devolución registrada' })
      }
      router.refresh()
      return result
    } catch (err) {
      // Si onConfirm lanza, sin este catch el diálogo queda colgado en "Procesando…".
      Sentry.captureException(err)
      return {
        success: false,
        error: 'No pudimos registrar la devolución. Revisá tu conexión e intentá de nuevo.',
      }
    }
  }

  // Clase B de la gramática de interacción: las consecuencias se muestran, no
  // se tipean. Salen del código de la action, no de memoria — el egreso en caja
  // lo crea `markRefundSettledAction` solo para efectivo y transferencia.
  const consequences = row
    ? [
        `Queda registrado que ya le devolviste ${formatArs(row.amountCents)} a ${row.debtorName}.`,
        ...(method === 'cash' || method === 'transfer'
          ? ['Se anota como gasto en los movimientos del día.']
          : []),
        'No se puede deshacer.',
      ]
    : undefined

  return (
    <ConfirmDialog
      open={row !== null}
      onOpenChange={(v) => !v && onClose()}
      title="¿Ya devolviste esta seña?"
      description={
        <>
          Esto <strong className="text-foreground">no mueve plata en MercadoPago</strong>: la
          devolución la hacés vos por fuera y acá solo queda el registro.
        </>
      }
      consequences={consequences}
      confirmLabel={row ? `Marcar devuelta · ${formatArs(row.amountCents)}` : 'Marcar devuelta'}
      cancelLabel="Volver"
      onConfirm={onConfirm}
    >
      {row && (
        <div className="space-y-1.5">
          <p id="refund-method-label" className="text-sm font-medium text-foreground">
            ¿Por dónde se la devolviste?
          </p>
          <RadioChipGroup
            aria-labelledby="refund-method-label"
            value={method}
            onValueChange={(v) => setMethod(v as MethodKey)}
          >
            {PAYMENT_METHOD_OPTIONS.map((m) => (
              <RadioChip key={m.value} value={m.value}>
                {m.label}
              </RadioChip>
            ))}
          </RadioChipGroup>
        </div>
      )}
    </ConfirmDialog>
  )
}
