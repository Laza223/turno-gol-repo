'use client'

import { useState } from 'react'
import type { TenantStatus } from '@/modules/billing/billing.types'
import { forceTenantStatusAction } from '../../actions'
import { SectionCard } from './SectionCard'
import { FeedbackText } from './FeedbackText'
import {
  STATUS_LABELS,
  destructiveBtn,
  inputCls,
  primaryBtn,
  type Feedback,
  type RunAction,
} from './constants'

type Props = {
  tenantId: string
  tenantName: string
  status: TenantStatus
  forceableTargets: TenantStatus[]
  destructiveTargets: TenantStatus[]
  pending: boolean
  run: RunAction
}

/**
 * Forzar transición de estado del tenant. Solo ofrece destinos válidos del FSM;
 * los destinos destructivos exigen tipear el nombre exacto (patrón GitHub) y la
 * action lo re-valida server-side.
 */
export function ForceStatusSection({
  tenantId,
  tenantName,
  status,
  forceableTargets,
  destructiveTargets,
  pending,
  run,
}: Props) {
  const [forceTarget, setForceTarget] = useState<TenantStatus | ''>('')
  const [forceConfirm, setForceConfirm] = useState('')
  const [forceFeedback, setForceFeedback] = useState<Feedback>(null)
  const forceIsDestructive = forceTarget !== '' && destructiveTargets.includes(forceTarget)

  return (
    <SectionCard
      title="Forzar transición de estado"
      description={`Estado actual: ${STATUS_LABELS[status]}. Solo se ofrecen destinos válidos según el ciclo de vida; las ventanas temporales del FSM (dunning/retención) se siguen respetando.`}
    >
      {forceableTargets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay transiciones forzables desde el estado actual.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="force-target" className="text-sm font-medium text-foreground">
              Estado destino
            </label>
            <select
              id="force-target"
              value={forceTarget}
              onChange={(e) => {
                setForceTarget(e.target.value as TenantStatus | '')
                setForceConfirm('')
              }}
              className={`${inputCls} bg-card`}
            >
              <option value="">Elegir…</option>
              {forceableTargets.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending || forceTarget === '' || (forceIsDestructive && forceConfirm.trim() !== tenantName)}
              onClick={() =>
                run(
                  () =>
                    forceTenantStatusAction({
                      tenantId,
                      targetStatus: forceTarget,
                      ...(forceIsDestructive ? { confirmName: forceConfirm } : {}),
                    }),
                  setForceFeedback,
                )
              }
              className={forceIsDestructive ? destructiveBtn : primaryBtn}
            >
              Forzar estado
            </button>
          </div>
          {forceIsDestructive && (
            <div className="space-y-1 rounded-md bg-red-50 dark:bg-red-500/10 p-3 ring-1 ring-inset ring-red-600/20 dark:ring-red-500/30">
              <label htmlFor="force-confirm" className="block text-xs font-medium text-red-700 dark:text-red-400">
                Acción destructiva. Escribí el nombre exacto del complejo (<span className="font-semibold">{tenantName}</span>) para confirmar:
              </label>
              <input
                id="force-confirm"
                type="text"
                value={forceConfirm}
                onChange={(e) => setForceConfirm(e.target.value)}
                className={`${inputCls} w-full`}
                autoComplete="off"
              />
            </div>
          )}
          <FeedbackText feedback={forceFeedback} />
        </div>
      )}
    </SectionCard>
  )
}
