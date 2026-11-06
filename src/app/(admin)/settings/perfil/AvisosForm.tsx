'use client'

import { useActionState, useState } from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { RADIX_DETACHED_FORM_ID } from '@/components/ui/radix-form-detach'
import { SubmitButton } from '@/components/ui/submit-button'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import type { AvisosActionResult } from './actions'

const INITIAL_STATE: AvisosActionResult = { success: true }

/** Firma de la Server Action que consume el form. */
export type UpdateAvisosSettings = (
  prevState: AvisosActionResult,
  formData: FormData,
) => Promise<AvisosActionResult>

function chipClass(active: boolean): string {
  return `h-11 rounded-xl border px-5 text-sm font-medium transition-all duration-200 ${
    active
      ? 'border-emerald-500 bg-emerald-500/10 font-semibold text-emerald-700 shadow-xs shadow-emerald-500/10 dark:text-emerald-400'
      : 'border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground'
  }`
}

/**
 * Opt-in de email del resumen semanal. La agenda diaria es sólo push. La action llega por PROP, no por import — mismo
 * motivo que ReservasPolicyForm ('use server' arrastra drizzle/postgres al
 * bundle de Storybook).
 *
 * H161: vivía en su propia pestaña top-level (`/settings/avisos`) con toda la
 * pantalla vacía alrededor de esta única preferencia. Se plegó en Perfil y,
 * desde 2026-09-25, vive en "Vos y tu equipo" (`/settings/equipo`), en el
 * bloque "Tu usuario": no es algo que vea el jugador.
 */
export function AvisosForm({ s, action }: { s: TenantSettings; action: UpdateAvisosSettings }) {
  const [state, formAction] = useActionState(action, INITIAL_STATE)
  const [weeklyOptIn, setWeeklyOptIn] = useState(s.weekly_summary_email_opt_in === true)
  const [didSubmit, setDidSubmit] = useState(false)

  return (
    <form
      action={formAction}
      onSubmit={() => setDidSubmit(true)}
      className="space-y-3 lg:space-y-6 max-w-lg"
    >
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">Semanal</legend>
        {/* `onlyRole: 'admin'` en `daily-summary.worker.ts`: trae lo mismo que
            Métricas, que el Encargado no ve. */}
        <p className="text-sm text-muted-foreground">
          Los lunes a las 8, lo que entró en la semana y por dónde, comparado con la anterior. Solo
          por email, a los administradores.
        </p>
        <RadioGroupPrimitive.Root
          aria-label="Resumen semanal"
          className="flex gap-2"
          value={weeklyOptIn ? 'email' : 'off'}
          onValueChange={(v) => setWeeklyOptIn(v === 'email')}
          form={RADIX_DETACHED_FORM_ID}
        >
          <RadioGroupPrimitive.Item value="email" className={chipClass(weeklyOptIn)}>
            Por email
          </RadioGroupPrimitive.Item>
          <RadioGroupPrimitive.Item value="off" className={chipClass(!weeklyOptIn)}>
            No
          </RadioGroupPrimitive.Item>
        </RadioGroupPrimitive.Root>
        <input
          type="hidden"
          name="weeklySummaryEmailOptIn"
          value={weeklyOptIn ? 'true' : 'false'}
        />
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
            Guardado.
          </p>
        )}
      </div>
    </form>
  )
}
