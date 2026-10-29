'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import type { WizardActionResult } from '../actions'
import { generateSlug } from '@/modules/tenants/tenant.utils'
import { PROVINCES, resolveMapCenter } from '@/modules/tenants/tenant.geo'
import LocationPickerField, {
  type GeocodeAddressAction,
} from '@/components/maps/LocationPickerField'
import { fieldClass, labelClass } from './wizard-styles'
import { useWizardNavigation } from './use-wizard-navigation'
import { WizardShell } from './WizardShell'
import { PublicCardPreview } from './PublicCardPreview'

/** Firma de la Server Action que consume el form. */
export type CreateTenantAction = (
  prevState: WizardActionResult,
  formData: FormData,
) => Promise<WizardActionResult>

const PROVINCE_OPTIONS: ComboboxOption[] = PROVINCES.map((p) => ({ value: p, label: p }))

// Sin `next`: el estado inicial no debe disparar la navegación al montar.
const INITIAL: WizardActionResult = { success: true }

/**
 * Datos ya guardados, en la revisita del paso (llegando con "Volver").
 *
 * Sin `phone`/`email`: el paso dejó de pedirlos (doc10 §2 — se derivan de la
 * cuenta staff al crear el complejo) y editarlos vive en `/settings/perfil`.
 */
type TenantIdentityValues = {
  name: string
  address: string
  city: string
  province: string
  /** Slug YA asignado: en revisita se muestra el real, no el derivado del nombre. */
  slug: string
  /** Punto en el mapa, si ya se cargó. Opcional: el paso nunca se bloquea por él. */
  latitude: number | null
  longitude: number | null
}

type Props = {
  action: CreateTenantAction
  /** Ausente = alta (crea el complejo). Presente = revisita: edita y no toca el slug. */
  defaultValues?: TenantIdentityValues
  /**
   * Buscador de dirección contra Georef — ver `geocodeAddressAction`
   * (settings/perfil/actions.ts). Opcional: sin esta prop,
   * `LocationPickerField` se comporta como antes (mapa manual, sin buscador),
   * que es lo que hace su story y el form standalone de ubicación.
   */
  geocodeAction?: GeocodeAddressAction
}

/**
 * `useTransition` + `onSubmit` manual, NO `useActionState` — a propósito,
 * distinto del resto del wizard (B17 los migró a todos a `useActionState`
 * salvo este). `createTenantAction` escribe cookies de sesión a mitad de
 * camino (`setStaffTenantClaim` + `supabase.auth.refreshSession()`, el único
 * paso que lo hace) y ESO le hace tomar a Next.js el mismo camino que un
 * `cookies().set()`: revalida automáticamente los Server Components de la
 * página ANTES de que el cliente termine de procesar la respuesta de la
 * action. Con `useActionState`, esa revalidación reemplaza `<StepIdentity
 * action={createTenantAction}>` por `<StepIdentity action={updateWizardTenantAction}
 * defaultValues={...}>` (el tenant ya existe) a mitad de un submit — mismo
 * componente, pero `useActionState` pierde la resolución pendiente de la
 * primera action en la carrera: `state` nunca deja de ser `INITIAL`, el
 * `next`/`hardNavigate` real se descarta en silencio, y el Paso 1 se queda
 * ahí (en modo edición) en vez de avanzar a Horarios. Reproducido a mano
 * (Fase 9): 100% repetible, no es un edge case — bloqueaba a CUALQUIER alta
 * nueva. `await action(...)` acá es una promesa común: no pasa por ningún
 * hook de React, así que ninguna revalidación de la página puede pisarla.
 */
