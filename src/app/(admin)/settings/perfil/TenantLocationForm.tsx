'use client'

import { useActionState, useMemo, useState } from 'react'
import { MapPin } from 'lucide-react'
import { SubmitButton } from '@/components/ui/submit-button'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import LocationPickerField from '@/components/maps/LocationPickerField'
import { PROVINCES, resolveMapCenter } from '@/modules/tenants/tenant.geo'
import type { UpdateTenantLocationResult } from './actions'

type UpdateTenantLocationAction = (
  prevState: UpdateTenantLocationResult,
  formData: FormData,
) => Promise<UpdateTenantLocationResult>

const INITIAL: UpdateTenantLocationResult = { success: true }

const PROVINCE_OPTIONS: ComboboxOption[] = PROVINCES.map((p) => ({ value: p, label: p }))

const inputClass =
  'mt-1.5 flex h-11 md:h-10 w-full rounded-lg border border-border bg-card px-3.5 text-base md:text-sm text-foreground shadow-xs transition placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus:border-emerald-500'

/**
 * Ubicación del complejo. Única pantalla que edita dirección/ciudad/provincia
 * después del wizard, y única forma de cargar el punto del mapa en toda la
 * aplicación.
 *
 * La provincia se guarda por input oculto (el Combobox no es un control
 * nativo), sin `required`: un oculto queda fuera de la validación del browser
 * y nunca bloquearía el envío. La validación real es `tenantLocationSchema`.
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
  // La provincia elegida recentra el mapa mientras todavía no haya punto: es
  // lo único que evita que abra en medio del Atlántico.
  const [province, setProvince] = useState(currentProvince)
  const fallback = useMemo(() => resolveMapCenter(province, null, null), [province])

  return (
    <div className="card-premium rounded-xl p-6">
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
        className="mt-6 max-w-xl space-y-4"
      >
        <div>
          <label
            htmlFor="tenant-location-address"
            className="block text-sm font-medium text-foreground"
          >
            Dirección <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          <input
            id="tenant-location-address"
            name="address"
            type="text"
            defaultValue={currentAddress}
            placeholder="Ej: Av. Corrientes 1234"
            required
            className={inputClass}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="tenant-location-city"
              className="block text-sm font-medium text-foreground"
            >
              Localidad <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              id="tenant-location-city"
              name="city"
              type="text"
              defaultValue={currentCity}
              placeholder="Ej: Rosario"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label
              htmlFor="tenant-location-province"
              className="block text-sm font-medium text-foreground"
            >
              Provincia <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <div className="mt-1.5">
              <Combobox
                id="tenant-location-province"
                options={PROVINCE_OPTIONS}
                value={province}
                onChange={setProvince}
                placeholder="Buscá tu provincia…"
                listboxLabel="Provincias"
              />
            </div>
            <input type="hidden" name="province" value={province} />
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-foreground">Punto en el mapa</p>
          <p className="mb-2 text-xs text-muted-foreground">
            Opcional, pero sin esto tu complejo no aparece en el mapa del buscador ni podemos
            mostrarle al jugador a cuántos kilómetros está.
          </p>
          <LocationPickerField
            initialLatitude={currentLatitude}
            initialLongitude={currentLongitude}
            fallbackCenter={fallback.center}
            fallbackZoom={fallback.zoom}
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
