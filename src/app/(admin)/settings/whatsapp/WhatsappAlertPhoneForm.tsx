'use client'

import { useActionState, useState } from 'react'
import { SubmitButton } from '@/components/ui/submit-button'
import type { ActionResult } from '@/shared/types/action-result'

type State = ActionResult<{ phone: string | null }> | null

/** Firma de `setWhatsappAlertPhoneAction`: entra por prop, no por import de valor. */
type SetWhatsappAlertPhone = (
  prevState: State,
  formData: FormData,
) => Promise<ActionResult<{ phone: string | null }>>

/**
 * El WhatsApp donde el dueño recibe los chats que el asistente le pasa. Vacío =
 * solo la notificación del panel.
 */
export function WhatsappAlertPhoneForm({
  phone,
  action,
}: {
  phone: string | null
  action: SetWhatsappAlertPhone
}) {
  const [state, formAction] = useActionState(action, null)
  // Controlado: React 19 resetea el form al terminar la action y, si el número se
  // rechaza, borraría lo que se escribió.
  const [value, setValue] = useState(phone ?? '')

  return (
    <form action={formAction} className="max-w-md space-y-3 border-t border-border pt-3 lg:pt-4">
      <div className="space-y-1">
        <label htmlFor="ownerAlertPhone" className="block text-sm font-medium text-foreground">
          Tu WhatsApp para avisos
        </label>
        <p id="ownerAlertPhone-help" className="text-sm text-muted-foreground">
          Cuando el asistente te pasa un chat, te manda a este número el contacto del jugador y el
          motivo. Si lo dejás vacío, te llega solo la notificación.
        </p>
      </div>
      <input
        id="ownerAlertPhone"
        name="ownerAlertPhone"
        type="tel"
        autoComplete="tel"
        maxLength={40}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="11 2345 6789"
        aria-describedby="ownerAlertPhone-help"
        className="flex h-11 md:h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
      />
      <SubmitButton variant="outline" pendingLabel="Guardando…">
        Guardar número
      </SubmitButton>
      {state?.success && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {state.phone
            ? `Guardado. Los avisos van al ${state.phone}.`
            : 'Quitaste el número. Te sigue llegando la notificación.'}
        </p>
      )}
      {state && !state.success && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  )
}
