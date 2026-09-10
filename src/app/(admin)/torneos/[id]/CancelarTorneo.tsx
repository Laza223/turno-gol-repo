'use client'

import type { ActionResult } from '@/shared/types/action-result'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Lock } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import type { TournamentActionResult } from '../actions'

/**
 * Cancelar el torneo (H166).
 *
 * `deleteTournament` solo borra en `draft`; un torneo que ya arrancó
 * (`registration` o `in_progress`) se CANCELA, no se borra, porque tiene
 * historial colgando — el propio código ya lo afirma dos veces
 * (`tournament.service.ts`, `BorrarTorneo.tsx`). Esto cumple esa promesa: no
 * hace falta una mutación nueva, `status` ya viaja en `updateTournamentSchema`
 * y el enum ya incluye `canceled` — se reusa `updateTournamentAction`, mismo
 * criterio que `PortalPanel.tsx` reusándola para "Abrir inscripción".
 *
 * Clase C (irreversible, sin camino de vuelta en la UI): pide escribir el
 * nombre del torneo, mismo patrón que `BorrarTorneo`. Cancelar es
 * configuración — solo el dueño —, así que al encargado el control se le
 * muestra BLOQUEADO con candado y tooltip, nunca escondido (MASTER §12
 * CHK-admin: nunca desaparición); patrón copiado de `CorteZonasCard.tsx`.
 */
export type CancelTournamentAction = (input: unknown) => Promise<TournamentActionResult>

export function CancelarTorneo({
  tournamentId,
  tournamentName,
  /** Cancelar es configuración: solo el dueño. */
  canCancel,
  cancelAction,
}: {
  tournamentId: string
  tournamentName: string
  canCancel: boolean
  cancelAction: CancelTournamentAction
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function confirmCancel(): Promise<ActionResult> {
    const result = await cancelAction({ id: tournamentId, status: 'canceled' })
    if (result.success) {
      toast({ title: 'Torneo cancelado', description: tournamentName, variant: 'success' })
      router.refresh()
    }
    return result
  }

  if (!canCancel) {
    return (
      <span
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground md:min-h-9"
        title="Solo el dueño puede cancelar torneos"
      >
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Cancelar torneo
        <span className="sr-only">— solo el dueño puede hacerlo</span>
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-red-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-red-300 md:min-h-9"
      >
        <Ban className="h-3.5 w-3.5" aria-hidden="true" />
        Cancelar torneo
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Cancelar ${tournamentName}`}
        description="El torneo ya arrancó: no se borra. Queda marcado como cancelado, con el historial que tiene hasta ahora."
        consequences={[
          'Deja de listarse en el portal público.',
          'Las horas que tiene tomadas en la grilla no se liberan solas: liberalas desde Horarios si hace falta.',
          'No se puede deshacer.',
        ]}
        variant="destructive"
        confirmationPhrase={tournamentName}
        confirmLabel="Cancelar torneo"
        cancelLabel="Volver"
        onConfirm={confirmCancel}
      />
    </>
  )
}
