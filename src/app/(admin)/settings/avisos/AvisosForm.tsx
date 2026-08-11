'use client'

import { useActionState, useState } from 'react'
import { SubmitButton } from '@/components/ui/submit-button'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import type { AvisosActionResult } from './actions'

const INITIAL_STATE: AvisosActionResult = { success: true }

/** Firma de la Server Action que consume el form. */
export type UpdateAvisosSettings = (
  prevState: AvisosActionResult,
  formData: FormData,
) => Promise<AvisosActionResult>

/**
 * Form de "Avisos" (D8, Fase 2): opt-in de email del resumen diario. La
 * action llega por PROP, no por import — mismo motivo que ReservasPolicyForm
 * ('use server' arrastra drizzle/postgres al bundle de Storybook).
 */
export function AvisosForm({ s, action }: { s: TenantSettings; action: UpdateAvisosSettings }) {
  const [state, formAction] = useActionState(action, INITIAL_STATE)
  const [optIn, setOptIn] = useState(s.daily_summary_email_opt_in === true)
  const [didSubmit, setDidSubmit] = useState(false)

  return (
    <form action={formAction} onSubmit={() => setDidSubmit(true)} className="space-y-6 max-w-lg">
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground/90">
          Resumen diario
        </legend>
        <p className="text-sm text-muted-foreground">
          Push al admin con PWA instalada, siempre activo. El email es opcional (opt-in).
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOptIn(true)}
            className={`h-11 rounded-xl border px-5 text-sm font-medium transition-all duration-200 ${
              optIn
                ? 'border-emerald-500 bg-emerald-500/10 font-semibold text-emerald-700 shadow-xs shadow-emerald-500/10 dark:text-emerald-400'
                : 'border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            }`}
          >
            Recibir por email
          </button>
          <button
            type="button"
            onClick={() => setOptIn(false)}
            className={`h-11 rounded-xl border px-5 text-sm font-medium transition-all duration-200 ${
              !optIn
                ? 'border-emerald-500 bg-emerald-500/10 font-semibold text-emerald-700 shadow-xs shadow-emerald-500/10 dark:text-emerald-400'
                : 'border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            }`}
          >
            Solo push
          </button>
        </div>
        <input type="hidden" name="dailySummaryEmailOptIn" value={optIn ? 'true' : 'false'} />
      </fieldset>

      <SubmitButton>Guardar</SubmitButton>

      <div aria-live="polite" className="min-h-5">
        {!state.success && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}
        {didSubmit && state.success && (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            Avisos guardados.
          </p>
        )}
      </div>
    </form>
  )
}
