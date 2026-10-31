import { CupSoda, Trash2, UserX, XCircle } from 'lucide-react'
import type { SlotGates } from '@/components/booking/slot-panel/slot-gates'
import { cn } from '@/lib/utils'

const ACTION_BUTTON =
  'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:h-10'

/**
 * Cantina: sin borde, como las rojas de al lado. Atada a un turno es el 1% de las
 * ventas (las sueltas van por "Vender") y una caja la ponía a la par de "Cobrar".
 */
const QUIET = 'text-foreground hover:bg-accent'

/** "Deshacer la ausencia" es lo único que queda por hacer en un ausente: `outline`. */
const NEUTRAL = 'border border-border bg-card text-foreground hover:bg-accent'

/**
 * Ausente, cancelar, liberar: a la vista (en el menú ⋯ el mostrador no las
 * encontraba) pero sin borde ni relleno. Con borde y fondo rojos competían con
 * "Cobrar" y se sumaban al rojo de "Terminó hace N min" y "Falta cobrar", que sí
 * son el estado. red-700/red-300 y no `text-destructive`: el token es red-600 en
 * los dos temas y sobre la superficie oscura no llega a AA.
 */
const DESTRUCTIVE = 'text-red-700 hover:bg-destructive/10 dark:text-red-300'

/**
 * Las acciones secundarias del modal de cobro de Hoy: cantina, marcar
 * ausente, cancelar reserva, liberar bloqueo, deshacer ausencia. Extraído de
 * `HoyChargeModal`.
 */
export function HoyChargeModalActions({
  gates,
  locked,
  error,
  onOpenCanteen,
  onOpenNoShow,
  onOpenCancel,
  onOpenReleaseBlock,
  onRevertNoShow,
}: {
  gates: Pick<
    SlotGates,
    'canSellCanteen' | 'canMarkNoShow' | 'canCancel' | 'canReleaseBlock' | 'canRevertNoShow'
  >
  locked: boolean
  /** En `no_show` no hay sección de cobro que pinte `error`: es el único lugar
   * del modal que lo muestra (mismo criterio que `SlotActionButtons.tsx`). */
  error: string | null
  onOpenCanteen: () => void
  onOpenNoShow: () => void
  onOpenCancel: () => void
  onOpenReleaseBlock: () => void
  onRevertNoShow: () => void
}) {
  const hasActions = gates.canSellCanteen || gates.canMarkNoShow
  const hasAny = hasActions || gates.canCancel || gates.canReleaseBlock || gates.canRevertNoShow
  if (!hasAny) return null

  return (
    // Un solo divisor y las filas pegadas: son el mismo grupo de acciones
    // secundarias, no bloques distintos.
    <div className="flex flex-col gap-1 border-t border-border pt-3">
      {hasActions && (
        <div className="flex gap-2">
          {gates.canSellCanteen && (
            <button
              type="button"
              onClick={onOpenCanteen}
              disabled={locked}
              className={cn(ACTION_BUTTON, QUIET)}
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
              className={cn(ACTION_BUTTON, DESTRUCTIVE)}
            >
              <UserX aria-hidden className="h-4 w-4" />
              Marcar ausente
            </button>
          )}
        </div>
      )}

      {/* A la vista y no en el menú ⋯: escondido ahí, el mostrador no lo
          encontraba. Renglón propio para que entre al lado de cantina/ausente
          en el teléfono. El motivo obligatorio lo pide `SlotCancelDialog`. */}
      {gates.canCancel && (
        <button
          type="button"
          onClick={onOpenCancel}
          disabled={locked}
          className={cn(ACTION_BUTTON, DESTRUCTIVE, 'w-full')}
        >
          <XCircle aria-hidden className="h-4 w-4" />
          Cancelar reserva
        </button>
      )}

      {gates.canReleaseBlock && (
        <button
          type="button"
          onClick={onOpenReleaseBlock}
          disabled={locked}
          className={cn(ACTION_BUTTON, DESTRUCTIVE, 'w-full')}
        >
          <Trash2 aria-hidden className="h-4 w-4" />
          Liberar el bloqueo
        </button>
      )}

      {gates.canRevertNoShow && (
        <>
          <button
            type="button"
            onClick={onRevertNoShow}
            disabled={locked}
            className={cn(ACTION_BUTTON, NEUTRAL)}
          >
            Deshacer la ausencia
          </button>
          {error && (
            <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  )
}
