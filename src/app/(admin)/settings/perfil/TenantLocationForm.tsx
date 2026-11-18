'use client'

import { useActionState, useState } from 'react'
import { MapPin, AlertTriangle } from 'lucide-react'
import { SubmitButton } from '@/components/ui/submit-button'
import AddressFinder from '@/components/geo/AddressFinder'
import type { UpdateTenantLocationResult } from './actions'

type UpdateTenantLocationAction = (
  prevState: UpdateTenantLocationResult,
  formData: FormData,
) => Promise<UpdateTenantLocationResult>

const INITIAL: UpdateTenantLocationResult = { success: true }

/**
 * Ubicación del complejo. Única pantalla que edita dirección/ciudad/provincia
 * después del wizard, y única forma de cargar el punto del mapa en toda la
 * aplicación.
 *
 * Los campos address/city/province/latitude/longitude los emite `AddressFinder`
 * como inputs ocultos; la validación real es `tenantLocationSchema`.
 */
export function TenantLocationForm({
  currentAddress,
  currentCity,
  currentProvince,
  currentLatitude,
  currentLongitude,
  action,
}: {
  currentAddress: string
  currentCity: string
  currentProvince: string
  currentLatitude: number | null
  currentLongitude: number | null
  action: UpdateTenantLocationAction
}) {
  const [state, formAction] = useActionState(action, INITIAL)
  const [didSubmit, setDidSubmit] = useState(false)
  const hasLocation = currentLatitude !== null && currentLongitude !== null

  return (
    <div className="card-premium rounded-xl p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <MapPin className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Ubicación</h2>
          <p className="text-sm text-muted-foreground">
            Dónde queda tu complejo. El punto en el mapa es lo que te hace aparecer en el buscador
            con la distancia hasta el jugador.
          </p>
        </div>
      </div>

      <form
        action={formAction}
        onSubmit={() => setDidSubmit(true)}
        className="mt-4 lg:mt-6 max-w-xl space-y-3 lg:space-y-4"
      >
        <div>
          <p className="text-sm font-medium text-foreground">Dónde queda</p>
          {hasLocation ? (
            <p className="mb-2 text-xs text-muted-foreground">
              Es lo que te hace aparecer en el buscador con la distancia hasta el jugador.
            </p>
          ) : (
            // H145: la dirección de texto de arriba ya está completa y "se
            // ve terminada" — este aviso compite con esos campos. Se
            // destaca con el mismo tratamiento de warning que el resto del
            // panel (ver settings/canchas, settings/facturacion) en vez de
            // un párrafo gris más.
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

        <SubmitButton pendingLabel="Guardando…">Guardar ubicación</SubmitButton>

        <div aria-live="polite">
          {!state.success && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.error}
            </p>
          )}
          {didSubmit && state.success && (
            <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
              Ubicación guardada.
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
