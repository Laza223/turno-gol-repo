'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import type { WizardActionResult } from '../actions'
import { generateSlug } from '@/modules/tenants/tenant.utils'
import { fieldClass, labelClass } from './wizard-styles'
import { useWizardNavigation } from './use-wizard-navigation'
import { WizardShell } from './WizardShell'
import { PublicCardPreview } from './PublicCardPreview'

/** Firma de la Server Action que consume el form. */
export type CreateTenantAction = (
  prevState: WizardActionResult,
  formData: FormData,
) => Promise<WizardActionResult>

const PROVINCES = [
  'Buenos Aires',
  'CABA',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
]

const PROVINCE_OPTIONS: ComboboxOption[] = PROVINCES.map((p) => ({ value: p, label: p }))

// Sin `next`: el estado inicial no debe disparar la navegación al montar.
const INITIAL: WizardActionResult = { success: true }

/**
 * Datos ya guardados, en la revisita del paso (llegando con "Volver").
 *
 * Sin `phone`/`email`: el paso dejó de pedirlos (doc10 §2 — se derivan de la
 * cuenta staff al crear el complejo) y editarlos vive en `/settings/perfil`.
 */
export type TenantIdentityValues = {
  name: string
  address: string
  city: string
  province: string
  /** Slug YA asignado: en revisita se muestra el real, no el derivado del nombre. */
  slug: string
}

type Props = {
  action: CreateTenantAction
  /** Ausente = alta (crea el complejo). Presente = revisita: edita y no toca el slug. */
  defaultValues?: TenantIdentityValues
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
export function StepIdentity({ action, defaultValues }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(defaultValues?.name ?? '')
  const [address, setAddress] = useState(defaultValues?.address ?? '')
  const [city, setCity] = useState(defaultValues?.city ?? '')
  const [province, setProvince] = useState(defaultValues?.province ?? '')
  const navigate = useWizardNavigation()

  const isEdit = defaultValues !== undefined
  // En revisita el slug es el de la DB: se fijó al crear el complejo y renombrar
  // no lo mueve, porque el link público ya puede estar circulando.
  const slug = isEdit ? defaultValues.slug : generateSlug(name)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await action(INITIAL, formData)
      if (!result.success) {
        setError(result.error)
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
      preview={<PublicCardPreview name={name} address={address} city={city} />}
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Tu complejo</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isEdit
              ? 'Corregí lo que haga falta y seguí donde estabas.'
              : 'Con esto armamos tu página pública para recibir reservas.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="identity-name" className={labelClass}>
              Nombre del complejo <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              id="identity-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Complejo San Martín"
              required
              className={fieldClass}
            />
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
              Dirección <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              id="identity-address"
              name="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ej: Av. Corrientes 1234"
              required
              className={fieldClass}
            />
          </div>

          {/* Columnas solo desde sm: en 375px los placeholders deben caber (§6.3). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="identity-city" className={labelClass}>
                Ciudad <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <input
                id="identity-city"
                name="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ej: Luján"
                required
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="identity-province" className={labelClass}>
                Provincia <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              {/* Combobox no participa de FormData por sí solo (no tiene `name`):
                  el hidden input de abajo es lo que el server realmente lee. */}
              <Combobox
                id="identity-province"
                options={PROVINCE_OPTIONS}
                value={province}
                onChange={setProvince}
                placeholder="Buscá tu provincia..."
                listboxLabel="Provincias"
                inputClassName={fieldClass}
              />
              {/* Sin `required`: un hidden input queda fuera de la constraint
                  validation del browser (nunca bloquearía el submit) — la
                  validación real es server-side, `createTenantSchema`. */}
              <input type="hidden" name="province" value={province} />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
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
