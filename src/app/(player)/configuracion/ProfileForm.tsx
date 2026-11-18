'use client'

import '@/components/booking/reserva.css'
import '@/components/world/portal-app.css'
import { startTransition, useActionState, useEffect, useState, type FormEvent } from 'react'
import type { UpdateProfileResult } from './actions'
import LocalityPicker from '@/components/geo/LocalityPicker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { Button } from '@/components/ui/button'
import { GLASS_INPUT } from '@/components/world/portal-auth-styles'
import { cn } from '@/lib/utils'
import type { GeoLocality } from '@/modules/geo/geo.types'
import { PROVINCES } from '@/shared/geo/argentina'

type DefaultValues = {
  firstName: string
  lastName: string
  phone: string
  preferredArea: string
}

/** Firma de la Server Action que consume el form. */
type UpdateProfileAction = (
  prevState: UpdateProfileResult,
  formData: FormData,
) => Promise<UpdateProfileResult>

type Props = {
  defaultValues: DefaultValues
  /**
   * La action llega por PROP, no por import: './actions' es `'use server'` y
   * arrastra drizzle/postgres + `node:async_hooks` (vía request-context), lo
   * que rompe cualquier bundle de browser (Storybook) si se importa como
   * valor. El type import de `UpdateProfileResult` sí es seguro: se borra en
   * compilación.
   */
  action: UpdateProfileAction
}

const INITIAL_STATE: UpdateProfileResult = { success: true }

/** Campo de vidrio del portal (el de Ingresar), con el borde rojo cuando el campo tiene error. */
const FIELD = cn(GLASS_INPUT, 'aria-invalid:border-portal-bad')
/** 13 px es el piso del portal. */
const FIELD_ERROR = 'text-[13px] leading-5 text-portal-bad'
/** El selector de país del teléfono: el mismo alto, fondo y borde que los campos de vidrio. */
const PHONE_WRAP =
  '[&_button]:h-13 [&_button]:rounded-l-[18px] [&_button]:border-portal-soft/70 [&_button]:bg-portal-inner md:[&_button]:h-13 [&_button>span.text-xs]:text-sm'
const PHONE_INPUT = cn(FIELD, 'rounded-l-none rounded-r-[18px]')
const LABEL = 'text-[14px] font-semibold text-portal-ink'

type FieldName = 'first_name' | 'last_name' | 'preferred_area' | 'phone'

/**
 * "Luján, Buenos Aires" → la localidad ya elegida, para que el buscador la muestre en vez de una
 * línea suelta. Un texto libre viejo ("Palermo") no tiene provincia: no se puede mostrar ahí.
 */
function parseSavedArea(area: string): GeoLocality | null {
  const i = area.lastIndexOf(', ')
  if (i <= 0) return null
  const province = area.slice(i + 2)
  if (!(PROVINCES as readonly string[]).includes(province)) return null
  return { city: area.slice(0, i), province, lat: null, lng: null, source: 'dataset' }
}

