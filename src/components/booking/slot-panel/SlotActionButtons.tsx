'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Ban, ChevronDown, CupSoda, MoveRight, Trash2, Trophy, UserX } from 'lucide-react'
import { cn } from '@/lib/utils'
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
  canReleaseBlock: boolean
  onOpenReleaseBlock: () => void
  /** RI G2.3: si viene, se ofrece el link directo a la pantalla del torneo. */
  tournamentId?: string | null
}

const ROW =
  'flex h-11 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-60 md:h-10'
const ROW_NEUTRAL = `${ROW} border-border bg-card text-foreground hover:bg-accent`

/**
 * Lo que se puede hacer con el turno además de cobrarlo.
 *
 * Cobrar es de todos los días y tiene su propio botón arriba; cargar cantina es
 * de algunos días y queda a la vista. Reprogramar, marcar ausente y cancelar son
 * de una vez por semana y estaban al mismo nivel que el resto: cinco botones
 * compitiendo por la misma atención, tres de ellos rojos. Ahora viven detrás de
 * "Más" — un toque de más en una tarea semanal a cambio de que la diaria no
 * tenga que elegir entre cinco.
 *
 * Liberar el bloqueo y deshacer la ausencia NO se pliegan: en esos dos estados
 * son la única acción que existe, y esconder la única acción no es resta.
 */
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
  canReleaseBlock,
  onOpenReleaseBlock,
  tournamentId,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false)

  const canCancelHere = canCancel && !!actions?.cancelBookingAction
  const canNoShowHere = canMarkNoShow && !!actions
  const hasFolded = canReschedule || canNoShowHere || canCancelHere

  return (
    <>
      {canSellCanteen && (
        <button type="button" onClick={onOpenCanteen} disabled={isPending} className={ROW_NEUTRAL}>
          <CupSoda aria-hidden className="h-4 w-4" />
          Cargar cantina
        </button>
      )}

      {canRevertNoShow && (
        <button
          type="button"
          onClick={onRevertNoShow}
          disabled={isPending}
          className={cn(ROW_NEUTRAL, 'font-medium')}
        >
          Deshacer la ausencia
        </button>
      )}

      {canReleaseBlock && (
        <button
          type="button"
          onClick={onOpenReleaseBlock}
          disabled={isPending}
          className={`${ROW} border-red-200 bg-card text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10`}
        >
          <Trash2 aria-hidden className="h-4 w-4" />
          Liberar el bloqueo
        </button>
      )}

      {hasFolded && !moreOpen && (
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          disabled={isPending}
          aria-expanded={false}
          className="flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60 md:h-10"
        >
          <ChevronDown aria-hidden className="h-4 w-4" />
          Más
        </button>
      )}

      {hasFolded && moreOpen && (
        <>
          {canReschedule && (
            <button
              type="button"
              onClick={onOpenReschedule}
              disabled={isPending}
              className={ROW_NEUTRAL}
            >
              <MoveRight aria-hidden className="h-4 w-4" />
              Reprogramar
            </button>
          )}

          {canNoShowHere && (
            <button
              type="button"
              onClick={onOpenNoShow}
              disabled={isPending}
              className={`${ROW} border-destructive/40 bg-destructive/5 text-red-700 hover:bg-destructive/10 dark:text-red-300`}
            >
              <UserX aria-hidden className="h-4 w-4" />
              Marcar ausente
            </button>
          )}

          {canCancelHere && (
            <button
              type="button"
              onClick={onOpenCancel}
              disabled={isPending}
              // H007 (LEY-von-restorff): con "Marcar ausente" visible a la vez, ese
              // es el rojo destructivo — este botón baja a outline/neutral para no
              // competir por la misma atención.
              className={
                canNoShowHere
                  ? ROW_NEUTRAL
                  : `${ROW} border-red-200 bg-card text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10`
              }
            >
              <Ban aria-hidden className="h-4 w-4" />
              Cancelar reserva
            </button>
          )}
        </>
      )}

      {isTournament && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Esta hora la ocupa un torneo. La plata del torneo entra por la inscripción, no por turno —
          se gestiona desde la pantalla del torneo.
        </p>
      )}

      {/* La ruta está detrás del flag `tournaments`, pero un booking type='tournament'
          sólo existe si el flag estuvo prendido para este complejo: el caso "link a
          404" es teórico. */}
      {isTournament && tournamentId && (
        <Link href={`/torneos/${tournamentId}`} className={ROW_NEUTRAL}>
          <Trophy aria-hidden className="h-4 w-4" />
          Ir al torneo
        </Link>
      )}
    </>
  )
}
