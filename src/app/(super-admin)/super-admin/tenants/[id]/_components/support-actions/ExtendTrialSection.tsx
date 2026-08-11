'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SectionCard } from './SectionCard'
import { FeedbackText } from './FeedbackText'
import {
  inputCls,
  primaryBtn,
  type Feedback,
  type RunAction,
  type SupportAction,
} from './constants'

type Props = {
  tenantId: string
  isTrialing: boolean
  pending: boolean
  run: RunAction
  action: SupportAction
}

/** Extender trial: mueve el fin de trial a max(hoy, fin actual) + días. Solo tenants en trial. */
export function ExtendTrialSection({ tenantId, isTrialing, pending, run, action }: Props) {
  const [trialDays, setTrialDays] = useState(7)
  const [trialFeedback, setTrialFeedback] = useState<Feedback>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <SectionCard
      title="Extender trial"
      description="Mueve el fin de trial a max(hoy, fin actual) + días. Solo para tenants en trial."
    >
      {!isTrialing ? (
        <p className="text-sm text-muted-foreground">El complejo no está en trial — no aplica.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="trial-days" className="text-sm font-medium text-foreground">
              Días (1–90)
            </label>
            <input
              id="trial-days"
              type="number"
              min={1}
              max={90}
              value={trialDays}
              onChange={(e) => setTrialDays(Number(e.target.value))}
              className={`${inputCls} w-24 tabular-nums`}
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmOpen(true)}
              className={primaryBtn}
            >
              Extender trial
            </button>
          </div>
          <FeedbackText feedback={trialFeedback} />
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Extender trial"
        description={`Se corre el fin del trial ${trialDays} día(s) desde hoy o desde el fin actual, lo que sea más tarde.`}
        confirmLabel="Extender"
        cancelLabel="Cancelar"
        onConfirm={async () => {
          run(() => action({ tenantId, days: trialDays }), setTrialFeedback)
        }}
      />
    </SectionCard>
  )
}
