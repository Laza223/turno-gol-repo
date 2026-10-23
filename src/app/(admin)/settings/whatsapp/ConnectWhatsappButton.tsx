'use client'

import { useActionState } from 'react'
import { SubmitButton } from '@/components/ui/submit-button'
import type { ActionResult } from '@/shared/types/action-result'

const INITIAL: ActionResult = { success: true }

/** Firma de las acciones de conexión: entran por prop, no por import de valor. */
export type WhatsappConnectAction = () => Promise<ActionResult>

function ConnectForm({
  action,
  variant,
  pendingLabel,
  children,
}: {
  action: WhatsappConnectAction
  variant: 'plus' | 'outline'
  pendingLabel: string
  children: string
}) {
  const [state, formAction] = useActionState(action, INITIAL)
  return (
    <form action={formAction} className="space-y-2">
      <SubmitButton variant={variant} pendingLabel={pendingLabel}>
        {children}
      </SubmitButton>
      {!state.success && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  )
}

/**
 * Conectar el número del complejo: el botón principal abre la conexión en Kapso;
 * "Ya lo conecté" es para quien terminó allá y no volvió solo.
 */
export function ConnectWhatsappButtons({
  connectLabel,
  startAction,
  checkAction,
}: {
  connectLabel: string
  startAction: WhatsappConnectAction
  checkAction: WhatsappConnectAction
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <ConnectForm action={startAction} variant="plus" pendingLabel="Abriendo…">
        {connectLabel}
      </ConnectForm>
      <ConnectForm action={checkAction} variant="outline" pendingLabel="Revisando…">
        Ya lo conecté
      </ConnectForm>
    </div>
  )
}
