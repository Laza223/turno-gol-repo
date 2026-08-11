'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Lock } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { MoneyInput } from '@/components/ui/money-input'
import { formatArsContable } from '@/lib/format'
import { mediumDateLabel } from '../caja-lib'
import type { CloseDayActionResult } from '../actions'
import { toast } from '@/hooks/use-toast'
import { track } from '@/shared/observability/breadcrumbs'

/**
 * closeDayAction llega por PROP: '../actions' es `'use server'` y arrastra
 * drizzle/postgres → `node:async_hooks`, que rompe Storybook si se importa
 * como valor (ver el comentario de ReservasPolicyForm.tsx).
 */
export type CloseDayAction = (
  date: string,
  declaredCash?: number,
  note?: string,
) => Promise<CloseDayActionResult>

export function CloseDayButton({
  date,
  tenantId,
  totalIncome,
  totalExpense,
  balance,
  cashTotal,
  expectedCash,
  openingCash,
  closeDayAction,
}: {
  date: string
  /** Proxy de medición §11 (contrato, criterio #6): identifica al tenant en los breadcrumbs de duración/diferencia del cierre. */
  tenantId: string
  totalIncome: number
  totalExpense: number
  balance: number
  /** Neto en efectivo del día (byMethod.cash): la referencia para contar el cajón. */
  cashTotal: number
  /** Fondo inicial + neto efectivo del día (migr. 049): SIEMPRE es un número
   * — sin apertura, openingCash es 0 y expectedCash === cashTotal. */
  expectedCash: number
  /** Fondo declarado en la apertura; null si el día no se abrió (sin fila en daily_cash_opens). */
  openingCash: number | null
  closeDayAction: CloseDayAction
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [declaredCentsState, setDeclaredCentsState] = useState<number | null>(null)
  const [note, setNote] = useState('')
  // Proxy "cierre ≤ 90s" (§11): arranca al abrir el diálogo, se lee al confirmar.
  const [openedAtMs, setOpenedAtMs] = useState<number | null>(null)

  // null (campo nunca tipeado) = "no declarado", misma semántica que antes tenía
  // el string vacío.
  const declaredCents = declaredCentsState ?? undefined
  // Migr. 049: la comparación del arqueo pasa de "saldo neto de la caja" a
  // "efectivo esperado" (fondo inicial + neto cash) — el saldo mezcla métodos
  // de pago que no están en el cajón físico.
  const diff = declaredCents === undefined ? null : declaredCents - expectedCash
  const noteRequired = diff !== null && diff !== 0

  async function onConfirm(): Promise<{ success: boolean; error?: string }> {
    if (noteRequired && note.trim().length < 1) {
      return { success: false, error: 'Hay diferencia: la nota es obligatoria.' }
    }
    try {
      const res = await closeDayAction(date, declaredCents, note.trim() || undefined)
      if (res.success) {
        toast({
          title: 'Caja cerrada',
          description: 'El resumen del día quedó guardado.',
          variant: 'success',
        })
        track.cashflow('close.confirmed', {
          tenantId,
          durationMs: openedAtMs != null ? Date.now() - openedAtMs : undefined,
          diffCents: diff ?? 0,
        })
        router.refresh()
      }
      return res
    } catch (err) {
      // Error inesperado (DB/red) en el cierre: lo contenemos acá para mostrar un
      // mensaje contextual y permitir reintentar, sin disparar el error boundary
      // ni quedar colgado en "Procesando…" (#49). Mismo patrón que RegisterMovementModal.
      Sentry.captureException(err)
      return {
        success: false,
        error: 'No pudimos cerrar la caja. Revisá tu conexión e intentá de nuevo.',
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDeclaredCentsState(null)
          setNote('')
          setOpen(true)
          setOpenedAtMs(Date.now())
          track.cashflow('close.opened', { tenantId })
        }}
        className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-10"
      >
        <Lock className="h-4 w-4" aria-hidden="true" />
        Cerrar caja
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Cerrar caja del ${mediumDateLabel(date)}`}
        description="El cierre es inmutable: una vez cerrada no se puede editar ni agregar movimientos a este día. Las correcciones posteriores van como ajustes."
        confirmLabel="Cerrar caja"
        cancelLabel="Volver"
        confirmationPhrase="CERRAR"
        onConfirm={onConfirm}
      >
        <div className="space-y-3">
          {/* Cierre guiado (criterio de salida #4 del contrato): el esperado va
              PRE-CALCULADO y visible antes de que el usuario cuente nada. */}
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            1. Esperado — ya calculado
          </p>
          <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ingresos</span>
              <span className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                +{formatArsContable(totalIncome)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Egresos</span>
              <span className="font-medium tabular-nums text-red-700 dark:text-red-400">
                −{formatArsContable(totalExpense)}
              </span>
            </div>
            <div className="flex justify-between border-t border-border pt-1">
              <span className="text-muted-foreground">Saldo neto del día</span>
              <span className="font-semibold tabular-nums text-foreground">
                {formatArsContable(balance)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">En efectivo según los movimientos</span>
              <span className="font-medium tabular-nums text-foreground">
                {cashTotal < 0 ? `−${formatArsContable(-cashTotal)}` : formatArsContable(cashTotal)}
              </span>
            </div>
            {openingCash != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fondo inicial</span>
                <span className="font-medium tabular-nums text-foreground">
                  {formatArsContable(openingCash)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-1">
              <span className="text-muted-foreground">Efectivo esperado</span>
              <span className="font-semibold tabular-nums text-foreground">
                {expectedCash < 0
                  ? `−${formatArsContable(-expectedCash)}`
                  : formatArsContable(expectedCash)}
              </span>
            </div>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            2. Contá e ingresá lo real
          </p>
          <div className="space-y-1">
            <label htmlFor="declared" className="text-xs font-medium text-foreground">
              Efectivo contado (opcional, pesos)
            </label>
            <MoneyInput
              id="declared"
              minCents={0}
              valueCents={declaredCentsState}
              onValueChange={setDeclaredCentsState}
            />
          </div>
          {diff !== null && diff !== 0 && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-500/30">
              {/* La dirección (falta/sobra) es lo que el que cierra necesita saber
                  ANTES de confirmar un cierre inmutable — mismo criterio que el
                  recibo ("sobraron"/"faltaron" de closeView). La diferencia se
                  ve al instante (misma tanda de digitación), no al día
                  siguiente — criterio de salida #4 del contrato. */}
              Diferencia de {formatArsContable(Math.abs(diff))} con el efectivo esperado:{' '}
              {diff < 0 ? 'falta' : 'sobra'} plata. La nota es obligatoria.
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="close-note" className="text-xs font-medium text-foreground">
              Nota {noteRequired ? '(obligatoria)' : '(opcional)'}
            </label>
            <textarea
              id="close-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border px-3 py-2 text-base md:text-sm"
            />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            3. Confirmar
          </p>
        </div>
      </ConfirmDialog>
    </>
  )
}
