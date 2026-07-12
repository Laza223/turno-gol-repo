'use client'

import { useState } from 'react'
import { formatArs } from '@/lib/format'
import { SectionCard } from './SectionCard'
import { FeedbackText } from './FeedbackText'
import {
  inputCls,
  primaryBtn,
  type Feedback,
  type RunAction,
  type SupportAction,
  type SupportPanelPlan,
} from './constants'

type Props = {
  tenantId: string
  hasSubscription: boolean
  currentPlanId: string | null
  plans: SupportPanelPlan[]
  pending: boolean
  run: RunAction
  action: SupportAction
}

/** Cambiar plan sin cobro: swap inmediato, sin proración. Actualiza el monto MP del próximo ciclo. */
export function ChangePlanSection({
  tenantId,
  hasSubscription,
  currentPlanId,
  plans,
  pending,
  run,
  action,
}: Props) {
  const [targetPlanId, setTargetPlanId] = useState('')
  const [planFeedback, setPlanFeedback] = useState<Feedback>(null)

  return (
    <SectionCard
      title="Cambiar plan sin cobro"
      description="Swap inmediato del plan, sin cargo de proración. Si hay suscripción MP activa, actualiza el monto recurrente para el próximo ciclo."
    >
      {!hasSubscription ? (
        <p className="text-sm text-muted-foreground">
          El complejo no tiene suscripción registrada — no aplica.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="target-plan" className="text-sm font-medium text-foreground">
              Plan destino
            </label>
            <select
              id="target-plan"
              value={targetPlanId}
              onChange={(e) => setTargetPlanId(e.target.value)}
              className={`${inputCls} bg-card`}
            >
              <option value="">Elegir…</option>
              {plans
                .filter((p) => p.id !== currentPlanId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatArs(p.priceMonthly)}/mes
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={pending || targetPlanId === ''}
              onClick={() =>
                run(() => action({ tenantId, targetPlanId }), setPlanFeedback)
              }
              className={primaryBtn}
            >
              Cambiar plan
            </button>
          </div>
          <FeedbackText feedback={planFeedback} />
        </div>
      )}
    </SectionCard>
  )
}
