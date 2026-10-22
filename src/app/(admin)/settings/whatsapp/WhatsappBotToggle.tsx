'use client'

import { useActionState } from 'react'
import { SubmitButton } from '@/components/ui/submit-button'
import { TONE_BADGE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import type { ActionResult } from '@/shared/types/action-result'

const INITIAL: ActionResult = { success: true }

/** Firma de `setWhatsappBotEnabledAction`: entra por prop, no por import de valor. */
export type SetWhatsappBotEnabled = (
  prevState: ActionResult,
  formData: FormData,
) => Promise<ActionResult>

/**
 * Prender o apagar el asistente. Un solo botón que hace lo contrario de lo que
 * está pasando hoy: no hay nada más que configurar.
 */
export function WhatsappBotToggle({
  enabled,
  action,
}: {
  enabled: boolean
  action: SetWhatsappBotEnabled
}) {
  const [state, formAction] = useActionState(action, INITIAL)

  return (
    <form action={formAction} className="space-y-3">
      <p className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Hoy:</span>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
            TONE_BADGE[enabled ? 'success' : 'neutral'],
          )}
        >
          {enabled ? 'Contesta solo' : 'Apagado'}
        </span>
      </p>
      <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
      <SubmitButton
        variant={enabled ? 'outline' : 'plus'}
        pendingLabel={enabled ? 'Apagando…' : 'Prendiendo…'}
      >
        {enabled ? 'Apagar el asistente' : 'Prender el asistente'}
      </SubmitButton>
      {!state.success && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  )
}
