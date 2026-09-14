'use client'

import { AlertCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * "Resumen" fijo a la derecha en escritorio (cancha, fecha, horario y
 * duración, total, cobrado ahora, queda por cobrar) con el botón primario —
 * verbo + monto. En el teléfono se reduce a un footer fijo: total + botón
 * (pages/grilla.md §3bis). Los dos leen el MISMO estado — ninguno inventa un
 * número que el otro no tenga.
 */
type Props = {
  courtName: string
  dateLabel: string
  timeStart: string
  timeEnd: string
  durationLabel: string
  /** `null` = "No se cobra" (Evento sin precio, Bloqueo). */
  totalCents: number | null
  collectedCents: number
  primaryLabel: string
  onCancel: () => void
  isPending: boolean
  disabled?: boolean
  error?: string | null
  warning?: string | null
}

export function Summary({
  courtName,
  dateLabel,
  timeStart,
  timeEnd,
  durationLabel,
  totalCents,
  collectedCents,
  primaryLabel,
  onCancel,
  isPending,
  disabled = false,
  error,
  warning,
}: Props) {
  const pendingCents = totalCents == null ? null : Math.max(0, totalCents - collectedCents)

  const notices = (
    <>
      {warning && (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {warning}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </>
  )

  return (
    <>
      {/* Escritorio: card fija a la derecha. */}
      <div className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-5 lg:flex">
        <h3 className="text-sm font-semibold text-foreground">Resumen</h3>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Cancha</dt>
            <dd className="font-medium text-foreground">{courtName}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Fecha</dt>
            <dd className="font-medium text-foreground">{dateLabel}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Horario</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {timeStart}–{timeEnd} · {durationLabel}
            </dd>
          </div>
        </dl>
        <div className="space-y-1.5 border-t border-border pt-3 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-semibold tabular-nums text-foreground">
              {totalCents != null ? formatArs(totalCents) : 'No se cobra'}
            </dd>
          </div>
          {totalCents != null && (
            <>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Cobrado ahora</dt>
                <dd className="tabular-nums text-foreground">{formatArs(collectedCents)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Queda por cobrar</dt>
                <dd
                  className={cn(
                    'font-semibold tabular-nums',
                    pendingCents && pendingCents > 0
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-foreground',
                  )}
                >
                  {formatArs(pendingCents ?? 0)}
                </dd>
              </div>
            </>
          )}
        </div>
        <div className="mt-auto space-y-2">
          {notices}
          <Button type="submit" isLoading={isPending} disabled={disabled} className="w-full">
            {primaryLabel}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} className="w-full">
            Cancelar
          </Button>
        </div>
      </div>

      {/* Teléfono: footer fijo. */}
      <div className="sticky bottom-0 space-y-2 border-t border-border bg-card p-3 lg:hidden">
        {notices}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">Total</p>
            <p className="truncate text-base font-semibold tabular-nums text-foreground">
              {totalCents != null ? formatArs(totalCents) : 'No se cobra'}
            </p>
          </div>
          <Button type="submit" isLoading={isPending} disabled={disabled} className="shrink-0">
            {primaryLabel}
          </Button>
        </div>
      </div>
    </>
  )
}
