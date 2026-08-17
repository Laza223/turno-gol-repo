'use client'

import type { ActionResult } from '@/shared/types/action-result'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import type { TournamentActionResult } from '../actions'

/**
 * Borrar el torneo.
 *
 * `deleteTournament` solo borra en `draft` y exige cero horas tomadas, cero
 * partidos y cero cobros: un torneo que arrancó se CANCELA, no se borra, porque
 * tiene historial colgando. Por eso esto no es una "zona de peligro" fija que
 * estaría muerta el 95% del tiempo — aparece únicamente cuando borrar es una
 * operación posible, y si hay horas tomadas se muestra bloqueada con el motivo
 * en vez de esconderse (MASTER §12: candado y tooltip, no desaparición).
 *
 * Es Clase C (irreversible): pide escribir el nombre del torneo. Los bloqueos
 * que esta pantalla no conoce — fixture generado, cobros en Caja — los reporta
 * el servidor, y el diálogo los muestra sin cerrarse.
 */
export type DeleteTournamentAction = (input: unknown) => Promise<TournamentActionResult>

export function BorrarTorneo({
  tournamentId,
  tournamentName,
  teamCount,
  slotCount,
  deleteAction,
}: {
  tournamentId: string
  tournamentName: string
  teamCount: number
  slotCount: number
  deleteAction: DeleteTournamentAction
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  if (slotCount > 0) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Para borrar este torneo, liberá primero las{' '}
        <span className="tabular-nums">{slotCount}</span>{' '}
        {slotCount === 1 ? 'hora tomada' : 'horas tomadas'} en la grilla.
      </p>
    )
  }

  async function confirmDelete(): Promise<ActionResult> {
    const result = await deleteAction({ id: tournamentId })
    if (result.success) {
      toast({ title: 'Torneo borrado', description: tournamentName, variant: 'success' })
      // El torneo ya no existe: quedarse en su ficha daría un 404.
      router.push('/torneos')
    }
    return result
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-red-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-red-300 md:min-h-9"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        Borrar este torneo
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Borrar ${tournamentName}`}
        description="El torneo está en borrador: todavía no ocupa horas ni tiene partidos, así que se puede borrar entero."
        consequences={[
          ...(teamCount > 0
            ? [
                `Se borran los ${teamCount} ${teamCount === 1 ? 'equipo anotado' : 'equipos anotados'} y sus planteles.`,
              ]
            : []),
          'No se puede deshacer.',
        ]}
        variant="destructive"
        confirmationPhrase={tournamentName}
        confirmLabel="Borrar torneo"
        cancelLabel="Volver"
        onConfirm={confirmDelete}
      />
    </>
  )
}
