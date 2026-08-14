'use client'

import { Ban, CupSoda, MoveRight, UserX } from 'lucide-react'
import type { SlotPanelActions } from './actions'

type Props = {
  isPending: boolean
  isTournament: boolean
  canSellCanteen: boolean
  onOpenCanteen: () => void
  canReschedule: boolean
  onOpenReschedule: () => void
  canMarkNoShow: boolean
  actions: SlotPanelActions | undefined
  onOpenNoShow: () => void
  canRevertNoShow: boolean
  onRevertNoShow: () => void
  canCancel: boolean
  onOpenCancel: () => void
}

/** Botones de cantina, reprogramar, cancelar, marcar ausente y deshacerla. */
export function SlotActionButtons({
  isPending,
  isTournament,
  canSellCanteen,
  onOpenCanteen,
  canReschedule,
  onOpenReschedule,
  canMarkNoShow,
  actions,
  onOpenNoShow,
  canRevertNoShow,
  onRevertNoShow,
  canCancel,
  onOpenCancel,
}: Props) {
  return (
    <>
      {canSellCanteen && (
        <button
          type="button"
          onClick={onOpenCanteen}
          disabled={isPending}
          className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-semibold transition-colors hover:bg-accent disabled:opacity-60 md:h-10"
        >
          <CupSoda aria-hidden className="h-4 w-4" />
          Cargar cantina
        </button>
      )}

      {canReschedule && (
        <button
          type="button"
          onClick={onOpenReschedule}
          disabled={isPending}
          className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-semibold transition-colors hover:bg-accent disabled:opacity-60 md:h-10"
        >
          <MoveRight aria-hidden className="h-4 w-4" />
          Reprogramar
        </button>
      )}

      {canMarkNoShow && actions && (
        <button
          type="button"
          onClick={onOpenNoShow}
          disabled={isPending}
          className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 text-sm font-semibold text-red-700 transition-colors hover:bg-destructive/10 disabled:opacity-60 dark:text-red-300 md:h-10"
        >
          <UserX aria-hidden className="h-4 w-4" />
          Marcar ausente
        </button>
      )}

      {canRevertNoShow && (
        <button
          type="button"
          onClick={onRevertNoShow}
          disabled={isPending}
          className="h-11 rounded-lg border border-border text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60 md:h-10"
        >
          Deshacer la ausencia
        </button>
      )}

      {canCancel && actions?.cancelBookingAction && (
        <button
          type="button"
          onClick={onOpenCancel}
          disabled={isPending}
          className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-card text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 md:h-10"
        >
          <Ban aria-hidden className="h-4 w-4" />
          Cancelar reserva
        </button>
      )}

      {isTournament && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Esta hora la ocupa un torneo. La plata del torneo entra por la inscripción, no por turno —
          se gestiona desde la pantalla del torneo.
        </p>
      )}
    </>
  )
}
