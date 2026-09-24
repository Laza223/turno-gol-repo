import { CupSoda, Trash2, UserX } from 'lucide-react'
import type { SlotGates } from '@/components/booking/slot-panel/slot-gates'
import { cn } from '@/lib/utils'

const ACTION_BUTTON =
  'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-60 md:h-10'

/**
 * Las acciones secundarias del modal de cobro de Hoy: cantina, marcar
 * ausente, liberar bloqueo, deshacer ausencia. Extraído de `HoyChargeModal`.
 */
export function HoyChargeModalActions({
  gates,
  locked,
  error,
  onOpenCanteen,
  onOpenNoShow,
  onOpenReleaseBlock,
  onRevertNoShow,
}: {
  gates: Pick<SlotGates, 'canSellCanteen' | 'canMarkNoShow' | 'canReleaseBlock' | 'canRevertNoShow'>
  locked: boolean
  /** En `no_show` no hay sección de cobro que pinte `error`: es el único lugar
   * del modal que lo muestra (mismo criterio que `SlotActionButtons.tsx`). */
  error: string | null
  onOpenCanteen: () => void
  onOpenNoShow: () => void
  onOpenReleaseBlock: () => void
  onRevertNoShow: () => void
}) {
  const hasActions = gates.canSellCanteen || gates.canMarkNoShow

  return (
    <>
      {hasActions && (
        <div className="flex gap-2 border-t border-border pt-4">
          {gates.canSellCanteen && (
            <button
              type="button"
              onClick={onOpenCanteen}
              disabled={locked}
              className={cn(ACTION_BUTTON, 'border-border bg-card text-foreground hover:bg-accent')}
            >
              <CupSoda aria-hidden className="h-4 w-4" />
              Cantina
            </button>
          )}
          {gates.canMarkNoShow && (
            <button
              type="button"
              onClick={onOpenNoShow}
              disabled={locked}
              className={cn(
                ACTION_BUTTON,
                'border-destructive/40 bg-destructive/5 text-red-700 hover:bg-destructive/10 dark:text-red-300',
              )}
            >
              <UserX aria-hidden className="h-4 w-4" />
              Marcar ausente
            </button>
          )}
        </div>
      )}

      {gates.canReleaseBlock && (
        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={onOpenReleaseBlock}
            disabled={locked}
            className={cn(
              ACTION_BUTTON,
              'w-full border-red-200 bg-card text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10',
            )}
          >
            <Trash2 aria-hidden className="h-4 w-4" />
            Liberar el bloqueo
          </button>
        </div>
      )}

      {gates.canRevertNoShow && (
        <div className="flex flex-col border-t border-border pt-4">
          <button
            type="button"
            onClick={onRevertNoShow}
            disabled={locked}
            className={cn(
              ACTION_BUTTON,
              'border-border bg-card font-medium text-foreground hover:bg-accent',
            )}
          >
            Deshacer la ausencia
          </button>
          {error && (
            <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
        </div>
      )}
    </>
  )
}
