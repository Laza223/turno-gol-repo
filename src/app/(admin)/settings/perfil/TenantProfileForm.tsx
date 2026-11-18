'use client'

import { useActionState, useState } from 'react'
import { Building2, AlertTriangle } from 'lucide-react'
import { SubmitButton } from '@/components/ui/submit-button'
import { PhoneInput } from '@/components/ui/phone-input'
import AddressFinder from '@/components/geo/AddressFinder'
import type { UpdateTenantProfileResult } from './actions'

type UpdateTenantProfileAction = (
  prevState: UpdateTenantProfileResult,
  formData: FormData,
) => Promise<UpdateTenantProfileResult>

const INITIAL: UpdateTenantProfileResult = { success: true }

const inputClass =
  'mt-1.5 flex h-11 md:h-10 w-full rounded-lg border border-border bg-card px-3.5 text-base md:text-sm text-foreground shadow-xs transition placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus:border-emerald-500'

/**
 * Rediseño de Configuración → Perfil: "Datos del complejo" fusiona el
 * contacto público (teléfono, WhatsApp, email) y la ubicación (dirección,
 * localidad, provincia, punto en el mapa) en un solo form con un solo botón
 * "Guardar cambios" — antes eran `TenantContactForm`/`TenantLocationForm`,
 * dos cards con dos submits. Los dos componentes viejos siguen existiendo sin
 * tocar (tienen stories propios), pero `updateTenantContactAction` ya no
 * existe: solo sobrevive el tipo `UpdateTenantContactResult` para tipar
 * `TenantContactForm.tsx`. `updateTenantLocationAction` sí sigue viva tal
 * cual (la ejercita `settings-perfil-actions.test.ts`).
 */
export function TenantProfileForm({
  currentPhone,
  currentEmail,
  currentWhatsapp,
  currentAddress,
  currentCity,
  currentProvince,
  currentLatitude,
  currentLongitude,
  action,
}: {
  currentPhone: string
  currentEmail: string
  currentWhatsapp: string | null
  currentAddress: string
  currentCity: string
  currentProvince: string
  currentLatitude: number | null
  currentLongitude: number | null
  action: UpdateTenantProfileAction
}) {
  const [state, formAction] = useActionState(action, INITIAL)
  // Mismo patrón que ReservasPolicyForm: sin esto, `state.success` sigue en
  // `true` desde el estado inicial y el mensaje de éxito aparecería ANTES de
  // que el dueño toque el form.
  const [didSubmit, setDidSubmit] = useState(false)
  const hasLocation = currentLatitude !== null && currentLongitude !== null

  return (
    <div className="card-premium rounded-xl p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Contacto y ubicación</h2>
          <p className="text-sm text-muted-foreground">
            Cómo te encuentra y te escribe el jugador.
          </p>
        </div>
      </div>

      <form
        action={formAction}
        onSubmit={() => setDidSubmit(true)}
        className="mt-4 lg:mt-6 max-w-xl space-y-3 lg:space-y-4"
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
            Email de contacto <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          <input
            id="tenant-contact-email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={currentEmail}
            required
            aria-describedby="tenant-contact-email-help"
            className={inputClass}
          />
          <p id="tenant-contact-email-help" className="mt-1 text-xs text-muted-foreground">
            Se lo damos al jugador si cancela y le tenés que devolver la seña.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Dónde queda</p>
          {!hasLocation && (
            // H145 (heredado de TenantLocationForm): mismo tratamiento de warning
            // que el resto del panel para no perderse entre los otros campos.
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Sin esto tu complejo no aparece en el mapa del buscador ni podemos mostrarle al
                jugador a cuántos kilómetros está.
              </span>
            </div>
          )}
          <AddressFinder
            idPrefix="tenant-location"
            names
            showMap
            value={
              currentAddress && currentCity && currentProvince
                ? {
                    address: currentAddress,
                    city: currentCity,
                    province: currentProvince,
                    latitude: currentLatitude,
                    longitude: currentLongitude,
                  }
                : null
            }
          />
        </div>

        <SubmitButton pendingLabel="Guardando…">Guardar cambios</SubmitButton>

        <div aria-live="polite">
          {!state.success && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.error}
            </p>
          )}
          {didSubmit && state.success && (
            <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
              Datos guardados.
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