export function ProfileForm({ defaultValues, action }: Props) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE)
  // La zona se elige entre las localidades del país y viaja en un hidden ("Luján, Buenos Aires").
  // Un texto libre viejo ("Palermo, Villa Crespo") se conserva hasta que elija otra.
  const [area, setArea] = useState(defaultValues.preferredArea)
  const [pickedArea, setPickedArea] = useState<GeoLocality | null>(() =>
    parseSavedArea(defaultValues.preferredArea),
  )
  // "Guardado" vale hasta que se vuelve a tocar un campo: después ya no dice nada de lo que hay en pantalla.
  const [edited, setEdited] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  // El tilde del botón dura 1,2 s después de guardar (dirección §4.5); "Guardado" sigue hasta editar.
  const [tickExpired, setTickExpired] = useState(false)
  const saved = submitted && state.success && !edited && !pending
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setTickExpired(true), 1200)
    return () => clearTimeout(timer)
  }, [saved])

  // La action se llama a mano y no con `<form action>`: React 19 resetea los campos no controlados
  // al terminar una action, y con un error de validación el jugador perdía lo que había escrito.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSubmitted(true)
    setEdited(false)
    setTickExpired(false)
    startTransition(() => formAction(data))
  }

  const fieldError = (name: FieldName) =>
    !state.success && state.field === name ? state.error : undefined
  const formError = !state.success && !state.field ? state.error : undefined

  return (
    <form
      onSubmit={handleSubmit}
      onChange={() => setEdited(true)}
      // `noValidate`: todo error —nombre vacío, largo máximo, teléfono corto— pasa por el mismo
      // camino (el mensaje de Zod, al lado de su campo) en vez de que el navegador bloquee el
      // submit con su tooltip. `required` se deja para `aria-required`.
      noValidate
      className="pa-form"
    >
      <div className="pa-fld">
        <Label htmlFor="first_name" className={LABEL}>
          Nombre
        </Label>
        <Input
          id="first_name"
          name="first_name"
          type="text"
          defaultValue={defaultValues.firstName}
          autoComplete="given-name"
          required
          className={FIELD}
          aria-invalid={fieldError('first_name') ? true : undefined}
          aria-describedby={fieldError('first_name') ? 'first_name-error' : undefined}
        />
        {fieldError('first_name') && (
          <p id="first_name-error" role="alert" className={FIELD_ERROR}>
            {fieldError('first_name')}
          </p>
        )}
      </div>
      <div className="pa-fld">
        <Label htmlFor="last_name" className={LABEL}>
          Apellido <span className="font-normal text-portal-soft">(opcional)</span>
        </Label>
        <Input
          id="last_name"
          name="last_name"
          type="text"
          defaultValue={defaultValues.lastName}
          autoComplete="family-name"
          className={FIELD}
          aria-invalid={fieldError('last_name') ? true : undefined}
          aria-describedby={fieldError('last_name') ? 'last_name-error' : undefined}
        />
        {fieldError('last_name') && (
          <p id="last_name-error" role="alert" className={FIELD_ERROR}>
            {fieldError('last_name')}
          </p>
        )}
      </div>

      <div className="pa-fld">
        {/* El error del teléfono lo dibujo acá y no con la prop `error` del PhoneInput: esa no es una alerta. */}
        <Label htmlFor="phone" className={LABEL}>
          Teléfono
        </Label>
        <PhoneInput
          id="phone"
          name="phone"
          defaultValue={defaultValues.phone}
          onChange={() => setEdited(true)}
          aria-invalid={fieldError('phone') ? true : undefined}
          aria-describedby={fieldError('phone') ? 'phone-error' : undefined}
          className={PHONE_WRAP}
          inputClassName={PHONE_INPUT}
        />
        {fieldError('phone') && (
          <p id="phone-error" role="alert" className={FIELD_ERROR}>
            {fieldError('phone')}
          </p>
        )}
      </div>

      <div className="pa-fld">
        <Label htmlFor="preferred_area" className={LABEL}>
          Zona preferida
        </Label>
        <LocalityPicker
          id="preferred_area"
          value={pickedArea}
          onChange={(locality) => {
            setPickedArea(locality)
            setArea(locality ? `${locality.city}, ${locality.province}` : '')
            setEdited(true)
          }}
          inputClassName={FIELD}
          locateStyle="icon"
          aria-invalid={fieldError('preferred_area') ? true : undefined}
          aria-describedby={fieldError('preferred_area') ? 'preferred_area-error' : undefined}
        />
        <input type="hidden" name="preferred_area" value={area} />
        {area && !pickedArea && <p className="text-sm text-portal-soft">Tu zona actual: {area}</p>}
        {fieldError('preferred_area') && (
          <p id="preferred_area-error" role="alert" className={FIELD_ERROR}>
            {fieldError('preferred_area')}
          </p>
        )}
      </div>

      <div className="pa-span2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          type="submit"
          variant="pill"
          size="pill"
          disabled={pending}
          aria-busy={pending}
          className="w-full disabled:opacity-100 sm:w-auto"
        >
          {saved && !tickExpired && (
            <svg
              className="pa-tick size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        {/* Región viva siempre montada: un anuncio solo se lee si el contenedor ya estaba en el DOM. */}
        <p role="status" className="text-sm font-semibold text-portal-green">
          {saved ? 'Guardado' : null}
        </p>
      </div>

      {formError && (
        <p role="alert" className={cn(FIELD_ERROR, 'pa-span2')}>
          {formError}
        </p>
      )}
    </form>
  )
}
