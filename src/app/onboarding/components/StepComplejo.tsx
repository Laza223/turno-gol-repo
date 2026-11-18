'use client'

import { useState, useTransition } from 'react'
import { Link2 } from 'lucide-react'
import AddressFinder from '@/components/geo/AddressFinder'
import { Input } from '@/components/ui/input'
import type { PickedAddress } from '@/modules/geo/geo.types'
import { generateSlug } from '@/modules/tenants/tenant.utils'
import type { WizardActionResult } from '../actions'
import { useWizardNavigation } from './use-wizard-navigation'
import { SIGNUP_INPUT_CLASS } from './signup-style'
import { StepScreen } from './StepScreen'

/** Firma de la Server Action que consume el paso (crear o, en revisita, actualizar). */
type CreateTenantAction = (
  prevState: WizardActionResult,
  formData: FormData,
) => Promise<WizardActionResult>

// Sin `next`: el estado inicial no debe disparar la navegación al montar.
const INITIAL: WizardActionResult = { success: true }

/** Datos ya guardados, en la revisita del paso. */
type TenantValues = {
  name: string
  address: string
  city: string
  province: string
  /** Slug YA asignado: en revisita se muestra el real, no el derivado del nombre. Sin slug = alta. */
  slug?: string
  latitude: number | null
  longitude: number | null
}

type Props = {
  action: CreateTenantAction
  /**
   * Ausente = alta (crea el complejo). Con `slug` = revisita: edita y no toca el slug.
   * Sin `slug` solo precarga las respuestas (el alta pública retoma su borrador).
   */
  defaultValues?: TenantValues
  /** Adónde vuelve "Atrás" desde la primera pantalla. Sin esto no hay botón (es el primer paso). */
  backHref?: string
}

/**
 * Dos pantallas: "¿Cómo se llama tu complejo?" y "¿Dónde queda?". Se guarda al
 * confirmar la segunda.
 *
 * `useTransition` + `await action(...)` manual, NO `useActionState` — a propósito.
 * `createTenantAction` escribe cookies de sesión a mitad de camino
 * (`setStaffTenantClaim` + `refreshSession`), y eso hace que Next revalide los
 * Server Components de la página ANTES de que el cliente procese la respuesta:
 * `<StepComplejo action={createTenantAction}>` pasa a ser `<StepComplejo
 * action={updateWizardTenantAction}>` (el tenant ya existe) a mitad del submit, y
 * `useActionState` pierde la resolución de la primera action: el `next` real se
 * descarta y el paso se queda ahí. Una promesa común no pasa por ningún hook.
 */
export function StepComplejo({ action, defaultValues, backHref }: Props) {
  const isEdit = defaultValues?.slug !== undefined
  const [screen, setScreen] = useState<'name' | 'place'>('name')
  const [name, setName] = useState(defaultValues?.name ?? '')
  const [nameError, setNameError] = useState<string | null>(null)

  const [place, setPlace] = useState<PickedAddress | null>(
    defaultValues?.address
      ? {
          address: defaultValues.address,
          city: defaultValues.city,
          province: defaultValues.province,
          latitude: defaultValues.latitude,
          longitude: defaultValues.longitude,
        }
      : null,
  )
  const [error, setError] = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()
  const navigate = useWizardNavigation()

  const slug = defaultValues?.slug ?? generateSlug(name)

  function goToPlace() {
    if (name.trim().length < 2) {
      setNameError('Escribí el nombre de tu complejo.')
      return
    }
    setNameError(null)
    setScreen('place')
  }

  function confirm() {
    setError(null)
    if (!place) {
      setError('Buscá tu dirección y elegila de la lista, o usá tu ubicación actual.')
      return
    }

    const formData = new FormData()
    formData.set('name', name.trim())
    formData.set('address', place.address)
    formData.set('city', place.city)
    formData.set('province', place.province)
    formData.set('latitude', place.latitude === null ? '' : String(place.latitude))
    formData.set('longitude', place.longitude === null ? '' : String(place.longitude))

    startTransition(async () => {
      const result = await action(INITIAL, formData)
      if (!result.success) {
        // Después del await, un set* suelto ya no es parte de la transición.
        startTransition(() => setError(result.error))
        return
      }
      // La navegación la maneja el cliente (ver use-wizard-navigation): acá es donde
      // `hardNavigate` importa, porque la cookie nueva tiene que llegar aplicada.
      if (result.next) navigate(result)
    })
  }

  if (screen === 'name') {
    return (
      <StepScreen
        title="¿Cómo se llama tu complejo?"
        accent="complejo"
        description="Así lo van a ver tus jugadores."
        onNext={goToPlace}
        backHref={backHref}
      >
        <label htmlFor="complejo-name" className="sr-only">
          Nombre del complejo
        </label>
        <Input
          id="complejo-name"
          name="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setNameError(null)
          }}
          placeholder="Ej: Complejo San Martín"
          autoComplete="organization"
          autoCapitalize="words"
          enterKeyHint="next"
          maxLength={100}
          className={SIGNUP_INPUT_CLASS}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? 'complejo-name-error' : undefined}
        />
        {nameError && (
          <p
            id="complejo-name-error"
            role="alert"
            className="mt-1.5 text-sm text-red-600 dark:text-red-400"
          >
            {nameError}
          </p>
        )}
        {(isEdit || name.trim().length >= 2) && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              {isEdit ? 'Tu link. No cambia aunque cambies el nombre.' : 'Tu link va a ser:'}
            </p>
            <p className="signup-lit mt-2 flex min-h-11 items-center gap-2 break-all rounded-xl border px-3.5 py-2 text-sm text-slate-200">
              <Link2 className="size-4 shrink-0 text-emerald-300" aria-hidden />
              <span>
                turnogol.app/<strong className="font-semibold text-white">{slug}</strong>
              </span>
            </p>
            {!isEdit && (
              <p className="mt-2 text-xs text-muted-foreground">Después no se puede cambiar.</p>
            )}
          </div>
        )}
      </StepScreen>
    )
  }

  return (
    <StepScreen
      title={name.trim() ? `¿Dónde queda ${name.trim()}?` : '¿Dónde queda?'}
      accent="Dónde queda"
      description="Usá tu ubicación actual o escribí la calle y la altura."
      nextLabel={isEdit ? 'Guardar' : 'Siguiente'}
      onNext={confirm}
      onBack={() => setScreen('name')}
      isPending={isPending}
      error={error}
      focusHeading
    >
      <AddressFinder
        idPrefix="complejo"
        value={place}
        onChange={(v) => {
          setPlace(v)
          setError(null)
        }}
        showMap
        inputClassName={SIGNUP_INPUT_CLASS}
      />
    </StepScreen>
  )
}
