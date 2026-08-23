'use client'

import { useActionState, useState } from 'react'
import { Phone } from 'lucide-react'
import { SubmitButton } from '@/components/ui/submit-button'
import { PhoneInput } from '@/components/ui/phone-input'
import type { UpdateTenantContactResult } from './actions'

type UpdateTenantContactAction = (
  prevState: UpdateTenantContactResult,
  formData: FormData,
) => Promise<UpdateTenantContactResult>

const INITIAL: UpdateTenantContactResult = { success: true }

/**
 * Contacto público del complejo (B15, plan de refactor de onboarding): el
 * wizard dejó de pedir teléfono/email en el paso 1 (doc10 §2, se derivan de la
 * cuenta staff al crear el complejo) — esta es la única pantalla que los
 * puede corregir después. Sin este form, un dueño que registró el complejo
 * con su celular personal no tendría forma de cambiarlo por una línea del
 * negocio.
 */
export function TenantContactForm({
  currentPhone,
  currentEmail,
  currentWhatsapp,
  action,
}: {
  currentPhone: string
  currentEmail: string
  currentWhatsapp: string | null
  action: UpdateTenantContactAction
}) {
  const [state, formAction] = useActionState(action, INITIAL)
  // Mismo patrón que ReservasPolicyForm: sin esto, `state.success` sigue en
  // `true` desde el estado inicial y el mensaje de éxito aparecería ANTES de
  // que el dueño toque el form.
  const [didSubmit, setDidSubmit] = useState(false)

  return (
    <div className="card-premium rounded-xl p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Phone className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Contacto del complejo</h2>
          <p className="text-sm text-muted-foreground">
            Teléfono, WhatsApp y email que ven los jugadores en tu página pública.
          </p>
        </div>
      </div>

      <form
        action={formAction}
        onSubmit={() => setDidSubmit(true)}
        className="mt-6 max-w-md space-y-4"
      >
        <PhoneInput
          id="tenant-contact-phone"
          name="phone"
          label="Teléfono"
          defaultValue={currentPhone}
          required
        />

        <PhoneInput
          id="tenant-contact-whatsapp"
          name="whatsapp"
          label="WhatsApp (opcional)"
          defaultValue={currentWhatsapp ?? ''}
        />
        <p className="-mt-2 text-xs text-muted-foreground">
          Si lo dejás vacío, los jugadores te escriben al teléfono de arriba.
        </p>

        <div>
          <label
            htmlFor="tenant-contact-email"
            className="block text-sm font-medium text-foreground"
          >
            Email <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          <input
            id="tenant-contact-email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={currentEmail}
            required
            className="mt-1.5 flex h-11 md:h-10 w-full rounded-lg border border-border bg-card px-3.5 text-base md:text-sm text-foreground shadow-xs transition placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus:border-emerald-500"
          />
        </div>

        <SubmitButton pendingLabel="Guardando…">Guardar contacto</SubmitButton>

        <div aria-live="polite">
          {!state.success && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.error}
            </p>
          )}
          {didSubmit && state.success && (
            <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
              Contacto guardado.
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
