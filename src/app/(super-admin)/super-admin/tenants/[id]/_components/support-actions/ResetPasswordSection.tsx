'use client'

import { useState } from 'react'
import { resetStaffPasswordAction } from '../../actions'
import { SectionCard } from './SectionCard'
import { FeedbackText } from './FeedbackText'
import { inputCls, primaryBtn, type Feedback, type RunAction } from './constants'

type Props = {
  tenantId: string
  pending: boolean
  run: RunAction
}

/** Resetear contraseña de staff: genera una temporal (soporte telefónico). Solo staff activo del complejo. */
export function ResetPasswordSection({ tenantId, pending, run }: Props) {
  const [resetEmail, setResetEmail] = useState('')
  const [resetFeedback, setResetFeedback] = useState<Feedback>(null)

  return (
    <SectionCard
      title="Resetear contraseña de staff"
      description="Genera una contraseña temporal para un miembro del complejo (soporte telefónico). El titular entra con la temporal y el sistema lo obliga a cambiarla. Solo staff activo de este complejo."
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="reset-email" className="text-sm font-medium text-foreground">
            Email del staff
          </label>
          <input
            id="reset-email"
            type="email"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            placeholder="staff@complejo.com"
            autoComplete="off"
            className={`${inputCls} w-64`}
          />
          <button
            type="button"
            disabled={pending || resetEmail.trim() === ''}
            onClick={() =>
              run(
                () => resetStaffPasswordAction({ tenantId, email: resetEmail.trim() }),
                setResetFeedback,
              )
            }
            className={primaryBtn}
          >
            Resetear contraseña
          </button>
        </div>
        <FeedbackText feedback={resetFeedback} />
      </div>
    </SectionCard>
  )
}
