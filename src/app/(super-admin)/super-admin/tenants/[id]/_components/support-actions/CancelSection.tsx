'use client'

import { useState } from 'react'
import { SectionCard } from './SectionCard'
import { FeedbackText } from './FeedbackText'
import {
  destructiveBtn,
  inputCls,
  type Feedback,
  type RunAction,
  type SupportAction,
} from './constants'

type Props = {
  tenantId: string
  tenantName: string
  hasSubscription: boolean
  pending: boolean
  run: RunAction
  action: SupportAction
}

/**
 * Cancelar suscripción: cancela el preapproval de MP y pasa a 'canceled'. El
 * acceso sigue hasta el fin del período pagado. Exige tipear el nombre exacto.
 */
export function CancelSection({
  tenantId,
  tenantName,
  hasSubscription,
  pending,
  run,
  action,
}: Props) {
  const [cancelReason, setCancelReason] = useState('')
  const [cancelConfirm, setCancelConfirm] = useState('')
  const [cancelFeedback, setCancelFeedback] = useState<Feedback>(null)

  return (
    <SectionCard
      title="Cancelar suscripción"
      description="Cancela el preapproval de MercadoPago y pasa el tenant a 'canceled'. El acceso sigue hasta el fin del período pagado. Irreversible sin reactivación."
    >
      {!hasSubscription ? (
        <p className="text-sm text-muted-foreground">
          El complejo no tiene suscripción registrada — no aplica.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="cancel-reason" className="text-xs font-medium text-foreground">
              Motivo (obligatorio)
            </label>
            <textarea
              id="cancel-reason"
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-emerald-600 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="space-y-1 rounded-md bg-red-50 dark:bg-red-500/10 p-3 ring-1 ring-inset ring-red-600/20 dark:ring-red-500/30">
            <label
              htmlFor="cancel-confirm"
              className="block text-xs font-medium text-red-700 dark:text-red-400"
            >
              Acción destructiva. Escribí el nombre exacto del complejo (
              <span className="font-semibold">{tenantName}</span>) para confirmar:
            </label>
            <input
              id="cancel-confirm"
              type="text"
              value={cancelConfirm}
              onChange={(e) => setCancelConfirm(e.target.value)}
              className={`${inputCls} w-full`}
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            disabled={
              pending || cancelReason.trim().length < 3 || cancelConfirm.trim() !== tenantName
            }
            onClick={() =>
              run(
                () =>
                  action({
                    tenantId,
                    reason: cancelReason.trim(),
                    confirmName: cancelConfirm,
                  }),
                setCancelFeedback,
              )
            }
            className={destructiveBtn}
          >
            Cancelar suscripción
          </button>
          <FeedbackText feedback={cancelFeedback} />
        </div>
      )}
    </SectionCard>
  )
}
