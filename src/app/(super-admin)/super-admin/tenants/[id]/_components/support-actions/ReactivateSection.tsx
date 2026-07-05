'use client'

import { useState } from 'react'
import { reactivateTenantAction } from '../../actions'
import { SectionCard } from './SectionCard'
import { FeedbackText } from './FeedbackText'
import { primaryBtn, type Feedback, type RunAction } from './constants'

type Props = {
  tenantId: string
  pending: boolean
  run: RunAction
}

/** Reactivar complejo: vuelve a 'active' (limpia dunning, cancelación y eliminación programada). */
export function ReactivateSection({ tenantId, pending, run }: Props) {
  const [reactivateFeedback, setReactivateFeedback] = useState<Feedback>(null)

  return (
    <SectionCard
      title="Reactivar complejo"
      description="Vuelve el tenant a 'active' (transitionToActiveFromAny): limpia dunning, cancelación y fecha de eliminación programada."
    >
      <div className="space-y-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => reactivateTenantAction({ tenantId }), setReactivateFeedback)}
          className={primaryBtn}
        >
          Reactivar
        </button>
        <FeedbackText feedback={reactivateFeedback} />
      </div>
    </SectionCard>
  )
}
