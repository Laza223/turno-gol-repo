'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parsePesosToCents } from '@/modules/courts/pricing-grid'
import type { CourtRow } from '@/modules/courts/court.types'
import type { WizardActionResult, WizardCourtDraftInput } from '../actions'
import {
  CourtDraftCard,
  type DeleteCourtPhotoAction,
  type UploadCourtPhotoAction,
} from './step-courts/CourtDraftCard'
import { ExistingCourtsList } from './step-courts/ExistingCourtsList'
import { useCourtDrafts } from './step-courts/use-court-drafts'

/** Firma de la Server Action que crea las canchas del wizard. */
export type CreateWizardCourtsAction = (input: {
  courts: WizardCourtDraftInput[]
}) => Promise<WizardActionResult>

/** Firma de la Server Action de "Volver" (mueve el wizard a un paso previo). */
export type SetWizardStepAction = (completedStep: number) => Promise<WizardActionResult>

type Props = {
  /** Canchas ya creadas (revisita con "Volver"): se listan, no se editan acá. */
  existingCourts: CourtRow[]
  createCourtsAction: CreateWizardCourtsAction
  setStepAction: SetWizardStepAction
  uploadPhotoAction: UploadCourtPhotoAction
  deletePhotoAction: DeleteCourtPhotoAction
}

/**
 * Paso 3 — Canchas y precios inline (pages/onboarding.md §5). Un precio por
 * cancha (uniforme sobre los horarios recién confirmados); "+ Agregar otra"
 * duplica la anterior porque el caso real es N canchas iguales. El ajuste por
 * franja (día/noche, finde) vive en /canchas. Orquesta: lista de existentes +
 * tarjetas de borrador (estado en useCourtDrafts) + submit a la Server Action.
 */
export function StepCourts({
  existingCourts,
  createCourtsAction,
  setStepAction,
  uploadPhotoAction,
  deletePhotoAction,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [isGoingBack, startBackTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { drafts, expandedKeys, canRemove, toggleExpand, expand, updateDraft, addDraft, removeDraft } =
    useCourtDrafts(existingCourts)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const courts: WizardCourtDraftInput[] = []
    for (const d of drafts) {
      if (d.name.trim().length === 0) {
        setError('Poné un nombre a cada cancha.')
        expand(d.key)
        return
      }
      const priceCents = parsePesosToCents(d.price)
      if (priceCents == null || priceCents <= 0) {
        setError(`Cargá el precio por turno de ${d.name.trim() || 'cada cancha'}.`)
        expand(d.key)
        return
      }
      courts.push({
        name: d.name.trim(),
        format: d.format,
        surfaceType: d.surfaceType,
        isCovered: d.isCovered,
        priceCents,
      })
    }

    startTransition(async () => {
      const result = await createCourtsAction({ courts })
      if (!result.success) setError(result.error)
    })
  }

  function handleBack() {
    setError(null)
    startBackTransition(async () => {
      const result = await setStepAction(1)
      if (!result.success) setError(result.error)
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Tus canchas</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Con una cancha y su precio ya podés recibir reservas online.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {existingCourts.length > 0 && <ExistingCourtsList courts={existingCourts} />}

        {drafts.map((draft, i) => (
          <CourtDraftCard
            key={draft.key}
            draft={draft}
            index={i}
            isExpanded={expandedKeys.has(draft.key)}
            canRemove={canRemove}
            onToggle={toggleExpand}
            onUpdate={updateDraft}
            onRemove={removeDraft}
            onUploadPhoto={uploadPhotoAction}
            onDeletePhoto={deletePhotoAction}
          />
        ))}

        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed hover:border-emerald-600/50 hover:text-emerald-700 dark:hover:text-emerald-400"
          onClick={addDraft}
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          Agregar otra cancha
        </Button>
        {drafts.length > 1 && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Copiamos los datos de la anterior — cambiá solo lo distinto.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            isLoading={isGoingBack}
            disabled={isPending}
          >
            Volver
          </Button>
          <Button type="submit" isLoading={isPending} disabled={isGoingBack} className="flex-1">
            Continuar
          </Button>
        </div>
      </form>
    </div>
  )
}