export function StepIdentity({ action, defaultValues, geocodeAction }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(defaultValues?.name ?? '')
  const [address, setAddress] = useState(defaultValues?.address ?? '')
  const [city, setCity] = useState(defaultValues?.city ?? '')
  const [province, setProvince] = useState(defaultValues?.province ?? '')
  const [provinceError, setProvinceError] = useState<string | null>(null)
  // Error inline de los campos de texto. Con `noValidate` el popup nativo de
  // `required` no aparece: la paridad la da este chequeo, un campo por vez.
  const [fieldError, setFieldError] = useState<{
    field: 'name' | 'address' | 'city'
    message: string
  } | null>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  // Sin punto, el complejo no sale en el mapa de /explorar ni se puede ordenar
  // por cercanía: el preview lo dice, para que cargarlo tenga consecuencia visible.
  const [hasLocation, setHasLocation] = useState(
    defaultValues?.latitude != null && defaultValues?.longitude != null,
  )
  const navigate = useWizardNavigation()
  // La provincia elegida es lo único que tenemos para abrir el mapa cerca del
  // complejo: sin geocodificador (doc10 §82), es eso o el centro del país.
  const mapFallback = useMemo(() => resolveMapCenter(province, null, null), [province])

  const isEdit = defaultValues !== undefined
  // En revisita el slug es el de la DB: se fijó al crear el complejo y renombrar
  // no lo mueve, porque el link público ya puede estar circulando.
  const slug = isEdit ? defaultValues.slug : generateSlug(name)

  // Lleva el foco (y el scroll) al error del server cuando aparece: al pie del form quedaba fuera de pantalla.
  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const empties = [
      { field: 'name', value: name, message: 'Poné el nombre del complejo.' },
      { field: 'address', value: address, message: 'Poné la dirección.' },
      { field: 'city', value: city, message: 'Poné la ciudad.' },
    ] as const
    const empty = empties.find((f) => f.value.trim() === '')
    if (empty) {
      setFieldError({ field: empty.field, message: empty.message })
      document.getElementById(`identity-${empty.field}`)?.focus()
      return
    }
    setFieldError(null)
    if (!province) {
      setProvinceError('Elegí tu provincia de la lista.')
      document.getElementById('identity-province')?.focus()
      return
    }
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await action(INITIAL, formData)
      if (!result.success) {
        // Después del await, un set* suelto ya no es parte de la transición: se pintaba un
        // render antes de que `pending` bajara, con los controles todavía deshabilitados.
        startTransition(() => setError(result.error))
        return
      }
      // La navegación la maneja el cliente (ver use-wizard-navigation), no un
      // redirect server-side: acá es donde `hardNavigate` importa (recarga
      // completa para que la cookie nueva del Paso 1 llegue aplicada al
      // próximo request — carrera de #158 en WebKit móvil).
      if (result.next) navigate(result)
    })
  }

  return (
    <WizardShell
      previewTitle="Tu complejo"
      preview={
        <PublicCardPreview name={name} address={address} city={city} hasLocation={hasLocation} />
      }
    >
      <div className="space-y-6">
        <div>
          <h2
            tabIndex={-1}
            className="text-2xl font-bold tracking-tight text-foreground focus:outline-hidden"
          >
            Tu complejo
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isEdit
              ? 'Corregí lo que haga falta y seguí donde estabas.'
              : 'Con esto armamos tu página pública para recibir reservas.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="identity-name" className={labelClass}>
              Nombre del complejo <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <input
              id="identity-name"
              name="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (fieldError?.field === 'name') setFieldError(null)
              }}
              placeholder="Ej: Complejo San Martín"
              autoComplete="organization"
              autoCapitalize="words"
              enterKeyHint="next"
              aria-invalid={fieldError?.field === 'name' ? true : undefined}
              aria-describedby={fieldError?.field === 'name' ? 'identity-name-error' : undefined}
              required
              className={fieldClass}
            />
            {fieldError?.field === 'name' && (
              <p
                id="identity-name-error"
                role="alert"
                className="mt-1.5 text-xs text-red-600 dark:text-red-400"
              >
                {fieldError.message}
              </p>
            )}
            {(isEdit || name.length >= 2) && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Tu link público:{' '}
                <span className="text-foreground">
                  turnogol.app/
                  <strong className="text-emerald-700 dark:text-emerald-400">{slug}</strong>
                </span>
                {isEdit && ' — no cambia aunque le cambies el nombre al complejo.'}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="identity-address" className={labelClass}>
              Dirección <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <input
              id="identity-address"
              name="address"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value)
                if (fieldError?.field === 'address') setFieldError(null)
              }}
              placeholder="Ej: Av. Corrientes 1234"
              autoComplete="address-line1"
              enterKeyHint="next"
              aria-invalid={fieldError?.field === 'address' ? true : undefined}
              aria-describedby={
                fieldError?.field === 'address' ? 'identity-address-error' : undefined
              }
              required
              className={fieldClass}
            />
            {fieldError?.field === 'address' && (
              <p
                id="identity-address-error"
                role="alert"
                className="mt-1.5 text-xs text-red-600 dark:text-red-400"
              >
                {fieldError.message}
              </p>
            )}
          </div>

          {/* Columnas solo desde sm: en 375px los placeholders deben caber (§6.3). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="identity-city" className={labelClass}>
                Ciudad <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input
                id="identity-city"
                name="city"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value)
                  if (fieldError?.field === 'city') setFieldError(null)
                }}
                placeholder="Ej: Rosario"
                autoComplete="address-level2"
                autoCapitalize="words"
                enterKeyHint="next"
                aria-invalid={fieldError?.field === 'city' ? true : undefined}
                aria-describedby={fieldError?.field === 'city' ? 'identity-city-error' : undefined}
                required
                className={fieldClass}
              />
              {fieldError?.field === 'city' && (
                <p
                  id="identity-city-error"
                  role="alert"
                  className="mt-1.5 text-xs text-red-600 dark:text-red-400"
                >
                  {fieldError.message}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="identity-province" className={labelClass}>
                Provincia <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              {/* Combobox no participa de FormData por sí solo (no tiene `name`):
                  el hidden input de abajo es lo que el server realmente lee. */}
              <Combobox
                id="identity-province"
                options={PROVINCE_OPTIONS}
                value={province}
                onChange={(v) => {
                  setProvince(v)
                  if (v) setProvinceError(null)
                }}
                aria-invalid={provinceError ? true : undefined}
                aria-describedby={provinceError ? 'identity-province-error' : undefined}
                placeholder="Buscá tu provincia..."
                listboxLabel="Provincias"
                inputClassName={fieldClass}
              />
              {/* Sin `required`: un hidden input queda fuera de la constraint
                  validation del browser (nunca bloquearía el submit) — la
                  validación real es server-side, `createTenantSchema`. */}
              <input type="hidden" name="province" value={province} />
              {provinceError && (
                <p
                  id="identity-province-error"
                  role="alert"
                  className="mt-1.5 text-xs text-red-600 dark:text-red-400"
                >
                  {provinceError}
                </p>
              )}
            </div>
          </div>

          {/* Opcional y colapsado: doc10 §82 — el Paso 1 nunca se bloquea por
              la ubicación. Pero si no está acá, todo complejo nuevo nace sin
              punto y tiene que descubrir la pantalla de Configuración por
              accidente. */}
          <LocationPickerField
            initialLatitude={defaultValues?.latitude ?? null}
            initialLongitude={defaultValues?.longitude ?? null}
            fallbackCenter={mapFallback.center}
            fallbackZoom={mapFallback.zoom}
            collapsible
            defaultQuery={address}
            city={city}
            province={province}
            geocodeAction={geocodeAction}
            onHasPointChange={setHasLocation}
          />

          {error && (
            <p
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className="text-sm text-red-600 dark:text-red-400 focus:outline-hidden"
            >
              {error}
            </p>
          )}

          <Button type="submit" isLoading={isPending} className="w-full">
            {isEdit ? 'Guardar y continuar' : 'Continuar'}
          </Button>
        </form>
      </div>
    </WizardShell>
  )
}
